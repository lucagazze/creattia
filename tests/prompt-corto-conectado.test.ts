import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildPromptCorto } from '../src/lib/creattia/prompt-corto';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

/**
 * El prompt corto existía y no estaba conectado a nada.
 *
 * Se escribió como la mitad B de un experimento —la hipótesis es que 20.000
 * caracteres y treinta secciones CRITICAL se diluyen, y que dos principios bien
 * dichos gobiernan mejor en 7.000— y quedó en el repo sin call site. Ahora se
 * elige por entorno, así que la comparación se puede hacer generando la MISMA
 * referencia con los dos.
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
const analisis = {
	referenceHasProduct: true,
	textZones: [{ where: 'titular', original: 'BACKED UP?', replacement: '¿LISTO PARA LA COPA?' }],
} as any;

describe('los dos prompts conviven', () => {
	test('por defecto se usa el largo, que es el que corre en producción', () => {
		const prompt = buildClonePrompt(base, analisis, false);
		assert.match(prompt, /The first input image is a WINNING AD TEMPLATE/);
	});

	test('el corto dice lo mismo en mucho menos', () => {
		const corto = buildPromptCorto({ ...base, hasLogo: false, analysis: analisis } as any);
		const largo = buildClonePrompt(base, analisis, false);
		assert.ok(corto.length < largo.length / 2, `el corto mide ${corto.length} y el largo ${largo.length}`);
	});

	/** Los dos principios que reemplazan a las treinta secciones. */
	test('el corto conserva los dos principios que gobiernan todo', () => {
		const corto = buildPromptCorto({ ...base, hasLogo: false, analysis: analisis } as any);
		assert.match(corto, /NOTHING THAT IS NOT IN THE WINNING AD/);
		assert.match(corto, /NOTHING FROM THE WINNING AD EXCEPT ITS STRUCTURE/);
	});

	test('el corto sigue reemplazando los textos medidos', () => {
		const corto = buildPromptCorto({ ...base, hasLogo: false, analysis: analisis } as any);
		assert.match(corto, /¿LISTO PARA LA COPA\?/);
	});
});
