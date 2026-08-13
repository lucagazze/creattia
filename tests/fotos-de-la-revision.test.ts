import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { alcanceDesde, subjectModeDesde } from '../src/lib/creattia/generation-pipeline';

/**
 * Qué fotos del producto viajan al motor, decidido en la revisión.
 *
 * Antes viajaban siempre todas las que había traído el escaneo y no se veían
 * hasta que salía la imagen: una captura con marca de agua, una foto de la caja
 * o la misma prenda de espaldas terminaban adentro del aviso sin que nadie las
 * hubiera elegido. Ahora se ven todas y se marcan; sacarlas todas es una
 * respuesta válida —ahí el aviso lo dibuja la IA— y se puede subir una propia.
 *
 * Misma regla que aplica generate.ts al armar `productInputPlan`: se replica acá
 * para poder probarla sin base de datos ni storage.
 */
function fotosQueViajan(guardadas: string[], elegidas: string[] | null): string[] {
	return elegidas ? guardadas.filter((path) => elegidas.includes(path)) : guardadas;
}

const guardadas = [
	'user-1/products/p1/primary.webp',
	'user-1/products/p1/extra-1.webp',
	'user-1/products/p1/extra-2.webp',
];

describe('las fotos elegidas en la revisión', () => {
	test('sin elegir nada viajan todas, como siempre', () => {
		assert.deepEqual(fotosQueViajan(guardadas, null), guardadas);
	});

	test('elegir algunas deja afuera al resto', () => {
		const elegidas = [guardadas[0], guardadas[2]];
		assert.deepEqual(fotosQueViajan(guardadas, elegidas), elegidas);
	});

	/**
	 * La lista vacía es una decisión, no un descuido: hay que poder distinguirla
	 * de "no elegí nada". Si se colapsaran las dos en el mismo caso, pedir un
	 * aviso sin fotos devolvería el aviso con las ocho fotos de la tienda.
	 */
	test('elegir ninguna no manda ninguna', () => {
		assert.deepEqual(fotosQueViajan(guardadas, []), []);
	});

	test('sin ninguna foto el anuncio pasa a hablar del negocio', () => {
		const viajan = fotosQueViajan(guardadas, []);
		const degradado = subjectModeDesde(alcanceDesde('product'), viajan.length > 0);
		assert.equal(degradado, 'service');
		assert.equal(subjectModeDesde(alcanceDesde('catalog'), viajan.length > 0), 'brand');
	});

	test('la foto propia recién subida viaja como cualquier otra', () => {
		const propia = 'user-1/products/p1/extra-1770000000000-3.webp';
		const conLaPropia = [...guardadas, propia];
		// "Cambiar" reemplaza: de ese producto queda marcada la subida y nada más.
		assert.deepEqual(fotosQueViajan(conLaPropia, [propia]), [propia]);
	});

	test('una ruta que ya no existe no rompe ni arrastra fotos de más', () => {
		assert.deepEqual(fotosQueViajan(guardadas, ['user-1/products/borrado/x.webp']), []);
	});
});
