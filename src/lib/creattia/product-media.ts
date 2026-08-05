type AdminClient = any;

export type ProductImageRow = {
	product_id: string;
	storage_path: string;
	source_url?: string | null;
	sort_order: number;
	is_primary?: boolean;
	media_type: 'image' | 'video';
	metadata?: Record<string, unknown>;
};

/**
 * The product-media migration is deliberately additive, but production can
 * briefly run an older schema while a deployment is already live. Keep this
 * compatibility check narrow so unrelated database failures still surface.
 */
export function isMissingMediaTypeColumn(error: unknown) {
	const message = error instanceof Error ? error.message : String((error as any)?.message || error || '');
	return /media_type|schema cache|column .*does not exist/i.test(message);
}

export async function listProductImageRows(admin: AdminClient, userId: string, productIds: string[]) {
	if (!productIds.length) return [] as ProductImageRow[];
	const richResult = await admin.from('creative_product_images')
		.select('product_id,storage_path,source_url,sort_order,is_primary,media_type,metadata')
		.eq('user_id', userId).in('product_id', productIds).eq('media_type', 'image').order('sort_order');
	if (!richResult.error) return (richResult.data || []) as ProductImageRow[];
	if (!isMissingMediaTypeColumn(richResult.error)) throw richResult.error;

	const legacyResult = await admin.from('creative_product_images')
		.select('product_id,storage_path,source_url,sort_order,is_primary,metadata')
		.eq('user_id', userId).in('product_id', productIds).order('sort_order');
	if (legacyResult.error) throw legacyResult.error;
	return (legacyResult.data || []).map((row: Omit<ProductImageRow, 'media_type'>) => ({
		...row,
		media_type: 'image' as const,
	})) as ProductImageRow[];
}

export async function countProductImages(admin: AdminClient, userId: string, productId: string) {
	return (await listProductImageRows(admin, userId, [productId])).length;
}

/**
 * Store rich media when available. On the legacy table, images can still be
 * stored safely; videos are kept in product metadata/source URLs instead of
 * being mislabeled as images.
 */
export async function upsertProductMediaRows(
	admin: AdminClient,
	rows: Array<Record<string, unknown>>,
	mediaType: 'image' | 'video',
) {
	if (!rows.length) return { skipped: false };
	const richResult = await admin.from('creative_product_images').upsert(rows, { onConflict: 'product_id,storage_path' });
	if (!richResult.error) return { skipped: false };
	if (!isMissingMediaTypeColumn(richResult.error)) throw richResult.error;
	if (mediaType === 'video') return { skipped: true };

	const legacyRows = rows.map(({ media_type: _mediaType, ...row }) => row);
	const legacyResult = await admin.from('creative_product_images').upsert(legacyRows, { onConflict: 'product_id,storage_path' });
	if (legacyResult.error) throw legacyResult.error;
	return { skipped: false };
}

