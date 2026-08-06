import assert from 'node:assert/strict';
import { describe, test, vi } from 'vitest';

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
