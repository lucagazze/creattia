import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { cifrasSinRespaldo, textoVerificado } from '../src/lib/creattia/claims';
import { quitarCifras } from '../src/lib/creattia/ad-analysis';

/**
 * Una cifra inventada es el defecto más caro que puede tener un creativo.
 *
 * Clonando un anuncio de Intercom que decía "resolvé el 50% de las consultas", el
 * análisis devolvió "INCREMENTÁ 50% TU FACTURACIÓN EN SOLO 90 DÍAS" para una
 * agencia de Meta Ads. Ninguno de los dos números existía en los datos de esa
 * agencia: el mecanismo de persuasión del ganador ES el número, y al adaptar el
 * mensaje se arrastró. El prompt ya lo prohibía en dos lugares y pasó igual.
 *
 * Por eso esto se chequea con código: lo que sale es una promesa comercial
 * impresa dentro de una imagen que alguien va a publicar con su marca.
 */
describe('cifras sin respaldo', () => {
	const verificado = textoVerificado({
		productFacts: 'Cuero curtido vegetal de 7-8oz, 3mm de espesor. Envíos a todo el país.',
		productNames: ['Montana Sides 7-8oz'],
		brandName: 'The Skirting Factory',
	});

	test('detecta el porcentaje que nadie verificó', () => {
		const cifras = cifrasSinRespaldo('INCREMENTÁ 50% TU FACTURACIÓN', verificado);
		assert.deepEqual(cifras.map((cifra) => cifra.texto), ['50%']);
	});

	test('detecta el plazo prometido', () => {
		const cifras = cifrasSinRespaldo('Resultados en solo 90 días.', verificado);
		assert.deepEqual(cifras.map((cifra) => cifra.texto), ['90 días']);
	});

	test('detecta precios y multiplicadores', () => {
		assert.ok(cifrasSinRespaldo('Desde $12.450', verificado).length);
		assert.ok(cifrasSinRespaldo('Vendé 5x más', verificado).length);
		assert.ok(cifrasSinRespaldo('4,8 estrellas', verificado).length);
		assert.ok(cifrasSinRespaldo('+10.000 clientes', verificado).length);
	});

	/**
	 * El límite conocido: se compara el número, no lo que significa.
	 *
	 * Si la página dice "3mm de espesor", un "3x más ventas" pasa. Es el precio de
	 * no tener falsos positivos: entender la unidad requeriría interpretar la
	 * frase, y equivocarse ahí borraría datos reales del producto. Un número que
	 * al menos figura en la página es un riesgo bastante menor que uno que no.
	 */
	test('un número que figura en la página se considera respaldado aunque cambie la unidad', () => {
		assert.deepEqual(cifrasSinRespaldo('Vendé 3x más', verificado), []);
	});

	/**
	 * Lo que NO puede tocar: un número que sí está en la página del usuario, y
	 * los números que son identidad del producto. Marcar "7-8oz" o "PS5" como una
	 * promesa rompería el nombre real de lo que se vende.
	 */
	test('un dato que sí está verificado pasa', () => {
		assert.deepEqual(cifrasSinRespaldo('Cuero de 3mm de espesor', verificado), []);
		assert.deepEqual(cifrasSinRespaldo('Montana Sides 7-8oz', verificado), []);
	});

	test('no persigue dígitos que no son una promesa', () => {
		assert.deepEqual(cifrasSinRespaldo('PlayStation 5 Slim', verificado), []);
		assert.deepEqual(cifrasSinRespaldo('Talle 42', verificado), []);
		assert.deepEqual(cifrasSinRespaldo('Always Pan 2.0', verificado), []);
	});

	test('el mismo número escrito distinto se reconoce igual', () => {
		// La página dice "1.200" y el anuncio "$1200": es el mismo número.
		const conPrecio = textoVerificado({ productFacts: 'Precio de lista: 1.200 pesos.' });
		assert.deepEqual(cifrasSinRespaldo('Llevalo por $1200', conPrecio), []);
	});

	test('un texto sin cifras no cuesta nada', () => {
		assert.deepEqual(cifrasSinRespaldo('Cuero curtido como se hacía antes', verificado), []);
		assert.deepEqual(cifrasSinRespaldo('', verificado), []);
		assert.deepEqual(cifrasSinRespaldo(undefined, verificado), []);
	});

	test('encuentra varias en la misma frase', () => {
		const cifras = cifrasSinRespaldo('INCREMENTÁ 50% TU FACTURACIÓN EN SOLO 90 DÍAS', verificado);
		assert.equal(cifras.length, 2);
	});

	/** Los patrones son globales: si no se reinicia lastIndex se saltean casos. */
	test('llamadas seguidas no se pisan entre sí', () => {
		for (let intento = 0; intento < 3; intento += 1) {
			assert.equal(cifrasSinRespaldo('Subí 50% tus ventas', verificado).length, 1, `intento ${intento}`);
		}
	});
});

/**
 * El recorte es el último recurso: solo corre si la reescritura falla. Queda una
 * frase más floja, y entre eso y un porcentaje inventado, la frase floja no le
 * genera un problema a nadie.
 */
describe('recorte de la cifra cuando no se puede reescribir', () => {
	const verificado = textoVerificado({ productFacts: 'Agencia de Meta Ads.' });

	test('saca la cifra y el conector que quedaba colgando', () => {
		const texto = 'INCREMENTÁ TU FACTURACIÓN EN SOLO 90 DÍAS.';
		const limpio = quitarCifras(texto, cifrasSinRespaldo(texto, verificado));
		assert.equal(limpio, 'INCREMENTÁ TU FACTURACIÓN.');
	});

	test('no deja espacios dobles ni puntuación suelta', () => {
		const texto = 'Vendé 3x más, con 50% menos de esfuerzo.';
		const limpio = quitarCifras(texto, cifrasSinRespaldo(texto, verificado));
		assert.doesNotMatch(limpio, /\s{2,}/);
		assert.doesNotMatch(limpio, /\s[.,]/);
		assert.doesNotMatch(limpio, /\d/);
	});
});
