import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

/**
 * El largo de un copy es parte del diseño, no una preferencia.
 *
 * El bloque de texto del ganador se dibujó para una cadena de ese tamaño: uno más
 * largo pasa a dos líneas, empuja lo de abajo y desarma el ritmo de la columna
 * aunque la maqueta se haya respetado. La regla pedía "±15% del original", que
 * sobre un titular de veinte caracteres da tres de margen pero sobre uno de
 * ciento veinte da dieciocho — y dieciocho caracteres son media línea.
 *
 * Ahora el margen es absoluto: tres caracteres, contados, no estimados.
 */

const base = {
	productNames: ['Campera Billabong'],
	productFacts: [],
	brief: '',
	brandName: 'California Garage',
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
	subjectMode: 'product' as const,
};

describe('el copy sugerido respeta el largo del original', () => {
	test('el margen se pide en caracteres, no en porcentaje', () => {
		const prompt = buildClonePrompt(base, {
			referenceHasProduct: true,
			textZones: [{ where: 'titular', original: 'BACKED UP?', replacement: '¿LISTO PARA LA COPA?' }],
		} as any, false);
		// El dato exacto contra el que se mide, que ya viajaba.
		assert.match(prompt, /the original is 10 characters/);
	});

	test('el prompt ya no habla de porcentajes', () => {
		// "±15%" sobre un texto largo daba casi veinte caracteres de margen.
		const prompt = buildClonePrompt(base, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.doesNotMatch(prompt, /15% of the original character count/);
	});

	/**
	 * El largo del original viaja por zona: es lo que permite decidir si hay que
	 * acortar antes de generar, en vez de descubrirlo mirando la imagen.
	 */
	test('cada zona lleva su propio largo medido', () => {
		const prompt = buildClonePrompt(base, {
			referenceHasProduct: true,
			textZones: [
				{ where: 'titular', original: 'BACKED UP?', replacement: 'A' },
				{ where: 'pie', original: 'TAP TO WIN FREE GIFTS', replacement: 'B' },
			],
		} as any, false);
		assert.match(prompt, /the original is 10 characters/);
		assert.match(prompt, /the original is 21 characters/);
	});
});
