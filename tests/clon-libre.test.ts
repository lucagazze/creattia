import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { buildPromptLibre, fotosParaElMotor, todasSonPlacas } from '../src/lib/creattia/clon-libre';

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
	 * La advertencia volvió el 2026-08-11, sola y con disparador visto: con la
	 * línea pelada de b8ded8c salieron un "Wait..." intacto y el "Mmmhmm"
	 * manuscrito del ganador en avisos de una campera GAP. Las palabras del
	 * ganador sobreviven justo cuando no parecen idioma — cortas e
	 * "internacionales", o en cursiva de firma — así que la advertencia las
	 * nombra a las dos.
	 */
	test('el idioma elegido manda, y ninguna palabra del ganador sobrevive', () => {
		const elegido = buildPromptLibre({ ...ficha, idioma: 'natural Argentine Spanish' });
		assert.match(elegido, /Every word in the ad is written in natural Argentine Spanish/);
		assert.match(elegido, /not a handwritten interjection/);
		assert.match(buildPromptLibre(ficha), /the language the product information above is written in/);
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
	 * Volvieron con la vuelta a b8ded8c: son parte del todo que midió mejor —
	 * sacarlos nunca se midió aislado. El riesgo conocido es una dirección
	 * impresa en el aviso; si aparece, sacarlos se mide SOLO, contra b8ded8c.
	 */
	test('la url y el logo viajan en la ficha, como en b8ded8c', () => {
		const prompt = buildPromptLibre({ ...ficha, url: 'https://rawmenoficial.com/p', logoUrl: 'https://cdn/logo.png' });
		assert.match(prompt, /url: https:\/\/rawmenoficial\.com\/p/);
		assert.match(prompt, /logo: https:\/\/cdn\/logo\.png/);
	});

	/**
	 * Dos de los bloques del PROMPT B, que le ganó 3 a 0 a la base en el
	 * experimento de la campera GAP (2026-08-11): el diseño-sale-de-la-primera-
	 * imagen y la tipografía impoluta. Entraron como paquete medido con imágenes,
	 * no como parches sueltos.
	 */
	test('los bloques del PROMPT B están presentes', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /THE DESIGN COMES FROM THE FIRST IMAGE AND FROM NOWHERE ELSE/);
		assert.match(prompt, /THE TYPE IS TYPESET, NOT DRAWN/);
	});
});

describe('qué fotos llegan al motor', () => {
	const fotos = [0, 1, 2, 3].map((i) => ({ buffer: Buffer.from(`foto ${i}`), type: 'image/jpeg' }));
	const nombres = (elegidas: Array<{ buffer: Buffer }>) => elegidas.map((f) => f.buffer.toString());

	/**
	 * TODAS, como en b8ded8c: el filtrado parcial de placas y el tope de tres
	 * fotos se midieron contra ese commit y las imágenes salían peor — entrada
	 * abundante gana. Mientras haya UNA foto real, las placas mezcladas viajan
	 * igual que viajaban en b8ded8c, y `mejores` se ignora a propósito.
	 */
	test('con al menos una foto real viajan todas, placas incluidas', () => {
		assert.deepEqual(
			nombres(fotosParaElMotor(fotos, { mejores: [1], graficas: [0, 2], conPersona: [] })),
			['foto 0', 'foto 1', 'foto 2', 'foto 3'],
		);
	});

	/**
	 * La única excepción, a todo o nada: la galería 100% placas (el caso mojarra)
	 * producía basura segura — el motor clonaba la placa de la tienda en vez del
	 * ganador. Devolver vacío le dice al que llama que fabrique un packshot.
	 */
	test('con la galería toda placas no viaja ninguna, y se fabrica un packshot', () => {
		assert.equal(fotosParaElMotor(fotos, { mejores: [], graficas: [0, 1, 2, 3], conPersona: [] }).length, 0);
	});

	/**
	 * OpenAI rechaza el pedido ENTERO —no lo degrada— si sospecha un cuerpo en ropa
	 * interior entre las imágenes de entrada, aunque el aviso a generar no muestre
	 * nada.
	 */
	test('las fotos con una persona no viajan', () => {
		assert.deepEqual(nombres(fotosParaElMotor(fotos, { mejores: [], graficas: [], conPersona: [1] })), ['foto 0', 'foto 2', 'foto 3']);
	});

	/**
	 * Si TODAS muestran una persona no se filtra nada: quedarse sin fotos es peor
	 * que arriesgar el filtro, porque sin ninguna el motor dibuja de memoria.
	 */
	test('si todas tienen persona, van todas igual', () => {
		assert.equal(fotosParaElMotor(fotos, { mejores: [], graficas: [], conPersona: [0, 1, 2, 3] }).length, 4);
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
	 * Lo que pide el usuario dejó de ser una línea suelta en la ficha.
	 *
	 * Ahí se leía como un dato más entre veinte —al lado del precio y la
	 * categoría— y a veces el aviso salía sin eso que se había pedido. Ahora es un
	 * bloque propio y dice que tiene que VERSE en el aviso terminado. Lo que sigue
	 * sin decir es dónde ni de qué tamaño: eso lo volvería una orden de
	 * maquetación, que es lo que endurece la generación.
	 */
	test('lo que pide el usuario pesa, sin decirle dónde ponerlo', () => {
		const prompt = buildPromptLibre({ ...ficha, indicaciones: 'que se vea el 4+2 de regalo' });
		assert.match(prompt, /WHAT THE ADVERTISER ASKED FOR: que se vea el 4\+2 de regalo/);
		assert.match(prompt, /has to be readable in the finished ad/);
		assert.match(prompt, /Where it goes, how big it is and which block carries it are yours to decide/);
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

	/**
	 * El lugar elegido SUSTITUYE la cláusula del recasteo, no le suma una orden —
	 * mismo patrón que la persona y el logo. Sin elección, la frase es la de
	 * b8ded8c letra por letra.
	 */
	test('el lugar elegido reemplaza el "somewhere" del recasteo', () => {
		const prompt = buildPromptLibre({ ...ficha, lugarElegido: 'una parrilla al aire libre' });
		assert.match(prompt, /in this exact setting: una parrilla al aire libre\./);
		assert.doesNotMatch(prompt, /somewhere this product is really used/);
		assert.doesNotMatch(buildPromptLibre(ficha), /in this exact setting/);
	});
});

describe('lo que el ganador trajo prestado', () => {
	/**
	 * Historia que no hay que perder: tres veces en producción sobrevivió una marca
	 * de terceros — un sello "WELLBEING AWARDS 2023" sobre sillas de cuero, el
	 * disclaimer de la FDA de un suplemento sobre un bóxer, un "$20 OFF" de nadie.
	 * La cláusula que los nombra volvió con el PROMPT B, y el prompt mínimo del
	 * mismo experimento mostró por qué hace falta: inventó un rating 4.7 y un
	 * precio de $69.000 sobre un producto de $75.000.
	 */
	test('los sellos, ratings y letra chica de terceros no se quedan', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /award seals, press logos, star ratings, certifications, legal small print/);
	});

	/**
	 * En el panel de 5 referencias B inventó "Garantía real" y "Atención
	 * personalizada" — promesas de servicio que la ficha no tenía. El cierre las
	 * nombra explícitamente: "guarantees" a secas no alcanzaba.
	 */
	test('las promesas de servicio inventadas están nombradas en el cierre', () => {
		assert.match(buildPromptLibre(ficha), /guarantees, warranties, free shipping or service promises/);
	});

	/**
	 * La mojarra sobre el comparador alemán de colágeno: "22,40€ pro Kilo" salió
	 * como "22.400$ por unidad" y "240€ pro Jahr" como "240.000$ por año". Para
	 * el modelo eso no era inventar un precio — era reemplazar el texto del
	 * bloque. La regla lo dice explícito: los números del ganador no son datos de
	 * este producto, ni copiados ni disfrazados.
	 */
	test('los números del ganador no se copian ni se disfrazan', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /do not adapt them into lookalikes/);
		assert.match(prompt, /Every number in the ad appears digit for digit in the product information above/);
	});

	/**
	 * En el us-vs-them del panel, B puso la MISMA campera de los dos lados y la
	 * comparación no decía nada. El otro lado muestra OTRO artículo, genérico y
	 * sin marca — lo que el comprador aceptaría en su lugar.
	 */
	test('la comparativa exige otro artículo del lado malo', () => {
		const prompt = buildPromptLibre(ficha);
		assert.match(prompt, /a DIFFERENT, generic, unbranded item of the same category/);
		assert.match(prompt, /The same product on both sides says nothing/);
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
	 * El PROMPT B reemplazó el bloque fijo de pudor por el bloque de prendas
	 * condicional: dice lo mismo por el lado positivo, sin el vocabulario que el
	 * filtro de OpenAI castiga (medido: 5/7 rechazos con él, 6/7 sin él), y solo
	 * cuando el producto se usa puesto — en un aviso de pesca no aporta nada.
	 */
	test('el bloque de prendas solo aparece si el producto se usa puesto', () => {
		const puesto = buildPromptLibre({ ...ficha, seUsaEnElCuerpo: true });
		assert.match(puesto, /PEOPLE CAN WEAR THE PRODUCT/);
		assert.doesNotMatch(puesto, /NOTHING EXPLICIT/);
		for (const palabra of ['genital', 'nipple', 'groin', 'erotic']) {
			assert.doesNotMatch(puesto, new RegExp(palabra, 'i'), `el prompt no puede decir "${palabra}"`);
		}
		assert.doesNotMatch(buildPromptLibre(ficha), /PEOPLE CAN WEAR THE PRODUCT/);
	});
});

describe('el reintento y las páginas hermanas, cableados de punta a punta', () => {
	/**
	 * Con la vuelta a b8ded8c el magro solo saca el ICP y las indicaciones:
	 * `seUsaEnElCuerpo` no cambia el prompt, así que sin esas dos cosas el magro
	 * es idéntico y el respaldo no debe mandarse.
	 */
	test('un producto que se usa puesto ya no cambia el magro', () => {
		const puesto = { ...ficha, seUsaEnElCuerpo: true };
		assert.equal(buildPromptLibre(puesto), buildPromptLibre(puesto, true));
	});

	/** Sin nada de eso los dos son iguales y reintentar sería mandar lo mismo. */
	test('sin nada quitable, el magro es idéntico', () => {
		assert.equal(buildPromptLibre(ficha), buildPromptLibre(ficha, true));
	});
});

describe('cuándo se fabrica un packshot', () => {
	const fotos = [0, 1, 2].map((i) => ({ buffer: Buffer.from(`foto ${i}`), type: 'image/jpeg' }));

	/**
	 * Una foto real regenerada por IA es copia de copia y se le nota. El packshot
	 * tiene que ser el último recurso —cuando la tienda no publica una sola foto
	 * del objeto— y nunca el efecto colateral de una clasificación floja que dejó
	 * `mejores` vacío sin motivo.
	 */
	test('solo cuando el clasificador dijo que TODAS son placas', () => {
		assert.equal(todasSonPlacas(fotos, { mejores: [], graficas: [0, 1, 2], conPersona: [] }), true);
		assert.equal(todasSonPlacas(fotos, { mejores: [], graficas: [0, 1], conPersona: [] }), false);
		assert.equal(todasSonPlacas(fotos, { mejores: [], graficas: [], conPersona: [0, 1, 2] }), false);
	});

	test('sin fotos no hay nada que rehacer', () => {
		assert.equal(todasSonPlacas([], { mejores: [], graficas: [], conPersona: [] }), false);
	});
});

describe('los textos ya escritos', () => {
	const textos = [
		{ original: 'BACKED UP?', replacement: '¿BUSCÁS CAMPERA?' },
		{ original: '*This statement has not been evaluated by the FDA.', replacement: 'Producto en excelente estado.' },
	];

	/**
	 * El análisis del ganador ya devuelve esta lista en CADA generación y se
	 * descartaba entera. Sin ella el motor improvisa el copy mientras dibuja, y ahí
	 * es donde sobrevivieron el disclaimer de la FDA, un "$20 OFF" que no era de
	 * nadie, un titular en inglés y los números alemanes transliterados.
	 *
	 * Medido en la campera (2026-08-12): con la lista salieron los nueve textos de
	 * un us-vs-them palabra por palabra. El control es real — por eso la lista
	 * tiene que ser editable, porque el aviso hereda sus errores igual de fiel.
	 */
	test('la lista entra con lo que decía y lo que va a decir', () => {
		const prompt = buildPromptLibre({ ...ficha, textos });
		assert.match(prompt, /THE TEXT IS ALREADY WRITTEN/);
		assert.match(prompt, /1\. "BACKED UP\?"  ->  "¿BUSCÁS CAMPERA\?"/);
		assert.match(prompt, /2\. ".*FDA\."  ->  "Producto en excelente estado\."/);
	});

	/**
	 * Es la lista SOLA, no el análisis entero: 700 a 1.000 caracteres contra
	 * 10.000-14.000. Inyectar el análisis completo es lo que hacía que el prompt se
	 * pasara del techo de 32.000 de OpenAI y saliera rígido.
	 */
	test('cuesta cientos de caracteres, no miles', () => {
		const conLista = buildPromptLibre({ ...ficha, textos });
		assert.ok(conLista.length - buildPromptLibre(ficha).length < 1500);
	});

	/** Una zona a medias no se manda: media línea es peor que ninguna. */
	test('las zonas incompletas se descartan', () => {
		const prompt = buildPromptLibre({ ...ficha, textos: [{ original: 'HOLA' }, { replacement: 'CHAU' }] });
		assert.doesNotMatch(prompt, /THE TEXT IS ALREADY WRITTEN/);
	});

	test('sin lista el prompt queda como estaba', () => {
		assert.doesNotMatch(buildPromptLibre(ficha), /THE TEXT IS ALREADY WRITTEN/);
	});
});
