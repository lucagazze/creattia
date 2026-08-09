import type { APIRoute } from 'astro';
import { authenticateRequest, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { parsePaletteOverride, SUBJECT_MODES, usesRealProductPhotos, type SubjectMode } from '../../../lib/creattia/generation-pipeline';
import { listProductImageRows } from '../../../lib/creattia/product-media';
import { loadWinners } from '../../../lib/creattia/winner-picker';
import { FREE_PREVIEW_REFERENCE_PATHS, hasFullLibraryAccess } from '../../../lib/creattia/library-access';
import { trackEvent } from '../../../lib/creattia/events';
import { datosDelNavegador } from '../../../lib/creattia/meta-capi';

export const prerender = false;
export const maxDuration = 60;

/**
 * Arranca la generación de un carrusel completo: una fila de creative_generations
 * por página del carrusel ganador, todas bajo el mismo batch_id. Reutiliza
 * exactamente el mismo worker que el lote (batch-worker.ts): cada fila trae su
 * propio product_id, su propia página del ganador y su propio análisis, así que
 * el worker la procesa igual que procesaría un anuncio suelto.
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
	const access = await getEffectiveAccess(admin, userId, auth.user.email);
	const isUnlimited = access.isUnlimited;

	let reserved = 0;
	try {
		const body = await request.json().catch(() => ({}));

		const referenceName = String(body?.referenceName || 'Carrusel ganador').slice(0, 180);
		const subjectModeParam = String(body?.subjectMode || 'product');
		const subjectMode = SUBJECT_MODES.includes(subjectModeParam as SubjectMode)
			? subjectModeParam as SubjectMode
			: 'product';
		const productRequired = usesRealProductPhotos(subjectMode);
		const subjectName = String(body?.productName || '').trim().slice(0, 120);
		const subjectDescription = String(body?.productDescription || '').trim().slice(0, 1200);
		const templateId = Number(body?.templateId);
		const slides: string[] = Array.isArray(body?.referenceSlidePaths)
			? [...new Set(body.referenceSlidePaths.map((v: unknown) => String(v || '').trim()).filter(Boolean))] as string[]
			: [];
		if (slides.length < 2) return json({ error: 'Un carrusel necesita al menos 2 páginas.' }, 400);
		if (slides.length > 12) return json({ error: 'El máximo por carrusel es 12 páginas.' }, 400);

		// Las páginas tienen que existir en la biblioteca y estar habilitadas para
		// el plan. Antes alcanzaba con que la ruta tuviera forma de ruta, así que
		// una cuenta gratuita podía armar un carrusel con la biblioteca paga.
		const siteOrigin = new URL(request.url).origin;
		const allWinners = await loadWinners(siteOrigin);
		const knownPaths = new Set<string>();
		for (const winner of allWinners) {
			knownPaths.add(winner.imagePath);
			for (const slide of winner.metadata?.carouselImages || []) knownPaths.add(slide);
		}
		const unknown = slides.filter((path) => !knownPaths.has(path));
		if (unknown.length) {
			return json({ error: 'Alguna página del carrusel ya no está disponible en la biblioteca.' }, 400);
		}
		if (!hasFullLibraryAccess(access)) {
			const locked = slides.filter((path) => !FREE_PREVIEW_REFERENCE_PATHS.has(path));
			if (locked.length) {
				return json({
					error: 'Ese carrusel es parte de la biblioteca completa. Activá un plan para usarlo.',
					code: 'LIBRARY_LOCKED',
				}, 402);
			}
		}
		if (!Number.isInteger(templateId) || templateId < 1) return json({ error: 'El carrusel elegido no es válido.' }, 400);

		const productIds: string[] = Array.isArray(body?.productIds)
			? body.productIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
			: [];
		if (productRequired && productIds.length !== 1 && productIds.length !== slides.length) {
			return json({ error: 'Necesitás 1 producto (mismo para todas las páginas) o 1 por cada página del carrusel.' }, 400);
		}

		const requestedFormat = String(body?.format || 'original');
		const allowedFormats = new Set(['original', 'square', 'portrait', 'story', 'landscape', '1:1', '3:4', '9:16', '4:3', '16:9']);
		const format = allowedFormats.has(requestedFormat) ? requestedFormat : 'original';
		const brandSources = new Set(['url', 'mine', 'none']);
		const brandSource = brandSources.has(String(body?.brandSource)) ? String(body?.brandSource) : 'url';
		const styleModes = new Set(['winner', 'url', 'brand']);
		const colorMode = styleModes.has(String(body?.colorMode)) ? String(body.colorMode) : 'winner';
		const typoMode = styleModes.has(String(body?.typoMode)) ? String(body.typoMode) : 'winner';
		// Corrección manual de la paleta detectada, si el usuario la editó.
		const paletteOverride = parsePaletteOverride(body?.paletteOverride);
		const supportedLanguages = new Set(['es', 'en', 'pt', 'it', 'fr', 'de']);
		const language = supportedLanguages.has(String(body?.language)) ? String(body.language) : 'es';
		// El usuario elige, página por página, en cuáles va su logo. Antes se
		// agregaba solo si había uno disponible, sin preguntar nunca.
		const logoSlideIndexes = new Set(
			Array.isArray(body?.logoSlideIndexes) ? body.logoSlideIndexes.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n >= 0) : []
		);
		/**
		 * Un análisis por página, en el orden de las páginas.
		 *
		 * Antes venía uno solo para todo el carrusel y el worker intentaba recortarlo
		 * por página, pero solo se podían recortar los campos que llevan número de
		 * página —los textos—: todo lo que decide la IMAGEN llegaba igual a las tres.
		 * Ahora cada fila guarda el análisis de SU página y no hay nada que recortar.
		 * Si la cantidad no coincide con las páginas, se descarta entero antes que
		 * asignarle a una página la lectura de otra.
		 */
		const approvedPlans: Array<Record<string, unknown> | null> = Array.isArray(body?.approvedPlans) && body.approvedPlans.length === slides.length
			? body.approvedPlans.map((plan: unknown) => (plan && typeof plan === 'object' ? plan as Record<string, unknown> : null))
			: slides.map(() => null);

		// Los productos tienen que ser del usuario y tener al menos una foto real.
		const uniqueProductIds = [...new Set(productIds)];
		const { data: products, error: productsError } = uniqueProductIds.length
			? await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path')
				.in('id', uniqueProductIds).eq('user_id', userId)
			: { data: [], error: null };
		if (productsError) throw productsError;
		const byId = new Map((products || []).map((p) => [p.id, p]));
		if (byId.size !== uniqueProductIds.length) {
			return json({ error: 'Alguno de los productos no existe o no pertenece a tu cuenta.' }, 404);
		}
		const imageRows = uniqueProductIds.length ? await listProductImageRows(admin, userId, uniqueProductIds) : [];
		const hasPhotoById = new Set(imageRows.map((r) => r.product_id));
		for (const id of uniqueProductIds) {
			const product = byId.get(id);
			if (productRequired && !product?.image_path && !hasPhotoById.has(id)) {
				return json({ error: `El producto "${product?.name || id}" no tiene ninguna foto real guardada.`, code: 'NO_PRODUCT_PHOTO' }, 422);
			}
		}

		const count = slides.length;

		/**
		 * Red contra el doble envío.
		 *
		 * Pasó de verdad: quedaron dos lotes idénticos de 10 páginas con 126 ms de
		 * diferencia, o sea el doble de créditos gastados por un clic de más. El
		 * botón ya no se puede tocar dos veces, pero eso vive en el navegador: un
		 * reintento de red, una pestaña duplicada o un cliente viejo repetirían el
		 * cobro. Si el mismo usuario pide el mismo carrusel sobre la misma
		 * referencia dentro del último minuto, se devuelve el lote que ya existe
		 * en vez de cobrar y generar todo otra vez.
		 */
		const desdeISO = new Date(Date.now() - 60_000).toISOString();
		const { data: recientes } = await admin.from('creative_generations')
			.select('id,batch_id,output_index,title,template_id,status,settings_snapshot,requested_outputs')
			.eq('user_id', userId)
			.eq('variant_key', 'carrusel')
			.gte('created_at', desdeISO)
			.limit(60);
		// Se agrupa por lote: cada página guarda SU propia referencia, así que
		// comparar página por página contra la primera nunca da más de una
		// coincidencia. Lo que identifica al pedido es el lote entero.
		const porLote = new Map<string, any[]>();
		for (const row of recientes || []) {
			if (!row.batch_id) continue;
			porLote.set(row.batch_id, [...(porLote.get(row.batch_id) || []), row]);
		}
		for (const [loteExistente, paginas] of porLote) {
			if (paginas.length !== count) continue;
			const primera = paginas.find((row: any) => (row.settings_snapshot?.carouselIndex || row.output_index) === 1);
			if (primera?.settings_snapshot?.referencePath !== slides[0]) continue;
			console.warn(`[carousel-start] envío duplicado del usuario ${userId}: se reutiliza el lote ${loteExistente}`);
			void trackEvent(admin, 'checkout_duplicado', userId, { tipo: 'carrusel', paginas: count }, {}, datosDelNavegador(request));
			return json({
				batchId: loteExistente,
				generations: [...paginas].sort((a: any, b: any) => (a.output_index || 0) - (b.output_index || 0)),
				duplicated: true,
			});
		}

		if (!isUnlimited) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: userId,
				p_amount: count, // 1 crédito por página
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) {
				return json({ error: `No tenés créditos suficientes (${count} requeridos).`, code: 'NO_CREDITS' }, 402);
			}
			reserved = count;
		}

		const batchId = crypto.randomUUID();
		void trackEvent(admin, 'carrusel_pedido', userId, { paginas: count, sujeto: subjectMode, formato: format }, {}, datosDelNavegador(request));
		const generationRows = slides.map((slidePath, index) => {
			const productId = productIds.length ? (productIds.length === 1 ? productIds[0] : productIds[index]) : null;
			const product = productId ? byId.get(productId) : null;
			const title = productRequired ? (product?.name || referenceName) : (subjectName || product?.name || referenceName);
			return {
				user_id: userId,
				template_id: templateId,
				title,
				format,
				image_type: productRequired ? 'product' : 'promotion',
				variant_key: 'carrusel',
				product_id: productRequired ? productId : null,
				batch_id: batchId,
				output_index: index + 1,
				requested_outputs: count,
				settings_snapshot: {
					format,
					paletteOverride,
					colorMode,
					typoMode,
					language,
					brandSource,
					includeLogo: logoSlideIndexes.has(index),
					imageType: productRequired ? 'product' : 'promotion',
					referencePath: slidePath,
					referenceName: `${referenceName} · página ${index + 1}/${count}`,
					templateId,
					productId,
					productName: title,
					productDescription: productRequired ? (product?.description || '') : subjectDescription,
					productPriceText: product?.price_text || '',
					productCurrency: product?.currency || '',
					subjectMode,
					avatarId: String(body?.avatarId || '').trim() || null,
					batchUrlMode: true,
					approvedByUser: true,
					carousel: true,
					carouselIndex: index + 1,
					carouselTotal: count,
					approvedPlan: approvedPlans[index],
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
			if (!productIds.length) return json({ batchId, count, generations });
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
		return fail('carousel-start', error, 'No se pudo iniciar la generación del carrusel.');
	}
};
