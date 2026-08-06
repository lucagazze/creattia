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

/**
 * Ancho para ver una imagen abierta.
 *
 * El original es un PNG de ~1 MB a 1536px. En pantalla no se distingue de una
 * versión a 1280px con buena calidad, pero pesa la quinta parte y por eso el
 * visor tardaba en mostrarla nítida. El archivo original se sigue usando para
 * descargar, que es donde la resolución sí importa.
 */
const VIEW_WIDTH = 1280;

export async function signGenerationPaths(
	client: SupabaseClient,
	paths: Array<string | null | undefined>,
	options?: { thumb?: boolean; view?: boolean },
): Promise<Map<string, string>> {
	const signed = new Map<string, string>();
	const unique = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
	if (!unique.length) return signed;
	try {
		const transform = options?.thumb
			? { transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: 'contain' as const, quality: 72 } }
			: options?.view
				? { transform: { width: VIEW_WIDTH, height: VIEW_WIDTH, resize: 'contain' as const, quality: 86 } }
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
			const signed = await signGenerationPaths(supabase, [outputPath], { view: true });
			const vista = signed.get(outputPath);
			if (vigente && vista) setUrl(vista);
		})();
		return () => { vigente = false; };
	}, [outputPath, fallback]);
	return url;
}


/**
 * Firma el archivo ORIGINAL, sin transformar, en el momento de descargarlo.
 *
 * La vista abierta usa una versión a 1280px porque abre mucho antes, pero al
 * descargar hay que entregar el archivo completo: firmarlo recién acá evita
 * pagar esa firma en cada imagen que se abre y solo se mira.
 */
export async function signOriginalGeneration(outputPath?: string | null, fallback = ''): Promise<string> {
	if (!outputPath || !supabase) return fallback;
	const signed = await signGenerationPaths(supabase, [outputPath]);
	return signed.get(outputPath) || fallback;
}
