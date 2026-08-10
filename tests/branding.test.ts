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

describe('con qué se firma el anuncio', () => {
	test('si el ganador firma en algún lado, ahí va el nombre de la marca', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'texto' }, { templateHasLogoSlot: true } as any, false);
		assert.match(prompt, /WRITE "Tostado"/);
		assert.match(prompt, /the same relative size, weight, case, letter-spacing, colour and alignment/i);
		// Sigue prohibido dibujar un emblema donde va una línea de tipografía.
		assert.match(prompt, /do NOT add a shield, seal, badge/i);
	});

	test('si el ganador NO firma, el clon tampoco', () => {
		/**
		 * Decía que "un aviso sin marca parece inacabado, así que el nombre tiene
		 * que estar", sin mirar si el ganador tenía algo ahí. Resultado: aparecía el
		 * nombre del negocio arriba de todo en anuncios cuya referencia tenía ese
		 * espacio vacío. Un elemento de más también rompe el parecido.
		 */
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'nada' }, { templateHasLogoSlot: false } as any, false);
		assert.match(prompt, /Do not add a logo, wordmark, domain, watermark or brand badge/i);
		assert.doesNotMatch(prompt, /WRITE "Tostado"/);
	});

	/**
	 * El default es escribir el nombre, no pegar el archivo.
	 *
	 * Antes la decisión era un sí/no cuyo único "sí" era pegar el archivo del
	 * logo, así que el caso más común —el ganador firma con su nombre escrito y
	 * el clon hace lo mismo con el del negocio— solo salía por casualidad,
	 * cuando el analizador había marcado la marca del ganador como wordmark.
	 */
	test('escribir el nombre no adjunta ni dibuja ningún archivo', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'texto' }, { templateHasLogoSlot: true, logoIsWordmark: false } as any, true);
		assert.match(prompt, /WRITE "Tostado"/);
		assert.doesNotMatch(prompt, /place the provided brand logo/i);
		// Con un emblema de por medio hay que decir de qué tamaño va el nombre.
		assert.match(prompt, /occupy the footprint its symbol occupied/i);
	});

	test('sacar la firma no deja un nombre inventado tapando el hueco', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'nada' }, { templateHasLogoSlot: true } as any, true);
		assert.match(prompt, /Remove it cleanly/i);
		assert.match(prompt, /Do not invent a replacement name, icon or badge/i);
		assert.doesNotMatch(prompt, /WRITE "Tostado"/);
	});

	/**
	 * Las generaciones anteriores a este campo guardaron un sí/no. Rehacerlas
	 * desde el historial tiene que dar lo mismo que daban entonces, y entonces
	 * ese "sí" era pegar el archivo.
	 */
	test('sin modo elegido se deduce lo que hacían las generaciones viejas', () => {
		const conArchivo = buildClonePrompt({ ...base, brandName: 'Tostado' }, { templateHasLogoSlot: true } as any, true);
		assert.match(conArchivo, /Replace it with the supplied selected-identity logo/i);
		const sinArchivo = buildClonePrompt({ ...base, brandName: 'Tostado' }, { templateHasLogoSlot: true, logoIsWordmark: true } as any, false);
		assert.match(sinArchivo, /WRITE "Tostado"/);
	});

	/**
	 * El sí/no viejo en `false` NO quería decir "sin firma".
	 *
	 * Con un ganador que firma escribiendo su nombre, esas generaciones escribían
	 * el nombre del negocio. Al traducir el sí/no a un modo en el endpoint —donde
	 * todavía no se leyó el ganador— salía 'nada', y rehacer desde el historial
	 * un aviso que tenía su firma lo devolvía sin ella. La deducción tiene que
	 * quedar acá, que es donde el análisis está delante.
	 */
	test('rehacer sin modo no le saca la firma a un ganador que firma escribiendo', () => {
		const prompt = buildClonePrompt(
			{ ...base, brandName: 'Tostado', logoMode: undefined },
			{ templateHasLogoSlot: true, logoIsWordmark: true } as any,
			false,
		);
		assert.match(prompt, /WRITE "Tostado"/);
		assert.doesNotMatch(prompt, /Remove it cleanly/i);
	});

	test('nunca se inventa una dirección web ni un sello', () => {
		// Apareció "theskirtingfactoryllc.com" abajo a la derecha de un anuncio cuya
		// referencia no tenía ninguna URL.
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado' }, null, false);
		assert.match(prompt, /NOTHING THAT IS NOT IN THE TEMPLATE/);
		assert.match(prompt, /not instructions to print them/i);
	});

	test('sin nombre de marca, no se inventa ninguno', () => {
		const prompt = buildClonePrompt({ ...base, brandName: '', logoMode: 'texto' }, { templateHasLogoSlot: true } as any, false);
		assert.match(prompt, /no brand name was supplied: leave the space clean/i);
		assert.doesNotMatch(prompt, /WRITE "/);
	});

	test('con logo elegido, se usa la imagen y no el texto', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'imagen' }, { templateHasLogoSlot: true } as any, true);
		assert.match(prompt, /Replace it with the supplied selected-identity logo/i);
		assert.doesNotMatch(prompt, /WRITE "Tostado"/);
	});

	/**
	 * La decisión estaba escrita DOS veces —acá y dentro del paso "BRAND SWAP"—
	 * y las dos versiones ya no decían lo mismo: la de BRAND SWAP se guiaba por
	 * si había archivo adjunto en vez de por lo que el usuario había elegido, de
	 * modo que pidiendo "escribir el nombre" igual mandaba pegar el logo.
	 */
	test('la decisión está escrita una sola vez en todo el prompt', () => {
		const prompt = buildClonePrompt({ ...base, brandName: 'Tostado', logoMode: 'texto' }, { templateHasLogoSlot: true } as any, true);
		assert.equal(prompt.match(/LOGO DECISION \(CRITICAL\)/g)?.length, 1);
		assert.doesNotMatch(prompt, /The user explicitly selected INCLUDE LOGO/);
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
	/**
	 * Quién afirma la cobertura es lo que separa mostrarla de inventarla.
	 *
	 * La fila del ganador nunca se copia: sus medios son de otra empresa y
	 * dejarlos afirma una cobertura que este negocio no tiene. Pero el negocio
	 * que SÍ salió en un medio tiene derecho a mostrarlo, con el logo incluido,
	 * y eso antes no se podía pedir: 'logos' existía en el tipo y se comportaba
	 * como "sacar el bloque", así que la opción no hacía nada.
	 */
	test('con logos declarados se dibujan esos y solo esos', () => {
		const prompt = buildClonePrompt(
			{ ...base, brandName: 'Tostado', pressRowMode: 'logos', pressRowItems: ['La Nación', 'Infobae'] },
			{ pressRow: { detected: true, heading: 'As seen on', outlets: ['Forbes', 'NBC News'] } } as any,
			false,
		);
		assert.match(prompt, /draw the actual mark of each of these — La Nación, Infobae/);
		// Los del ganador siguen sin poder aparecer, en cualquier modo.
		assert.match(prompt, /nothing carried over from the winner's row/i);
		assert.doesNotMatch(prompt, /Forbes/);
	});

	/**
	 * Sin nombres declarados no hay fila. Es la regla que impide que la app
	 * rellene sola: era exactamente el bug original —el analizador listaba
	 * "Forbes" y "NBC News" como textos reemplazables y la fila volvía llena de
	 * lo primero que el modelo encontraba, en un caso con marcas del producto.
	 */
	test('elegir logos sin declarar ninguno no dibuja una fila', () => {
		const prompt = buildClonePrompt(
			{ ...base, brandName: 'Tostado', pressRowMode: 'logos', pressRowItems: [] },
			{ pressRow: { detected: true, heading: 'As seen on', outlets: ['Forbes'] } } as any,
			false,
		);
		assert.match(prompt, /Remove the whole area, including the heading/i);
		assert.match(prompt, /Do not replace it with invented logos, invented outlet names/i);
	});

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


/**
 * El titular salía clavado y el texto de la tarjeta salía más grande y más
 * separado. No era azar: el analizador medía la altura de mayúscula DEL TITULAR
 * y de ningún otro bloque, así que el titular tenía un número que respetar y el
 * resto quedaba librado a cómo compone el modelo por defecto — que es cómodo de
 * leer, o sea más grande y con más interlineado que un aviso editorial.
 *
 * La corrección no es otra regla pidiendo "mismo tamaño": eso ya lo decía TEXT
 * FIT y perdía, porque una instrucción sin número no tiene con qué ganar.
 */
describe('el texto chico se mide, no se estima', () => {
	const conGeometria = (geometria: string) => buildClonePrompt(
		{ productNames: ['Silla'], productFacts: [], brief: '', brandName: 'BKF', colorMode: 'winner' as const, typoMode: 'winner' as const, subjectMode: 'product' as const },
		{ referenceHasProduct: true, compositionGeometry: geometria } as any,
		false,
	);

	const conZonas = (zonas: any[]) => buildClonePrompt(
		{ productNames: ['Silla'], productFacts: [], brief: '', brandName: 'BKF', colorMode: 'winner' as const, typoMode: 'winner' as const, subjectMode: 'product' as const },
		{ referenceHasProduct: true, textZones: zonas } as any,
		false,
	);

	/**
	 * Un aviso tiene más de dos tamaños de texto. La tarjeta blanca del ejemplo
	 * tiene tres —título, copia y descargo— y la copia del medio quedaba sin
	 * medir: no es el titular ni es el texto más chico, que eran los dos únicos
	 * bloques con un número. Salía más grande y más separada que en el ganador.
	 */
	test('cada bloque lleva su propia medida al render', () => {
		const prompt = conZonas([
			{ where: 'titular', original: 'COMODIDAD SIN IGUAL?', replacement: 'A', setIn: '13% of width, black, all caps, lines at 1.0x' },
			{ where: 'copia de la tarjeta', original: 'La forma más fácil', replacement: 'B', setIn: '3.1% of width, bold, sentence case, lines at 1.15x' },
			{ where: 'descargo al pie', original: 'hecha con cuero', replacement: 'C', setIn: '1.4% of width, regular, sentence case, lines at 1.3x' },
		]);
		for (const medida of ['13% of width, black, all caps', '3.1% of width, bold, sentence case', '1.4% of width, regular']) {
			assert.ok(prompt.includes(medida), `falta la medida: ${medida}`);
		}
		// La regla que obliga a respetarlas va UNA vez, no pegada a cada zona:
		// ocho copias de la misma frase son medio kilo de prompt contra el techo.
		assert.match(prompt, /that measurement IS the block/);
		assert.equal(prompt.match(/never bigger, never looser, never re-aligned/g)?.length, 1);
	});

	test('una zona sin medir no inventa un número', () => {
		const prompt = conZonas([{ where: 'titular', original: 'HOLA', replacement: 'A' }]);
		assert.doesNotMatch(prompt, /set it EXACTLY as measured on the template/);
		// El encaje por caracteres sigue viajando igual.
		assert.match(prompt, /the original is 4 characters/);
	});

	/**
	 * La medida vivía también dentro de compositionGeometry. Dos lugares
	 * diciendo lo mismo es exactamente como empiezan a decir distinto — ya pasó
	 * con la decisión del logo, que se guiaba por el archivo adjunto en un lado
	 * y por lo elegido en el otro.
	 */
	test('la medida del texto chico no quedó escrita dos veces', () => {
		const prompt = conGeometria('headline cap-height 14% of width');
		assert.doesNotMatch(prompt, /cap-height of the SMALLEST body text/i);
	});

	test('el bloqueo de geometría alcanza a los bloques chicos y al interlineado', () => {
		const prompt = conGeometria('headline cap-height 14% of width');
		assert.match(prompt, /every smaller text block keeps ITS measured cap-height and ITS measured line spacing/);
		// Lo que efectivamente pasó: la tarjeta salió más grande y más separada.
		assert.match(prompt, /opening the leading toward a comfortable reading size/i);
	});

	/**
	 * El campo se corta antes de entrar al prompt. Con dos medidas entraba en 700
	 * caracteres; ahora son cuatro y la última —justo la del texto chico, que va
	 * al final— se perdía por el recorte.
	 */
	test('el bloqueo de geometría sigue midiendo lo del lienzo', () => {
		const prompt = conGeometria('headline cap-height 14% of width, outer margin 6%');
		assert.match(prompt, /headline cap-height 14% of width, outer margin 6%/);
	});
});

/**
 * Una url titulada "hoddie" hizo que el modelo le dibujara capucha a un buzo
 * que no tiene. Solo pasa con productos mal titulados —con cualquier otro el
 * nombre y las fotos coinciden y no hay nada que resolver— y por eso costaba
 * verlo: el mismo flujo funciona perfecto con el producto de al lado.
 *
 * La regla ya decía "nunca agregues un componente que falta". Lo que faltaba
 * era decir QUIÉN GANA cuando el nombre y las fotos dicen cosas distintas, y
 * entre un título que viaja ocho veces por el prompt y una foto, gana el
 * título. Es el mismo patrón de siempre: dos fuentes, ninguna con prioridad.
 */
describe('las fotos del producto le ganan a su nombre', () => {
	const prompt = buildClonePrompt(
		{ productNames: ['Hoddie U.S. Polo Assn talle M'], productFacts: [], brief: '', brandName: 'California Garage', colorMode: 'winner' as const, typoMode: 'winner' as const, subjectMode: 'product' as const },
		{ referenceHasProduct: true } as any,
		false,
	);

	test('el nombre no describe la construcción', () => {
		assert.match(prompt, /THE NAME IS A LABEL, NOT A SPECIFICATION/);
		assert.match(prompt, /called a hoodie but no hood in the photos means no hood/);
	});

	test('no se le agrega una pieza porque el nombre la sugiera', () => {
		assert.match(prompt, /Never add a hood, zip, collar, pocket or strap because the name, the category or the template's garment implies one/);
		assert.match(prompt, /only the photos say what this thing physically is/);
	});

	/** El nombre sigue viajando: sirve para el copy, no para dibujar la prenda. */
	test('el nombre del producto se sigue usando', () => {
		assert.match(prompt, /Hoddie U\.S\. Polo Assn talle M/);
	});
});

/**
 * El titular del ganador estaba centrado sobre el eje y el clon lo puso pegado
 * a la izquierda. Investigado contra el anuncio de sticky.io generando de
 * verdad: el analizador MIDE bien —dice "centrado" en la posición y otra vez en
 * la medida del bloque— pero ese dato caía al 53% de un prompt de 22.000
 * caracteres, que es donde menos se atiende, y encima volvía en castellano
 * dentro de un prompt en inglés.
 *
 * Faltaba la regla que lo ordena, que vive más tarde y entre las CRITICAL. La
 * había sacado al empezar a medir cada bloque, creyendo que la medida la
 * reemplazaba: la medida dice cómo se alinea el texto ADENTRO de su bloque, no
 * dónde cae ese bloque en el lienzo. Con la regla puesta, seis de seis
 * generaciones salieron centradas.
 */
describe('el ancla horizontal de cada bloque', () => {
	const prompt = buildClonePrompt(
		{ productNames: ['Creattia'], productFacts: [], brief: '', brandName: 'Creattia', colorMode: 'winner' as const, typoMode: 'winner' as const, subjectMode: 'saas' as const },
		{ referenceHasProduct: false } as any,
		false,
	);

	test('centrado sigue centrado aunque cambie el largo del texto', () => {
		assert.match(prompt, /a block centred on the canvas axis stays centred there/);
		assert.match(prompt, /even when the new text is shorter or longer than the original/);
	});

	test('pegado a un borde sigue pegado a ese borde', () => {
		assert.match(prompt, /one flush to an edge stays flush to that edge/);
	});
});

/**
 * Las mediciones que lee el renderizador van en inglés.
 *
 * La regla de idioma decía "cada replacement en el idioma elegido" y el modelo
 * la estiró a todo: "where" y "setIn" volvían en castellano y se incrustaban
 * dentro de un prompt en inglés, donde "centrado" pesa menos que "centred"
 * rodeado de reglas en inglés. Lo que lee una persona va en su idioma; lo que
 * lee el renderizador, no.
 */
describe('en qué idioma vuelve cada cosa del análisis', () => {
	test('el idioma elegido manda solo sobre lo que se ve en el aviso', () => {
		const fuente = readFileSync(new URL('../src/lib/creattia/ad-analysis.ts', import.meta.url), 'utf8');
		assert.match(fuente, /This applies ONLY to what a reader will see in the finished ad/);
		assert.match(fuente, /"where", "setIn", "compositionGeometry"[^]{0,120}stay in ENGLISH always/);
	});
});
