import type { APIRoute } from 'astro';
import { analyzeBrandStyle, persistBrandStyle } from '../../../lib/creattia/brand-style';
import { extractProductPageWithAI, type ScannedProduct } from '../../../lib/creattia/catalog-scanner';
import { mirrorProductImages } from '../../../lib/creattia/product-assets';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 180;

const mimeExtensions: Record<string, string> = {
	'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif',
};

async function listProducts(userId: string) {
	const admin = getAdminClient();
	if (!admin) throw new Error('Supabase no está configurado.');
	const { data, error } = await admin.from('creative_products')
		.select('id,name,description,price_text,currency,product_url,image_path,source,source_image_url,analysis,updated_at')
		.eq('user_id', userId).eq('is_active', true).order('updated_at', { ascending: false }).limit(200);
	if (error) throw error;
	const ids = (data || []).map((product) => product.id);
	const { data: imageRows, error: imageError } = ids.length
		? await admin.from('creative_product_images').select('product_id,storage_path,source_url,sort_order,is_primary').eq('user_id', userId).in('product_id', ids).order('sort_order')
		: { data: [], error: null };
	if (imageError) throw imageError;
	const imagesByProduct = new Map<string, Array<{ storage_path: string; source_url: string | null }>>();
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
		const paths = [...new Set([product.image_path, ...rows.map((row) => row.storage_path)].filter(Boolean) as string[])];
		const imageUrls = paths.map((path, index) => signedByPath.get(path) || rows[index]?.source_url || (index === 0 ? product.source_image_url : '') || '');
		const usableImageUrls = imageUrls.filter(Boolean);
		if (!usableImageUrls.length && product.source_image_url) usableImageUrls.push(product.source_image_url);
		return { ...product, imageUrl: usableImageUrls[0] || '', imageUrls: usableImageUrls, imageCount: usableImageUrls.length };
	});
}

function sameProductUrl(left: string, right: string) {
	try {
		const a = new URL(left);
		const b = new URL(right);
		return a.hostname === b.hostname && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
	} catch {
		return false;
	}
}

async function importProductUrls(userId: string, rawUrls: unknown[]) {
	const admin = getAdminClient();
	if (!admin) throw new Error('Supabase no está configurado.');
	const apiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	const groqApiKey = process.env.GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
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
			// 1. Extract product data using AI (reads full page text + images)
			const product: ScannedProduct = await extractProductPageWithAI(url, apiKey);

			// 2. Upsert into DB
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
				metadata: {
					...product.metadata,
					importedFromUrl: url,
					sourceImageUrls: product.imageUrls,
					aiExtracted: true,
				},
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

			importedIds.push(stored.id as string);
		} catch (err) {
			errors.push({ url, error: err instanceof Error ? err.message : 'No se pudo analizar el producto.' });
		}
	}

	// Primera importación: aprender el estilo de la marca desde su web
	// (logo, colores, tipografía, estética) scrapeando home + páginas internas.
	if (importedIds.length) {
		// Run brand style analysis in the background so it does not block product import
		void (async () => {
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
	try {
		if ((request.headers.get('content-type') || '').includes('application/json')) {
			const body = await request.json().catch(() => ({}));
			const rawUrls = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
			if (rawUrls.length > 10) return json({ error: 'Podés importar hasta 10 URLs por vez.' }, 400);
			const imported = await importProductUrls(auth.user.id, rawUrls);
			const products = await listProducts(auth.user.id);
			return json({ ...imported, products }, imported.importedIds.length ? 201 : 422);
		}

		const form = await request.formData();
		const name = String(form.get('name') || '').trim().slice(0, 180);
		const description = String(form.get('description') || '').trim().slice(0, 1600);
		const priceText = String(form.get('priceText') || '').trim().slice(0, 60);
		const rawProductUrl = String(form.get('productUrl') || '').trim().slice(0, 500);
		const productUrl = rawProductUrl ? normalizeExternalUrl(rawProductUrl) : '';
		const image = form.get('image');
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
		const { error: updateError } = await admin.from('creative_products').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', product.id).eq('user_id', auth.user.id);
		if (updateError) throw updateError;
		const { error: imageError } = await admin.from('creative_product_images').upsert({
			user_id: auth.user.id, product_id: product.id, storage_path: path, sort_order: 0, is_primary: true,
		}, { onConflict: 'product_id,storage_path' });
		if (imageError) throw imageError;
		const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(path, 60 * 60);
		return json({ product: { id: product.id, name, description, price_text: priceText, product_url: productUrl, image_path: path, source: 'manual', imageUrl: signed?.signedUrl || '' } }, 201);
	} catch (error) {
		if (uploadedPath) await admin.storage.from('creative-assets').remove([uploadedPath]);
		if (productId) await admin.from('creative_products').delete().eq('id', productId).eq('user_id', auth.user.id);
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar el producto.' }, 500);
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const id = new URL(request.url).searchParams.get('id') || '';
	if (!id) return json({ error: 'Producto inválido.' }, 400);
	const { data: product, error: findError } = await admin.from('creative_products').select('id').eq('id', id).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
	if (findError) return json({ error: findError.message }, 500);
	if (!product) return json({ error: 'Producto no encontrado.' }, 404);
	// Keep the product and its private source image for generation history and revisions.
	// The catalog is user-facing soft-deleted so foreign-key provenance remains intact.
	const { error } = await admin.from('creative_products').update({
		is_active: false,
		updated_at: new Date().toISOString(),
	}).eq('id', id).eq('user_id', auth.user.id);
	return error ? json({ error: error.message }, 500) : json({ ok: true });
};
