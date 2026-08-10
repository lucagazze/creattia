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
