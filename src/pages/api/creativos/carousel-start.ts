import type { APIRoute } from 'astro';
import { LANGUAGE_NAMES } from '../../../lib/creattia/ad-analysis';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { isAdminEmail } from '../../../lib/creattia/admin';

export const prerender = false;
export const maxDuration = 60;

/**
 * Arranca la generación de un carrusel completo: una fila de creative_generations
 * por página del carrusel ganador, todas bajo el mismo batch_id. Reutiliza
 * exactamente el mismo worker que el lote (batch-worker.ts) — cada fila ya
 * trae su propio product_id, así que no hace falta tocar nada ahí: procesa
 * una página igual que procesaría un anuncio cualquiera del lote.
 *
 * productIds: 1 solo id → mismo producto en todas las páginas.
 *             N ids (uno por página) → productos distintos, en el mismo
 *             orden que las páginas del carrusel.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const userId = auth.user.id;
	const isAdmin = isAdminEmail(auth.user.email);

	let reserved = 0;
	try {
		const body = await request.json().catch(() => ({}));

		const referenceName = String(body?.referenceName || 'Carrusel ganador').slice(0, 180);
		const templateId = Number(body?.templateId);
		const slides: string[] = Array.isArray(body?.referenceSlidePaths)
			? [...new Set(body.referenceSlidePaths.map((v: unknown) => String(v || '').trim()).filter(Boolean))] as string[]
			: [];
		const pathPattern = /^[0-9]+\/[a-f0-9]{8,}\.(png|jpe?g|webp|avif)$/i;
		if (slides.length < 2) return json({ error: 'Un carrusel necesita al menos 2 páginas.' }, 400);
		if (slides.length > 12) return json({ error: 'El máximo por carrusel es 12 páginas.' }, 400);
		if (!slides.every((path) => pathPattern.test(path))) return json({ error: 'Alguna página del carrusel no es válida.' }, 400);
		if (!Number.isInteger(templateId) || templateId < 1) return json({ error: 'El carrusel elegido no es válido.' }, 400);

		const productIds: string[] = Array.isArray(body?.productIds)
			? body.productIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
			: [];
		if (productIds.length !== 1 && productIds.length !== slides.length) {
			return json({ error: 'Necesitás 1 producto (mismo para todas las páginas) o 1 por cada página del carrusel.' }, 400);
		}

		const requestedFormat = String(body?.format || 'original');
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape', '1:1', '3:4', '9:16', '4:3', '16:9']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		const requestedLanguage = String(body?.language || 'es');
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : 'es';
		const brandSources = new Set(['url', 'mine', 'none']);
		const brandSource = brandSources.has(String(body?.brandSource)) ? String(body?.brandSource) : 'url';
		const colorMode = body?.colorMode === 'brand' ? 'brand' : 'winner';
		const typoMode = body?.typoMode === 'brand' ? 'brand' : 'winner';

		// Los productos tienen que ser del usuario y tener al menos una foto real.
		const uniqueProductIds = [...new Set(productIds)];
		const { data: products, error: productsError } = await admin.from('creative_products')
			.select('id,name,description,price_text,currency,image_path')
			.in('id', uniqueProductIds).eq('user_id', userId);
		if (productsError) throw productsError;
		const byId = new Map((products || []).map((p) => [p.id, p]));
		if (byId.size !== uniqueProductIds.length) {
			return json({ error: 'Alguno de los productos no existe o no pertenece a tu cuenta.' }, 404);
		}
		const { data: imageRows } = await admin.from('creative_product_images')
			.select('product_id').eq('user_id', userId).in('product_id', uniqueProductIds);
		const hasPhotoById = new Set((imageRows || []).map((r) => r.product_id));
		for (const id of uniqueProductIds) {
			const product = byId.get(id);
			if (!product?.image_path && !hasPhotoById.has(id)) {
				return json({ error: `El producto "${product?.name || id}" no tiene ninguna foto real guardada.`, code: 'NO_PRODUCT_PHOTO' }, 422);
			}
		}

		const count = slides.length;

		if (!isAdmin) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: userId,
				p_amount: count,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) {
				return json({ error: `No tenés créditos suficientes (${count} requeridos).`, code: 'NO_CREDITS' }, 402);
			}
			reserved = count;
		}

		const batchId = crypto.randomUUID();
		const generationRows = slides.map((slidePath, index) => {
			const productId = productIds.length === 1 ? productIds[0] : productIds[index];
			const product = byId.get(productId)!;
			return {
				user_id: userId,
				template_id: templateId,
				title: product.name,
				format,
				image_type: 'product',
				variant_key: 'carrusel',
				product_id: productId,
				batch_id: batchId,
				output_index: index + 1,
				requested_outputs: count,
				settings_snapshot: {
					format,
					language,
					colorMode,
					typoMode,
					brandSource,
					imageType: 'product',
					referencePath: slidePath,
					referenceName: `${referenceName} · página ${index + 1}/${count}`,
					templateId,
					productId,
					productName: product.name,
					productDescription: product.description || '',
					productPriceText: product.price_text || '',
					productCurrency: product.currency || '',
					batchUrlMode: true,
					approvedByUser: true,
					carousel: true,
					carouselIndex: index + 1,
					carouselTotal: count,
				},
				status: 'processing',
			};
		});

		const { data: inserted, error: insertError } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index,title,template_id,status,settings_snapshot');
		if (insertError) {
			if (reserved) await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: reserved });
			throw new Error('Error guardando el carrusel en base de datos: ' + (insertError.message || JSON.stringify(insertError)));
		}
		const generations = inserted || [];
		if (generations.length !== count) {
			throw new Error(`El carrusel se guardó incompleto (${generations.length} de ${count}).`);
		}

		try {
			await admin.from('creative_generation_products').insert(generations.map((generation, index) => ({
				generation_id: generation.id,
				product_id: productIds.length === 1 ? productIds[0] : productIds[index],
				user_id: userId,
				sort_order: 0,
			})));
		} catch (joinError) {
			console.error('Error insert join generation products (carousel):', joinError);
		}

		return json({ batchId, count, generations });
	} catch (error: any) {
		console.error('Error en POST carousel-start:', error);
		if (reserved) {
			await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: reserved })
				.then(({ error: refundError }: any) => { if (refundError) console.error('Refund falló:', refundError); });
		}
		return json({ error: error?.message || 'No se pudo iniciar la generación del carrusel.' }, 500);
	}
};
