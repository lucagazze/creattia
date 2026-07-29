import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { creativos, type Creativo } from '../../../data/creativos50';
import { extractProductPageWithAI, type ScannedProduct } from '../../../lib/creattia/catalog-scanner';
import { mirrorProductImages } from '../../../lib/creattia/product-assets';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 300;

const acceptedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Selecciona las mejores plantillas probadas para el lote
function selectTemplatesForBatch(count: number): Creativo[] {
	const result: Creativo[] = [];
	const seen = new Set<number>();

	// Selección equilibrada entre anillos (Prueba social, Oferta, Vs, Educativo, Demo, Autoridad)
	const featuredIds = [1, 2, 4, 6, 13, 14, 15, 17, 23, 30, 31, 33, 40, 41, 48];
	for (const id of featuredIds) {
		if (result.length >= count) break;
		const found = creativos.find(c => c.id === id);
		if (found && !seen.has(found.id)) {
			seen.add(found.id);
			result.push(found);
		}
	}

	// Rellenar hasta alcanzar la cantidad deseada (10, 20, 30, 40)
	for (const c of creativos) {
		if (result.length >= count) break;
		if (!seen.has(c.id)) {
			seen.add(c.id);
			result.push(c);
		}
	}

	return result;
}

// Selección inteligente por IA de las mejores plantillas según el producto escaneado
async function selectTemplatesWithAI(
	product: ScannedProduct,
	count: number,
	openAIKey: string
): Promise<Creativo[]> {
	if (!openAIKey) return selectTemplatesForBatch(count);

	try {
		const openai = new OpenAI({ apiKey: openAIKey });
		const catalogSummary = creativos.map(c => `ID ${c.id}: ${c.nombre} (Ring: ${c.ring}, Nivel: ${c.n}) - ${c.sirve}`).join('\n');

		const prompt = `Analizá este producto y seleccioná exactamente las ${count} MEJORES plantillas publicitarias del catálogo que generarán más ventas.

PRODUCTO:
Nombre: ${product.name}
Descripción: ${product.description || 'Producto e-commerce'}
Precio: ${product.priceText || 'No especificado'}

CATÁLOGO DE PLANTILLAS PROBADAS:
${catalogSummary}

Respondé ÚNICAMENTE con un objeto JSON válido con este formato exacto:
{
  "ids": [id1, id2, id3, ...]
}`;

		const response = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' },
		});

		const content = response.choices[0]?.message?.content || '{}';
		const parsed = JSON.parse(content);
		const ids: number[] = Array.isArray(parsed.ids) ? parsed.ids : [];
		
		const selected = ids.map(id => creativos.find(c => c.id === Number(id))).filter((c): c is Creativo => Boolean(c));
		if (selected.length >= Math.min(count, 10)) {
			const seen = new Set(selected.map(s => s.id));
			for (const c of creativos) {
				if (selected.length >= count) break;
				if (!seen.has(c.id)) selected.push(c);
			}
			return selected.slice(0, count);
		}
	} catch (err) {
		console.warn('AI template selection fallback:', err);
	}
	return selectTemplatesForBatch(count);
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const userId = auth.user.id;
	const userEmail = auth.user.email || '';

	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar credenciales de IA (GOOGLE_AI_API_KEY u OPENAI_API_KEY).' }, 503);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const form = await request.formData();
		const rawUrl = clean(form.get('productUrl'), 500);
		const requestedCount = Number(clean(form.get('count'), 3) || 10);
		const count = [10, 20, 30, 40].includes(requestedCount) ? requestedCount : 10;
		const brief = clean(form.get('brief'), 1000);
		const format = clean(form.get('format'), 20) || 'square';
		const extraImagesUploaded = form.getAll('extraImages').filter((item): item is File => item instanceof File && item.size > 0);

		if (!rawUrl) return json({ error: 'Ingresá la URL del producto.' }, 400);

		let productUrl = '';
		try {
			productUrl = normalizeExternalUrl(rawUrl);
		} catch {
			return json({ error: 'La URL ingresada no es válida. Verificá que sea pública e incluyas https://' }, 400);
		}

		for (const file of extraImagesUploaded) {
			if (file.size > 15 * 1024 * 1024) return json({ error: `La imagen ${file.name} supera los 15 MB.` }, 413);
			if (!acceptedInputTypes.has(file.type)) return json({ error: `Formato no soportado para ${file.name}. Usá PNG, JPG o WebP.` }, 415);
		}

		// 1. Extraer o encontrar producto por URL
		let scannedProduct: ScannedProduct | null = null;
		try {
			scannedProduct = await extractProductPageWithAI(productUrl, openAIKey);
		} catch (extractErr) {
			console.warn('AI product extraction failed, creating fallback product info from URL:', extractErr);
			scannedProduct = {
				externalId: productUrl,
				name: 'Producto desde URL',
				description: 'Producto analizado directamente desde ' + productUrl,
				priceText: '',
				currency: 'ARS',
				productUrl,
				imageUrl: '',
				imageUrls: [],
				metadata: {},
			};
		}

		// 2. Guardar producto en DB si es nuevo o actualizarlo (de forma segura)
		let storedProductId: string | null = null;
		let storedProduct: any = null;
		if (scannedProduct) {
			try {
				const { data: existing } = await admin.from('creative_products')
					.select('id,name,description,price_text,currency,image_path,source_image_url')
					.eq('user_id', userId)
					.eq('product_url', scannedProduct.productUrl || productUrl)
					.limit(1).maybeSingle();

				if (existing) {
					storedProductId = existing.id;
					storedProduct = existing;
				} else {
					const { data: newData, error: insertErr } = await admin.from('creative_products').insert({
						user_id: userId,
						name: scannedProduct.name || 'Producto Web',
						description: scannedProduct.description || null,
						price_text: scannedProduct.priceText || null,
						currency: scannedProduct.currency || null,
						product_url: scannedProduct.productUrl || productUrl,
						source: 'website',
						external_id: scannedProduct.externalId || productUrl,
						source_image_url: scannedProduct.imageUrl || null,
						metadata: { ...scannedProduct.metadata, importedFromUrl: productUrl, sourceImageUrls: scannedProduct.imageUrls },
						is_active: true,
						updated_at: new Date().toISOString(),
						synced_at: new Date().toISOString(),
					}).select('id,name,description,price_text,currency,image_path,source_image_url').single();

					if (!insertErr && newData) {
						storedProductId = newData.id;
						storedProduct = newData;
					}
				}

				if (storedProductId && storedProduct) {
					// Se espera el espejo de fotos a propósito: los workers necesitan la
					// foto real del producto ya guardada antes de generar. Sin esto el
					// modelo dibuja un producto inventado.
					const urlsToMirror = scannedProduct.imageUrls.length ? scannedProduct.imageUrls : (scannedProduct.imageUrl ? [scannedProduct.imageUrl] : []);
					if (urlsToMirror.length) {
						try {
							await mirrorProductImages(userId, { ...storedProduct, id: storedProductId }, urlsToMirror);
						} catch (mirrorErr) {
							console.error('Error espejo fotos:', mirrorErr);
						}
					}

					// Fotos extra subidas por el usuario: se suman al producto para que
					// el modelo tenga más ángulos reales.
					for (let index = 0; index < extraImagesUploaded.length; index += 1) {
						try {
							const file = extraImagesUploaded[index];
							const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/avif' ? 'avif' : 'jpg';
							const path = `${userId}/products/${storedProductId}/upload-${index + 1}.${extension}`;
							const { error: uploadErr } = await admin.storage.from('creative-assets')
								.upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
							if (uploadErr) continue;
							await admin.from('creative_product_images').upsert({
								user_id: userId,
								product_id: storedProductId,
								storage_path: path,
								sort_order: 50 + index,
								is_primary: false,
							}, { onConflict: 'product_id,storage_path' });
						} catch (extraErr) {
							console.error('Error subiendo foto extra:', extraErr);
						}
					}
				}
			} catch (prodErr) {
				console.warn('Error guardando producto en DB, continuando sin product_id:', prodErr);
			}
		}

		// 3. Verificar cuota y reservar créditos (1 crédito por imagen del lote)
		const isAdmin = String(userEmail).toLowerCase().includes('lucagazze') || String(userEmail).toLowerCase().includes('algoritmiadesarrollos');
		if (!isAdmin) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: userId,
				p_amount: count,
			});
			if (creditError) {
				console.warn('RPC reserve_creative_credits not present or failed, falling back to profile credits check:', creditError);
				const { data: userProfile } = await admin.from('creative_profiles').select('credits').eq('id', userId).single();
				if ((userProfile?.credits || 0) < count) {
					return json({ error: `No tenés créditos suficientes (${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar este lote.`, code: 'NO_CREDITS' }, 402);
				}
				await admin.from('creative_profiles').update({ credits: Math.max(0, (userProfile?.credits || 0) - count) }).eq('id', userId);
			} else if (reserveRes === -1) {
				return json({ error: `No tenés créditos suficientes (${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar este lote.`, code: 'NO_CREDITS' }, 402);
			}
		}

		// 4. Seleccionar las mejores plantillas probadas asistidas por IA para este producto
		const templatesForBatch = await selectTemplatesWithAI(scannedProduct!, count, openAIKey);
		const batchId = crypto.randomUUID();

		// 5. Insertar las filas de generación en creative_generations (con tolerancia a esquema de DB)
		const generationRows = templatesForBatch.map((template, index) => {
			const row: any = {
				user_id: userId,
				template_id: template.id,
				title: `${scannedProduct?.name || 'Producto'} — ${template.nombre}`,
				format,
				image_type: 'product',
				variant_key: template.ring,
				product_id: storedProductId,
				user_brief: brief ? `${brief} | Formato probado: ${template.nombre} (${template.sirve})` : `Formato probado: ${template.nombre} (${template.sirve})`,
				batch_id: batchId,
				output_index: index + 1,
				requested_outputs: count,
				settings_snapshot: {
					format,
					imageType: 'product',
					templateId: template.id,
					templateName: template.nombre,
					templateRing: template.ring,
					templateN: template.n,
					productId: storedProductId,
					productName: scannedProduct?.name,
					productDescription: scannedProduct?.description || '',
					productPriceText: scannedProduct?.priceText || '',
					productCurrency: scannedProduct?.currency || '',
					productUrl,
					batchUrlMode: true,
				},
				status: 'processing',
			};
			return row;
		});

		// Sin reintento "sin batch_id": ese fallback dejaba cada fila con un
		// batch_id aleatorio y output_index 1, y la app no podía volver a
		// encontrar el lote. Si el insert falla, falla fuerte y se devuelven
		// los créditos.
		const { data: insData, error: insertErr } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index,title,template_id,status');

		if (insertErr) {
			if (!isAdmin) {
				await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: count });
			}
			const errMsg = insertErr.message || JSON.stringify(insertErr);
			throw new Error('Error guardando el lote en base de datos: ' + errMsg);
		}
		const insertedGenerations: any[] = insData || [];
		if (insertedGenerations.length !== count) {
			throw new Error(`El lote se guardó incompleto (${insertedGenerations.length} de ${count}).`);
		}

		// Asociar producto en creative_generation_products
		if (storedProductId && insertedGenerations?.length) {
			const joinRows = insertedGenerations.map((gen) => ({
				generation_id: gen.id,
				product_id: storedProductId!,
				user_id: userId,
				sort_order: 0,
			}));
			try {
				await admin.from('creative_generation_products').insert(joinRows);
			} catch (joinErr) {
				console.error('Error insert join generation products:', joinErr);
			}
		}

		// 6. El lote queda en estado 'processing'. Cada anuncio se genera con una
		// invocación independiente y corta a /api/creativos/batch-worker, disparada
		// por el cliente con concurrencia limitada y reintentable.
		// Antes todo el lote corría acá dentro con waitUntil: en Vercel la función
		// se cortaba a mitad del lote y las filas quedaban en 'processing' para
		// siempre, que es exactamente el congelamiento que se veía en la app.

		return json({
			batchId,
			count,
			product: {
				id: storedProductId,
				name: scannedProduct.name,
				description: scannedProduct.description,
				imageUrl: scannedProduct.imageUrl,
			},
			generations: insertedGenerations || [],
		});
	} catch (error: any) {
		console.error('Error en POST batch-url:', error);
		const message = typeof error === 'object' && error && 'message' in error && error.message 
			? String(error.message) 
			: typeof error === 'string' 
				? error 
				: 'No se pudo iniciar la generación del lote.';
		return json({ error: message }, 500);
	}
};
