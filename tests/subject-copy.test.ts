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
		assert.match(prompt, /SAME number of lines/);
	});

	test('prohíbe reflujo y pide acortar', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /TEXT FIT \(CRITICAL\)/);
		assert.match(prompt, /SHORTEN it/);
		assert.match(prompt, /do not shrink the type/i);
	});

	test('la tipografía observada del ganador llega al prompt', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product' }, analisis, false);
		assert.match(prompt, /Grotesca condensada pesada/);
		assert.match(prompt, /do not substitute a generic sans-serif/i);
	});

	test('con tipografía de marca elegida, manda esa', () => {
		const prompt = buildClonePrompt({ ...base, subjectMode: 'product', typoMode: 'brand', brandTypography: { headings: 'Poppins' } } as any, analisis, false);
		assert.match(prompt, /Poppins/);
	});
});
