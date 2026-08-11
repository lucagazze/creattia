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

	test('el idioma elegido manda sobre el de la ficha', () => {
		assert.match(buildPromptLibre({ ...ficha, idioma: 'natural Argentine Spanish' }), /written in natural Argentine Spanish/);
		assert.match(buildPromptLibre(ficha), /the language the product information above is written in/);
	});

	/** Sin ICP el anuncio lo protagoniza un modelo cualquiera y no se lo apropia nadie. */
	test('el ICP entra sin duplicar el punto final', () => {
		const prompt = buildPromptLibre({ ...ficha, icp: 'Un hombre de 30 activo.' });
		assert.match(prompt, /WHO THIS AD IS FOR: Un hombre de 30 activo\. Whoever/);
	});

	test('lo que se scrapeó del producto viaja entero', () => {
		const prompt = buildPromptLibre({ ...ficha, url: 'https://rawmenoficial.com/p', aspecto: 'Negro, tejido perforado.' });
		assert.match(prompt, /Bóxer premium de bambú/);
		assert.match(prompt, /url: https:\/\/rawmenoficial\.com\/p/);
		assert.match(prompt, /WHAT THE PRODUCT LOOKS LIKE, read off its real photos:\nNegro, tejido perforado\./);
	});
});

describe('qué fotos llegan al motor', () => {
	const fotos = [0, 1, 2].map((i) => ({ buffer: Buffer.from(`foto ${i}`), type: 'image/jpeg' }));

	/**
	 * OpenAI rechaza el pedido ENTERO —no lo degrada— si sospecha un cuerpo en
	 * ropa interior entre las imágenes de entrada, aunque el aviso a generar no
	 * muestre nada. Esas fotos sirvieron para entender el producto y ahí terminan.
	 */
	test('las fotos con una persona no viajan', () => {
		const quedan = fotosParaElMotor(fotos, { conPersona: [1] });
		assert.deepEqual(quedan.map((f) => f.buffer.toString()), ['foto 0', 'foto 2']);
	});

	/**
	 * Si TODAS tienen persona no se filtra: quedarse sin una sola foto es peor que
	 * arriesgar el filtro, porque sin ninguna el motor dibuja el producto de
	 * memoria y sale parecido en vez de igual.
	 */
	test('nunca deja al motor sin ninguna foto', () => {
		assert.equal(fotosParaElMotor(fotos, { conPersona: [0, 1, 2] }).length, 3);
	});

	test('sin personas no toca nada', () => {
		assert.equal(fotosParaElMotor(fotos, { conPersona: [] }).length, 3);
	});
});
