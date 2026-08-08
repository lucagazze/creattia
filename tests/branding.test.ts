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
	test('si el ganador firma en algún lado, ahí va el nombre de la marca', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, { templateHasLogoSlot: true } as any, false);
		assert.match(prompt, /WRITE the brand name "Tostado"/);
		assert.match(prompt, /where the template placed its brand mark/i);
		// Sigue prohibido dibujar un emblema.
		assert.match(prompt, /Do NOT draw a logo, emblem, monogram/i);
	});

	test('si el ganador NO firma, el clon tampoco', () => {
		/**
		 * Decía que "un aviso sin marca parece inacabado, así que el nombre tiene
		 * que estar", sin mirar si el ganador tenía algo ahí. Resultado: aparecía el
		 * nombre del negocio arriba de todo en anuncios cuya referencia tenía ese
		 * espacio vacío. Un elemento de más también rompe el parecido.
		 */
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, { templateHasLogoSlot: false } as any, false);
		assert.match(prompt, /THE TEMPLATE DOES NOT SIGN ITSELF ANYWHERE/);
		assert.doesNotMatch(prompt, /WRITE the brand name "Tostado"/);
	});

	test('nunca se inventa una dirección web ni un sello', () => {
		// Apareció "theskirtingfactoryllc.com" abajo a la derecha de un anuncio cuya
		// referencia no tenía ninguna URL.
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /NOTHING THAT IS NOT IN THE TEMPLATE/);
		assert.match(prompt, /not instructions to print them/i);
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
