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

describe('los tres prompts conviven', () => {
	/**
	 * El default es el LIBRE desde que se lo probó contra siete referencias reales
	 * y salió mejor en las siete. Si esto falla, alguien cambió el camino que
	 * corre en producción sin querer.
	 */
	test('por defecto se usa el libre, que es el que corre en producción', () => {
		delete process.env.RENDER_PROMPT;
		const prompt = buildClonePrompt(base, analisis, false);
		assert.match(prompt, /Make EXACTLY THIS AD, for a different product/);
	});

	test('el detallado se sigue pudiendo elegir por entorno', () => {
		process.env.RENDER_PROMPT = 'detallado';
		const prompt = buildClonePrompt(base, analisis, false);
		assert.match(prompt, /The first input image is a WINNING AD TEMPLATE/);
		delete process.env.RENDER_PROMPT;
	});

	/**
	 * El libre crece SOLO por la lista de textos, y con tope.
	 *
	 * Antes no crecía nada: el análisis se descartaba entero. Ahora se le pasa la
	 * lista "esto decía → esto va a decir", que es lo que impide que el texto del
	 * ganador sobreviva. Es lo único variable del prompt, así que lo que se
	 * verifica es que un ganador cargadísimo de texto no lo devuelva al problema
	 * que lo tumbaba: los 32.000 caracteres de OpenAI.
	 */
	test('el libre solo crece por la lista de textos, y con tope', () => {
		delete process.env.RENDER_PROMPT;
		const flaco = buildClonePrompt(base, analisis, false);
		const cargado = buildClonePrompt(base, {
			...analisis,
			textZones: Array.from({ length: 60 }, (_, i) => ({
				where: `zona ${i}`, original: `original ${i} `.repeat(40), replacement: `nuevo ${i} `.repeat(40),
			})),
		} as any, false);
		assert.ok(cargado.length > flaco.length, 'la lista tiene que llegar al prompt');
		assert.ok(cargado.length < 20_000, `con 60 zonas gigantes mide ${cargado.length}, y el techo de OpenAI es 32.000`);
	});

	test('el corto dice lo mismo en mucho menos', () => {
		process.env.RENDER_PROMPT = 'detallado';
		const corto = buildPromptCorto({ ...base, hasLogo: false, analysis: analisis } as any);
		const largo = buildClonePrompt(base, analisis, false);
		delete process.env.RENDER_PROMPT;
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
