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
}) {
	const admin = getAdminClient();
	if (!admin || !product.source_image_url || product.image_path) return product.image_path || '';

	try {
		const response = await safeExternalFetch(product.source_image_url, {
			headers: { accept: 'image/avif,image/webp,image/png,image/jpeg' },
		}, 15_000);
		const contentType = (response.headers.get('content-type') || '').split(';')[0];
		if (!response.ok || !imageTypes[contentType]) return '';
		const bytes = await readLimited(response, 10 * 1024 * 1024);
		const path = `${userId}/products/${product.id}/primary.${imageTypes[contentType]}`;
		const { error: uploadError } = await admin.storage.from('creative-assets').upload(path, bytes, {
			contentType,
			upsert: true,
		});
		if (uploadError) return '';

		await admin.from('creative_products').update({
			image_path: path,
			updated_at: new Date().toISOString(),
		}).eq('id', product.id).eq('user_id', userId);
		await admin.from('creative_product_images').upsert({
			user_id: userId,
			product_id: product.id,
			storage_path: path,
			source_url: product.source_image_url,
			sort_order: 0,
			is_primary: true,
		}, { onConflict: 'product_id,storage_path' });

		return path;
	} catch {
		return '';
	}
}
