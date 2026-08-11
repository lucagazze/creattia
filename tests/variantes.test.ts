import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'vitest';

/**
 * Pedir varias versiones del mismo aviso de una sola vez.
 *
 * El motor no devuelve dos veces lo mismo con el mismo prompt, así que pedir
 * cuatro es la forma barata de elegir: salen juntas, con el análisis y las
 * decisiones ya tomadas, en vez de rehacer el flujo entero cuatro veces.
 *
 * Lo que se prueba acá es el TECHO, porque cada versión es una imagen que se
 * cobra y que cuesta plata de verdad. El endpoint leía el número del cliente
 * sin ningún límite superior: alcanzaba con mandar un dígito más alto para
 * arrancar más renders de los que la pantalla ofrece.
 */
const endpoint = readFileSync(new URL('../src/pages/api/creativos/generate.ts', import.meta.url), 'utf8');

describe('cuántas versiones se pueden pedir', () => {
	test('el número que llega del cliente se acota entre 1 y 4', () => {
		assert.match(endpoint, /Math\.min\(4, Math\.max\(1, pedido\)\)/);
	});

	/**
	 * Antes se leía con `clean(..., 1)`, que recorta a UN carácter. Ese recorte
	 * hacía de tope por accidente —nada mayor a 9 entraba— y no por decisión.
	 * Un tope que depende de cuántos dígitos entran no es un tope.
	 */
	test('el tope no depende del largo del texto que llega', () => {
		assert.doesNotMatch(endpoint, /Number\(clean\(form\.get\('count'\), 1\)/);
	});

	test('rehacer una generación existente devuelve una sola', () => {
		assert.match(endpoint, /const count = sourceGenerationId \? 1 : requestedCount;/);
	});

	/** Lo que se reserva es lo que se va a generar, no lo que se pidió. */
	test('se cobra por versión', () => {
		assert.match(endpoint, /const creditsNeeded = count \* creditsPerImage;/);
	});
});

/**
 * Cuántas fotos del producto llegan al modelo.
 *
 * El escaneo de una url guarda hasta 24 imágenes, pero la generación tomaba 5
 * por producto mientras el total permitido es 8. Con UN solo producto —el caso
 * normal— sobraban tres lugares y se descartaban fotos que ya estaban traídas
 * y pagas. Cada vista que falta es una parte de la prenda que el modelo tiene
 * que suponer, y de suponer salen las capuchas que el producto no tiene.
 */
const generar = readFileSync(new URL('../src/pages/api/creativos/generate.ts', import.meta.url), 'utf8');

describe('fotos del producto que llegan al render', () => {
	test('un solo producto puede usar todas sus fotos hasta el cupo', () => {
		assert.match(generar, /Math\.min\(paths\.length, 8\)/);
		assert.doesNotMatch(generar, /Math\.min\(paths\.length, 5\)/);
	});

	/** El techo total sigue siendo el que manda: no se dispara sin límite. */
	test('el total sigue acotado', () => {
		assert.match(generar, /productInputPlan\.length < 8/);
	});
});

/**
 * Una sola URL de producto.
 *
 * Varias hacían que un aviso hablara de dos productos a la vez, y el ganador que
 * se está clonando fue diseñado para uno: los textos, el lugar del héroe y la
 * jerarquía son de un solo producto.
 *
 * Queda una excepción que NO es lo mismo: el carrusel con un producto por
 * página. Ahí cada URL es una página, no un producto más dentro del mismo aviso.
 */
const flujo = readFileSync(new URL('../src/components/creattia/CreationFlow.tsx', import.meta.url), 'utf8');

describe('cuántas URLs de producto se pueden cargar', () => {
	test('agregar otra URL solo existe en el carrusel por página', () => {
		assert.match(flujo, /const variasUrls = wantsFullCarousel && !carouselSameProduct;/);
		assert.match(flujo, /\{variasUrls && \(/);
		// El rótulo de "otro producto" no puede volver: ya no hay caso que lo use.
		assert.doesNotMatch(flujo, /otro producto/);
	});

	/**
	 * Y las que ya estaban cargadas se recortan al salir de ese modo: quien armó
	 * tres en el carrusel y volvió a imagen suelta se quedaba con tres y sin nada
	 * en la pantalla que explicara de dónde salían.
	 */
	test('al salir del carrusel por página queda una sola', () => {
		assert.match(flujo, /if \(!variasUrls\) setUrls\(\(prev\) => \(prev\.length > 1 \? \[prev\[0\]\] : prev\)\);/);
	});
});
