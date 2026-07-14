import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

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
	return Promise.all((data || []).map(async (product) => {
		let imageUrl = product.source_image_url || '';
		if (product.image_path) {
			const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(product.image_path, 60 * 60);
			imageUrl = signed?.signedUrl || imageUrl;
		}
		return { ...product, imageUrl };
	}));
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
	try {
		const form = await request.formData();
		const name = String(form.get('name') || '').trim().slice(0, 180);
		const description = String(form.get('description') || '').trim().slice(0, 1600);
		const priceText = String(form.get('priceText') || '').trim().slice(0, 60);
		const productUrl = String(form.get('productUrl') || '').trim().slice(0, 500);
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
		const { error: updateError } = await admin.from('creative_products').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', product.id).eq('user_id', auth.user.id);
		if (updateError) throw updateError;
		const { error: imageError } = await admin.from('creative_product_images').upsert({
			user_id: auth.user.id, product_id: product.id, storage_path: path, sort_order: 0, is_primary: true,
		}, { onConflict: 'product_id,storage_path' });
		if (imageError) throw imageError;
		const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(path, 60 * 60);
		return json({ product: { id: product.id, name, description, price_text: priceText, product_url: productUrl, image_path: path, source: 'manual', imageUrl: signed?.signedUrl || '' } }, 201);
	} catch (error) {
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
	const { data: product } = await admin.from('creative_products').select('image_path').eq('id', id).eq('user_id', auth.user.id).maybeSingle();
	if (!product) return json({ error: 'Producto no encontrado.' }, 404);
	if (product.image_path) await admin.storage.from('creative-assets').remove([product.image_path]);
	const { error } = await admin.from('creative_products').delete().eq('id', id).eq('user_id', auth.user.id);
	return error ? json({ error: error.message }, 500) : json({ ok: true });
};
