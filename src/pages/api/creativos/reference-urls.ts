import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, fail, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { filterAllowedReferencePaths } from '../../../lib/creattia/library-access';

export const prerender = false;

const BUCKET = 'creative-references';
// Una pantalla de biblioteca son ~20 tarjetas, algunas con páginas de carrusel.
const MAX_PATHS = 250;

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

		/**
		 * Tope de firmas por hora.
		 *
		 * Cada llamada firma hasta 250 rutas contra Storage y lee el manifiesto
		 * entero para validarlas. Es barato por llamada pero se invoca en cada
		 * scroll, así que sin techo una cuenta puede pedirlo en bucle y saturar la
		 * cuota de Storage para todos los demás.
		 *
		 * Mil y no doscientas: el front pide por tarjeta, no por pantalla, así que
		 * una hora de uso real de UNA persona midió 237 pedidos — con 200 la
		 * biblioteca se le puso en blanco a un usuario navegando normal, en todas
		 * las versiones a la vez porque el contador vive en la base compartida. El
		 * techo es para el bucle de un script, no para el scroll de una persona.
		 *
		 * No cierra por defecto: si el limitador está caído, preferimos que la
		 * biblioteca se siga viendo.
		 */
		const dentroDelLimite = await checkRateLimit(admin, auth.user.id, 'reference-urls', 1000, 3600);
		if (!dentroDelLimite) return json({ error: 'Demasiados pedidos seguidos. Esperá unos segundos.' }, 429);

		const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
		const { allowed, locked } = await filterAllowedReferencePaths(paths, access, new URL(request.url).origin);
		if (!allowed.length) return json({ urls: {}, locked });

		const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrls(allowed, 60 * 60);
		if (error) return fail('reference-urls', error, 'No se pudieron preparar las referencias.');

		const urls: Record<string, string> = {};
		(signed || []).forEach((row, index) => {
			const path = row.path || allowed[index];
			if (row.signedUrl) urls[path] = row.signedUrl;
		});
		return json({ urls, locked });
	} catch (error) {
		return fail('reference-urls', error, 'No se pudieron preparar las referencias.');
	}
};
