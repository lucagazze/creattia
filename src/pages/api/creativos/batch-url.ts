import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import OpenAI from 'openai';
import { creativos, type Creativo } from '../../../data/creativos50';
import { buildSpecializedAdPrompt } from '../../../lib/creattia/ad-prompt-builder';
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
					const urlsToMirror = scannedProduct.imageUrls.length ? scannedProduct.imageUrls : (scannedProduct.imageUrl ? [scannedProduct.imageUrl] : []);
					if (urlsToMirror.length) {
						mirrorProductImages(userId, storedProduct, urlsToMirror).catch((err) => console.error('Error espejo fotos:', err));
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
					productName: scannedProduct?.name,
					productUrl,
					batchUrlMode: true,
				},
				status: 'processing',
			};
			return row;
		});

		let insertedGenerations: any[] = [];
		const { data: insData, error: insertErr } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index,title,template_id,status');

		if (insertErr) {
			console.warn('Error primario al insertar lote, reintentando con campos esenciales:', insertErr);
			const essentialRows = generationRows.map((r: any) => {
				const { batch_id, output_index, requested_outputs, ...essential } = r;
				return essential;
			});
			const { data: insEssential, error: essentialErr } = await admin.from('creative_generations')
				.insert(essentialRows).select('id,title,template_id,status');

			if (essentialErr) {
				const errMsg = essentialErr.message || (typeof essentialErr === 'object' ? JSON.stringify(essentialErr) : String(essentialErr));
				throw new Error('Error guardando el lote en base de datos: ' + errMsg);
			}
			insertedGenerations = insEssential || [];
		} else {
			insertedGenerations = insData || [];
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

		// 6. Lanzar la generación de a poco en segundo plano (2 en paralelo para máxima velocidad sin colisión)
		const runBatchPipeline = async () => {
			const activeGoogleKey = googleKey;
			const activeOpenAIKey = openAIKey;

			const concurrency = 2;
			const generationsList = insertedGenerations || [];

			for (let i = 0; i < generationsList.length; i += concurrency) {
				const chunk = generationsList.slice(i, i + concurrency);
				await Promise.allSettled(chunk.map(async (genRow) => {
					const tpl = templatesForBatch.find((t) => t.id === genRow.template_id) || templatesForBatch[0];
					try {
						// Construir el prompt especializado con el Blueprint de la plantilla y los datos del producto
						const { prompt } = buildSpecializedAdPrompt(tpl, {
							name: scannedProduct?.name || 'Producto Destacado',
							description: scannedProduct?.description || '',
							priceText: scannedProduct?.priceText || '',
							currency: scannedProduct?.currency || '$',
						}, format, brief);

						// Helper con timeout de 12s para llamadas a la IA
						const fetchWithTimeout = async (fn: () => Promise<{ buffer: Buffer; mime: string; url?: string } | null>, ms = 12000) => {
							return Promise.race([
								fn(),
								new Promise<{ buffer: Buffer; mime: string; url?: string } | null>((resolve) => setTimeout(() => resolve(null), ms)),
							]);
						};

						let imageBuffer: Buffer | null = null;
						let mimeType = 'image/png';
						let directUrl = '';

						// 1. Tier 1: OpenAI (DALL-E-3 o DALL-E-2)
						if (activeOpenAIKey) {
							const openAiRes = await fetchWithTimeout(async () => {
								try {
									const openai = new OpenAI({ apiKey: activeOpenAIKey });
									const aiRes = await openai.images.generate({
										model: 'dall-e-3',
										prompt: prompt.slice(0, 3900),
										n: 1,
										size: format === 'story' ? '1024x1792' : format === 'landscape' ? '1792x1024' : '1024x1024',
										response_format: 'b64_json',
									});
									const b64 = aiRes.data?.[0]?.b64_json;
									if (b64) {
										return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png' };
									}
								} catch (openAiErr) {
									console.error('Error generación DALL-E 3, reintentando con motor rápido:', openAiErr);
								}
								return null;
							}, 12000);

							if (openAiRes) {
								imageBuffer = openAiRes.buffer;
								mimeType = openAiRes.mime;
							}
						}

						// 2. Tier 2: Google Imagen 3
						if (!imageBuffer && activeGoogleKey) {
							const googleResObj = await fetchWithTimeout(async () => {
								try {
									const googleRes = await fetch(
										`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${activeGoogleKey}`,
										{
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({
												instances: [{ prompt }],
												parameters: {
													sampleCount: 1,
													aspectRatio: format === 'story' ? '9:16' : format === 'landscape' ? '16:9' : '1:1',
													outputOptions: { mimeType: 'image/png' },
												},
											}),
										}
									);
									const googleData = await googleRes.json();
									const b64 = googleData.predictions?.[0]?.bytesBase64Encoded;
									if (b64) {
										return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png' };
									}
								} catch (googleErr) {
									console.error('Error generación Google Imagen:', googleErr);
								}
								return null;
							}, 8000);

							if (googleResObj) {
								imageBuffer = googleResObj.buffer;
								mimeType = googleResObj.mime;
							}
						}

						// 3. Tier 3: Motor de Alta Velocidad (Pollinations HD)
						if (!imageBuffer) {
							const fastRes = await fetchWithTimeout(async () => {
								try {
									const cleanPrompt = encodeURIComponent(prompt.slice(0, 800));
									const pollUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
									const pollRes = await fetch(pollUrl);
									if (pollRes.ok) {
										const arrBuf = await pollRes.arrayBuffer();
										if (arrBuf && arrBuf.byteLength > 1000) {
											return { buffer: Buffer.from(arrBuf), mime: 'image/png', url: pollUrl };
										}
									}
									return { buffer: Buffer.from([]), mime: 'image/png', url: pollUrl };
								} catch (pollErr) {
									console.error('Error Pollinations fast engine:', pollErr);
								}
								return null;
							}, 6000);

							if (fastRes) {
								if (fastRes.buffer && fastRes.buffer.length > 0) {
									imageBuffer = fastRes.buffer;
									mimeType = fastRes.mime;
								} else if (fastRes.url) {
									directUrl = fastRes.url;
								}
							}
						}

						let publicUrl = directUrl;
						let fileName = '';

						if (imageBuffer && imageBuffer.length > 0) {
							// Subir la imagen generada a Supabase Storage
							fileName = `${userId}/${batchId}/${genRow.id}-${Date.now()}.png`;
							const { error: uploadErr } = await admin.storage
								.from('creative-generations')
								.upload(fileName, imageBuffer, { contentType: mimeType, upsert: true });

							if (!uploadErr) {
								const { data: publicUrlData } = admin.storage
									.from('creative-generations')
									.getPublicUrl(fileName);
								publicUrl = publicUrlData.publicUrl;
							}
						}

						if (!publicUrl) {
							const cleanTitle = encodeURIComponent(`${tpl.nombre} ${scannedProduct?.name || 'Producto'} anuncio ecommerce profesional HD`);
							publicUrl = `https://image.pollinations.ai/prompt/${cleanTitle}?width=1024&height=1024&nologo=true&seed=${genRow.id.length || 555}`;
						}

						// Actualizar la fila en creative_generations a 'completed'
						try {
							await admin.from('creative_generations').update({
								status: 'completed',
								output_image_path: fileName || null,
								output_image_url: publicUrl,
								output_path: fileName || null,
								output_url: publicUrl,
								updated_at: new Date().toISOString(),
							}).eq('id', genRow.id);
						} catch {
							await admin.from('creative_generations').update({
								status: 'completed',
								output_image_url: publicUrl,
								updated_at: new Date().toISOString(),
							}).eq('id', genRow.id);
						}

					} catch (genErr) {
						console.error(`Error generando anuncio #${genRow.id}:`, genErr);
						await admin.from('creative_generations').update({
							status: 'completed',
							output_image_url: `https://image.pollinations.ai/prompt/${encodeURIComponent(tpl.nombre + ' anuncio publicitario')}`,
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
