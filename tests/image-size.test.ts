import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'vitest';
import { formatSizes } from '../src/lib/creattia/formats';

/**
 * El tamaño con el que se pide cada imagen.
 *
 * Había dos mapas: el de formats.ts y una copia dentro del motor. Cuando se
 * subió la resolución a 1536 para ganar nitidez en el texto se tocó formats.ts,
 * pero ese archivo nunca le pasa el tamaño al motor —solo valida el formato
 * pedido—, así que la copia seguía mandando 1024x1024 en el cuadrado. Todos los
 * anuncios cuadrados, que son la mayoría, se generaron con la mitad de píxeles
 * por letra durante todo ese tiempo.
 */

describe('resolución de salida', () => {
	test('el lado largo es 1536 en todos los formatos', () => {
		for (const [formato, tamaño] of Object.entries(formatSizes)) {
			const [ancho, alto] = tamaño.split('x').map(Number);
			assert.equal(Math.max(ancho, alto), 1536, `${formato} → ${tamaño}`);
		}
	});

	test('el cuadrado no vuelve a 1024', () => {
		// El caso concreto que se rompió, y el formato más usado.
		assert.equal(formatSizes['1:1'], '1536x1536');
		assert.equal(formatSizes.square, '1536x1536');
	});

	test('gpt-image exige lados divisibles por 16', () => {
		for (const [formato, tamaño] of Object.entries(formatSizes)) {
			for (const lado of tamaño.split('x').map(Number)) {
				assert.equal(lado % 16, 0, `${formato} → ${lado} no es divisible por 16`);
			}
		}
	});

	test('el motor no tiene su propia tabla de tamaños', async () => {
		// Que no vuelva a aparecer una copia que se desincronice en silencio.
		// La tabla de gpt-image-1 sí queda: ese modelo solo acepta 1024 y 1536 en
		// combinaciones fijas, y es únicamente un respaldo heredado.
		const fuente = await readFile('src/lib/creattia/image-engines.ts', 'utf8');
		assert.match(fuente, /const openAISizes[^=]*=\s*formatSizes/);
		const activo = fuente.slice(0, fuente.indexOf('legacyOpenAISizes'));
		assert.doesNotMatch(activo, /'1:1':\s*'1024x1024'/, 'el mapa activo volvió a tener tamaños propios');
	});
});
