import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const body = await request.json();
		const { generationId, imageUrl } = body || {};

		if (!generationId || !imageUrl) {
			return json({ error: 'Faltan parámetros.' }, 400);
		}

		const { error } = await admin.from('creative_generations').update({
			status: 'completed',
			output_image_url: imageUrl,
			output_url: imageUrl,
			updated_at: new Date().toISOString(),
		}).eq('id', generationId).eq('user_id', auth.user.id);

		if (error) throw error;

		return json({ ok: true, id: generationId, imageUrl });
	} catch (err: any) {
		console.error('Error completando generación:', err);
		return json({ error: err.message || 'No se pudo actualizar.' }, 500);
	}
};
