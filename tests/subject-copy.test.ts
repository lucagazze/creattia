import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { alcanceDesde, buildClonePrompt, SUBJECT_MODES, subjectModeDesde, usesRealProductPhotos } from '../src/lib/creattia/generation-pipeline';

/**
 * De qué habla el anuncio tiene que gobernar los TEXTOS, no solo la imagen.
 *
 * El síntoma reportado: se detectaba la tienda, y el aviso salía hablando de un
 * solo artículo. La causa no estaba en el prompt sino en las listas de valores
 * válidos escritas a mano en cada endpoint: 'catalog' no figuraba en ninguna, no
 * matcheaba, y caía en el valor por defecto 'product' sin que nada fallara.
 */

const base = {
	productNames: ['Cinturón de cuero', 'Bolso mediano'],
	productFacts: [],
	brief: '',
	brandName: 'The Skirting Factory',
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
};

describe('dos opciones para la persona, cuatro modos por dentro', () => {
	test('el alcance más las fotos definen el modo', () => {
		// La persona elige una sola cosa: si el anuncio habla de todo o de algo
		// puntual. Que eso se pueda fotografiar o no lo deduce el sistema, porque
		// preguntarlo era pedirle al usuario que resolviera un detalle técnico.
		assert.equal(subjectModeDesde('general', true), 'catalog');
		assert.equal(subjectModeDesde('general', false), 'brand');
		assert.equal(subjectModeDesde('especifico', true), 'product');
		assert.equal(subjectModeDesde('especifico', false), 'service');
	});

	test('el modo interno vuelve al alcance que le corresponde', () => {
		assert.equal(alcanceDesde('catalog'), 'general');
		assert.equal(alcanceDesde('brand'), 'general');
		assert.equal(alcanceDesde('product'), 'especifico');
		assert.equal(alcanceDesde('service'), 'especifico');
		// Sin dato, lo más seguro es asumir algo puntual: es lo que hacía antes.
		assert.equal(alcanceDesde(null), 'especifico');
	});
});

describe('el sujeto es único y compartido', () => {
	test('catalog es un sujeto válido', () => {
		// La regresión concreta: si esto sale de la lista, el catálogo vuelve a
		// caer en 'product' en silencio.
		assert.ok(SUBJECT_MODES.includes('catalog'));
		for (const mode of ['product', 'service', 'saas', 'brand', 'catalog'] as const) {
			assert.ok(SUBJECT_MODES.includes(mode), mode);
		}
	});

	test('la tienda usa fotos reales igual que una ficha', () => {
		// Sin esto el catálogo se trataba como una marca abstracta y se generaba
		// sin ninguna foto de producto.
		assert.equal(usesRealProductPhotos('catalog'), true);
		assert.equal(usesRealProductPhotos('product'), true);
		assert.equal(usesRealProductPhotos('service'), false);
		assert.equal(usesRealProductPhotos('brand'), false);
	});
});

describe('los textos siguen al sujeto', () => {
	test('con la tienda, el texto habla del negocio y no de un artículo', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog' }, null, false);
		assert.match(prompt, /SUBJECT IS THE STORE, NOT ONE ITEM/);
		// Lo importante: las instrucciones de texto no apuntan a la lista de
		// nombres, porque eso empuja a hablar de artículos sueltos.
		assert.match(prompt, /the store The Skirting Factory as a whole/);
		assert.doesNotMatch(prompt, /adapt its message honestly to Cinturón de cuero \+ Bolso mediano/);
	});

	test('con un producto, el texto se centra en ese producto', () => {
		const prompt = buildClonePrompt({ ...base, productNames: ['Cinturón de cuero'], subjectMode: 'product' }, null, false);
		assert.match(prompt, /Cinturón de cuero/);
		assert.doesNotMatch(prompt, /SUBJECT IS THE STORE/);
	});

	test('un servicio no inventa un objeto físico', () => {
		const prompt = buildClonePrompt({ ...base, productNames: [], subjectMode: 'service' }, null, false);
		assert.match(prompt, /service or SaaS offer/);
		assert.doesNotMatch(prompt, /SUBJECT IS THE STORE/);
	});
});

/**
 * Lo que hace ganar al anuncio tiene que llegar al render.
 *
 * El analizador devolvía `adType`, `styleFamily` y `scoreReasons` —"por qué este
 * creativo funciona": contraste, jerarquía, CTA, legibilidad— y nada de eso
 * entraba al prompt. Se pagaba el análisis y se descartaba justamente la parte
 * que explica la fuerza del anuncio, que es lo único que hay que conservar al
 * clonarlo.
 */
describe('la fuerza del ganador llega al render', () => {
	const analisis: any = {
		creative: {
			adType: 'testimonial con reseña destacada',
			styleFamily: 'Skincare',
			photographyStyle: 'packshot de estudio',
			lighting: 'suave difusa',
			composition: 'división 50/50',
			scoreReasons: ['contraste alto entre fondo y titular', 'CTA con color de acción', 'jerarquía clara'],
		},
	};

	test('el tipo de anuncio se conserva explícitamente', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /testimonial con reseña destacada/);
		// Y se dice qué NO puede pasar, que es lo que se rompe al clonar.
		assert.match(prompt, /do not turn a testimonial into a plain product shot/i);
	});

	test('la familia estética viaja', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /Skincare/);
	});

	test('las razones por las que gana se listan como obligatorias', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /WHY THIS AD PERFORMS/);
		assert.match(prompt, /contraste alto entre fondo y titular/);
		assert.match(prompt, /CTA con color de acción/);
	});

	test('sin datos creativos no se inventa el bloque', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, { creative: {} } as any, false);
		assert.doesNotMatch(prompt, /WHY THIS AD PERFORMS/);
	});
});

/**
 * El prompt del render no puede crecer sin control.
 *
 * Cada regla nueva se suma a un texto que ya ronda los 13.000 caracteres. Los
 * modelos de imagen diluyen las instrucciones cuando el prompt es muy largo: la
 * regla número treinta compite con la primera. Esto no dice cuál es el tamaño
 * ideal —eso solo se sabe generando y mirando— pero avisa si alguien duplica el
 * prompt sin darse cuenta.
 */
describe('tamaño del prompt de render', () => {
	test('se mantiene dentro de lo razonable', () => {
		const analisis: any = {
			referenceHasProduct: true,
			productHasPackaging: true,
			templateHasLogoSlot: true,
			messageStrategy: 'Dispara deseo mostrando el resultado antes que el producto.',
			creative: {
				adType: 'testimonial', styleFamily: 'Skincare', photographyStyle: 'packshot',
				lighting: 'suave difusa', depth: 'fondo desenfocado', composition: '50/50',
				colorPsychology: 'rosa de cuidado', emotion: 'deseo', designPattern: 'producto derecha, reseña izquierda',
				scoreReasons: ['contraste alto', 'CTA visible', 'jerarquía clara'],
			},
			textZones: Array.from({ length: 6 }, (_, i) => ({ where: `zona ${i}`, original: `O${i}`, replacement: `N${i}` })),
		};
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, true);
		assert.ok(prompt.length < 20000, `el prompt creció a ${prompt.length} caracteres`);
	});

	test('no le pide al modelo una resolución que no va a producir', () => {
		// Pedía "exportación 4K" mientras el motor renderiza a 1536: una
		// instrucción que no se puede cumplir y solo agrega ruido.
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, { referenceHasProduct: true } as any, false);
		assert.doesNotMatch(prompt, /4K/);
	});
});

/**
 * Que el texto entre donde va, y que la letra sea la del ganador.
 *
 * Comparando un clon contra su original se veían dos diferencias que no eran de
 * maqueta: la tipografía no coincidía, y varios textos pasaban a dos líneas donde
 * el original usaba una, lo que corría todo hacia abajo y rompía el ritmo de la
 * columna. La maqueta estaba bien reproducida y el anuncio se veía mal igual.
 *
 * Las dos causas eran de instrucción. `styleNotes` —que describe la sensación
 * tipográfica del ganador— se extraía y no se usaba, así que "copiá la tipografía
 * del template" era una orden sin contenido. Y del largo solo se pedía que fuera
 * "similar", sin decir contra qué.
 */
describe('encaje del texto y tipografía', () => {
	const analisis: any = {
		referenceHasProduct: true,
		styleNotes: 'Grotesca condensada pesada en los títulos, itálica liviana en las aclaraciones',
		textZones: [{ where: 'lista izquierda', original: 'Glycerin – helps in deep hydration', replacement: 'Glicerina – hidratación profunda' }],
	};

	test('se le dice el largo exacto del original', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		// 34 caracteres: el dato que permite decidir si hay que acortar.
		assert.match(prompt, /the original is 34 characters/);
	});

	/**
	 * Las líneas se cuentan mirando el ganador, no el texto.
	 *
	 * Se deducían de los saltos de línea de `original`, que el análisis nunca
	 * devuelve: todo daba 1. Comparando un clon contra su original se vio el daño
	 * — un titular partido en tres líneas recibía la orden de ocupar una sola, y
	 * salía en dos. El prompt rompía justo lo que quería copiar.
	 */
	test('pide las líneas que el análisis contó en la imagen', () => {
		const conLineas = { ...analisis, textZones: [{ ...analisis.textZones[0], lines: 3 }] };
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, conLineas, false);
		assert.match(prompt, /EXACTLY 3 lines/);
	});

	test('sin ese dato no inventa un número de líneas', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.doesNotMatch(prompt, /EXACTLY \d+ lines?/);
	});

	test('prohíbe reflujo y pide acortar', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /TEXT FIT \(CRITICAL\)/);
		assert.match(prompt, /SHORTEN it/);
		assert.match(prompt, /do not shrink the type/i);
	});

	test('la regla tipográfica es explícita', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /do not substitute a generic sans-serif/i);
	});

	/**
	 * `styleNotes` describe fondo, paleta y recursos gráficos, no la letra. Se lo
	 * pegaba bajo "TYPOGRAPHY" como sustituto de una descripción tipográfica real,
	 * y con eso se colaba la ESCENA del ganador en el render: de ahí salió un
	 * cuero flotando sobre agua, que era el fondo del anuncio de colágeno.
	 */
	test('la descripción del fondo no se cuela en la regla de tipografía', () => {
		const conFondo = { ...analisis, styleNotes: 'fondo acuático turquesa para dar frescura' };
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, conFondo, false);
		assert.doesNotMatch(prompt, /fondo acuático/);
	});

	test('con tipografía de marca elegida, manda esa', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product', typoMode: 'brand', brandTypography: { headings: 'Poppins' } } as any, analisis, false);
		assert.match(prompt, /Poppins/);
	});
});

/**
 * La caja del texto original es parte del diseño.
 *
 * Se comprobó generando el mismo anuncio con el prompt anterior y con el nuevo:
 * el ganador tenía el subtítulo en MAYÚSCULAS y la versión nueva lo devolvió en
 * minúsculas, más liviano y en dos líneas en vez de tres. El texto era correcto
 * y la jerarquía del anuncio se desarmó igual. La regla de acortar empujaba en
 * esa dirección sin que nada compensara.
 */
describe('caja del texto', () => {
	test('un original en mayúsculas se pide en mayúsculas', () => {
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [{ where: 'subtítulo', original: 'THE ALWAYS PAN 2.0 HAS A NEW TOXIN-FREE NONSTICK', replacement: 'Creattia usa IA para generar anuncios' }],
		};
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /RENDER IT IN ALL CAPS/);
	});

	test('un original en minúsculas no fuerza mayúsculas', () => {
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [{ where: 'bajada', original: 'The majority of other nonstick pans use toxic materials', replacement: 'La mayoría de las herramientas son complejas' }],
		};
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.doesNotMatch(prompt, /RENDER IT IN ALL CAPS/);
	});

	test('los signos y números no confunden la detección', () => {
		// "50% BETTER PERFORMANCE" es mayúsculas aunque tenga dígitos y símbolos.
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [{ where: 'dato', original: '50% BETTER PERFORMANCE', replacement: '3x más rápido' }],
		};
		assert.match(buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false), /RENDER IT IN ALL CAPS/);
	});
});

/**
 * Lo que se midió del ganador tiene que llegar al render.
 *
 * Se generaron ocho anuncios cruzando tipos de ganador (testimonial, comparativa,
 * antes/después, grilla de precio, listado, ficha de características, dato duro)
 * con tipos de sujeto (producto, catálogo, servicio, marca), y se compararon uno
 * a uno contra su original. Los defectos que aparecieron no eran de maqueta: eran
 * datos que el análisis devolvía mal o que el prompt no usaba.
 */
describe('lo medido en el ganador llega al render', () => {
	const base2 = { ...base, subjectMode: 'product' as const };

	/**
	 * La letra, en atributos y no en sensación.
	 *
	 * `styleNotes` devolvía "tipografía elegante" y con eso el modelo elegía
	 * cualquier grotesca: un ganador de letra liviana, extendida y muy espaciada
	 * salía clonado en una condensada pesada. Todo igual menos la letra, que es lo
	 * primero que se nota al poner las dos imágenes al lado.
	 */
	test('la tipografía observada viaja como atributos', () => {
		const analisis: any = {
			referenceHasProduct: true,
			typography: { headline: 'sans, light, extended, ALL CAPS, very wide letter-spacing', body: 'sans, regular, normal', pairing: 'el título cuadruplica al cuerpo' },
			textZones: [{ where: 'título', original: 'THE PERFECT SIDE-KICK', replacement: 'El compañero perfecto' }],
		};
		const prompt = buildClonePrompt(base2, analisis, false);
		assert.match(prompt, /MEASURED IN THIS TEMPLATE/);
		assert.match(prompt, /light, extended, ALL CAPS/);
		assert.match(prompt, /el título cuadruplica al cuerpo/);
	});

	/**
	 * Un rótulo con línea guía solo funciona si señala algo.
	 *
	 * En la ficha de características los rótulos quedaron apuntando al aire: uno
	 * decía "cable HDMI incluido" con la línea terminando en el canto de la
	 * consola. El ganador funciona porque cada línea cae sobre la pieza que nombra.
	 */
	test('un rótulo pide que su línea caiga sobre la pieza equivalente', () => {
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [{ where: 'rótulo izquierdo', original: 'REINFORCED CARRY STRAPS', labels: 'las correas de transporte', replacement: 'Diseño delgado' }],
		};
		const prompt = buildClonePrompt(base2, analisis, false);
		assert.match(prompt, /callout labelling las correas de transporte/);
		assert.match(prompt, /label a different real feature rather than pointing the line at nothing/);
	});

	/**
	 * Una tienda se muestra por su variedad.
	 *
	 * La grilla de nueve relojes de distintos colores se clonó con tres cueros
	 * distintos y salieron nueve celdas del mismo negro. La estructura estaba
	 * perfecta y el anuncio ya no vendía una tienda: vendía un producto repetido.
	 */
	test('en modo catálogo exige que cada producto conserve lo suyo', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog', productNames: ['Cuero negro', 'Cuero rosa', 'Doble hombro'] } as any, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /THE RANGE HAS TO BE VISIBLE/);
		assert.match(prompt, /none may be recoloured or reshaped to match another/);
		// Se le dice en qué orden repartirlos, para que la grilla no dependa del azar.
		assert.match(prompt, /\(1\) Cuero negro, \(2\) Cuero rosa, \(3\) Doble hombro/);
		assert.match(prompt, /consecutive cells never repeat/);
		// Y que la grilla no se rompa con una foto de ambiente en una sola celda.
		assert.match(prompt, /KEEP THE GRID UNIFORM/);
	});

	/**
	 * Un número inventado es el defecto más caro de todos.
	 *
	 * El clon de un anuncio que prometía "resolvé el 50%" devolvió "incrementá tu
	 * ROAS un 45% en 90 días" con un tablero de métricas inventado. Se ve bien y
	 * es una promesa que el anunciante no puede sostener.
	 */
	test('prohíbe escribir cifras que no estén en los reemplazos', () => {
		const prompt = buildClonePrompt(base2, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /never write a number that is not literally present in the replacements/);
		assert.match(prompt, /guarantees/);
	});
});

/**
 * Reglas que se contradicen entre sí.
 *
 * El prompt creció regla sobre regla y algunas quedaron aplicándose a sujetos
 * para los que no fueron escritas. Un servicio recibía "no muestres ningún
 * producto" y a renglón seguido mil doscientos caracteres pidiendo conservar la
 * silueta exacta, las costuras y el packaging de un producto que no existe.
 * Cuando dos instrucciones se pelean, el modelo elige distinto en cada corrida.
 */
describe('cada sujeto recibe solo las reglas que le corresponden', () => {
	const base3 = { ...base, productNames: ['Viajes Personalizados'], productFacts: ['Agencia de viajes.'] };
	const sinProducto = { referenceHasProduct: false, textZones: [] } as any;

	test('un servicio no recibe reglas de fidelidad de producto', () => {
		const prompt = buildClonePrompt({ ...base3, subjectMode: 'service' }, sinProducto, false);
		assert.match(prompt, /NO PRODUCT INSERTION/);
		assert.doesNotMatch(prompt, /ONE SAME SKU/);
		assert.doesNotMatch(prompt, /preserve the exact silhouette/);
		assert.doesNotMatch(prompt, /PRODUCT ORIENTATION AND GRAPHICS/);
		// Las excepciones "salvo lo impreso en el producto" también sobraban: son
		// un permiso para inventar un envase donde se dijo que no hay ninguno.
		assert.doesNotMatch(prompt, /supplied product packaging/);
		assert.doesNotMatch(prompt, /TARGET PRODUCT itself/);
	});

	test('una marca sin fotos tampoco', () => {
		const prompt = buildClonePrompt({ ...base3, subjectMode: 'brand' }, sinProducto, false);
		assert.doesNotMatch(prompt, /ONE SAME SKU/);
	});

	test('una ficha de producto sí las recibe', () => {
		const prompt = buildClonePrompt({ ...base3, subjectMode: 'product' }, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /ONE SAME SKU/);
		assert.match(prompt, /TRUE SIZE AND BELIEVABLE HANDLING/);
	});

	test('un carrusel de servicio conserva el mundo visual, no un SKU', () => {
		const prompt = buildClonePrompt({ ...base3, subjectMode: 'service', carousel: { index: 2, total: 4 } } as any, sinProducto, false);
		assert.match(prompt, /CAROUSEL CONSISTENCY/);
		assert.match(prompt, /the same palette, the same typography/);
		assert.doesNotMatch(prompt, /identity master for this same product/);
	});
});

/**
 * Defectos que aparecieron al ampliar la matriz a doce casos.
 *
 * Los tres se vieron generando: un ganador que susurra una oferta al oído y
 * muestra la piel erizada volvió como dos fotos del producto, un titular terminó
 * en "CON CAM" contra el borde derecho, y un cuero liso salió repujado con flores
 * que no existen en la foto ni en la ficha.
 */
describe('lo que se rompió al probar más casos', () => {
	const base4 = { ...base, subjectMode: 'product' as const, productNames: ['Cubos modulares'] };

	/**
	 * Un anuncio puede ser una idea, no un producto.
	 *
	 * La maqueta se copiaba perfecta y el anuncio moría igual: la reacción, la
	 * metáfora o el chiste es lo único que lo hacía funcionar, y se reemplazaba
	 * por una foto del producto nuevo.
	 */
	test('la idea de un área se marca como obligatoria', () => {
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [],
			imageSlots: [{ where: 'panel superior', showsNow: 'boca susurrando al oído', idea: 'la reacción física a escuchar una oferta', replaceWith: 'alguien susurrando la nueva oferta' }],
		};
		const prompt = buildClonePrompt(base4, analisis, false);
		assert.match(prompt, /THE IDEA THIS AREA CARRIES, which must survive: la reacción física/);
		assert.match(prompt, /do not replace it with a product photo/);
	});

	test('sin idea declarada no se agrega el aviso', () => {
		const analisis: any = {
			referenceHasProduct: true,
			textZones: [],
			imageSlots: [{ where: 'foto principal', showsNow: 'una cartera', replaceWith: 'un cubo modular' }],
		};
		assert.doesNotMatch(buildClonePrompt(base4, analisis, false), /THE IDEA THIS AREA CARRIES/);
	});

	/** "ANTES DE REINVENTARTE CON CAM": la palabra se cortó contra el borde. */
	test('prohíbe cortar una palabra para que entre', () => {
		const prompt = buildClonePrompt(base4, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /MARGINS ARE PART OF THE DESIGN/);
		assert.match(prompt, /never truncate one/);
		assert.match(prompt, /No letter may touch, overlap or cross an edge/);
	});

	/** Un cuero liso salió repujado: eso es un producto que el usuario no vende. */
	test('prohíbe decorar una superficie que en la foto está lisa', () => {
		const prompt = buildClonePrompt(base4, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /NOTHING MAY BE ADDED EITHER/);
		assert.match(prompt, /A plain surface stays plain/);
	});

	test('la tienda también lo prohíbe', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog' }, { referenceHasProduct: true, textZones: [] } as any, false);
		assert.match(prompt, /A plain hide stays plain/);
	});
});

/**
 * Dos reglas mías peleándose.
 *
 * Para que el clon no heredara la escena del ganador —un cuero flotando sobre
 * agua, que era el fondo del anuncio de colágeno— se puso que lo propuesto para
 * cada área manda sobre todo lo demás. Con eso, cuando el análisis proponía para
 * una grilla de tienda "incluir partes del proceso y herramientas", esa frase le
 * ganaba a la regla que exige que todas las celdas sean packshots. La grilla
 * salía distinta en cada corrida no por el modelo, sino porque el prompt decía
 * las dos cosas.
 */
describe('qué manda cuando dos reglas se cruzan', () => {
	const conSlots: any = {
		referenceHasProduct: true,
		textZones: [],
		imageSlots: [{ where: 'grilla 3x3', showsNow: 'relojes', replaceWith: 'texturas de cuero y escenas de taller con herramientas' }],
	};

	test('lo propuesto para un área manda sobre el ESCENARIO, no sobre el contenido', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog', productNames: ['Cuero negro', 'Cuero rosa', 'Doble hombro'] } as any, conSlots, false);
		assert.match(prompt, /On the SETTING these replacements have the last word/);
		assert.match(prompt, /never authorise changing WHICH products appear/);
	});

	test('la uniformidad de la grilla gana explícitamente', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'catalog', productNames: ['Cuero negro', 'Cuero rosa', 'Doble hombro'] } as any, conSlots, false);
		assert.match(prompt, /KEEP THE GRID UNIFORM — This rule overrides anything said earlier/);
		assert.match(prompt, /No cell may show hands, a person, a tool, a workbench/);
		// Y el orden importa: la regla que gana tiene que ir después de la que pierde.
		assert.ok(prompt.indexOf('KEEP THE GRID UNIFORM') > prompt.indexOf('On the SETTING these replacements'), 'la regla que gana quedó antes que la que pierde');
	});
});

/**
 * Un sitio sin fotos de producto no es un error del usuario.
 *
 * Pegando puertasblindadasjack.com.ar en el flujo de muchas imágenes, la
 * generación se cayó entera con "Puertas Blindadas JACK todavía no tiene una
 * foto disponible". Pero de ese sitio se puede hacer un aviso perfecto: hablando
 * del negocio en lugar de un artículo. Lo que hay que conservar es el ALCANCE
 * que la persona eligió —general sigue siendo general— y cambiar solo lo que
 * depende de tener fotos.
 */
describe('degradado cuando no hay fotos de producto', () => {
	test('una ficha sin fotos pasa a servicio, no falla', () => {
		assert.equal(subjectModeDesde(alcanceDesde('product'), false), 'service');
	});

	test('una tienda sin fotos pasa a marca, no a producto', () => {
		// Lo importante: sigue hablando del negocio entero, que es lo que se pidió.
		assert.equal(subjectModeDesde(alcanceDesde('catalog'), false), 'brand');
	});

	test('el degradado conserva el alcance elegido', () => {
		for (const modo of ['product', 'catalog', 'service', 'brand'] as const) {
			const degradado = subjectModeDesde(alcanceDesde(modo), false);
			assert.equal(alcanceDesde(degradado), alcanceDesde(modo), modo);
			assert.equal(usesRealProductPhotos(degradado), false, modo);
		}
	});
});
