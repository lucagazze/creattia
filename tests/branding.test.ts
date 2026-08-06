import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline';

/**
 * Un anuncio sin ninguna marca a la vista se ve inconcluso. Elegir "sin logo"
 * significa no dibujar un emblema, no que el aviso quede anónimo: si hay nombre
 * de marca, va escrito donde el ganador tenía su marca.
 */

const base = {
	productNames: ['Café'],
	productFacts: [],
	brief: '',
	subjectMode: 'product' as const,
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
};

describe('marca cuando se elige sin logo', () => {
	test('con nombre de marca, se escribe donde iba el logo', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /WRITE the brand name "Tostado"/);
		assert.match(prompt, /where the template placed its brand mark/i);
		// Sigue prohibido dibujar un emblema.
		assert.match(prompt, /Do NOT draw a logo, emblem, monogram/i);
	});

	test('sin nombre de marca, no se inventa ninguno', () => {
		const prompt = buildClonePrompt({ ...base, brandName: '' }, null, false);
		assert.match(prompt, /do not invent a brand name/i);
		assert.doesNotMatch(prompt, /WRITE the brand name/);
	});

	test('con logo elegido, se usa la imagen y no el texto', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, true);
		assert.match(prompt, /INCLUDE LOGO/);
		assert.doesNotMatch(prompt, /WRITE the brand name "Tostado"/);
	});

	test('elegir sin logo nunca borra la marca impresa en el packaging real', () => {
		// La regla vive en la rama "sin logo", que es donde podía malinterpretarse
		// como "sacá toda marca de la imagen", incluida la del envase real.
		for (const marca of ['Tostado', '']) {
			const prompt = buildClonePrompt({ ...base, brandName: marca }, null, false);
			assert.match(prompt, /physically printed on the supplied product packaging/i);
		}
	});
});
