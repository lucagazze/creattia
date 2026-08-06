import type { APIRoute } from 'astro';
import { loadWinners } from '../../../lib/creattia/winner-picker';
import { authenticateRequest, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { FREE_PREVIEW_REFERENCE_PATHS, freePreviewAngleFor, hasFullLibraryAccess } from '../../../lib/creattia/library-access';
import { countProductImages } from '../../../lib/creattia/product-media';

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
	const access = await getEffectiveAccess(admin, userId, auth.user.email);
	const isUnlimited = access.isUnlimited;

	let reserved = 0;
	try {
		const body = await request.json().catch(() => ({}));
		const productId = String(body?.productId || '').trim();
		const requestedPaths: string[] = Array.isArray(body?.winnerPaths)
			? body.winnerPaths.map((value: unknown) => String(value || '').trim()).filter(Boolean)
			: [];
		const brief = String(body?.brief || '').trim().slice(0, 1000);
		const requestedFormat = String(body?.format || 'original');
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape', '1:1', '3:4', '9:16', '4:3', '16:9']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		// De qué marca habla el anuncio: la del sitio del producto, la que el
		// usuario tiene guardada, o ninguna. Sin esto, un producto de eBay salía
		// firmado por la marca guardada en el perfil.
		const brandSources = new Set(['url', 'mine', 'none']);
		const brandSource = brandSources.has(String(body?.brandSource)) ? String(body?.brandSource) : 'url';
		// El estilo puede venir del ganador o de la marca elegida arriba.
		const styleModes = new Set(['winner', 'url', 'brand']);
		const colorMode = styleModes.has(String(body?.colorMode)) ? String(body.colorMode) : 'winner';
		const typoMode = styleModes.has(String(body?.typoMode)) ? String(body.typoMode) : 'winner';
		const supportedLanguages = new Set(['es', 'en', 'pt', 'it', 'fr', 'de']);
		const language = supportedLanguages.has(String(body?.language)) ? String(body.language) : 'es';
		// El usuario elige explícitamente si quiere el logo en el anuncio o no —
		// antes se agregaba solo si había uno disponible, sin preguntar.
		const includeLogo = brandSource !== 'none' && Boolean(body?.includeLogo);

		// En modo manual se permite continuar sin foto; el nombre y la descripción
		// siguen siendo obligatorios para que el anuncio tenga contexto.
		const textMode = body?.mode === 'text' || (!productId && Boolean(body?.productName));
		const allowNoProductImage = body?.mode === 'manual';
		const textName = String(body?.productName || '').trim().slice(0, 140);
		const textDescription = String(body?.productDescription || '').trim().slice(0, 1200);
		if (!productId && !textName) return json({ error: 'Falta el producto.' }, 400);
		const paths = [...new Set(requestedPaths)];
		if (!paths.length) return json({ error: 'Elegí al menos una referencia ganadora.' }, 400);
		if (paths.length > 40) return json({ error: 'El máximo por lote es 40 anuncios.' }, 400);

		// Con producto: tiene que ser del usuario y tener al menos una foto real.
		// Sin producto (modo texto): se usa el nombre y la descripción escritos.
		let product: any = { name: textName, description: textDescription, price_text: '', currency: '', product_url: '', image_path: null };
		if (productId) {
			const { data: found, error: productError } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,product_url,image_path')
				.eq('id', productId).eq('user_id', userId).maybeSingle();
			if (productError) throw productError;
			if (!found) return json({ error: 'El producto no existe o no pertenece a tu cuenta.' }, 404);
			product = found;

			const photoCount = await countProductImages(admin, userId, productId);
			if (!photoCount && !product.image_path && !allowNoProductImage) {
				return json({ error: 'El producto no tiene ninguna foto real guardada. Subí una foto y volvé a intentar.', code: 'NO_PRODUCT_PHOTO' }, 422);
			}
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
		// Además de existir, tienen que estar habilitadas para el plan: una cuenta
		// sin suscripción solo puede lanzar lotes con el preview gratuito.
		if (!hasFullLibraryAccess(access)) {
			const locked = approved.filter((winner) => !FREE_PREVIEW_REFERENCE_PATHS.has(winner.imagePath) && !freePreviewAngleFor(winner));
			if (locked.length) {
				return json({
					error: 'Algunas de esas referencias son parte de la biblioteca completa. Activá un plan para usarlas.',
					code: 'LIBRARY_LOCKED',
					lockedCount: locked.length,
				}, 402);
			}
		}

		const count = approved.length;
		const creditsNeeded = count; // 1 crédito por anuncio

		// Créditos reservados recién ahora que el usuario confirmó el lote.
		if (!isUnlimited) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: userId,
				p_amount: creditsNeeded,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) {
				return json({ error: `No tenés créditos suficientes (${creditsNeeded} requeridos).`, code: 'NO_CREDITS' }, 402);
			}
			reserved = creditsNeeded;
		}

		const batchId = crypto.randomUUID();
		const generationRows = approved.map((winner, index) => ({
			user_id: userId,
			template_id: winner.templateId || 1,
			// El ganador queda en el settings_snapshot para conservar la referencia
			// visual elegida por el usuario.
			title: product.name,
			format,
			image_type: 'product',
			variant_key: winner.categoryLeaf || 'hero',
			product_id: productId || null,
			// El brief va limpio: es lo que el modelo lee como USER DIRECTION.
			user_brief: brief || null,
			batch_id: batchId,
			output_index: index + 1,
			requested_outputs: count,
			settings_snapshot: {
				format,
				colorMode,
				typoMode,
				language,
				brandSource,
				includeLogo,
				imageType: 'product',
				textMode,
				allowNoProductImage,
				referencePath: winner.imagePath,
				referenceName: winner.name,
				referenceLeaf: winner.categoryLeaf || '',
				templateId: winner.templateId || null,
				productId: productId || null,
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

		if (productId) try {
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
		return fail('batch-start', error, 'No se pudo iniciar la generación del lote.');
	}
};
