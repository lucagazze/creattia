import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

/**
 * Una URL puede ser la ficha de un producto, una landing de servicio o el
 * catálogo de la tienda. Antes todo caía en "producto" y la home de una tienda
 * entraba como un único "producto 1" con todas las fotos mezcladas.
 */

const base = {
	productNames: ['Remera', 'Buzo', 'Gorra'],
	productFacts: ['Algodón'],
	brandName: 'Tienda',
	brief: '',
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
};

describe('anuncio de catálogo', () => {
	test('cuando la página es un catálogo, el prompt habla del negocio y no de un ítem', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog' }, null, false);
		assert.match(prompt, /SUBJECT IS THE STORE, NOT ONE ITEM/);
		// Lo importante: prohíbe elegir un héroe entre los productos y prohíbe
		// inventar precios de un ítem suelto.
		assert.match(prompt, /never present one of them as "the" hero product/i);
		assert.match(prompt, /never write a price or a claim that belongs to a single item/i);
	});

	test('una ficha de producto NO recibe la regla de catálogo', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, null, false);
		assert.doesNotMatch(prompt, /SUBJECT IS THE STORE/);
	});

	test('una landing de servicio tampoco', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'service' }, null, false);
		assert.doesNotMatch(prompt, /SUBJECT IS THE STORE/);
	});

	test('el catálogo trata las fotos como productos reales, no como decorado', () => {
		// Se apoya en la misma rama que 'product': hay objetos físicos que hay que
		// reproducir con fidelidad, aunque el mensaje sea de la tienda.
		const catalogo = buildClonePrompt({ ...base, subjectMode: 'catalog' }, null, false);
		const producto = buildClonePrompt({ ...base, subjectMode: 'product' }, null, false);
		assert.match(catalogo, /PRODUCT/);
		assert.ok(catalogo.length > producto.length, 'el catálogo suma reglas, no las reemplaza');
	});
});
