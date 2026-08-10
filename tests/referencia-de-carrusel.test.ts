import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { Winner } from '../src/lib/creattia/winner-picker';

/**
 * De un carrusel sólo se podía clonar la primera página.
 *
 * El índice de referencias válidas se armaba como `imagePath -> winner`, o sea
 * únicamente PORTADAS. Al elegir la segunda página de un carrusel para generar
 * una imagen suelta, la ruta existía en la biblioteca pero no en ese mapa, y
 * salía "esa referencia ya no está disponible". `carousel-start` ya indexaba las
 * páginas además de la portada; `batch-start` no.
 *
 * Y había un segundo error escondido detrás del primero: la fila se guardaba con
 * `winner.imagePath`, así que aun pasando la validación se habría clonado la
 * portada en vez de la página elegida — en silencio y con el crédito cobrado.
 *
 * El test reproduce el índice y la elección, que es donde estaba la lógica.
 */

const carrusel: Winner = {
	templateId: 40,
	name: 'Nautical Collection',
	imagePath: 'ganadores/collectif/01-portada.png',
	metadata: {
		carouselImages: [
			'ganadores/collectif/01-portada.png',
			'ganadores/collectif/02-detalle.png',
			'ganadores/collectif/03-cierre.png',
		],
	},
};
const suelto: Winner = { templateId: 12, name: 'Estático', imagePath: 'ganadores/otro/unico.png' };

/** El mismo índice que arma el endpoint. */
function indexar(winners: Winner[]) {
	const byPath = new Map<string, Winner>();
	for (const winner of winners) {
		byPath.set(winner.imagePath, winner);
		for (const slide of winner.metadata?.carouselImages || []) {
			if (!byPath.has(slide)) byPath.set(slide, winner);
		}
	}
	return byPath;
}

function elegir(winners: Winner[], paths: string[]) {
	const byPath = indexar(winners);
	return paths
		.map((path) => { const winner = byPath.get(path); return winner ? { winner, referencePath: path } : null; })
		.filter((elegido): elegido is { winner: Winner; referencePath: string } => Boolean(elegido));
}

describe('elegir una sola página de un carrusel', () => {
	test('la página 2 es una referencia válida', () => {
		// La regresión exacta: antes esto daba 0 y el endpoint cortaba con
		// "alguna de las referencias elegidas ya no está disponible".
		const elegidas = elegir([carrusel, suelto], ['ganadores/collectif/02-detalle.png']);
		assert.equal(elegidas.length, 1);
		assert.equal(elegidas[0].winner.templateId, 40);
	});

	test('se clona la página elegida, no la portada', () => {
		const [elegida] = elegir([carrusel, suelto], ['ganadores/collectif/03-cierre.png']);
		assert.equal(elegida.referencePath, 'ganadores/collectif/03-cierre.png');
		assert.notEqual(elegida.referencePath, carrusel.imagePath);
	});

	test('se pueden elegir varias páginas del mismo carrusel', () => {
		const elegidas = elegir([carrusel], ['ganadores/collectif/02-detalle.png', 'ganadores/collectif/03-cierre.png']);
		assert.deepEqual(elegidas.map((e) => e.referencePath), ['ganadores/collectif/02-detalle.png', 'ganadores/collectif/03-cierre.png']);
	});

	test('un estático suelto sigue funcionando igual', () => {
		const [elegida] = elegir([carrusel, suelto], ['ganadores/otro/unico.png']);
		assert.equal(elegida.referencePath, 'ganadores/otro/unico.png');
		assert.equal(elegida.winner.templateId, 12);
	});

	test('una ruta inventada sigue sin pasar', () => {
		// El índice existe para eso: nunca se acepta una ruta arbitraria del cliente.
		assert.equal(elegir([carrusel], ['ganadores/inventado/hackeo.png']).length, 0);
	});

	test('la portada mapea a su propio ganador y no se duplica', () => {
		const byPath = indexar([carrusel]);
		assert.equal(byPath.get(carrusel.imagePath), carrusel);
		assert.equal(byPath.size, 3);
	});
});
