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
		assert.match(prompt, /not merely a design detail/i);
		// El rótulo se va con los logos: sacando sólo los logos quedaba "APARECE EN"
		// anunciando una fila que ya no existe, sobre una banda vacía.
		assert.match(prompt, /including the heading that introduces it/);
	});

	/**
	 * La fila de medios se decide, no se borra a ciegas.
	 *
	 * Copiar "As seen on Forbes" cuando el negocio no salio en Forbes es una
	 * afirmacion falsa sobre otra empresa, y eso no cambia porque sea comun. Pero
	 * borrarla siempre dejaba afuera al negocio que SI tiene prensa propia, que es
	 * perfectamente legitimo. Ahora se pregunta, y el default es sacarla.
	 */
	test('por defecto la fila se saca entera, con su rotulo', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /Remove the whole area, including the heading that introduces it/);
		assert.doesNotMatch(prompt, /The advertiser confirmed they have this coverage/);
	});

	test('con prensa propia confirmada, van los nombres del anunciante', () => {
		const prompt = buildClonePrompt(
			{ ...base, brandName: 'Tostado', pressRowMode: 'texto', pressRowItems: ['La Nación', 'Infobae'] } as any,
			null,
			false,
		);
		assert.match(prompt, /The advertiser confirmed they have this coverage/);
		assert.match(prompt, /La Nación, Infobae/);
		// Nombres escritos, nunca los logos del ganador ni sellos inventados.
		assert.match(prompt, /No logos, no seals, no invented extras/);
	});

	test('la prohibicion de copiar marcas ajenas nunca se levanta', () => {
		// Ni siquiera eligiendo poner prensa propia: lo que se agrega son los
		// nombres del anunciante, no los medios que mostraba el ganador.
		for (const modo of [undefined, 'quitar', 'texto']) {
			const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', pressRowMode: modo, pressRowItems: ['Clarín'] } as any, null, false);
			assert.match(prompt, /THIRD-PARTY MARKS ARE NEVER COPIED/, String(modo));
			assert.match(prompt, /NONE of them may appear in the output/, String(modo));
		}
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

