import { readLimited, safeExternalFetch } from './safe-fetch';
import { getAdminClient } from './server';
import { upsertProductMediaRows } from './product-media';

const imageTypes: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

const videoTypes: Record<string, string> = {
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'video/x-m4v': 'm4v',
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
	const urls = [...new Set(rawUrls.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 24);
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
	await upsertProductMediaRows(admin, mirrored.map((item, position) => ({
			user_id: userId,
			product_id: product.id,
			storage_path: item.path,
			source_url: item.sourceUrl,
			sort_order: position,
			is_primary: position === 0,
			media_type: 'image',
		})), 'image');

	return mirrored.map((item) => item.path);
}

/**
 * Guarda videos de producto como medios del mismo producto, exclusivamente para
 * revisión/playback. Nunca se envían a los analizadores ni a los prompts de IA.
 * Es best-effort:
 * algunas tiendas protegen sus videos o usan streams que no son descargables;
 * en ese caso el importador conserva la URL externa para poder revisarla.
 */
export async function mirrorProductVideos(userId: string, product: { id: string }, rawUrls: string[]) {
	const admin = getAdminClient();
	if (!admin) return [];
	const urls = [...new Set(rawUrls.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 12);
	if (!urls.length) return [];

	const mirrored: Array<{ path: string; sourceUrl: string; index: number; contentType: string }> = [];
	for (let index = 0; index < urls.length; index += 1) {
		try {
			const sourceUrl = urls[index];
			const response = await safeExternalFetch(sourceUrl, {
				headers: { accept: 'video/mp4,video/webm,video/quicktime,video/*' },
			}, 20_000);
			const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
			const extension = videoTypes[contentType] || (sourceUrl.match(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i)?.[1]?.toLowerCase() || '');
			if (!response.ok || !extension) continue;
			const bytes = await readLimited(response, 100 * 1024 * 1024);
			const path = `${userId}/products/${product.id}/video-${index + 1}.${extension}`;
			const { error: uploadError } = await admin.storage.from('creative-assets').upload(path, bytes, {
				contentType: contentType || `video/${extension === 'mov' ? 'quicktime' : extension}`,
				upsert: true,
			});
			if (uploadError) continue;
			mirrored.push({ path, sourceUrl, index, contentType: contentType || `video/${extension}` });
		} catch {
			// A protected/streaming video must not make the product import fail.
		}
	}
	if (!mirrored.length) return [];

	await upsertProductMediaRows(admin, mirrored.map((item, position) => ({
		user_id: userId,
		product_id: product.id,
		storage_path: item.path,
		source_url: item.sourceUrl,
		sort_order: 1000 + position,
		is_primary: false,
		media_type: 'video',
		metadata: { mediaType: 'video', contentType: item.contentType },
	})), 'video');

	return mirrored.map((item) => item.path);
}
