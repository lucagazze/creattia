import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

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
	if (processing.error) return json({ error: processing.error.message }, 500);

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
	const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze')
		|| String(auth.user.email || '').toLowerCase().includes('algoritmiadesarrollos');

	try {
		const body = await request.json().catch(() => ({}));
		const remove = body?.remove === true;
		// Permite cerrar una sola generación (botón "Cancelar" de una tarjeta).
		const onlyId = String(body?.generationId || '').trim();

		// Una sola generación (botón Cancelar) o la barrida completa: pendientes
		// vencidas + todas las fallidas, que no tienen imagen y solo estorban.
		let rows: Array<{ id: string; output_path: string | null; status: string }> = [];
		if (onlyId) {
			const { data, error } = await admin.from('creative_generations')
				.select('id,output_path,status')
				.eq('user_id', userId).eq('id', onlyId).in('status', ['processing', 'failed']);
			if (error) throw error;
			rows = data || [];
		} else {
			const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
			const [stale, failed] = await Promise.all([
				admin.from('creative_generations').select('id,output_path,status')
					.eq('user_id', userId).eq('status', 'processing').lt('created_at', cutoff),
				admin.from('creative_generations').select('id,output_path,status')
					.eq('user_id', userId).eq('status', 'failed'),
			]);
			if (stale.error) throw stale.error;
			rows = [...(stale.data || []), ...(failed.data || [])];
		}

		const ids = rows.map((row) => row.id);
		if (!ids.length) return json({ closed: 0, removed: 0, ids: [] });

		// Solo se devuelven créditos por lo que estaba en curso: las fallidas ya
		// fueron reembolsadas cuando fallaron.
		const refundable = rows.filter((row) => row.status === 'processing').length;

		if (remove) {
			// Se borran también los archivos que hubieran quedado a medias.
			const paths = rows.map((row) => row.output_path).filter(Boolean) as string[];
			if (paths.length) await admin.storage.from('creative-assets').remove(paths);
			const { error: deleteError } = await admin.from('creative_generations')
				.delete().in('id', ids).eq('user_id', userId);
			if (deleteError) throw deleteError;
		} else {
			const { error: updateError } = await admin.from('creative_generations').update({
				status: 'failed',
				error_code: 'Generación interrumpida. Los créditos fueron devueltos.',
				completed_at: new Date().toISOString(),
			}).in('id', ids).eq('user_id', userId);
			if (updateError) throw updateError;
		}

		// Los créditos de lo que nunca se generó vuelven al usuario.
		if (!isAdmin && refundable > 0) {
			const { error: refundError } = await admin.rpc('refund_creative_credits', {
				p_user_id: userId,
				p_amount: refundable,
			});
			if (refundError) console.error('Refund de pendientes falló:', refundError);
		}

		return json({ closed: ids.length, removed: remove ? ids.length : 0, ids });
	} catch (error: any) {
		console.error('Error limpiando generaciones colgadas:', error);
		return json({ error: error?.message || 'No se pudieron limpiar las generaciones pendientes.' }, 500);
	}
};
