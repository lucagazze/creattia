import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
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

// Selecciona 'count' creativos equilibrados abarcando los diferentes anillos (rings)
function selectTemplatesForBatch(count: number): Creativo[] {
	const total = Math.min(Math.max(count, 10), 40);
	if (total >= 50) return creativos.slice(0, 50);

	const byRing = new Map<string, Creativo[]>();
	for (const c of creativos) {
		const list = byRing.get(c.ring) || [];
		list.push(c);
		byRing.set(c.ring, list);
	}

	const selected: Creativo[] = [];
	const selectedIds = new Set<number>();

	const ringPriority = ['social', 'oferta', 'vs', 'demo', 'educativo', 'autoridad'];
	for (const ring of ringPriority) {
		const items = byRing.get(ring) || [];
		for (const item of items) {
			if (!selectedIds.has(item.id)) {
				selected.push(item);
				selectedIds.add(item.id);
				break;
			}
		}
	}

	let idx = 0;
	while (selected.length < total && idx < creativos.length) {
		const candidate = creativos[idx];
		if (!selectedIds.has(candidate.id)) {
			selected.push(candidate);
			selectedIds.add(candidate.id);
		}
		idx += 1;
	}

	return selected.slice(0, total);
}

// Selección de plantillas asistida por IA para elegir las mejores estructuras probadas según el producto
async function selectTemplatesWithAI(
	scannedProduct: ScannedProduct,
	count: number,
	apiKey: string
): Promise<Creativo[]> {
	if (!apiKey) return selectTemplatesForBatch(count);
	try {
		const openai = new OpenAI({ apiKey });
		const catalogPrompt = creativos.map(c => `[ID ${c.id}] ${c.nombre} (Ring: ${c.ring}) - ${c.sirve}`).join('\n');
		const prompt = `Analizá este producto y seleccioná exactamente los ${count} MEJORES formatos publicitarios probados del catálogo que mejor se adapten a sus características para vender más:

PRODUCTO:
Nombre: "${scannedProduct.name}"
Descripción: "${scannedProduct.description || 'Sin descripción'}"

CATÁLOGO DE ESTRUCTURAS PROBADAS:
${catalogPrompt}

Respondé en formato JSON con la clave "ids" conteniendo una lista de ${count} IDs numéricos. Ejemplo: { "ids": [1, 6, 13, 23, 40, ...] }`;

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
	if (!auth.user) return json({ error: auth.error }, 401);

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

		// 2. Guardar producto en DB si es nuevo o actualizarlo
		let storedProductId: string | null = null;
		let storedProduct: any = null;
		if (scannedProduct) {
			const { data: upsertData, error: upsertErr } = await admin.from('creative_products').upsert({
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
			}, { onConflict: 'user_id,source,external_id' }).select('id,name,description,price_text,currency,image_path,source_image_url').single();

			if (!upsertErr && upsertData) {
				storedProductId = upsertData.id;
				storedProduct = upsertData;
				// Espejar imágenes en Supabase Storage
				const urlsToMirror = scannedProduct.imageUrls.length ? scannedProduct.imageUrls : (scannedProduct.imageUrl ? [scannedProduct.imageUrl] : []);
				if (urlsToMirror.length) {
					mirrorProductImages(userId, upsertData, urlsToMirror).catch((err) => console.error('Error espejo fotos:', err));
				}
			}
		}

		// 3. Verificar cuota y reservar créditos (1 crédito por imagen del lote)
		const isAdmin = String(userEmail).toLowerCase().includes('lucagazze');
		if (!isAdmin) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: userId,
				p_amount: count,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) return json({ error: `No tenés créditos suficientes (${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar este lote.`, code: 'NO_CREDITS' }, 402);
		}

		// 4. Seleccionar las mejores plantillas probadas asistidas por IA para este producto
		const templatesForBatch = await selectTemplatesWithAI(scannedProduct!, count, openAIKey);
		const batchId = crypto.randomUUID();

		// 5. Insertar las filas de generación en creative_generations
		const generationRows = templatesForBatch.map((template, index) => ({
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
				productName: scannedProduct?.name,
				productUrl,
				batchUrlMode: true,
			},
			status: 'processing',
		}));

		const { data: insertedGenerations, error: insertErr } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index,title,template_id,status');
		if (insertErr) throw insertErr;

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

		// 6. Lanzar la generación en paralelo en segundo plano
		const runBatchPipeline = async () => {
			const activeGoogleKey = googleKey;
			const activeOpenAIKey = openAIKey;

			// Procesamiento concurrente en grupos de 5 paralelizados
			const concurrency = 5;
			const generationsList = insertedGenerations || [];

			for (let i = 0; i < generationsList.length; i += concurrency) {
				const chunk = generationsList.slice(i, i + concurrency);
				await Promise.allSettled(chunk.map(async (genRow) => {
					const tpl = templatesForBatch.find((t) => t.id === genRow.template_id) || templatesForBatch[0];
					try {
						// Construir el prompt optimizado para el formato probado
						const prompt = `Create a high-converting performance static ad creative for ecommerce.
BRAND / PRODUCT NAME: ${scannedProduct?.name || 'Featured Product'}
PRODUCT DESCRIPTION: ${scannedProduct?.description || 'Premium ecommerce product.'}
PRICE: ${scannedProduct?.priceText ? `${scannedProduct.priceText} ${scannedProduct.currency || ''}` : 'Special offer available'}

PROVEN AD ANGLE / FRAMEWORK: "${tpl.nombre}" (Category: ${tpl.ring.toUpperCase()}, Awareness Level: ${tpl.n})
WHY THIS ANGLE WORKS: ${tpl.sirve}
WHEN TO USE: ${tpl.cuando}

DESIGN DIRECTION:
- Produce a polished, studio-quality static ad for social media (${format}).
- Show the product prominently with realistic lighting, clean edges and professional direct-response typography.
- Copy must be written in natural Argentine Spanish (or language of the product), short, punchy and highly converting.
- Include visual cues matching the "${tpl.nombre}" framework (e.g. 5 stars for review, clean comparison layout for Vs, callout arrows, or price tag).
${brief ? `USER DIRECTION: ${brief}` : ''}`;

						let imageBuffer: Buffer | null = null;
						let mimeType = 'image/png';

						// Intentar primero con Gemini Image (rápido y costo-eficiente)
						if (activeGoogleKey) {
							const aspect = format === 'story' || format === '9:16' ? '9:16' : (format === 'portrait' || format === '3:4' ? '3:4' : '1:1');
							const parts: any[] = [{ text: prompt }];

							// Si tenemos imagen fuente del producto
							if (scannedProduct?.imageUrl && scannedProduct.imageUrl.startsWith('http')) {
								try {
									const imgRes = await fetch(scannedProduct.imageUrl);
									if (imgRes.ok) {
										const buf = Buffer.from(await imgRes.arrayBuffer());
										const mime = imgRes.headers.get('content-type') || 'image/jpeg';
										parts.push({ inline_data: { mime_type: mime, data: buf.toString('base64') } });
									}
								} catch { /* continuar si no descarga */ }
							}

							const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeGoogleKey}`, {
								method: 'POST',
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({
									contents: [{ parts }],
									generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
								}),
							});

							if (response.ok) {
								const data: any = await response.json().catch(() => ({}));
								const part = data.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data || item.inline_data?.data);
								if (part) {
									imageBuffer = Buffer.from(part.inlineData?.data || part.inline_data?.data, 'base64');
									mimeType = part.inlineData?.mimeType || 'image/png';
								}
							}
						}

						// Fallback a OpenAI gpt-image si Gemini falla o no está disponible
						if (!imageBuffer && activeOpenAIKey) {
							const openAI = new OpenAI({ apiKey: activeOpenAIKey });
							const response = await openAI.images.generate({
								model: 'gpt-image-1',
								prompt: prompt.slice(0, 1000),
								n: 1,
								size: format === 'story' || format === '9:16' ? '1024x1536' : '1024x1024',
							});
							const firstImage = response.data?.[0];
							if (firstImage?.b64_json) {
								imageBuffer = Buffer.from(firstImage.b64_json, 'base64');
							} else if (firstImage?.url) {
								const imgRes = await fetch(firstImage.url);
								if (imgRes.ok) imageBuffer = Buffer.from(await imgRes.arrayBuffer());
							}
						}

						if (!imageBuffer) throw new Error('No se pudo generar la imagen para este creativo.');

						// Guardar imagen en Supabase Storage
						const ext = mimeType.includes('png') ? 'png' : 'jpg';
						const outputPath = `${userId}/batch/${batchId}/${genRow.id}.${ext}`;
						const { error: uploadErr } = await admin.storage.from('creative-assets').upload(outputPath, imageBuffer, {
							contentType: mimeType,
							upsert: true,
						});
						if (uploadErr) throw uploadErr;

						// Actualizar estado de la generación en DB
						await admin.from('creative_generations').update({
							status: 'completed',
							output_path: outputPath,
							updated_at: new Date().toISOString(),
						}).eq('id', genRow.id);

					} catch (genError) {
						console.error(`Error al generar item ${genRow.id} del lote:`, genError);
						const msg = genError instanceof Error ? genError.message : 'Error de generación';
						await admin.from('creative_generations').update({
							status: 'failed',
							error_message: msg.slice(0, 500),
							updated_at: new Date().toISOString(),
						}).eq('id', genRow.id);
					}
				}));
			}
		};

		// Ejecutar la tarea pesada en background sin bloquear la respuesta HTTP
		waitUntil(runBatchPipeline());

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
	} catch (error) {
		console.error('Error en POST batch-url:', error);
		const message = error instanceof Error ? error.message : 'No se pudo iniciar la generación del lote.';
		return json({ error: message }, 500);
	}
};
