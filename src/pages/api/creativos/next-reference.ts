import type { APIRoute } from 'astro';
import { loadWinners, type Winner } from '../../../lib/creattia/winner-picker';
import { isCompatible, screenWinners } from '../../../lib/creattia/winner-screening';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 60;

/** Mezcla al azar sin tocar el original. */
function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap], copy[index]];
	}
	return copy;
}

/**
 * Devuelve UNA referencia nueva al azar de toda la biblioteca, compatible con el
 * producto y sin repetir ninguna de las que el usuario ya vio.
 *
 * Antes el botón Reemplazar tiraba de un banco de suplentes calculado en el
 * preview, que se agotaba enseguida (con productos difíciles quedaba en 1 o 0) y
 * limitaba las opciones a lo que se hubiera analizado en ese momento. Ahora cada
 * reemplazo sale del pool completo.
 *
 * Los anuncios que el usuario guardó tienen prioridad: se prueban primero y solo
 * se sale al resto de la biblioteca cuando se agotan o ninguno es compatible.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';

	try {
		const body = await request.json().catch(() => ({}));
		const exclude = new Set<string>(
			Array.isArray(body?.exclude) ? body.exclude.map((value: unknown) => String(value || '')) : [],
		);
		const savedPaths: string[] = Array.isArray(body?.savedPaths)
			? body.savedPaths.map((value: unknown) => String(value || '')).filter(Boolean)
			: [];
		const wearable = body?.wearable !== false;
		const hasImage = body?.hasImage !== false;
		const wanted = Math.min(Math.max(Number(body?.count) || 1, 1), 6);

		const all = await loadWinners(new URL(request.url).origin);
		const available = all.filter((winner) => !exclude.has(winner.imagePath));
		if (!available.length) return json({ winners: [], exhausted: true });

		const savedSet = new Set(savedPaths);
		// Los guardados primero, el resto de la biblioteca después. Cada grupo va
		// mezclado, así dos reemplazos seguidos nunca dan lo mismo.
		const ordered = [
			...shuffle(available.filter((winner) => savedSet.has(winner.imagePath))),
			...shuffle(available.filter((winner) => !savedSet.has(winner.imagePath))),
		];

		const picked: Winner[] = [];
		const tried = new Set<string>();
		// Se analiza de a tandas chicas: alcanza con encontrar los que se piden y
		// evita gastar llamadas de visión de más.
		for (let round = 0; round < 4 && picked.length < wanted; round += 1) {
			const batch = ordered.filter((winner) => !tried.has(winner.imagePath)).slice(0, Math.max(6, wanted * 3));
			if (!batch.length) break;
			batch.forEach((winner) => tried.add(winner.imagePath));

			const downloads = await Promise.all(batch.map(async (winner) => {
				const { data } = await admin.storage.from('creative-references').download(winner.imagePath);
				if (!data) return null;
				return { imagePath: winner.imagePath, buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || 'image/webp' };
			}));
			const verdicts = await screenWinners(
				downloads.filter((item): item is NonNullable<typeof item> => Boolean(item)),
				{ googleKey },
			);
			for (const winner of batch) {
				if (picked.length >= wanted) break;
				const verdict = verdicts.get(winner.imagePath);
				if (verdict && !isCompatible(verdict, { wearable, hasImage }).compatible) continue;
				picked.push(winner);
			}
		}

		return json({
			winners: picked.map((winner) => ({
				imagePath: winner.imagePath,
				name: winner.name,
				notes: winner.promptNotes || '',
				leaf: winner.categoryLeaf || '',
				templateId: winner.templateId || null,
				fromSaved: savedSet.has(winner.imagePath),
			})),
			exhausted: picked.length === 0,
		});
	} catch (error: any) {
		console.error('Error buscando otra referencia:', error);
		return json({ error: error?.message || 'No se pudo buscar otra referencia.' }, 500);
	}
};
