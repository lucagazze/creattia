import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

/**
 * Las portadas se firman antes que las páginas de precarga.
 *
 * El servidor firma como mucho 250 rutas por pedido. Al empezar a pedir las doce
 * páginas de cada carrusel para precargarlas, veinte tarjetas visibles llegaban a
 * pedir 260: las últimas quedaban fuera del corte y se mostraban en blanco, sin
 * siquiera su portada, porque los carruseles del principio se comían todo el
 * presupuesto.
 *
 * El orden importa y no es un detalle: sin portada no hay tarjeta, mientras que
 * sin páginas precargadas solo se pierde fluidez al pasarlas.
 */

const MAX_PATHS = 250;

/** Mismo armado que usa la biblioteca. */
function rutasAFirmar(items: Array<{ imagePath: string; paginas?: string[] }>, abierto?: string[]) {
	const portadas = items.map((item) => item.imagePath);
	const paginas = items.flatMap((item) => (item.paginas || []).slice(0, 12));
	return [...portadas, ...(abierto || []), ...paginas];
}

describe('firmado de la biblioteca', () => {
	const items = Array.from({ length: 20 }, (_, i) => ({
		imagePath: `portada-${i}.webp`,
		paginas: Array.from({ length: 12 }, (_, p) => `pagina-${i}-${p}.webp`),
	}));

	test('ninguna portada queda fuera del tope', () => {
		const rutas = rutasAFirmar(items).slice(0, MAX_PATHS);
		for (const item of items) {
			assert.ok(rutas.includes(item.imagePath), `quedó sin firmar: ${item.imagePath}`);
		}
	});

	test('el anuncio abierto entra siempre', () => {
		const rutas = rutasAFirmar(items, ['abierto.webp']).slice(0, MAX_PATHS);
		assert.ok(rutas.includes('abierto.webp'));
	});

	test('lo que se recorta son páginas de precarga, no portadas', () => {
		const rutas = rutasAFirmar(items);
		assert.ok(rutas.length > MAX_PATHS, 'el escenario tiene que exceder el tope');
		const recortadas = rutas.slice(MAX_PATHS);
		assert.ok(recortadas.every((ruta) => ruta.startsWith('pagina-')), 'se estaba recortando una portada');
	});
});
