import assert from 'node:assert/strict';
import { describe, test, vi } from 'vitest';
import { buildDiscoverDeck } from '../src/lib/creattia/library-access';

/**
 * El filtro por lote que decide qué miniaturas de la biblioteca se firman.
 * Se llama en cada scroll, así que tiene que ser correcto y barato.
 */
vi.mock('../src/lib/creattia/winner-picker', () => ({
	loadWinners: async () => ([
		{ templateId: 40, name: 'Gratis', imagePath: '40/2fb666571bf2802e.png' },
		{ templateId: 41, name: 'Pago', imagePath: '41/aaaaaaaaaaaaaaaa.png',
		  metadata: { carouselImages: ['41/aaaaaaaaaaaaaaaa.png', '41/bbbbbbbbbbbbbbbb.png'] } },
	]),
}));

const { filterAllowedReferencePaths } = await import('../src/lib/creattia/library-access');

const paid = { isPaidLibrary: true } as any;
const free = { isPaidLibrary: false } as any;

describe('filterAllowedReferencePaths', () => {
	test('una cuenta paga recibe todo lo que existe, incluidas las páginas de carrusel', async () => {
		const { allowed, locked } = await filterAllowedReferencePaths(
			['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png', '41/bbbbbbbbbbbbbbbb.png'], paid, 'https://creattia.app');
		assert.equal(allowed.length, 3);
		assert.equal(locked, 0);
	});

	test('una cuenta gratuita solo recibe el preview', async () => {
		const { allowed, locked } = await filterAllowedReferencePaths(
			['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png'], free, 'https://creattia.app');
		assert.deepEqual(allowed, ['40/2fb666571bf2802e.png']);
		assert.equal(locked, 1);
	});

	test('una ruta inventada nunca se firma, ni siquiera para una cuenta paga', async () => {
		const { allowed } = await filterAllowedReferencePaths(
			['99/inventada.png', '../../etc/passwd', ''], paid, 'https://creattia.app');
		assert.deepEqual(allowed, []);
	});

	test('deduplica: la misma ruta repetida se firma una sola vez', async () => {
		const { allowed } = await filterAllowedReferencePaths(
			Array(50).fill('40/2fb666571bf2802e.png'), paid, 'https://creattia.app');
		assert.equal(allowed.length, 1);
	});
});

/**
 * El mazo del descubridor mostraba cuatro tarjetas y nada más.
 *
 * Tomaba UN anuncio de cada uno de cuatro ángulos fijos, igual para todos: una
 * cuenta gratuita se perdía 46 de los 50 creativos que sí puede usar, y una
 * paga veía la biblioteca entera reducida a cuatro imágenes. El síntoma era que
 * el descubridor se terminaba a los cuatro swipes.
 */
describe('mazo del descubridor', () => {
	const hacer = (categoria: string, cuantos: number) =>
		Array.from({ length: cuantos }, (_, i) => ({ category: categoria, imagePath: `${categoria}-${i}` }));

	test('entra todo lo permitido, no cuatro', () => {
		const candidatos = [...hacer('producto', 5), ...hacer('resenas', 5), ...hacer('precio', 5)];
		assert.equal(buildDiscoverDeck(candidatos, 50).length, 15);
	});

	test('alterna ángulos en vez de agrupar', () => {
		const candidatos = [...hacer('producto', 3), ...hacer('resenas', 3)];
		const deck = buildDiscoverDeck(candidatos, 6);
		// Uno de cada ángulo por vuelta: nunca dos seguidos del mismo.
		assert.deepEqual(deck.map((x) => x.category), ['producto', 'resenas', 'producto', 'resenas', 'producto', 'resenas']);
	});

	test('respeta el tope sin romperse', () => {
		assert.equal(buildDiscoverDeck([...hacer('producto', 100), ...hacer('resenas', 100)], 50).length, 50);
	});

	test('con menos candidatos que el tope devuelve los que hay', () => {
		assert.equal(buildDiscoverDeck(hacer('producto', 3), 50).length, 3);
		assert.equal(buildDiscoverDeck([], 50).length, 0);
	});

	test('no pierde ninguno cuando un ángulo tiene más que los otros', () => {
		const candidatos = [...hacer('producto', 10), ...hacer('resenas', 2)];
		assert.equal(buildDiscoverDeck(candidatos, 50).length, 12);
	});
});
