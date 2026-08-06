import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

/**
 * El idioma que elige el usuario tiene que ganarle SIEMPRE al del anuncio
 * ganador. Era el bug reportado: se pedía inglés y salía en español porque el
 * análisis devuelve el idioma que leyó en la referencia y ese pisaba la
 * elección.
 */

const base = {
	productNames: ['Café de especialidad'],
	productFacts: ['Tueste medio'],
	brandName: 'Marca',
	brief: '',
	subjectMode: 'product' as const,
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
};

/** El análisis de un ganador escrito en español. */
const spanishAnalysis = { language: 'es', referenceHasProduct: true, adCopy: { headline: 'Titular', description: 'Bajada', cta: 'Comprar' } } as any;

describe('idioma del creativo', () => {
	test('si el usuario pide inglés, el prompt exige inglés aunque el ganador esté en español', () => {
		const prompt = buildClonePrompt({ ...base, language: 'en' }, spanishAnalysis, false);
		assert.match(prompt, /must be in natural American English/i);
		assert.doesNotMatch(prompt, /must be in natural Argentine Spanish/i);
	});

	test('sin elección del usuario, se respeta el idioma que detectó el ganador', () => {
		const prompt = buildClonePrompt({ ...base }, spanishAnalysis, false);
		assert.match(prompt, /must be in natural Argentine Spanish/i);
	});

	test('el idioma elegido gana en todos los idiomas soportados', () => {
		const esperado: Record<string, RegExp> = {
			en: /American English/i, pt: /Brazilian Portuguese/i, it: /natural Italian/i,
			fr: /natural French/i, de: /natural German/i, es: /Argentine Spanish/i,
		};
		for (const [code, patron] of Object.entries(esperado)) {
			const prompt = buildClonePrompt({ ...base, language: code }, spanishAnalysis, false);
			assert.match(prompt, patron, `el idioma ${code} no llegó al prompt`);
		}
	});

	test('un código de idioma inventado no rompe: cae en español', () => {
		const prompt = buildClonePrompt({ ...base, language: 'xx' }, null, false);
		assert.match(prompt, /must be in natural Argentine Spanish/i);
	});
});
