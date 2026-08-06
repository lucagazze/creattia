/**
 * Host desde el que se aceptan referencias de la biblioteca (videos y
 * fotogramas). Sale del proyecto Supabase configurado en vez de estar escrito a
 * mano en cada endpoint: antes el project-ref aparecía repetido en tres rutas de
 * API y en el front, así que mudar de proyecto obligaba a acordarse de todos.
 */
const configuredUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';

export const REFERENCE_HOST = (() => {
	try {
		return configuredUrl ? new URL(configuredUrl).hostname : '';
	} catch {
		return '';
	}
})();

/** Valida que una URL de referencia sea https y del proyecto configurado. */
export function assertReferenceUrl(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || !REFERENCE_HOST || url.hostname !== REFERENCE_HOST) {
		throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	}
	return url;
}
