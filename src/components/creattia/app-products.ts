import type { Product } from './app-types';

/** Normalización de los productos de la API y de las URLs que pega el usuario. */

export function mapProduct(record: any): Product {
	return {
		id: record.id,
		name: record.name || 'Producto',
		description: record.description || '',
		priceText: record.price_text || record.priceText || '',
		currency: record.currency || '',
		productUrl: record.product_url || record.productUrl || '',
		imageUrl: record.imageUrl || '',
		imageUrls: Array.isArray(record.imageUrls) && record.imageUrls.length ? record.imageUrls : record.imageUrl ? [record.imageUrl] : [],
		imageCount: Number(record.imageCount || record.imageUrls?.length || (record.imageUrl ? 1 : 0)),
		source: record.source || 'manual',
	};
}

export function normalizeProductUrlInput(value: string) {
	const clean = value.trim();
	if (!clean) return '';
	try {
		const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
		return url.toString();
	} catch { throw new Error('Ingresá una URL válida del producto.'); }
}

export async function fileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}
