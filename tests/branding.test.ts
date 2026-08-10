import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

describe('marcas de terceros y la foto del ganador', () => {
	test('los logos de prensa del ganador nunca se copian', () => {
		/**
		 * Un anuncio de asesoría financiera con la fila "As featured in" —FOX
		 * Business, Bloomberg, WSJ, Forbes, CNBC— se clonó para un proveedor de
		 * cuero y esos logos quedaron tal cual. No es un detalle de diseño: afirma
		 * una cobertura de prensa que ese negocio no tiene.
		 */
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /THIRD-PARTY MARKS ARE NEVER COPIED/);
		assert.match(prompt, /press logos/i);
		assert.match(prompt, /not a design detail/i);
		// El rótulo se va con los logos: sacando sólo los logos quedaba "APARECE EN"
		// anunciando una fila que ya no existe, sobre una banda vacía.
		assert.match(prompt, /INCLUDING the heading that introduces it/);
	});

	test('la foto del ganador no puede sobrevivir con el producto encima', () => {
		// En el mismo caso quedó la pareja de jubilados en la costa y el cuero
		// pegado adelante: se lee como un collage y la escena no tiene sentido.
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /THE TEMPLATE'S PHOTOGRAPH DOES NOT SURVIVE/);
		assert.match(prompt, /Pasting the new product ON TOP/);
	});
});

/**
 * La pantalla que pregunta "¿incluir tu logo?" muestra el archivo que se va a
 * pegar. Esa miniatura solo sirve si es el mismo archivo que baja el servidor:
 * una miniatura equivocada, o un "no tenemos ningún logo" cuando sí lo hay, es
 * peor que no mostrar nada, porque la decisión se toma antes de gastar el
 * crédito y la imagen no se puede rehacer gratis.
 */
describe('la miniatura del logo muestra el archivo que se va a usar', () => {
	const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

	test('"Mi marca" muestra el logo del perfil, que es el que baja la generación', () => {
		// `generate.ts`, el worker de lotes y los videos bajan todos
		// `creative_profiles.logo_path`. El logo de cada fila de marca puede faltar
		// aunque el perfil tenga uno: el que se detecta al analizar el sitio del
		// negocio se guarda únicamente en el perfil.
		assert.match(leer('src/pages/api/creativos/brands.ts'), /profileLogoUrl/);
		for (const ruta of ['src/components/creattia/CreationFlow.tsx', 'src/components/creattia/UrlBatchSection.tsx']) {
			assert.match(leer(ruta), /payload\?\.profileLogoUrl/, `${ruta} muestra un logo distinto del que se va a pegar`);
		}
	});

	test('el lote por URL guarda el logo detectado en el sitio', () => {
		// El servidor ya lo devolvía; sin guardarlo en la revisión la pantalla
		// afirmaba que no había ninguno y el anuncio salía igual con logo.
		assert.match(leer('src/pages/api/creativos/batch-url.ts'), /brandLogoUrl: logoDeLaUrl/);
		assert.match(leer('src/components/creattia/UrlBatchSection.tsx'), /brandLogoUrl: data\.brandLogoUrl/);
	});
});

describe('texto sobre una curva', () => {
	test('el arco no crece: se acorta el texto', () => {
		/**
		 * El ganador tenía "NEW IN" —seis caracteres— en un arco corto metido en la
		 * esquina. El reemplazo salió con "CREA CON INTELIGENCIA ARTIFICIAL", cinco
		 * veces más largo: el arco se estiró hasta el centro del lienzo y dejó de
		 * ser un sello de esquina para competir con el titular. Con un texto más
		 * largo todavía, se habría ido de la imagen.
		 */
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /CURVED TEXT KEEPS ITS CURVE/);
		assert.match(prompt, /may NOT exceed the original's character count/);
		assert.match(prompt, /leave the corner empty/i);
	});

	test('el arco observado viaja al render con su tope de caracteres', () => {
		const analisis = {
			textZones: [{
				where: 'esquina superior izquierda',
				original: 'NEW IN',
				replacement: 'RECIÉN',
				onCurve: 'arco que abraza la esquina superior izquierda, cubre un cuarto de giro, sentido horario',
			}],
		} as any;
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, analisis, false);
		assert.match(prompt, /THIS TEXT SITS ON A CURVE/);
		assert.match(prompt, /cubre un cuarto de giro/);
		// El tope sale del largo del original, no de un número inventado.
		assert.match(prompt, /no more than 6 characters/);
	});

	test('una zona recta no arrastra la regla del arco', () => {
		const analisis = { textZones: [{ where: 'titular', original: 'HOLA', replacement: 'CHAU' }] } as any;
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, analisis, false);
		assert.doesNotMatch(prompt, /THIS TEXT SITS ON A CURVE/);
	});
});
