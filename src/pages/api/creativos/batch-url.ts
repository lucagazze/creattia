import type { APIRoute } from 'astro';
import { LANGUAGE_NAMES } from '../../../lib/creattia/ad-analysis';
import { extractProductPageWithAI, type ScannedProduct } from '../../../lib/creattia/catalog-scanner';
import { loadWinners, pickWinnersForProduct, type Winner } from '../../../lib/creattia/winner-picker';
import { isCompatible, screenWinners } from '../../../lib/creattia/winner-screening';
import { analyzeBrandStyle } from '../../../lib/creattia/brand-style';
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
		const count = [5, 10, 20, 30].includes(requestedCount) ? requestedCount : 10;
		const brief = clean(form.get('brief'), 1000);
		// 'original' mantiene la proporción exacta del anuncio ganador, que es lo
		// que mejor conserva la composición al clonarlo.
		const requestedFormat = clean(form.get('format'), 20) || 'original';
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		// Estilo: paleta y tipografía del ganador (default, conserva lo que hizo
		// ganar al anuncio) o de la marca del usuario.
		const colorMode = clean(form.get('colorMode'), 8) === 'brand' ? 'brand' : 'winner';
		const typoMode = clean(form.get('typoMode'), 8) === 'brand' ? 'brand' : 'winner';
		const requestedLanguage = clean(form.get('language'), 5) || 'es';
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : 'es';
		const extraImagesUploaded = form.getAll('extraImages').filter((item): item is File => item instanceof File && item.size > 0);

		// Dos formas de arrancar:
		//   url    → se escanea la página del producto
		//   manual → el usuario escribe nombre y descripción; las fotos son opcionales
		const requestedMode = clean(form.get('mode'), 10);
		const mode: 'url' | 'manual' = requestedMode === 'manual' ? 'manual' : 'url';
		const manualName = clean(form.get('productName'), 140);
		const manualDescription = clean(form.get('productDescription'), 1200);
		const manualPrice = clean(form.get('productPriceText'), 60);

		if (mode === 'url' && !rawUrl) return json({ error: 'Ingresá la URL del producto.' }, 400);
		if (mode === 'manual' && !manualName) {
			return json({ error: 'Escribí al menos el nombre de lo que querés promocionar.' }, 400);
		}

		let productUrl = '';
		if (rawUrl) {
			try {
				productUrl = normalizeExternalUrl(rawUrl);
			} catch {
				if (mode === 'url') return json({ error: 'La URL ingresada no es válida. Verificá que sea pública e incluyas https://' }, 400);
			}
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
		if (mode !== 'url') {
			// Sin página que leer: los datos los escribió el usuario.
			scannedProduct = {
				externalId: `${mode}:${manualName}`,
				name: manualName,
				description: manualDescription,
				priceText: manualPrice,
				currency: '',
				productUrl,
				imageUrl: '',
				imageUrls: [],
				metadata: { enteredManually: true },
			};
		} else try {
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
		// Las fotos son recomendables, pero el modo manual también puede trabajar
		// solo con el nombre, descripción y referencia ganadora.
		let productPhotoCount = 0;
		if (scannedProduct) {
			try {
				const { data: existing } = await admin.from('creative_products')
					.select('id,name,description,price_text,currency,image_path,source_image_url,metadata')
					.eq('user_id', userId)
					.eq(mode === 'manual' ? 'name' : 'product_url', mode === 'manual' ? scannedProduct.name : (scannedProduct.productUrl || productUrl))
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
						product_url: scannedProduct.productUrl || productUrl || null,
						source: mode === 'manual' ? 'manual' : 'website',
						external_id: scannedProduct.externalId || productUrl,
						source_image_url: scannedProduct.imageUrl || null,
						metadata: { ...scannedProduct.metadata, importedFromUrl: productUrl, sourceImageUrls: scannedProduct.imageUrls },
						is_active: true,
						updated_at: new Date().toISOString(),
						synced_at: new Date().toISOString(),
					}).select('id,name,description,price_text,currency,image_path,source_image_url,metadata').single();

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

					// Imágenes adicionales subidas por el usuario: se suman al producto para que
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

		// En modo manual las imágenes son opcionales. Si no hay una, el worker usa
		// el nombre, descripción y la referencia ganadora sin inventar una foto.
		if (mode === 'url' && (!storedProductId || productPhotoCount === 0)) {
			const { count: existingPhotos } = storedProductId
				? await admin.from('creative_product_images').select('id', { count: 'exact', head: true })
					.eq('product_id', storedProductId).eq('user_id', userId)
				: { count: 0 };
			if (!existingPhotos) {
				return json({
					error: 'No pudimos obtener ninguna foto del producto desde esa URL. Subí al menos una foto real para continuar.',
					code: 'NO_PRODUCT_PHOTO',
				}, 422);
			}
		}

		// Marca del sitio del producto. Se guarda EN EL PRODUCTO, no en el perfil:
		// la URL que se analiza puede ser de otra marca (un producto de eBay, de
		// Frávega, de un competidor) y pisar "Mi marca" con eso hacía que un
		// anuncio de una PlayStation terminara firmado por una curtiembre.
		if (productUrl && storedProductId) {
			try {
				const origin = new URL(productUrl).origin;
				const style = await analyzeBrandStyle(origin, { openAIKey, googleKey });
				const brandFromUrl = {
					name: new URL(productUrl).hostname.replace(/^www\./, ''),
					website: origin,
					colors: (style.colors || []).slice(0, 5),
					typography: style.typography || null,
					styleSummary: style.styleSummary || '',
					logoUrl: style.logoUrl || '',
				};
				await admin.from('creative_products')
					.update({ metadata: { ...(storedProduct?.metadata || {}), brandFromUrl } })
					.eq('id', storedProductId).eq('user_id', userId);
				console.log(`[batch-url] marca del sitio detectada: ${brandFromUrl.name} (${brandFromUrl.colors.length} colores)`);
			} catch (brandError) {
				console.warn('No se pudo detectar la marca del sitio:', brandError);
			}
		}

		// 3. Elegir los anuncios GANADORES de la biblioteca que mejor pegan con este
		// producto, repartidos por tipo de anuncio para cubrir todo el embudo.
		// Este endpoint NO cobra créditos ni crea filas: solo propone las
		// referencias para que el usuario las revise y descarte las que no quiera.
		// La generación arranca después en /api/creativos/batch-start.
		const siteOrigin = new URL(request.url).origin;
		const allWinners = await loadWinners(siteOrigin);
		const { winners, spares, signals } = await pickWinnersForProduct({
			winners: allWinners,
			product: {
				name: scannedProduct?.name || 'Producto',
				description: scannedProduct?.description || '',
				priceText: scannedProduct?.priceText || '',
			},
			count,
			// El screening con visión descarta hasta 60% en productos difíciles, así
			// que se piden más candidatos para no quedarse corto. No más de eso:
			// cada candidato es una llamada de visión y alarga el análisis.
			spareCount: Math.max(16, count * 2),
			openAIKey,
			googleKey,
		});
		if (winners.length < count) {
			return json({ error: 'No hay suficientes anuncios ganadores disponibles para armar el lote.' }, 503);
		}

		// Se mira cada referencia con visión antes de mostrarla: descarta las que
		// son imposibles de clonar para este producto (una modelo fitness, una
		// ilustración anatómica, un layout sin producto). Antes esas plantillas
		// llegaban a generarse y salían anuncios sin sentido, gastando créditos.
		const productHasImage = productPhotoCount > 0 || Boolean(storedProduct?.image_path);
		const candidates = [...winners, ...spares];
		const screened = new Map<string, { compatible: boolean; why: string }>();
		try {
			const downloads = await Promise.all(candidates.map(async (winner) => {
				const { data } = await admin.storage.from('creative-references').download(winner.imagePath);
				if (!data) return null;
				return { imagePath: winner.imagePath, buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || 'image/webp' };
			}));
			const verdicts = await screenWinners(
				downloads.filter((item): item is NonNullable<typeof item> => Boolean(item)),
				{ googleKey },
			);
			for (const [imagePath, verdict] of verdicts) {
				screened.set(imagePath, isCompatible(verdict, { wearable: signals.wearable, hasImage: productHasImage }));
			}
		} catch (screeningError) {
			console.warn('Screening de referencias falló, se muestran sin filtrar:', screeningError);
		}

		const usable = (winner: Winner) => screened.get(winner.imagePath)?.compatible !== false;
		// Se rearma el lote priorizando las compatibles y tapando los huecos con
		// suplentes que también pasaron el filtro, sin repetir marca: el relleno
		// anterior salteaba ese tope y devolvía dos veces el mismo anunciante.
		const finalWinners: Winner[] = winners.filter(usable);
		const finalSpares: Winner[] = spares.filter(usable);
		const usedBrands = new Set(finalWinners.map((winner) => (winner.name || '').toLowerCase()));
		for (let index = 0; index < finalSpares.length && finalWinners.length < count; index += 1) {
			const brand = (finalSpares[index].name || '').toLowerCase();
			if (usedBrands.has(brand)) continue;
			usedBrands.add(brand);
			finalWinners.push(finalSpares.splice(index, 1)[0]);
			index -= 1;
		}
		const discarded = candidates.length - finalWinners.length - finalSpares.length;

		const toPayload = (winner: Winner) => ({
			imagePath: winner.imagePath,
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
				description: scannedProduct.description || '',
				priceText: scannedProduct.priceText || '',
				imageUrl: scannedProduct.imageUrl,
				productUrl,
			},
			mode,
			// Los necesita /api/creativos/next-reference para filtrar los reemplazos
			// sin volver a analizar el producto en cada clic.
			wearable: signals.wearable,
			hasImage: productHasImage,
			count,
			format,
			language,
			colorMode,
			typoMode,
			brief,
			winners: finalWinners.slice(0, count).map(toPayload),
			spares: finalSpares.map(toPayload),
			discarded,
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
