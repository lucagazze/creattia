import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildPromptLibre, fotosParaElMotor } from '../src/lib/creattia/clon-libre';

/**
 * El clon libre, que es el que corre en producción.
 *
 * Cada regla de acá se ganó el lugar generando con y sin ella contra siete
 * referencias reales. Lo que se prueba abajo no es que el texto exista: es que
 * no vuelva el defecto que la regla arregló. Antes de tocar una, generá las dos
 * versiones y mirá las imágenes.
 */

const ficha = {
	nombres: ['Bóxer premium de bambú'],
	datos: ['Tela de bambú, evita humedad y rozaduras'],
	marca: 'Rawmen',
};

describe('el prompt del clon libre', () => {
	/**
	 * El defecto: con un ganador cargado de texto el prompt detallado llegaba a
	 * 33.610 caracteres y OpenAI devolvía 400. Este es fijo, así que ese modo de
	 * fallar ya no existe. El techo generoso deja lugar a una ficha larga sin
	 * dejar que el prompt se convierta otra vez en una enciclopedia.
	 */
	test('el prompt es fijo y entra cómodo bajo el techo de OpenAI', () => {
		const prompt = buildPromptLibre(ficha);
		assert.ok(prompt.length < 9000, `mide ${prompt.length}`);
	});

	/**
	 * El defecto: el anuncio salía con la composición correcta y las rosas del
	 * probiótico vaginal que era el ganador. Dicho en general —"adaptá la
	 * escena"— las rosas se quedaban; nombrando la decoración se van.
	 */
	test('nombra la decoración, que es lo que sobrevive por error', () => {
		assert.match(buildPromptLibre(ficha), /The decoration is what survives by mistake/);
	});

	/**
	 * El defecto: en un anuncio donde la foto ES el anuncio, el clon volvía con la
	 * misma cara, la misma ropa y la misma ciudad. Se arregló SACANDO "el mismo
	 * estilo fotográfico" de lo que se conserva: pedirle conservar la foto y
	 * adaptarla a la vez es pedirle dos cosas opuestas, y ganaba conservar.
	 */
	test('lo que se conserva es el diseño, no la fotografía', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /Everything about the design stays/);
		assert.doesNotMatch(prompt, /the same photographic style/);
		assert.match(prompt, /EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT/);
	});

	/** El defecto: un US vs THEM salía con los dos lados iguales. */
	test('mantiene enfrentados los dos lados de una comparación', () => {
		assert.match(buildPromptLibre(ficha), /keep that comparison and keep the sides clearly opposed/);
	});

	/**
	 * El defecto: aparecía un logo en anuncios que no tenían ninguno. La condición
	 * es lo que muestra el GANADOR, no si la marca tiene logo.
	 */
	test('el logo depende de lo que muestra el ganador', () => {
		assert.match(buildPromptLibre(ficha), /does it show a logo or a brand name anywhere\?/);
	});

	/**
	 * La decisión del usuario reemplaza la regla ENTERA. Tener las dos es pedirle
	 * dos cosas distintas, y ahí gana la más gráfica y la decisión se ignora.
	 */
	test('la decisión de firma del usuario reemplaza la regla, no se suma', () => {
		const prompt = buildPromptLibre({ ...ficha, decisionDeLogo: 'This ad carries no logo anywhere.' });
		assert.match(prompt, /THE BRAND MARK — This ad carries no logo anywhere\./);
		assert.doesNotMatch(prompt, /does it show a logo or a brand name anywhere\?/);
	});

	/**
	 * El defecto: un ganador en francés devolvió "OBTENEZ VOTRE BOXER PREMIUM DE
	 * BAMBÚ" — media frase en el idioma del ganador y media en el pedido. Decir en
	 * qué idioma escribir no alcanzaba: hay que decir que ninguna palabra del
	 * ganador sobrevive por parecerse a la que iba.
	 */
	test('el idioma elegido manda, y ninguna palabra del ganador sobrevive', () => {
		const elegido = buildPromptLibre({ ...ficha, idioma: 'natural Argentine Spanish' });
		assert.match(elegido, /EVERY WORD IN THE AD IS WRITTEN IN NATURAL ARGENTINE SPANISH/);
		assert.match(elegido, /not one of its words survives/);
		assert.match(elegido, /Do not mix two languages/);
		assert.match(buildPromptLibre(ficha), /THE LANGUAGE OF THE PRODUCT INFORMATION ABOVE/);
	});

	/** Sin ICP el anuncio lo protagoniza un modelo cualquiera y no se lo apropia nadie. */
	test('el ICP entra sin duplicar el punto final', () => {
		const prompt = buildPromptLibre({ ...ficha, icp: 'Un hombre de 30 activo.' });
		assert.match(prompt, /WHO THIS AD IS FOR: Un hombre de 30 activo\. Whoever/);
	});

	/**
	 * Los dos únicos controles que quedaron. Sin elegir nada se usan los del
	 * ganador, que es lo que hace que el clon se parezca al original: si esto se
	 * invierte, todos los avisos salen con la identidad del usuario encima y el
	 * ganador deja de reconocerse.
	 */
	test('sin elegir nada, los colores y la letra son los del ganador', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /the same typography — the very letterforms you can see in the image/);
		assert.match(prompt, /the same colour palette, the same accent colour on the same word/);
	});

	/**
	 * Elegir la identidad propia REEMPLAZA la cláusula del ganador, no se suma.
	 * Con las dos presentes se le piden dos cosas distintas y gana la que ve en la
	 * imagen, así que la elección se ignoraba.
	 */
	test('la identidad elegida reemplaza a la del ganador', () => {
		const prompt = buildPromptLibre({
			...ficha,
			coloresDeLaMarca: ['#0b1120', '#dd1d1d'],
			tipografiaDeLaMarca: { headings: 'Outfit', body: 'Inter' },
		});
		assert.match(prompt, /Outfit for headings, Inter for body/);
		assert.match(prompt, /#0b1120, #dd1d1d/);
		assert.doesNotMatch(prompt, /the very letterforms you can see in the image/);
		assert.doesNotMatch(prompt, /the same colour palette/);
	});

	/** Se puede cambiar una sola: la otra sigue siendo la del ganador. */
	test('los dos controles son independientes', () => {
		const soloLetra = buildPromptLibre({ ...ficha, tipografiaDeLaMarca: { headings: 'Outfit' } });
		assert.match(soloLetra, /Outfit for headings/);
		assert.match(soloLetra, /the same colour palette/);
	});

	test('lo que se scrapeó del producto viaja entero', () => {
		const prompt = buildPromptLibre({ ...ficha, aspecto: 'Negro, tejido perforado.' });
		assert.match(prompt, /Bóxer premium de bambú/);
		assert.match(prompt, /WHAT THE PRODUCT LOOKS LIKE, read off its real photos:\nNegro, tejido perforado\./);
	});

	/**
	 * La URL y el logo salieron del texto: el modelo no abre links, el logo viaja
	 * como imagen, y una dirección escrita en el prompt es candidata a terminar
	 * impresa en el aviso.
	 */
	test('la url y el logo no se le escriben', () => {
		const prompt = buildPromptLibre({ ...ficha, url: 'https://rawmenoficial.com/p', logoUrl: 'https://cdn/logo.png' });
		assert.doesNotMatch(prompt, /rawmenoficial/);
		assert.doesNotMatch(prompt, /cdn/);
	});

	/**
	 * El defecto, visto en producción: una mojarra de pesca cuya galería eran todas
	 * placas promocionales —bandera, caja, "SORTEO DÍA 30"— salió siendo esa placa.
	 * El motor tenía dos diseños delante y la orden de reproducir letra por letra lo
	 * impreso en el producto, así que clonó el de la tienda.
	 */
	test('el diseño sale del ganador, no de las fotos del producto', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /THE DESIGN COMES FROM THE FIRST IMAGE AND FROM NOWHERE ELSE/);
		assert.match(prompt, /Take the object out of it and leave the rest behind/);
	});
});

describe('qué fotos llegan al motor', () => {
	const fotos = [0, 1, 2, 3].map((i) => ({ buffer: Buffer.from(`foto ${i}`), type: 'image/jpeg' }));
	const nombres = (elegidas: Array<{ buffer: Buffer }>) => elegidas.map((f) => f.buffer.toString());

	/**
	 * El defecto: una tienda con la galería llena de placas promocionales hacía que
	 * el motor clonara el diseño de la tienda en vez del anuncio ganador. Tenía dos
	 * diseños delante y la orden de ser fiel al producto.
	 */
	test('las placas de diseño no viajan', () => {
		assert.deepEqual(nombres(fotosParaElMotor(fotos, { mejores: [1, 3], graficas: [0, 2], conPersona: [] })), ['foto 1', 'foto 3']);
	});

	/**
	 * OpenAI rechaza el pedido ENTERO —no lo degrada— si sospecha un cuerpo en ropa
	 * interior entre las imágenes de entrada, aunque el aviso a generar no muestre
	 * nada.
	 */
	test('las fotos con una persona tampoco', () => {
		assert.deepEqual(nombres(fotosParaElMotor(fotos, { mejores: [0, 1, 2], graficas: [], conPersona: [1] })), ['foto 0', 'foto 2']);
	});

	/** Cada imagen de entrada es una señal que compite con la referencia. */
	test('nunca viajan más de tres', () => {
		assert.equal(fotosParaElMotor(fotos, { mejores: [], graficas: [], conPersona: [] }).length, 3);
	});

	/**
	 * Devolver vacío es una respuesta con significado: no hay una sola foto del
	 * objeto, y el que llama fabrica una en vez de mandar una placa. Es lo que
	 * dispara `renderStudioProductShot`.
	 */
	test('sin ninguna foto limpia devuelve vacío, para que se fabrique una', () => {
		assert.equal(fotosParaElMotor(fotos, { mejores: [], graficas: [0, 1, 2, 3], conPersona: [] }).length, 0);
	});
});

describe('el prompt de respaldo, para cuando OpenAI rechaza', () => {
	/**
	 * El rechazo del filtro es del pedido ENTERO —400, sin imagen— y no depende de
	 * lo que se vaya a dibujar sino de lo que el prompt describe: con un producto
	 * sensible alcanza una línea sobre una persona para que no genere nada.
	 * Medido: con ICP e indicaciones se caían 2 de 7 referencias; sacando esas dos
	 * líneas las 2 salieron.
	 */
	test('saca el ICP y lo que pidió el usuario, que es lo que dispara el filtro', () => {
		const conTodo = { ...ficha, icp: 'Un hombre de 30 activo', indicaciones: 'que se vea el 4+2' };
		const completo = buildPromptLibre(conTodo);
		const magro = buildPromptLibre(conTodo, true);
		assert.match(completo, /WHO THIS AD IS FOR: Un hombre/);
		assert.match(completo, /que se vea el 4\+2/);
		assert.doesNotMatch(magro, /Un hombre de 30 activo/);
		assert.doesNotMatch(magro, /que se vea el 4\+2/);
		assert.ok(magro.length < completo.length);
	});

	/**
	 * Lo que pide el usuario entra como UN dato más de la ficha, sin explicarle
	 * cómo obedecerlo. Las tres frases que le decían dónde ponerlo se sacaron: el
	 * prompt es un presupuesto de atención, y cada orden le come lugar a las reglas
	 * que sí se midieron contra imágenes.
	 */
	test('lo que pide el usuario entra en una línea, sin instrucciones alrededor', () => {
		const prompt = buildPromptLibre({ ...ficha, indicaciones: 'que se vea el 4+2 de regalo' });
		assert.match(prompt, /WHAT THE ADVERTISER ALSO WANTS THIS AD TO SAY: que se vea el 4\+2 de regalo/);
		assert.doesNotMatch(prompt, /you decide which block carries it/);
	});

	/** Todo lo demás sigue igual: se sacan dos líneas, no se cambia de prompt. */
	test('lo que se midió que sirve no se toca', () => {
		const magro = buildPromptLibre({ ...ficha, icp: 'Un hombre de 30' }, true);
		assert.match(magro, /The decoration is what survives by mistake/);
		assert.match(magro, /EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT/);
		assert.match(magro, /keep the sides clearly opposed/);
		assert.match(magro, /does it show a logo or a brand name anywhere\?/);
	});
});



describe('quién aparece en el aviso', () => {
	/**
	 * Sin elegir nada el aviso lo resuelve mirando el ganador, que es lo que sale
	 * bien casi siempre. Si esto se invierte, un aviso que funcionaba con gente
	 * empieza a salir sin nadie.
	 */
	test('sin decisión, la escena se recastea sola', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /another person, the one this product is for/);
		assert.match(prompt, /The same face in the same place is the sign nothing was adapted/);
	});

	/**
	 * La decisión REEMPLAZA la frase, no se le suma. Con las dos presentes se le
	 * piden dos cosas distintas y gana la que ve en la imagen del ganador, así que
	 * elegir "nadie" sobre un ganador con gente no hacía nada.
	 */
	test('elegir que no aparezca nadie reemplaza el recasteo', () => {
		const prompt = buildPromptLibre({ ...ficha, decisionDePersona: 'No person appears anywhere in this ad.' });
		assert.match(prompt, /No person appears anywhere in this ad\./);
		assert.doesNotMatch(prompt, /another person, the one this product is for/);
	});

	test('con fotos propias, la persona es la de las fotos', () => {
		const prompt = buildPromptLibre({ ...ficha, decisionDePersona: 'The person in it is the one in the supplied photos.' });
		assert.match(prompt, /the one in the supplied photos/);
		assert.doesNotMatch(prompt, /The same face in the same place/);
	});
});

describe('lo que el ganador trajo prestado', () => {
	/**
	 * El defecto, visto en producción tres veces: un sello de "beauty shortlist
	 * WELLBEING AWARDS 2023" sobre un aviso de sillas de cuero, el disclaimer de la
	 * FDA de un suplemento sobre un bóxer, un "$20 OFF" que no era de nadie.
	 *
	 * La regla vieja decía "no conserves la marca del anunciante original", y un
	 * sello ajeno no es del anunciante: es de un tercero que el ganador citaba. Por
	 * ese hueco pasaba todo lo que más delata el aviso como de otro.
	 */
	test('los sellos, ratings y letra chica de terceros tampoco se quedan', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /award seals, press logos, star ratings, certifications, legal small print/);
		assert.match(prompt, /stays only if THIS product genuinely has its own/);
	});
});

describe('cuando se sube una persona', () => {
	/**
	 * Lo que se sube es una CARA y un FÍSICO, no un vestuario ni una pose. Decirle
	 * que copiara la foto entera hacía que el aviso heredara la ropa y el encuadre
	 * de una foto sacada para otra cosa, y que una foto de teléfono movida saliera
	 * movida en el aviso.
	 */
	test('se toma la persona, no su ropa ni su foto', () => {
		const prompt = buildPromptLibre({
			...ficha,
			decisionDePersona: 'The person in this ad is the one in the supplied photos, and THE FACE HAS TO COME OUT IDENTICAL. Everything else is yours: what they wear belongs to this ad.',
		});
		assert.match(prompt, /THE FACE HAS TO COME OUT IDENTICAL/);
		assert.doesNotMatch(prompt, /another person, the one this product is for/);
	});
});

describe('las páginas de un carrusel', () => {
	/**
	 * Se generan por separado, sin verse entre sí, y todas reciben la misma ficha
	 * del producto. Sin decirles que son una secuencia, las tres escribían el mismo
	 * titular y el mismo beneficio: el carrusel decía lo mismo tres veces.
	 */
	test('cada página dice lo suyo y no repite a las otras', () => {
		const prompt = buildPromptLibre({ ...ficha, carrusel: { indice: 1, total: 4 } });
		assert.match(prompt, /This is page 2 of a 4-page carousel/);
		assert.match(prompt, /no headline, no claim and no benefit repeated from another page/);
		assert.match(prompt, /one moment in a sequence, not the whole ad said again/);
	});

	test('una imagen suelta no dice nada de páginas', () => {
		assert.doesNotMatch(buildPromptLibre(ficha), /carousel/);
	});
});

describe('las otras páginas del carrusel como contexto', () => {
	/**
	 * Decirle "sos la 2 de 4" no alcanzaba: cada página se genera sola y todas
	 * reciben la misma ficha, así que no tenía con qué saber qué dicen las otras y
	 * las tres escribían el mismo titular. Ahora las otras páginas viajan como
	 * imágenes de entrada, y el prompt tiene que nombrarlas — si no, las lee como
	 * fotos más del producto y las dibuja adentro del aviso.
	 */
	test('se nombran para que no las dibuje', () => {
		const prompt = buildPromptLibre({ ...ficha, carrusel: { indice: 1, total: 4 }, otrasPaginas: 3 });
		assert.match(prompt, /The last 3 input images are the other pages of this same carousel/);
		assert.match(prompt, /never draw them, never copy their words/);
	});

	test('con una sola página hermana, el texto va en singular', () => {
		const prompt = buildPromptLibre({ ...ficha, carrusel: { indice: 0, total: 2 }, otrasPaginas: 1 });
		assert.match(prompt, /The last 1 input image is the other page of this same carousel/);
	});

	test('sin hermanas no se menciona ninguna', () => {
		const prompt = buildPromptLibre({ ...ficha, carrusel: { indice: 0, total: 3 } });
		assert.doesNotMatch(prompt, /the other page/);
	});
});

describe('las personas usando el producto', () => {
	/**
	 * El párrafo enumeraba anatomía para prohibirla, y medido contra 7 referencias
	 * eso era lo que hacía que OpenAI rechazara el pedido ENTERO: 5 de 7 con él, 6
	 * de 7 sin él. Dice lo mismo por el lado positivo y sin una sola de esas
	 * palabras — el estándar de una campaña de tienda ya excluye lo que hay que
	 * excluir, y una persona en ropa interior es justo lo que esas campañas
	 * muestran.
	 *
	 * Si alguien vuelve a meter esas palabras, vuelven los rechazos.
	 */
	test('se permite mostrarlas, sin nombrar anatomía', () => {
		const prompt = buildPromptLibre({ ...ficha, seUsaEnElCuerpo: true });
		assert.match(prompt, /PEOPLE CAN WEAR THE PRODUCT/);
		assert.match(prompt, /an editorial retail photograph/);
		for (const palabra of ['genital', 'nipple', 'groin', 'erotic', 'bare ']) {
			assert.doesNotMatch(prompt, new RegExp(palabra, 'i'), `el prompt no puede decir "${palabra}"`);
		}
	});

	/**
	 * En un aviso de pesca o de suplementos ese párrafo no aporta nada, y sí aporta
	 * el vocabulario que el filtro de OpenAI castiga. Y del prompt magro —el que se
	 * manda cuando el filtro ya rechazó una vez— sale siempre.
	 */
	test('solo aparece si el producto se usa puesto', () => {
		assert.doesNotMatch(buildPromptLibre(ficha), /PEOPLE CAN WEAR THE PRODUCT/);
		assert.doesNotMatch(buildPromptLibre({ ...ficha, seUsaEnElCuerpo: true }, true), /PEOPLE CAN WEAR THE PRODUCT/);
	});
});
