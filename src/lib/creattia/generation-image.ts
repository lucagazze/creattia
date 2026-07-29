import type { SupabaseClient } from '@supabase/supabase-js';

// Las imágenes generadas viven en el bucket privado `creative-assets`.
// getPublicUrl NO funciona ahí: la única forma de mostrarlas es firmar el
// output_path. Las políticas de storage permiten al usuario firmar su propia
// carpeta ({user_id}/...), así que el cliente del navegador puede hacerlo.
const BUCKET = 'creative-assets';
const TTL_SECONDS = 60 * 60;

export async function signGenerationPaths(
	client: SupabaseClient,
	paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
	const signed = new Map<string, string>();
	const unique = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
	if (!unique.length) return signed;
	try {
		const { data } = await client.storage.from(BUCKET).createSignedUrls(unique, TTL_SECONDS);
		(data || []).forEach((row: any, index: number) => {
			if (row?.signedUrl) signed.set(row.path || unique[index], row.signedUrl);
		});
	} catch {
		// Sin firma la tarjeta queda sin imagen, pero nunca rompe el render.
	}
	return signed;
}
