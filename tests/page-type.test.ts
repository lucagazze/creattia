import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { pageTypeFromUrl, resolvePageType } from '../src/lib/creattia/page-type';

/**
 * La ruta de la URL es una señal mucho más dura que el contenido: con la home
 * de una tienda el modelo elegía el primer producto de la grilla y lo trataba
 * como protagonista, mientras que "/" no admite interpretación.
 */
describe('tipo de página según la URL', () => {
	test('la raíz sugiere tienda, pero sin imponerlo', () => {
		// Una home puede ser una tienda con 40 productos O la landing de un
		// producto único. Eso solo se ve en el contenido, así que la ruta sugiere
		// y deja decidir al modelo.
		for (const url of ['https://www.theskirtingfactoryllc.com/', 'https://tienda.com', 'https://x.com/?utm=1']) {
			const v = pageTypeFromUrl(url);
			assert.equal(v.pageType, 'catalog', url);
			assert.equal(v.confidence, 'media', 'la home no puede pisar al modelo');
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
		// /collections/ es inequívoco: un listado nunca es una ficha.
		const r = resolvePageType(pageTypeFromUrl('https://t.com/collections/cueros'), 'product');
		assert.equal(r.pageType, 'catalog');
		assert.match(r.reason, /ruta pesa más/);
	});

	test('en una home, el modelo decide: tienda si vio varios productos', () => {
		const r = resolvePageType(pageTypeFromUrl('https://tienda.com/'), 'catalog', 8);
		assert.equal(r.pageType, 'catalog');
	});

	test('una landing de producto único en la home NO se trata como tienda', () => {
		// Marcas que venden una sola cosa: la home ES la ficha. Antes la ruta la
		// forzaba a "tienda" y el anuncio hablaba de un catálogo de un solo ítem.
		const r = resolvePageType(pageTypeFromUrl('https://unsoloproducto.com/'), 'product');
		assert.equal(r.pageType, 'product');

		// Y si el modelo dice "catálogo" pero solo encontró un producto, tampoco.
		const r2 = resolvePageType(pageTypeFromUrl('https://unsoloproducto.com/'), 'catalog', 1);
		assert.equal(r2.pageType, 'product');
		assert.match(r2.reason, /un solo producto/);
	});

	test('sin señales en la ruta, manda el modelo, que sí vio el contenido', () => {
		const r = resolvePageType(pageTypeFromUrl('https://t.com/xyz'), 'service');
		assert.equal(r.pageType, 'service');
	});
});
