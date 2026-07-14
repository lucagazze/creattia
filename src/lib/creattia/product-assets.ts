import { readLimited, safeExternalFetch } from './safe-fetch';
import { getAdminClient } from './server';

const imageTypes: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

export async function mirrorProductImage(userId: string, product: {
	id: string;
	source_image_url?: string | null;
	image_path?: string | null;
	image_urls?: string[] | null;
}) {
	const paths = await mirrorProductImages(userId, product, product.image_urls || [product.source_image_url || '']);
	return paths[0] || product.image_path || '';
}

export async function mirrorProductImages(userId: string, product: {
	id: string;
	source_image_url?: string | null;
	image_path?: string | null;
}, rawUrls: string[]) {
	const admin = getAdminClient();
	if (!admin) return product.image_path ? [product.image_path] : [];
	const urls = [...new Set(rawUrls.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 6);
	if (!urls.length) return product.image_path ? [product.image_path] : [];

	const mirrored: Array<{ path: string; sourceUrl: string; index: number }> = [];
	for (let index = 0; index < urls.length; index += 1) {
		try {
			const sourceUrl = urls[index];
			const response = await safeExternalFetch(sourceUrl, {
				headers: { accept: 'image/avif,image/webp,image/png,image/jpeg' },
			}, 15_000);
			const contentType = (response.headers.get('content-type') || '').split(';')[0];
			if (!response.ok || !imageTypes[contentType]) continue;
			const bytes = await readLimited(response, 10 * 1024 * 1024);
			const path = `${userId}/products/${product.id}/${index === 0 ? 'primary' : `angle-${index + 1}`}.${imageTypes[contentType]}`;
			const { error: uploadError } = await admin.storage.from('creative-assets').upload(path, bytes, {
				contentType,
				upsert: true,
			});
			if (uploadError) continue;
			mirrored.push({ path, sourceUrl, index });
		} catch {
			// A broken secondary photo must not discard an otherwise usable product.
		}
	}
	if (!mirrored.length) return product.image_path ? [product.image_path] : [];

	await admin.from('creative_products').update({
		image_path: mirrored[0].path,
		source_image_url: mirrored[0].sourceUrl,
		updated_at: new Date().toISOString(),
	}).eq('id', product.id).eq('user_id', userId);
	await admin.from('creative_product_images').upsert(mirrored.map((item, position) => ({
			user_id: userId,
			product_id: product.id,
			storage_path: item.path,
			source_url: item.sourceUrl,
			sort_order: position,
			is_primary: position === 0,
		})), { onConflict: 'product_id,storage_path' });

	return mirrored.map((item) => item.path);
}
