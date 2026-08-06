import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { pageTypeFromUrl, resolvePageType } from '../src/lib/creattia/page-type';

/**
 * La ruta de la URL es una señal mucho más dura que el contenido: con la home
 * de una tienda el modelo elegía el primer producto de la grilla y lo trataba
 * como protagonista, mientras que "/" no admite interpretación.
 */
describe('tipo de página según la URL', () => {
	test('la raíz del dominio es la tienda, nunca una ficha', () => {
		for (const url of ['https://www.theskirtingfactoryllc.com/', 'https://tienda.com', 'https://x.com/?utm=1']) {
			const v = pageTypeFromUrl(url);
			assert.equal(v.pageType, 'catalog', url);
			assert.equal(v.confidence, 'alta');
		}
	});

	test('una ficha de producto se reconoce por la ruta', () => {
		for (const url of ['https://t.com/products/latigo-leather', 'https://t.com/producto/cuero-natural', 'https://t.com/es/product/x']) {
			assert.equal(pageTypeFromUrl(url).pageType, 'product', url);
		}
	});

	test('el listado sin hijo es catálogo, no ficha', () => {
		assert.equal(pageTypeFromUrl('https://t.com/products').pageType, 'catalog');
		assert.equal(pageTypeFromUrl('https://t.com/collections/cueros').pageType, 'catalog');
	});

	test('una URL sin señales no inventa un veredicto', () => {
		const v = pageTypeFromUrl('https://t.com/xyz');
		assert.equal(v.pageType, null);
		assert.equal(v.confidence, 'baja');
	});

	test('una señal fuerte de la ruta le gana al modelo', () => {
		// El caso reportado: home de tienda, el modelo dice "producto".
		const r = resolvePageType(pageTypeFromUrl('https://www.theskirtingfactoryllc.com/'), 'product');
		assert.equal(r.pageType, 'catalog');
		assert.match(r.reason, /ruta pesa más/);
	});

	test('sin señales en la ruta, manda el modelo, que sí vio el contenido', () => {
		const r = resolvePageType(pageTypeFromUrl('https://t.com/xyz'), 'service');
		assert.equal(r.pageType, 'service');
	});
});
