import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { generacionDesdeFila, groupCarouselHistory } from '../src/components/creattia/history-utils';

/**
 * Una fila del historial tiene que nacer igual venga por donde venga.
 *
 * El mapeo de fila a tarjeta estaba escrito tres veces a mano —la carga inicial,
 * el polling global y el polling del lote— y las copias se separaron. Los dos
 * síntomas que se vieron usando la app:
 *
 * · Un carrusel recién generado aparecía partido en tarjetas sueltas hasta
 *   recargar la página, porque los pollings no leían `batch_id` ni `variant_key`
 *   y sin esos dos campos no hay con qué agrupar.
 * · Al abrir una imagen recién hecha, la vista grande se quedaba con la
 *   miniatura y la descarga bajaba la miniatura: ningún polling guardaba
 *   `output_path`, que es lo único con lo que se puede volver a firmar el
 *   archivo original.
 */

const filaDeCarrusel = (indice: number) => ({
	id: `gen-${indice}`,
	title: 'Departamento en Abasto',
	output_path: `usuario/carrusel-${indice}.png`,
	format: '4:5',
	created_at: '2026-08-09T12:00:00.000Z',
	template_id: 40,
	batch_id: 'lote-abc',
	output_index: indice,
	variant_key: 'carrusel',
	status: 'completed',
	settings_snapshot: { referencePath: 'ganadores/inmo.png', referenceName: 'Inmo ganador' },
});

describe('una fila se lee siempre igual', () => {
	test('conserva la ruta del archivo, que es lo que permite volver a firmarlo', () => {
		const generacion = generacionDesdeFila(filaDeCarrusel(1), { imageUrl: 'https://firmada/1' });
		assert.equal(generacion.outputPath, 'usuario/carrusel-1.png');
		assert.equal(generacion.imageUrl, 'https://firmada/1');
	});

	test('conserva lo que identifica a una página dentro de su carrusel', () => {
		const generacion = generacionDesdeFila(filaDeCarrusel(3));
		assert.equal(generacion.batchId, 'lote-abc');
		assert.equal(generacion.outputIndex, 3);
		assert.equal(generacion.preset, 'carrusel');
	});

	test('una imagen suelta es su propio grupo y no se mezcla con otra', () => {
		// Con `batchId` vacío, dos sueltas compartirían clave y se verían como un
		// carrusel de dos páginas que nadie generó.
		const a = generacionDesdeFila({ id: 'a', status: 'completed' });
		const b = generacionDesdeFila({ id: 'b', status: 'completed' });
		assert.equal(a.batchId, 'a');
		assert.equal(b.batchId, 'b');
	});
});

describe('las páginas vuelven a juntarse en una tarjeta', () => {
	test('cuatro páginas del mismo lote son un solo carrusel, en orden', () => {
		const historial = [3, 1, 4, 2].map((indice) => generacionDesdeFila(filaDeCarrusel(indice), { imageUrl: `u${indice}` }));
		const grupos = groupCarouselHistory(historial);
		assert.equal(grupos.length, 1);
		assert.equal(grupos[0].slides?.length, 4);
		assert.deepEqual(grupos[0].slides?.map((s) => s.outputIndex), [1, 2, 3, 4]);
	});

	test('sin el dato del lote se rompía en cuatro tarjetas', () => {
		// La regresión exacta: así se veía un carrusel recién generado cuando el
		// polling no leía `batch_id` ni `variant_key`.
		const sinLote = [1, 2, 3, 4].map((indice) => {
			const { batch_id, variant_key, ...resto } = filaDeCarrusel(indice);
			return generacionDesdeFila(resto);
		});
		assert.equal(groupCarouselHistory(sinLote).length, 4);
	});
});
