import type { APIRoute } from 'astro';
import { authenticateRequest, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { checkReferencePath } from '../../../lib/creattia/library-access';

export const prerender = false;

const BUCKET = 'creative-references';
const MAX_PATHS = 60;

/**
 * Firma URLs de la biblioteca de ganadores para el front.
 *
 * El bucket `creative-references` es privado, así que el navegador ya no puede
 * armar la URL por su cuenta con getPublicUrl(). Cada ruta se valida contra el
 * manifiesto y contra el plan de la cuenta antes de firmarse: pedir rutas
 * sueltas no alcanza para ver la biblioteca paga.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const body = await request.json().catch(() => ({}));
		const rawPaths: unknown[] = Array.isArray(body?.paths) ? body.paths : [];
		const paths: string[] = [...new Set(rawPaths.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, MAX_PATHS);
		if (!paths.length) return json({ urls: {} });

		const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
		const siteOrigin = new URL(request.url).origin;
		const verdicts = await Promise.all(paths.map((path) => checkReferencePath(path, access, siteOrigin)));
		const allowed = verdicts.filter((verdict) => verdict.ok).map((verdict) => (verdict as { path: string }).path);
		if (!allowed.length) return json({ urls: {}, locked: paths.length });

		const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrls(allowed, 60 * 60);
		if (error) return fail('reference-urls', error, 'No se pudieron preparar las referencias.');

		const urls: Record<string, string> = {};
		(signed || []).forEach((row, index) => {
			const path = row.path || allowed[index];
			if (row.signedUrl) urls[path] = row.signedUrl;
		});
		return json({ urls, locked: paths.length - allowed.length });
	} catch (error) {
		return fail('reference-urls', error, 'No se pudieron preparar las referencias.');
	}
};
