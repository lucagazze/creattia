import type { APIRoute } from 'astro';
import { LANGUAGE_NAMES } from '../../../lib/creattia/ad-analysis';
import { extractProductPageWithAI, type ScannedProduct } from '../../../lib/creattia/catalog-scanner';
import { loadWinners, pickWinnersForProduct } from '../../../lib/creattia/winner-picker';
import { mirrorProductImages } from '../../../lib/creattia/product-assets';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 300;

const acceptedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
		// 'original' mantiene la proporción exacta del anuncio ganador, que es lo
		// que mejor conserva la composición al clonarlo.
		const requestedFormat = clean(form.get('format'), 20) || 'original';
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		const requestedLanguage = clean(form.get('language'), 5) || 'es';
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : 'es';
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

		// 1. Extraer el producto de la URL.
		// Antes, si esto fallaba se guardaba un producto vacío llamado "Producto
		// desde URL" y el error real quedaba en los logs: el usuario recibía un
		// mensaje equivocado sobre las fotos. Ahora se devuelve la causa concreta.
		let scannedProduct: ScannedProduct;
		try {
			scannedProduct = await extractProductPageWithAI(productUrl, openAIKey);
		} catch (extractErr) {
			const detail = extractErr instanceof Error ? extractErr.message : String(extractErr);
			console.error('Fallo la extracción del producto:', extractErr);
			return json({
				error: `No pudimos leer la página del producto. ${detail}`,
				code: 'SCAN_FAILED',
			}, 502);
		}

		// 2. Guardar producto en DB si es nuevo o actualizarlo (de forma segura)
		let storedProductId: string | null = null;
		let storedProduct: any = null;
		// Sin al menos una foto real no se puede clonar un ganador: el modelo
		// tendría que inventar el producto, que es justo lo que no queremos.
		let productPhotoCount = 0;
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
							const mirrored = await mirrorProductImages(userId, { ...storedProduct, id: storedProductId }, urlsToMirror);
							productPhotoCount += mirrored.length;
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
							productPhotoCount += 1;
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

		// Si no hay ninguna foto real del producto, se corta antes de cobrar: el
		// resultado serían anuncios con un producto inventado.
		if (!storedProductId || productPhotoCount === 0) {
			const { count: existingPhotos } = storedProductId
				? await admin.from('creative_product_images').select('id', { count: 'exact', head: true })
					.eq('product_id', storedProductId).eq('user_id', userId)
				: { count: 0 };
			if (!existingPhotos) {
				return json({
					error: 'No pudimos obtener ninguna foto del producto desde esa URL. Subí al menos una foto real en "Más fotos e instrucciones" y volvé a intentar.',
					code: 'NO_PRODUCT_PHOTO',
				}, 422);
			}
		}

		// 3. Elegir los anuncios GANADORES de la biblioteca que mejor pegan con este
		// producto, repartidos por tipo de anuncio para cubrir todo el embudo.
		// Este endpoint NO cobra créditos ni crea filas: solo propone las
		// referencias para que el usuario las revise y descarte las que no quiera.
		// La generación arranca después en /api/creativos/batch-start.
		const siteOrigin = new URL(request.url).origin;
		const allWinners = await loadWinners(siteOrigin);
		const { winners, spares, signals, scoreByPath, minRelevance } = await pickWinnersForProduct({
			winners: allWinners,
			product: {
				name: scannedProduct?.name || 'Producto',
				description: scannedProduct?.description || '',
				priceText: scannedProduct?.priceText || '',
			},
			count,
			spareCount: Math.max(12, count),
			openAIKey,
			googleKey,
		});
		if (winners.length < count) {
			return json({ error: 'No hay suficientes anuncios ganadores disponibles para armar el lote.' }, 503);
		}

		const toPayload = (winner: typeof winners[number]) => ({
			imagePath: winner.imagePath,
			// Para que la UI marque cuáles pegan poco con el producto y el usuario
			// los reemplace primero.
			weakMatch: (scoreByPath.get(winner.imagePath) || 0) < minRelevance,
			name: winner.name,
			notes: winner.promptNotes || '',
			leaf: winner.categoryLeaf || '',
			niches: winner.metadata?.foreplayNiches || [],
			templateId: winner.templateId || null,
			domain: winner.metadata?.domain || '',
		});

		return json({
			product: {
				id: storedProductId,
				name: scannedProduct.name,
				description: scannedProduct.description,
				priceText: scannedProduct.priceText,
				imageUrl: scannedProduct.imageUrl,
				productUrl,
			},
			count,
			format,
			language,
			quality: clean(form.get('quality'), 6) === 'text' ? 'text' : 'fast',
			brief,
			matchedNiches: signals.niches,
			winners: winners.map(toPayload),
			spares: spares.map(toPayload),
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
