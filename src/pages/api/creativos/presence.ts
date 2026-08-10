import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

/**
 * El latido de presencia, y dónde está parada la persona.
 *
 * Antes solo guardaba una marca de tiempo: alcanzaba para contar cuánta gente
 * hay conectada, no para saber qué está haciendo. Con una campaña corriendo eso
 * es lo que se quiere mirar — si entran y se quedan en la biblioteca sin
 * generar, si abren el flujo y lo abandonan, en qué anuncio se traban.
 *
 * La pantalla llega solo cuando CAMBIA. El latido corre cada minuto y anotar una
 * fila por minuto por persona llenaría la tabla de eventos con lo mismo
 * repetido; un cambio de pantalla son unos pocos por sesión.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const result = await admin.from('creative_profiles').update({ last_activity_at: new Date().toISOString() }).eq('user_id', auth.user.id);
	if (result.error) {
		console.error('[creative-presence]', result.error);
		return json({ error: 'No se pudo actualizar la presencia.' }, 500);
	}

	// El body es opcional: el latido periódico no manda nada y solo refresca la
	// hora. Un JSON roto no puede tumbar la presencia, así que se ignora.
	let vista = '';
	let detalle = '';
	try {
		const body = await request.json();
		vista = String(body?.vista || '').trim().slice(0, 40);
		detalle = String(body?.detalle || '').trim().slice(0, 120);
	} catch {
		// Sin cuerpo: es un latido y ya quedó anotado arriba.
	}

	if (vista) {
		try {
			// Se escribe directo y NO por trackEvent: ese helper manda además cada
			// evento a Meta, y una pantalla vista no es una conversión — mandarla
			// ensuciaría la cuenta con miles de eventos que no significan nada.
			await admin.from('creative_events').insert({
				user_id: auth.user.id,
				event: 'pantalla',
				props: { vista, detalle },
			});
		} catch (error) {
			console.warn('[creative-presence] pantalla', error instanceof Error ? error.message : error);
		}
	}

	return json({ ok: true });
};
