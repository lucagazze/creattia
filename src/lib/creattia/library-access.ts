import { loadWinners } from './winner-picker';
import type { EffectiveAccess } from './admin-access';

/**
 * Control de acceso a la biblioteca de ganadores.
 *
 * Hasta ahora el paywall se apoyaba en no devolver las rutas: `library.ts` solo
 * listaba 5 referencias por ángulo a las cuentas gratuitas. Pero `next-reference`
 * entregaba rutas de toda la biblioteca sin mirar el plan, y `generate` aceptaba
 * cualquier `referencePath` que matcheara una regex, así que una cuenta gratis
 * (o una que canceló) podía generar con el catálogo completo. Acá vive la única
 * definición de "esta cuenta puede usar esta referencia".
 */

/** Rutas que la app muestra gratis; el resto necesita suscripción activa. */
export const FREE_PREVIEW_REFERENCE_PATHS = new Set<string>([
	'40/2fb666571bf2802e.png',
	'40/55596501e64f813b.png',
	'40/174faa5c6ab2a671.png',
	'40/8640d4617f2e692d.png',
	'40/b3aaaa6a8d580a1a.png',
]);

/** Los nombres de archivo originales que componen el preview gratuito. */
export const FREE_PREVIEW_FILES: Record<string, string[]> = {
	'antes-despues': ['antes y despues (1).png', 'antes y despues (11).jpg', 'antes y despues (12).jpg', 'antes y despues (2).png', 'antes y despues (25).jpg'],
	estadisticas: ['Factos y Estadisticas (3).jpg', 'Factos y Estadisticas (15).jpg', 'Factos y Estadisticas (34).jpg', 'Factos y Estadisticas (30).jpg', 'Factos y Estadisticas (26).jpg'],
	caracteristicas: ['caracteristicas y beneficios (10).jpg', 'caracteristicas y beneficios (13).jpg', 'caracteristicas y beneficios (19).jpg', 'caracteristicas y beneficios (34).jpg', 'caracteristicas y beneficios (48).jpg'],
	estacional: ['Vacaciones - Estacional (3).jpg', 'Vacaciones - Estacional (5).jpg', 'Vacaciones - Estacional (8).jpg', 'Vacaciones - Estacional (18).jpg', 'Vacaciones - Estacional (21).jpg'],
	noticias: ['Noticias (4).png', 'Noticias (19).jpg', 'Noticias (22).jpg', 'Noticias (26).jpg', 'Noticias (27).jpg'],
	precio: ['Promociones y Descuentos (13).jpg', 'Promociones y Descuentos (18).jpg', 'Promociones y Descuentos (24).jpg', 'Promociones y Descuentos (32).jpg', 'Promociones y Descuentos (36).jpg'],
	'razones-porque': ['Razones porque (44).jpg', 'Razones porque (49).jpg', 'Razones porque (51).jpg', 'Razones porque (54).jpg', 'Razones porque (1).png'],
	resenas: ['Testimonios (66).jpg', 'Testimonios (18).png', 'Testimonios (71).jpg', 'Testimonios (85).jpg', 'Testimonios (87).jpg'],
	competencia: ['Nosotros vs Ellos (77).jpg', 'Nosotros vs Ellos (94).jpg', 'Nosotros vs Ellos (97).jpg', 'Nosotros vs Ellos (103).jpg', 'Nosotros vs Ellos (1).jpg'],
	producto: [
		'producto-presentacion-gratis-01.png',
		'producto-presentacion-gratis-02.png',
		'producto-presentacion-gratis-03.png',
		'producto-presentacion-gratis-04.png',
		'producto-presentacion-gratis-05.png',
	],
};

const FREE_PREVIEW_FILE_TO_ANGLE = new Map(
	Object.entries(FREE_PREVIEW_FILES).flatMap(([angle, files]) => files.map((file) => [file.toLowerCase(), angle] as const)),
);

/** El ángulo del preview gratuito al que pertenece un item del manifiesto. */
export function freePreviewAngleFor(item: { metadata?: { originalFileName?: string }; imagePath?: string }) {
	const sourceFile = String(item.metadata?.originalFileName || '').toLowerCase().trim();
	if (FREE_PREVIEW_FILE_TO_ANGLE.has(sourceFile)) return FREE_PREVIEW_FILE_TO_ANGLE.get(sourceFile) || null;
	return FREE_PREVIEW_REFERENCE_PATHS.has(String(item.imagePath || '')) ? 'producto' : null;
}

/** ¿Esta cuenta puede usar la biblioteca completa? */
export function hasFullLibraryAccess(access: EffectiveAccess) {
	return access.isPaidLibrary;
}

export type ReferenceCheck =
	| { ok: true; path: string }
	| { ok: false; status: 400 | 402 | 503; error: string; code?: string };

/**
 * Valida una ruta de referencia recibida del cliente: tiene que existir de
 * verdad en el manifiesto (no alcanza con parecerse a una ruta) y estar
 * permitida para el plan de la cuenta.
 */
export async function checkReferencePath(
	rawPath: string,
	access: EffectiveAccess,
	siteOrigin: string,
): Promise<ReferenceCheck> {
	const path = String(rawPath || '').trim();
	if (!path) return { ok: false, status: 400, error: 'Falta la referencia.' };

	// Si el manifiesto no se puede leer, se corta: sin la lista no hay forma de
	// saber si la ruta existe ni de qué plan es, y adivinar sería justamente el
	// agujero que esta función cierra.
	let winners: Awaited<ReturnType<typeof loadWinners>>;
	try {
		winners = await loadWinners(siteOrigin);
	} catch (error) {
		console.error('[library-access] no se pudo leer el manifiesto de ganadores', error);
		return { ok: false, status: 503, error: 'La biblioteca de ganadores no está disponible en este momento.' };
	}
	const known = winners.some((winner) => winner.imagePath === path);
	if (!known) {
		return { ok: false, status: 400, error: 'Esa referencia ya no está disponible en la biblioteca.' };
	}
	if (!hasFullLibraryAccess(access) && !FREE_PREVIEW_REFERENCE_PATHS.has(path)) {
		const previewItem = winners.find((winner) => winner.imagePath === path);
		if (!previewItem || !freePreviewAngleFor(previewItem)) {
			return {
				ok: false,
				status: 402,
				error: 'Esta referencia es parte de la biblioteca completa. Activá un plan para usarla.',
				code: 'LIBRARY_LOCKED',
			};
		}
	}
	return { ok: true, path };
}
