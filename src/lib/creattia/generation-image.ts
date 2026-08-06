import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase-browser';

// Las imágenes generadas viven en el bucket privado `creative-assets`.
// getPublicUrl NO funciona ahí: la única forma de mostrarlas es firmar el
// output_path. Las políticas de storage permiten al usuario firmar su propia
// carpeta ({user_id}/...), así que el cliente del navegador puede hacerlo.
const BUCKET = 'creative-assets';
const TTL_SECONDS = 60 * 60;

/**
 * Ancho de las miniaturas de las grillas.
 *
 * Un creativo terminado pesa cerca de 1 MB (PNG a 1536px). "Mis imágenes" carga
 * 150: eran ~140 MB de descarga para mostrar tarjetas de 250px. Storage
 * transforma al vuelo y la misma imagen baja a ~40 KB, así que la grilla abre
 * casi al instante. El original se sigue usando al abrir la imagen grande.
 */
const THUMB_WIDTH = 420;

export async function signGenerationPaths(
	client: SupabaseClient,
	paths: Array<string | null | undefined>,
	options?: { thumb?: boolean },
): Promise<Map<string, string>> {
	const signed = new Map<string, string>();
	const unique = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
	if (!unique.length) return signed;
	try {
		const transform = options?.thumb
			? { transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: 'contain' as const, quality: 72 } }
			: undefined;
		const { data } = await client.storage.from(BUCKET).createSignedUrls(unique, TTL_SECONDS, transform as any);
		(data || []).forEach((row: any, index: number) => {
			if (row?.signedUrl) signed.set(row.path || unique[index], row.signedUrl);
		});
	} catch {
		// Sin firma la tarjeta queda sin imagen, pero nunca rompe el render.
	}
	return signed;
}

/**
 * URL en calidad completa de un creativo, para la vista grande y la descarga.
 *
 * Las grillas usan miniaturas transformadas —abren mucho más rápido— pero al
 * abrir una imagen hay que mostrar el original: con la miniatura, la vista
 * grande salía borrosa y la descarga bajaba una imagen chica.
 */
export function useFullGenerationUrl(outputPath?: string | null, fallback = '') {
	const [url, setUrl] = useState(fallback);
	useEffect(() => {
		setUrl(fallback);
		if (!outputPath || !supabase) return;
		let vigente = true;
		void (async () => {
			const signed = await signGenerationPaths(supabase, [outputPath]);
			const original = signed.get(outputPath);
			if (vigente && original) setUrl(original);
		})();
		return () => { vigente = false; };
	}, [outputPath, fallback]);
	return url;
}
