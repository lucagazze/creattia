import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

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
	return json({ ok: true });
};
