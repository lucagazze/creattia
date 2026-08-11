import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

// Estas pruebas verifican el prompt DETALLADO (`ad-analysis.ts`), que dejó de ser
// el default cuando entró el clon libre pero sigue entero y elegible. Sin esto
// mirarían el prompt equivocado y fallarían por buscar reglas que el libre no
// tiene, no por una regresión real.
process.env.RENDER_PROMPT = 'detallado';


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
		const catalogo = buildClonePrompt({ ...base, subjectMode: 'catalog' }, null, false);
		assert.match(catalogo, /PRODUCT SWAP/);
		assert.match(catalogo, /SUBJECT IS THE STORE, NOT ONE ITEM/);
	});

	/**
	 * La tienda tiene su propio bloque de producto, no el de una ficha.
	 *
	 * Antes heredaba el de producto único, escrito palabra por palabra para UN
	 * objeto: pedía renderizar "ONE single coherent object" y tratar todas las
	 * fotos como vistas del mismo SKU, mientras la regla de tienda pedía lo
	 * contrario. Con las dos órdenes juntas el modelo resolvía distinto en cada
	 * corrida, y la misma grilla salía a veces con toda la variedad y a veces con
	 * nueve celdas iguales.
	 */
	test('el catálogo no arrastra las reglas de producto único', () => {
		const catalogo = buildClonePrompt({ ...base, subjectMode: 'catalog' }, null, false);
		assert.doesNotMatch(catalogo, /ONE single coherent object/);
		assert.doesNotMatch(catalogo, /ONE SAME SKU/);
		// Y el nombre de la etiqueta no puede ser la concatenación de varios.
		assert.doesNotMatch(catalogo, /the product name is literally/);
	});
});
