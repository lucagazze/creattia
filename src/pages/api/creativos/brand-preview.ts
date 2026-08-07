import type { APIRoute } from 'astro';
import { analyzeBrandStyle } from '../../../lib/creattia/brand-style';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, checkRateLimit, fail, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
// Mismo trabajo que /brands —escanear un sitio entero y pasarlo por un modelo—
// que tiene 120. Con 60 se cortaba a mitad de camino en sitios pesados.
export const maxDuration = 120;

/**
 * Lee la identidad visual de una URL y la devuelve SIN guardar nada.
 *
 * Sirve para que al regenerar una imagen se pueda tomar el logo, los colores y
 * la tipografía de cualquier sitio, no solo de "Mi marca" o de la URL del
 * producto. Se separa de `/brands` a propósito: aquel crea una marca en la
 * cuenta y consume el cupo del plan, y acá solo se quiere mirar.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	// Escanea un sitio entero y lo pasa por un modelo: sin tope es costo abierto.
	const withinLimit = await checkRateLimit(admin, auth.user.id, 'brand-preview', 20, 3600, true);
	if (!withinLimit) return json({ error: 'Analizaste muchas marcas en poco tiempo. Esperá un rato.' }, 429);

	try {
		const body = await request.json().catch(() => ({}));
		const raw = String(body?.url || '').trim().slice(0, 500);
		if (!raw) return json({ error: 'Pegá la URL de la marca.' }, 400);

		// normalizeExternalUrl rechaza credenciales embebidas y esquemas raros; el
		// bloqueo de redes privadas lo hace safeExternalFetch al descargar.
		const website = normalizeExternalUrl(raw);
		const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
		const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

		const style = await analyzeBrandStyle(website, { openAIKey, googleKey });
		return json({
			brand: {
				name: new URL(website).hostname.replace(/^www\./, ''),
				website,
				logoUrl: style.logoUrl || '',
				colors: (style.colors || []).slice(0, 5),
				palette: style.palette || null,
				typography: style.typography || null,
				styleSummary: style.styleSummary || '',
			},
		});
	} catch (error) {
		return fail('brand-preview', error, 'No pudimos leer la identidad de esa página.');
	}
};
