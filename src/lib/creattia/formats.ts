/**
 * Formatos de salida soportados. Vivía duplicado en `generate.ts` y en
 * `batch-worker.ts` — dos copias idénticas que había que tocar de a dos.
 */

/** gpt-image-2 acepta cualquier tamaño divisible por 16 → ratios exactos. */
export const formatSizes: Record<string, string> = {
	'1:1': '1024x1024',
	'3:4': '1152x1536',
	'9:16': '864x1536',
	'4:3': '1536x1152',
	'16:9': '1536x864',
	// Alias heredados de la primera versión del wizard.
	square: '1024x1024',
	portrait: '1152x1536',
	story: '864x1536',
	landscape: '1536x1152',
};

/** 'original' = usar la proporción del anuncio ganador de referencia. */
export const supportedFormats = new Set([...Object.keys(formatSizes), 'original']);

const RATIO_CANDIDATES: Array<[string, number]> = [
	['1:1', 1],
	['3:4', 3 / 4],
	['9:16', 9 / 16],
	['4:3', 4 / 3],
	['16:9', 16 / 9],
];

/** Dado un ratio ancho/alto, el formato soportado más cercano. */
export function closestFormat(ratio: number) {
	let best = '1:1';
	let bestDistance = Infinity;
	for (const [key, value] of RATIO_CANDIDATES) {
		const distance = Math.abs(Math.log(ratio / value));
		if (distance < bestDistance) {
			bestDistance = distance;
			best = key;
		}
	}
	return best;
}
