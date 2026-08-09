import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildClonePrompt, parsePersonMode, personModeRecomendado, PERSON_MODES } from '../src/lib/creattia/generation-pipeline';

/**
 * Quién aparece en el anuncio.
 *
 * Antes había una sola pregunta con dos respuestas: "sin persona / avatar" y
 * "cargar referencias". La primera no hacía lo que decía. El prompt emitía "no
 * inventes una cara recurrente" —que no es lo mismo que "que no aparezca
 * nadie"— y a renglón seguido el bloque de personas del análisis pedía
 * conservar las del ganador. Quien elegía "sin persona" sobre un ganador con
 * gente recibía gente, y no había forma de pedir lo contrario.
 *
 * Ahora son cuatro caminos y cada uno tiene que llegar distinto al render.
 */

const base = {
	productNames: ['Crema hidratante'],
	productFacts: [],
	brief: '',
	brandName: 'Selka',
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
	subjectMode: 'product' as const,
};

/** Un ganador que muestra una persona: es el caso que rompía. */
const conGente: any = {
	referenceHasProduct: true,
	textZones: [],
	people: [{ where: 'mitad derecha, sosteniendo el producto', role: 'modelo de estilo de vida', description: 'mujer joven sonriendo en un baño luminoso' }],
};

const sinGente: any = { referenceHasProduct: true, textZones: [], people: [] };

describe('cuál opción viene marcada', () => {
	test('un ganador con gente recomienda que la IA elija', () => {
		// Sacarle la persona a un aviso que gana justamente por mostrarla rompe lo
		// que se está clonando: lo razonable por defecto es reemplazarla, no borrarla.
		assert.equal(personModeRecomendado(conGente.people), 'ai');
	});

	test('un ganador sin nadie recomienda sin persona', () => {
		assert.equal(personModeRecomendado([]), 'none');
		assert.equal(personModeRecomendado(undefined), 'none');
		assert.equal(personModeRecomendado(null), 'none');
	});

	test('las entradas vacías del análisis no cuentan como personas', () => {
		// El analizador devuelve a veces objetos sin un solo dato. Contarlos hacía
		// que un anuncio sin una sola cara abriera recomendando poner una, que es
		// el error más caro de los dos: agrega gente donde no había.
		assert.equal(personModeRecomendado([{}, { where: '' }] as any), 'none');
		// Con que traiga la posición alcanza: es lo mismo que filtra el prompt.
		assert.equal(personModeRecomendado([{ where: 'esquina inferior' }] as any), 'ai');
	});
});

/**
 * Las personas salían de plástico.
 *
 * Piel sin poros, brillo parejo de muñeca, cara perfectamente simétrica, ojos
 * muertos, manos con los dedos mal. Es lo primero que delata que un anuncio lo
 * hizo una IA: la maqueta puede estar perfecta y el creativo no se puede
 * publicar igual. Lo que no puede pasar es que arreglar esto pise la regla del
 * medio, que es la instrucción que más parecido aporta de todo el prompt.
 */
describe('las personas de un anuncio fotográfico parecen fotos', () => {
	test('con un ganador fotográfico se pide piel de verdad', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'ai' } as any, { ...conGente, renderingMedium: 'photograph, studio lighting' }, false);
		assert.match(prompt, /PHOTOGRAPHIC SKIN \(CRITICAL\)/);
		assert.match(prompt, /pores and fine lines/);
		assert.match(prompt, /five correct fingers at the right scale/);
		assert.match(prompt, /poreless airbrushed skin/);
	});

	test('sin medio declarado también, porque el default es fotográfico', () => {
		assert.match(buildClonePrompt({ ...base, personMode: 'ai' } as any, conGente, false), /PHOTOGRAPHIC SKIN/);
	});

	/** La regla del medio manda: en un ganador dibujado la persona sigue dibujada. */
	test('con un ganador ilustrado NO se pide piel fotográfica', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'ai' } as any, {
			...conGente,
			renderingMedium: '3D cartoon render, Pixar-like stylised characters',
		}, false);
		assert.doesNotMatch(prompt, /PHOTOGRAPHIC SKIN/);
		// Y lo que sí tiene que seguir diciendo es que se dibuje.
		assert.match(prompt, /This template is NOT a photograph/);
	});

	test('sin nadie en el aviso no se emite', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'none' } as any, sinGente, false);
		assert.doesNotMatch(prompt, /PHOTOGRAPHIC SKIN/);
	});

	test('con fotos de avatar se emite aunque el análisis no haya listado gente', () => {
		// El usuario pidió una cara concreta: hay alguien en el aviso aunque el
		// analizador no lo haya anotado.
		const prompt = buildClonePrompt({ ...base, personMode: 'upload', hasAvatarReference: true } as any, sinGente, false);
		assert.match(prompt, /PHOTOGRAPHIC SKIN/);
	});

	/**
	 * Pedir piel de verdad no puede pagarse agregando texto.
	 *
	 * El techo del prompt lo vigilan los dos tests de más abajo. Esta regla entró
	 * recuperando lo que sobraba en el mismo bloque: el default de casting estaba
	 * escrito una vez por cada persona detectada, y el recordatorio del medio se
	 * repetía al pie cuando la regla del medio ya abre el prompt.
	 */
	test('el default de casting se escribe una sola vez, no una por persona', () => {
		const dosPersonas = { ...conGente, people: [{ where: 'izquierda' }, { where: 'derecha' }] };
		const prompt = buildClonePrompt({ ...base, personMode: 'ai' } as any, dosPersonas, false);
		const bloque = prompt.slice(prompt.indexOf('5. PEOPLE'));
		assert.equal(bloque.match(/keep them essentially as in the template/g)?.length, 1);
		assert.match(bloque, /no direction given/);
	});
});

describe('el modo que llega del cliente no se cree', () => {
	test('los cuatro modos válidos pasan', () => {
		for (const modo of PERSON_MODES) assert.equal(parsePersonMode(modo), modo);
	});

	test('cualquier otra cosa cae en el valor por defecto', () => {
		assert.equal(parsePersonMode('saved'), 'ai');
		assert.equal(parsePersonMode(''), 'ai');
		assert.equal(parsePersonMode(null), 'ai');
		assert.equal(parsePersonMode({ modo: 'none' }), 'ai');
	});

	/**
	 * La regresión que el fallback evita: las generaciones guardadas antes de este
	 * cambio no tienen `personMode`, pero muchas tienen `avatarId`. Leerlas como
	 * 'ai' habría hecho desaparecer al avatar de toda rehecha desde el historial,
	 * sin ningún error de por medio.
	 */
	test('una fila vieja con avatar guardado se lee como fotos cargadas', () => {
		assert.equal(parsePersonMode(undefined, 'upload'), 'upload');
	});
});

describe('cada modo llega distinto al render', () => {
	test('sin persona: el prompt dice que no va nadie', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'none' }, conGente, false);
		assert.match(prompt, /NOBODY APPEARS IN THIS AD/);
		assert.match(prompt, /No person, face, hand, body part, silhouette, reflection, mascot or human character anywhere/);
	});

	/**
	 * El defecto concreto: el ganador mostraba una persona, el usuario pedía un
	 * aviso sin nadie, y dos renglones más abajo el prompt pedía conservarla
	 * "esencialmente como en el template". Dos órdenes opuestas en el mismo texto
	 * se resuelven distinto en cada corrida.
	 */
	test('sin persona: el bloque de personas del ganador no se emite', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'none' }, conGente, false);
		assert.doesNotMatch(prompt, /5\. PEOPLE/);
		assert.doesNotMatch(prompt, /keep them essentially as in the template/);
	});

	test('sin persona: tampoco se pregunta por la modelo detectada', () => {
		// La decisión creativa de tipo "person" trae su propia estrategia por
		// defecto, y esa estrategia vuelve a meter a alguien en el aviso.
		const conDecision = {
			...conGente,
			creativeDecisions: [
				{ type: 'person', title: 'Edad de la modelo', question: '¿Qué edad querés?', defaultStrategy: 'mantener una mujer de 30 a 40' },
				{ type: 'scene', title: 'Ambiente', question: '¿Dónde ocurre?', defaultStrategy: 'un baño luminoso' },
			],
		};
		const prompt = buildClonePrompt({ ...base, personMode: 'none' }, conDecision, false);
		assert.doesNotMatch(prompt, /Edad de la modelo/);
		// La decisión que no habla de personas sigue viajando.
		assert.match(prompt, /Ambiente/);
	});

	test('que la IA elija: no manda ni descripción ni fotos, y el ganador manda', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'ai' }, conGente, false);
		assert.match(prompt, /No person reference was supplied/);
		assert.doesNotMatch(prompt, /VISUAL IDENTITY REFERENCE/);
		// El bloque de personas queda con su comportamiento de siempre.
		assert.match(prompt, /5\. PEOPLE/);
		assert.match(prompt, /keep them essentially as in the template/);
	});

	test('yo la describo: lo escrito por el usuario entra al prompt', () => {
		const prompt = buildClonePrompt(
			{ ...base, personMode: 'described', avatarDescription: 'mujer de unos 50, pelo canoso corto, ropa de lino' },
			conGente,
			false,
		);
		assert.match(prompt, /The advertiser wrote who has to appear/);
		assert.match(prompt, /pelo canoso corto/);
		// Y no se anuncian fotos que nunca se adjuntaron.
		assert.doesNotMatch(prompt, /VISUAL IDENTITY REFERENCE/);
	});

	/**
	 * Sin esto la descripción no cambiaba la imagen: el bloque de personas usaba
	 * su default —"dejalas como en el template"— y esa frase, por venir después,
	 * le ganaba a la descripción del usuario.
	 *
	 * Se apunta a la descripción en vez de copiarla: escrita entera una vez por
	 * cada persona detectada, una descripción larga por tres personas empujaba el
	 * prompt por encima del techo de tamaño.
	 */
	test('yo la describo: la descripción también gobierna a la persona detectada', () => {
		const prompt = buildClonePrompt(
			{ ...base, personMode: 'described', avatarDescription: 'mujer de unos 50, pelo canoso corto' },
			conGente,
			false,
		);
		const bloque = prompt.slice(prompt.indexOf('5. PEOPLE'));
		assert.match(bloque, /render the person described under VISUAL IDENTITY/);
		assert.doesNotMatch(bloque, /keep them essentially as in the template/);
	});

	test('yo la describo: lo que el usuario escribió para ESA persona sigue mandando', () => {
		// La descripción general es el default; la indicación puntual de la
		// revisión es más específica y no puede quedar pisada por ella.
		const conDirectiva = { ...conGente, people: [{ ...conGente.people[0], directive: 'hombre mayor con delantal de taller' }] };
		const prompt = buildClonePrompt(
			{ ...base, personMode: 'described', avatarDescription: 'mujer de unos 50, pelo canoso corto' },
			conDirectiva,
			false,
		);
		const bloque = prompt.slice(prompt.indexOf('5. PEOPLE'));
		assert.match(bloque, /hombre mayor con delantal de taller/);
		assert.doesNotMatch(bloque, /render the person described under VISUAL IDENTITY/);
	});

	test('cargar avatar: se declaran las fotos como referencia de identidad', () => {
		const prompt = buildClonePrompt(
			{ ...base, personMode: 'upload', avatarImageCount: 6, avatarDescription: 'Sofía, la fundadora' },
			conGente,
			false,
		);
		assert.match(prompt, /VISUAL IDENTITY REFERENCE/);
		assert.match(prompt, /Sofía, la fundadora/);
		assert.match(prompt, /Do not merge different people, invent a new face or turn the avatar into a product/);
	});

	test('sin persona sigue diciendo que no va nadie aunque el ganador no muestre a nadie', () => {
		const prompt = buildClonePrompt({ ...base, personMode: 'none' }, sinGente, false);
		assert.match(prompt, /NOBODY APPEARS IN THIS AD/);
	});
});

/**
 * Los análisis guardados y los callers que todavía no mandan el campo no pueden
 * cambiar de comportamiento de un día para el otro: hasta ahora "hay fotos de
 * avatar" era la única pregunta, y así se sigue leyendo cuando no viene nada.
 */
describe('compatibilidad con lo que ya estaba guardado', () => {
	test('sin modo, con fotos adjuntas, se comporta como cargar avatar', () => {
		const prompt = buildClonePrompt({ ...base, avatarImageCount: 5, avatarDescription: 'Sofía' }, conGente, false);
		assert.match(prompt, /VISUAL IDENTITY REFERENCE/);
	});

	test('sin modo y sin nada, se comporta como que la IA elija', () => {
		const prompt = buildClonePrompt({ ...base }, conGente, false);
		assert.match(prompt, /No person reference was supplied/);
		assert.match(prompt, /5\. PEOPLE/);
	});
});

/**
 * El prompt de render ya está en su techo: cuatro caminos no pueden convertirse
 * en cuatro bloques nuevos. Cada modo reemplaza al mismo bloque de identidad, y
 * ninguno puede quedar desproporcionado respecto de los otros.
 */
describe('los cuatro caminos no engordan el prompt', () => {
	const analisis: any = {
		referenceHasProduct: true,
		productHasPackaging: true,
		templateHasLogoSlot: true,
		messageStrategy: 'Muestra el resultado antes que el producto.',
		people: [{ where: 'izquierda' }, { where: 'derecha' }],
		textZones: Array.from({ length: 6 }, (_, i) => ({ where: `zona ${i}`, original: `O${i}`, replacement: `N${i}` })),
	};
	const descripcionLarga = 'mujer de unos 40 años, '.repeat(20);

	test('ningún modo se pasa del techo', () => {
		for (const modo of PERSON_MODES) {
			const prompt = buildClonePrompt(
				{ ...base, personMode: modo, avatarImageCount: modo === 'upload' ? 6 : 0, avatarDescription: modo === 'none' || modo === 'ai' ? '' : descripcionLarga },
				analisis,
				true,
			);
			assert.ok(prompt.length < 20000, `${modo} llegó a ${prompt.length} caracteres`);
		}
	});

	test('elegir un modo u otro no cambia el tamaño del prompt más que lo que ocupa el texto', () => {
		// Si un modo pesara mucho más que los otros sería porque se le sumó una
		// regla nueva en lugar de reemplazar el bloque de identidad.
		const conIa = buildClonePrompt({ ...base, personMode: 'ai' }, analisis, true).length;
		const sinNadie = buildClonePrompt({ ...base, personMode: 'none' }, analisis, true).length;
		assert.ok(Math.abs(conIa - sinNadie) < 600, `la diferencia entre 'ai' y 'none' fue de ${Math.abs(conIa - sinNadie)} caracteres`);
	});
});
