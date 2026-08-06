import type { APIRoute } from 'astro';
import { authenticateRequest, closeGenerationsAndCountRefunds, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';

export const prerender = false;
export const maxDuration = 60;

// Una generación real tarda menos de un minuto. Pasado este tiempo en
// 'processing' ya no hay nadie generándola: el worker murió, se cerró la pestaña
// o el modelo rechazó el prompt.
const STALE_MINUTES = 8;

/**
 * Cierra las generaciones que quedaron colgadas en 'processing' y devuelve los
 * créditos. Sin esto las tarjetas quedaban girando para siempre en
 * "Mis imágenes" y había que borrarlas de a una.
 *
 * GET  → cuántas hay colgadas (para mostrar el botón solo si hace falta).
 * POST → las marca como fallidas, devuelve los créditos y, si se pide
 *        `remove: true`, las borra directamente del historial.
 */
export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
	const [processing, failed] = await Promise.all([
		admin.from('creative_generations').select('id', { count: 'exact', head: true })
			.eq('user_id', auth.user.id).eq('status', 'processing').lt('created_at', cutoff),
		// Las fallidas también cuentan: no tienen imagen y solo ocupan lugar.
		admin.from('creative_generations').select('id', { count: 'exact', head: true })
			.eq('user_id', auth.user.id).eq('status', 'failed'),
	]);
	if (processing.error) return fail('cleanup-stuck-count', processing.error, 'No se pudo revisar el estado de tus generaciones.');

	return json({
		stuck: (processing.count || 0) + (failed.count || 0),
		processing: processing.count || 0,
		failed: failed.count || 0,
		staleMinutes: STALE_MINUTES,
	});
};

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const userId = auth.user.id;
	// Una cuenta con override 'unlimited' tampoco gastó créditos, no solo el admin.
	const access = await getEffectiveAccess(admin, userId, auth.user.email);
	const isUnlimited = access.isUnlimited;

	try {
		const body = await request.json().catch(() => ({}));
		const remove = body?.remove === true;
		// Permite cerrar una sola generación (botón "Cancelar" de una tarjeta).
		const onlyId = String(body?.generationId || '').trim();

		// Una sola generación (botón Cancelar) o la barrida completa: pendientes
		// vencidas + todas las fallidas, que no tienen imagen y solo estorban.
		//
		// El corte por antigüedad se aplica SIEMPRE, también al cancelar una sola:
		// antes esta rama aceptaba cualquier fila recién creada, así que se podía
		// arrancar un lote de 40, "cancelarlo" para recuperar los 40 créditos y
		// después pedirle igual las imágenes a batch-worker. Gratis.
		const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
		let rows: Array<{ id: string; output_path: string | null; status: string; settings_snapshot: any }> = [];
		if (onlyId) {
			const [stale, failed] = await Promise.all([
				admin.from('creative_generations').select('id,output_path,status,settings_snapshot')
					.eq('user_id', userId).eq('id', onlyId).eq('status', 'processing').lt('created_at', cutoff),
				admin.from('creative_generations').select('id,output_path,status,settings_snapshot')
					.eq('user_id', userId).eq('id', onlyId).eq('status', 'failed'),
			]);
			if (stale.error) throw stale.error;
			if (failed.error) throw failed.error;
			rows = [...(stale.data || []), ...(failed.data || [])];
			if (!rows.length) {
				return json({
					error: `Esa generación todavía puede estar en curso. Se puede cancelar después de ${STALE_MINUTES} minutos.`,
					code: 'NOT_STALE_YET',
				}, 409);
			}
		} else {
			const [stale, failed] = await Promise.all([
				admin.from('creative_generations').select('id,output_path,status,settings_snapshot')
					.eq('user_id', userId).eq('status', 'processing').lt('created_at', cutoff),
				admin.from('creative_generations').select('id,output_path,status,settings_snapshot')
					.eq('user_id', userId).eq('status', 'failed'),
			]);
			if (stale.error) throw stale.error;
			rows = [...(stale.data || []), ...(failed.data || [])];
		}

		const ids = rows.map((row) => row.id);
		if (!ids.length) return json({ closed: 0, removed: 0, ids: [] });

		// El reembolso lo decide el UPDATE condicional de abajo, no este conteo:
		// solo se acredita por las filas que este llamado logró mover de
		// 'processing' a 'failed'. Las que ya estaban fallidas ya se reembolsaron.
		const processingRows = rows.filter((row) => row.status === 'processing');
		// Una imagen en calidad 'pro' se cobró 3 créditos, no 1: devolver siempre
		// 1 por fila le comía 2 créditos al usuario en cada lote pro cancelado.
		const costById = new Map(processingRows.map((row) => [row.id, row.settings_snapshot?.quality === 'pro' ? 3 : 1]));
		let refundable = 0;

		// Primero se cierran las pendientes con el UPDATE condicional: eso fija de
		// forma atómica cuántos créditos corresponde devolver.
		if (processingRows.length) {
			const closed = await closeGenerationsAndCountRefunds(
				admin, userId, processingRows.map((row) => row.id), 'Generación interrumpida. Los créditos fueron devueltos.',
			);
			refundable = closed.reduce((total, id) => total + (costById.get(id) || 1), 0);
		}

		if (remove) {
			// Se borran también los archivos que hubieran quedado a medias.
			const paths = rows.map((row) => row.output_path).filter(Boolean) as string[];
			if (paths.length) await admin.storage.from('creative-assets').remove(paths);
			const { error: deleteError } = await admin.from('creative_generations')
				.delete().in('id', ids).eq('user_id', userId);
			if (deleteError) throw deleteError;
		}

		// Los créditos de lo que nunca se generó vuelven al usuario. Las cuentas
		// ilimitadas no reservaron nada, así que tampoco se les acredita.
		if (!isUnlimited && refundable > 0) {
			const { error: refundError } = await admin.rpc('refund_creative_credits', {
				p_user_id: userId,
				p_amount: refundable,
			});
			if (refundError) console.error('Refund de pendientes falló:', refundError);
		}

		return json({ closed: ids.length, removed: remove ? ids.length : 0, ids });
	} catch (error) {
		return fail('cleanup-stuck', error, 'No se pudieron limpiar las generaciones pendientes.');
	}
};
