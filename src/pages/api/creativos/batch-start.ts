import type { APIRoute } from 'astro';
import { LANGUAGE_NAMES } from '../../../lib/creattia/ad-analysis';
import { loadWinners } from '../../../lib/creattia/winner-picker';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 60;

/**
 * Segundo paso del generador por URL: el usuario ya revisó las referencias
 * ganadoras propuestas por /api/creativos/batch-url (y descartó las que no
 * quería). Acá se cobran los créditos y se crean las filas del lote, una por
 * referencia aprobada. La generación real la hace batch-worker, un anuncio por
 * invocación.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const userId = auth.user.id;
	const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze')
		|| String(auth.user.email || '').toLowerCase().includes('algoritmiadesarrollos');

	let reserved = 0;
	try {
		const body = await request.json().catch(() => ({}));
		const productId = String(body?.productId || '').trim();
		const requestedPaths: string[] = Array.isArray(body?.winnerPaths)
			? body.winnerPaths.map((value: unknown) => String(value || '').trim()).filter(Boolean)
			: [];
		const brief = String(body?.brief || '').trim().slice(0, 1000);
		const requestedFormat = String(body?.format || 'original');
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		const requestedLanguage = String(body?.language || 'es');
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : 'es';

		if (!productId) return json({ error: 'Falta el producto analizado.' }, 400);
		const paths = [...new Set(requestedPaths)];
		if (!paths.length) return json({ error: 'Elegí al menos una referencia ganadora.' }, 400);
		if (paths.length > 40) return json({ error: 'El máximo por lote es 40 anuncios.' }, 400);

		// El producto tiene que ser del usuario y tener al menos una foto real.
		const { data: product, error: productError } = await admin.from('creative_products')
			.select('id,name,description,price_text,currency,product_url,image_path')
			.eq('id', productId).eq('user_id', userId).maybeSingle();
		if (productError) throw productError;
		if (!product) return json({ error: 'El producto no existe o no pertenece a tu cuenta.' }, 404);

		const { count: photoCount } = await admin.from('creative_product_images')
			.select('id', { count: 'exact', head: true }).eq('product_id', productId).eq('user_id', userId);
		if (!photoCount && !product.image_path) {
			return json({ error: 'El producto no tiene ninguna foto real guardada. Subí una foto y volvé a intentar.', code: 'NO_PRODUCT_PHOTO' }, 422);
		}

		// Las referencias tienen que existir en la biblioteca: nunca se acepta una
		// ruta arbitraria del cliente.
		const siteOrigin = new URL(request.url).origin;
		const allWinners = await loadWinners(siteOrigin);
		const byPath = new Map(allWinners.map((winner) => [winner.imagePath, winner]));
		const approved = paths.map((path) => byPath.get(path)).filter((winner): winner is NonNullable<typeof winner> => Boolean(winner));
		if (approved.length !== paths.length) {
			return json({ error: 'Alguna de las referencias elegidas ya no está disponible en la biblioteca.' }, 400);
		}

		const count = approved.length;

		// Créditos: 1 por anuncio, reservados recién ahora que el usuario confirmó.
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
		const generationRows = approved.map((winner, index) => ({
			user_id: userId,
			template_id: winner.templateId || 1,
			// Solo el producto: promptNotes puede ser el copy completo del anuncio y
			// llenaba de texto la tarjeta en "Mis imágenes". El ganador queda en el
			// settings_snapshot para quien lo necesite.
			title: product.name,
			format,
			image_type: 'product',
			variant_key: winner.categoryLeaf || 'hero',
			product_id: productId,
			// El brief va limpio: es lo que el modelo lee como USER DIRECTION.
			user_brief: brief || null,
			batch_id: batchId,
			output_index: index + 1,
			requested_outputs: count,
			settings_snapshot: {
				format,
				language,
				imageType: 'product',
				referencePath: winner.imagePath,
				referenceName: winner.name,
				referenceNotes: winner.promptNotes || '',
				referenceLeaf: winner.categoryLeaf || '',
				referenceNiches: winner.metadata?.foreplayNiches || [],
				templateId: winner.templateId || null,
				productId,
				productName: product.name,
				productDescription: product.description || '',
				productPriceText: product.price_text || '',
				productCurrency: product.currency || '',
				productUrl: product.product_url || '',
				batchUrlMode: true,
				approvedByUser: true,
			},
			status: 'processing',
		}));

		const { data: inserted, error: insertError } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index,title,template_id,status,settings_snapshot');
		if (insertError) {
			if (reserved) await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: reserved });
			throw new Error('Error guardando el lote en base de datos: ' + (insertError.message || JSON.stringify(insertError)));
		}
		const generations = inserted || [];
		if (generations.length !== count) {
			throw new Error(`El lote se guardó incompleto (${generations.length} de ${count}).`);
		}

		try {
			await admin.from('creative_generation_products').insert(generations.map((generation) => ({
				generation_id: generation.id,
				product_id: productId,
				user_id: userId,
				sort_order: 0,
			})));
		} catch (joinError) {
			console.error('Error insert join generation products:', joinError);
		}

		return json({ batchId, count, generations });
	} catch (error: any) {
		console.error('Error en POST batch-start:', error);
		if (reserved) {
			await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: reserved })
				.then(({ error: refundError }: any) => { if (refundError) console.error('Refund falló:', refundError); });
		}
		return json({ error: error?.message || 'No se pudo iniciar la generación del lote.' }, 500);
	}
};
