import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { analyzeBrandStyle, persistBrandStyle } from '../../../lib/creattia/brand-style';
import { extractProductPageWithAI, type ScannedProduct } from '../../../lib/creattia/catalog-scanner';
import { mirrorProductImages, mirrorProductVideos } from '../../../lib/creattia/product-assets';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, checkRateLimit, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { countProductImages, listProductImageRows, upsertProductMediaRows } from '../../../lib/creattia/product-media';

export const prerender = false;
export const maxDuration = 180;

const mimeExtensions: Record<string, string> = {
	'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif',
};

async function listProducts(userId: string) {
	const admin = getAdminClient();
	if (!admin) throw new Error('Supabase no está configurado.');
	const { data, error } = await admin.from('creative_products')
		.select('id,name,description,price_text,currency,product_url,image_path,source,source_image_url,metadata,analysis,updated_at')
		.eq('user_id', userId).eq('is_active', true).order('updated_at', { ascending: false }).limit(200);
	if (error) throw error;
	const ids = (data || []).map((product) => product.id);
	let imageRows: Array<any> = [];
	if (ids.length) {
		const mediaResult = await admin.from('creative_product_images')
			.select('product_id,storage_path,source_url,sort_order,is_primary,media_type,metadata')
			.eq('user_id', userId).in('product_id', ids).order('sort_order');
		if (!mediaResult.error) {
			imageRows = mediaResult.data || [];
		} else if (/media_type|schema cache|column|does not exist/i.test(mediaResult.error.message || '')) {
			// Compatibilidad mientras la migración de videos termina de propagarse.
			// El catálogo sigue mostrando las imágenes antiguas y las trata como tales.
			const legacyResult = await admin.from('creative_product_images')
				.select('product_id,storage_path,source_url,sort_order,is_primary')
				.eq('user_id', userId).in('product_id', ids).order('sort_order');
			if (legacyResult.error) throw legacyResult.error;
			imageRows = (legacyResult.data || []).map((row) => ({ ...row, media_type: 'image', metadata: {} }));
		} else {
			throw mediaResult.error;
		}
	}
	const imagesByProduct = new Map<string, Array<any>>();
	for (const row of imageRows || []) {
		const current = imagesByProduct.get(row.product_id) || [];
		current.push(row); imagesByProduct.set(row.product_id, current);
	}
	const allPaths = [...new Set((data || []).flatMap((product) => [
		product.image_path,
		...(imagesByProduct.get(product.id) || []).map((row) => row.storage_path),
	]).filter(Boolean) as string[])];
	const signedByPath = new Map<string, string>();
	if (allPaths.length) {
		const { data: signedRows } = await admin.storage.from('creative-assets').createSignedUrls(allPaths, 60 * 60);
		(signedRows || []).forEach((row, index) => { if (row.signedUrl) signedByPath.set(allPaths[index], row.signedUrl); });
	}
	return (data || []).map((product) => {
		const rows = imagesByProduct.get(product.id) || [];
		const metadata = (product.metadata && typeof product.metadata === 'object' ? product.metadata : {}) as Record<string, any>;
		const media: Array<{ path: string; url: string; type: 'image' | 'video'; sourceUrl?: string }> = [];
		const seenPaths = new Set<string>();
		const seenUrls = new Set<string>();
		const seenSourceUrls = new Set<string>();
		const addMedia = (item: { path?: string; url?: string; type?: 'image' | 'video'; sourceUrl?: string }) => {
			const path = item.path || '';
			const url = item.url || item.sourceUrl || '';
			if (!url || (path && seenPaths.has(path)) || seenUrls.has(url) || (item.sourceUrl && seenSourceUrls.has(item.sourceUrl))) return;
			if (path) seenPaths.add(path);
			seenUrls.add(url);
			if (item.sourceUrl) seenSourceUrls.add(item.sourceUrl);
			media.push({ path, url, type: item.type || 'image', sourceUrl: item.sourceUrl });
		};
		rows.forEach((row) => addMedia({
			path: row.storage_path,
			url: signedByPath.get(row.storage_path) || row.source_url || '',
			type: row.media_type === 'video' || row.metadata?.mediaType === 'video' ? 'video' : 'image',
			sourceUrl: row.source_url || undefined,
		}));
		if (product.image_path && !seenPaths.has(product.image_path)) {
			addMedia({ path: product.image_path, url: signedByPath.get(product.image_path) || product.source_image_url || '', type: 'image', sourceUrl: product.source_image_url || undefined });
		}
		// Mirrored rows are the curated gallery. The old metadata fallback could
		// expose every image found on the page, including related products.
		if (!rows.some((row) => row.media_type !== 'video' && row.metadata?.mediaType !== 'video')) {
			const sourceImageUrls = Array.isArray(metadata.sourceImageUrls) ? metadata.sourceImageUrls.slice(0, 24) : [];
			sourceImageUrls.forEach((url: unknown) => addMedia({ url: String(url || ''), type: 'image', sourceUrl: String(url || '') }));
		}
		const sourceVideoUrls = Array.isArray(metadata.sourceVideoUrls) ? metadata.sourceVideoUrls : [];
		sourceVideoUrls.forEach((url: unknown) => addMedia({ url: String(url || ''), type: 'video', sourceUrl: String(url || '') }));
		const images = media.filter((item) => item.type === 'image');
		const videos = media.filter((item) => item.type === 'video');
		const imageUrls = images.map((item) => item.url);
		return {
			...product,
			media,
			images,
			videos,
			imageUrl: imageUrls[0] || '',
			imageUrls,
			videoUrls: videos.map((item) => item.url),
			imageCount: imageUrls.length,
			mediaCount: media.length,
		};
	});
}

async function importProductUrls(userId: string, rawUrls: unknown[]) {
	const admin = getAdminClient();
	if (!admin) throw new Error('Supabase no está configurado.');
	const apiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	const groqApiKey = process.env.GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	if (!apiKey && !groqApiKey) throw new Error('Falta configurar las credenciales de IA (OpenAI o Groq).');

	const errors: Array<{ url: string; error: string }> = [];
	const normalized = rawUrls.flatMap((value) => {
		const raw = String(value).trim().slice(0, 500);
		try { return raw ? [normalizeExternalUrl(raw)] : []; }
		catch (error) { errors.push({ url: raw, error: error instanceof Error ? error.message : 'URL inválida.' }); return []; }
	});
	const urls = [...new Set(normalized)].slice(0, 5);
	if (!urls.length) throw new Error('Pegá al menos una URL de producto.');

	// AI-first extraction: each URL is analyzed independently by GPT-4o-mini
	const importedIds: string[] = [];
	for (const url of urls) {
		try {
			// 1. Se analiza la página: qué tipo es y qué productos tiene.
			const page = await extractProductPageWithAI(url, apiKey);

			// 2. Una fila por producto detectado. En una página de catálogo son
			//    varios; en una ficha o una landing de servicio, uno solo. Antes
			//    siempre se creaba uno y la home de una tienda entraba como un
			//    "producto 1" con todas las fotos de la página mezcladas.
			for (const product of page.products) {
			const baseMetadata = {
				...product.metadata,
				importedFromUrl: url,
				sourceImageUrls: product.imageUrls,
				sourceVideoUrls: product.videoUrls || [],
				aiExtracted: true,
				// Contexto de la página completa: el anuncio de un catálogo habla
				// del negocio, no de un ítem suelto.
				pageType: page.pageType,
				store: page.store,
			};
			const { data: stored, error } = await admin.from('creative_products').upsert({
				user_id: userId,
				name: product.name,
				description: product.description || null,
				price_text: product.priceText || null,
				currency: product.currency || null,
				product_url: product.productUrl || url,
				source: 'website',
				external_id: product.externalId || url,
				source_image_url: product.imageUrl || null,
				metadata: baseMetadata,
				analysis: {
					category: product.metadata?.category || '',
					keywords: [],
				},
				is_active: true,
				updated_at: new Date().toISOString(),
				synced_at: new Date().toISOString(),
			}, { onConflict: 'user_id,source,external_id' })
				.select('id,name,image_path,source_image_url')
				.single();

			if (error) throw error;

			// 3. Mirror product images into Supabase Storage
			if (product.imageUrls?.length) {
				await mirrorProductImages(userId, stored, product.imageUrls);
			} else if (product.imageUrl) {
				await mirrorProductImages(userId, stored, [product.imageUrl]);
			}
			if (product.videoUrls?.length) {
				await mirrorProductVideos(userId, stored, product.videoUrls);
			}

			// Marca del sitio de este producto (no "Mi marca": puede ser la web de
			// otra marca). Se guarda en el producto para poder ofrecer "Marca de la
			// URL" como opción de identidad al generar el anuncio.
			try {
				const origin = new URL(url).origin;
				const style = await analyzeBrandStyle(origin, { openAIKey: apiKey, googleKey });
				const brandFromUrl = {
					name: new URL(url).hostname.replace(/^www\./, ''),
					website: origin,
					colors: (style.colors || []).slice(0, 5),
					palette: style.palette || null,
					typography: style.typography || null,
					styleSummary: style.styleSummary || '',
					logoUrl: style.logoUrl || '',
				};
				await admin.from('creative_products')
					.update({ metadata: { ...baseMetadata, brandFromUrl } })
					.eq('id', stored.id).eq('user_id', userId);
			} catch (brandError) {
				console.warn('No se pudo detectar la marca del sitio:', brandError);
			}

			importedIds.push(stored.id as string);
			}
		} catch (err) {
			errors.push({ url, error: err instanceof Error ? err.message : 'No se pudo analizar el producto.' });
		}
	}

	// Primera importación: aprender el estilo de la marca desde su web
	// (logo, colores, tipografía, estética) scrapeando home + páginas internas.
	if (importedIds.length) {
		// Análisis de marca en background sin bloquear el import: waitUntil evita
		// que Vercel mate la promesa al devolver la respuesta.
		const brandStylePromise = (async () => {
			try {
				const { data: profile } = await admin.from('creative_profiles')
					.select('brand_style').eq('user_id', userId).maybeSingle();
				if (!profile?.brand_style) {
					const origin = new URL(urls[0]).origin;
					const style = await analyzeBrandStyle(origin, apiKey);
					await persistBrandStyle(admin, userId, style);
				}
			} catch (styleErr) {
				console.error('Background brand style analysis failed:', styleErr);
			}
		})();
		try { waitUntil(brandStylePromise); } catch { /* dev local */ }
	}

	return { importedIds, errors };
}


export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	try { return json({ products: await listProducts(auth.user.id) }); }
	catch (error) { return json({ error: error instanceof Error ? error.message : 'No se pudo cargar el catálogo.' }, 500); }
};

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	let productId = '';
	let uploadedPath = '';
	let uploadedPaths: string[] = [];
	try {
		if ((request.headers.get('content-type') || '').includes('application/json')) {
			const body = await request.json().catch(() => ({}));
			const rawUrls = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
			if (rawUrls.length > 10) return json({ error: 'Podés importar hasta 10 URLs por vez.' }, 400);
			// Cada análisis llama a OpenAI aunque no gaste créditos: sin tope se
			// puede hacer costar plata sin límite.
			const withinLimit = await checkRateLimit(admin, auth.user.id, 'product-url-scan', 30, 3600, true);
			if (!withinLimit) return json({ error: 'Analizaste muchas URLs en poco tiempo. Esperá un rato y volvé a intentar.' }, 429);
			const imported = await importProductUrls(auth.user.id, rawUrls);
			const products = await listProducts(auth.user.id);
			const importedSet = new Set(imported.importedIds);
			return json({ ...imported, products: products.filter((product) => importedSet.has(product.id)) }, imported.importedIds.length ? 201 : 422);
		}

		const form = await request.formData();
		// Agregar fotos a un producto existente
		const existingProductId = String(form.get('productId') || '').trim().slice(0, 60);
		if (existingProductId) {
			const { data: owned, error: ownedError } = await admin.from('creative_products').select('id,image_path')
				.eq('id', existingProductId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
			if (ownedError) throw ownedError;
			if (!owned) return json({ error: 'El producto no existe.' }, 404);
			const files = form.getAll('image').filter((file): file is File => file instanceof File && file.size > 0).slice(0, 6);
			if (!files.length) return json({ error: 'Subi al menos una foto.' }, 400);
			let sortOrder = await countProductImages(admin, auth.user.id, existingProductId);
			let firstPath = '';
			for (const file of files) {
				if (!mimeExtensions[file.type]) return json({ error: 'Usa imagenes PNG, JPG, WebP o AVIF.' }, 415);
				if (file.size > 15 * 1024 * 1024) return json({ error: 'Una de las imagenes supera los 15 MB.' }, 413);
				const path = `${auth.user.id}/products/${existingProductId}/extra-${Date.now()}-${sortOrder}.${mimeExtensions[file.type]}`;
				if (!firstPath) firstPath = path;
				const { error: uploadError } = await admin.storage.from('creative-assets').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: true });
				if (uploadError) throw uploadError;
				await upsertProductMediaRows(admin, [{
					user_id: auth.user.id, product_id: existingProductId, storage_path: path, sort_order: sortOrder, is_primary: false, media_type: 'image',
				}], 'image');
				sortOrder += 1;
			}
			if (!owned.image_path && firstPath) {
				await admin.from('creative_products').update({ image_path: firstPath, updated_at: new Date().toISOString() }).eq('id', existingProductId);
			}
			return json({ products: await listProducts(auth.user.id) }, 201);
		}
		const name = String(form.get('name') || '').trim().slice(0, 180);
		const description = String(form.get('description') || '').trim().slice(0, 1600);
		const priceText = String(form.get('priceText') || '').trim().slice(0, 60);
		const rawProductUrl = String(form.get('productUrl') || '').trim().slice(0, 500);
		const productUrl = rawProductUrl ? normalizeExternalUrl(rawProductUrl) : '';
		const images = form.getAll('image').filter((file): file is File => file instanceof File && file.size > 0).slice(0, 5);
		const image = images[0];
		for (const file of images) {
			if (!mimeExtensions[file.type]) return json({ error: 'Formato de imagen no soportado.' }, 415);
			if (file.size > 15 * 1024 * 1024) return json({ error: 'Una imagen supera los 15 MB.' }, 413);
		}
		if (!name) return json({ error: 'Poné un nombre para el producto.' }, 400);
		if (!(image instanceof File) || !image.size) return json({ error: 'Subí una imagen del producto.' }, 400);
		if (!mimeExtensions[image.type]) return json({ error: 'Usá una imagen PNG, JPG, WebP o AVIF.' }, 415);
		if (image.size > 15 * 1024 * 1024) return json({ error: 'La imagen supera los 15 MB.' }, 413);

		const { data: product, error: insertError } = await admin.from('creative_products').insert({
			user_id: auth.user.id, name, description: description || null, price_text: priceText || null,
			product_url: productUrl || null, source: 'manual', external_id: crypto.randomUUID(), synced_at: new Date().toISOString(),
		}).select('id').single();
		if (insertError) throw insertError;
		productId = product.id;

		const path = `${auth.user.id}/products/${product.id}/primary.${mimeExtensions[image.type]}`;
		const bytes = new Uint8Array(await image.arrayBuffer());
		const { error: uploadError } = await admin.storage.from('creative-assets').upload(path, bytes, { contentType: image.type, upsert: true });
		if (uploadError) throw uploadError;
		uploadedPath = path;
		uploadedPaths = [path];
		const { error: updateError } = await admin.from('creative_products').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', product.id).eq('user_id', auth.user.id);
		if (updateError) throw updateError;
		await upsertProductMediaRows(admin, [{
			user_id: auth.user.id, product_id: product.id, storage_path: path, sort_order: 0, is_primary: true, media_type: 'image',
		}], 'image');
		for (let index = 1; index < images.length; index += 1) {
			const extra = images[index];
			const extraPath = `${auth.user.id}/products/${product.id}/extra-${index}.${mimeExtensions[extra.type]}`;
			const { error: extraUploadError } = await admin.storage.from('creative-assets').upload(extraPath, new Uint8Array(await extra.arrayBuffer()), { contentType: extra.type, upsert: true });
			if (extraUploadError) throw extraUploadError;
			uploadedPaths.push(extraPath);
			await upsertProductMediaRows(admin, [{
				user_id: auth.user.id, product_id: product.id, storage_path: extraPath, sort_order: index, is_primary: false, media_type: 'image',
			}], 'image');
		}
		const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(path, 60 * 60);
		return json({ product: { id: product.id, name, description, price_text: priceText, product_url: productUrl, image_path: path, source: 'manual', imageUrl: signed?.signedUrl || '' } }, 201);
	} catch (error) {
		const pathsToRemove = [...new Set([uploadedPath, ...uploadedPaths].filter(Boolean))];
		if (pathsToRemove.length) await admin.storage.from('creative-assets').remove(pathsToRemove);
		if (productId) await admin.from('creative_products').delete().eq('id', productId).eq('user_id', auth.user.id);
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar el producto.' }, 500);
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const params = new URL(request.url).searchParams;
	// Quitar UNA foto de un producto (sin borrar el producto)
	const imagePath = params.get('path') || '';
	const imageProductId = params.get('productId') || '';
	if (imagePath && imageProductId) {
		if (!imagePath.startsWith(`${auth.user.id}/`)) return json({ error: 'Foto invalida.' }, 400);
		const { error: rowError } = await admin.from('creative_product_images').delete()
			.eq('user_id', auth.user.id).eq('product_id', imageProductId).eq('storage_path', imagePath);
		if (rowError) return fail('products', rowError, 'No se pudo completar la operación sobre el catálogo.');
		const { data: productRow } = await admin.from('creative_products').select('image_path')
			.eq('id', imageProductId).eq('user_id', auth.user.id).maybeSingle();
		if (productRow?.image_path === imagePath) {
			const nextImage = (await listProductImageRows(admin, auth.user.id, [imageProductId]))[0];
			await admin.from('creative_products').update({ image_path: nextImage?.storage_path || null, updated_at: new Date().toISOString() })
				.eq('id', imageProductId).eq('user_id', auth.user.id);
		}
		return json({ products: await listProducts(auth.user.id) });
	}
	const id = params.get('id') || '';
	if (!id) return json({ error: 'Producto inválido.' }, 400);
	const { data: product, error: findError } = await admin.from('creative_products').select('id').eq('id', id).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
	if (findError) return fail('products', findError, 'No se pudo completar la operación sobre el catálogo.');
	if (!product) return json({ error: 'Producto no encontrado.' }, 404);
	// Keep the product and its private source image for generation history and revisions.
	// The catalog is user-facing soft-deleted so foreign-key provenance remains intact.
	const { error } = await admin.from('creative_products').update({
		is_active: false,
		updated_at: new Date().toISOString(),
	}).eq('id', id).eq('user_id', auth.user.id);
	return error ? fail('products', error, 'No se pudo completar la operación sobre el catálogo.') : json({ ok: true });
};
