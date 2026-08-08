import assert from 'node:assert/strict';
import { beforeEach, describe, test, vi } from 'vitest';
import { createFakeSupabase, PNG_BYTES } from './helpers/fake-supabase';

/**
 * Borrar una imagen tiene que borrarla de verdad.
 *
 * Antes el navegador pedía el borrado directo contra la tabla, pero
 * `creative_generations` tiene RLS y su única política es de lectura: la
 * operación no alcanzaba ninguna fila y PostgREST no considera eso un error.
 * El código miraba `error`, lo veía vacío y avisaba "imagen eliminada
 * correctamente"; el sondeo del historial las devolvía a los pocos segundos y
 * las imágenes reaparecían solas. Ahora lo hace el servidor y contesta qué
 * borró realmente.
 */

const DUENIO = { id: '11111111-1111-4111-8111-111111111111', email: 'duenio@example.com' };
const AJENO = { id: '22222222-2222-4222-8222-222222222222', email: 'ajeno@example.com' };

let fake = createFakeSupabase();
let authUser: { id: string; email: string } | null = DUENIO;

vi.mock('../src/lib/creattia/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/server')>();
	return {
		...actual,
		getAdminClient: () => fake.client as any,
		authenticateRequest: async () => (authUser
			? { user: authUser, token: 'token-de-prueba' }
			: { user: null, token: null, error: 'Sesión requerida.' }),
	};
});

const { DELETE } = await import('../src/pages/api/creativos/generations');

function pedido(ids: unknown) {
	return {
		request: new Request('https://creattia.app/api/creativos/generations', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json', authorization: 'Bearer token-de-prueba' },
			body: JSON.stringify({ ids }),
		}),
	} as any;
}

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_AJENO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
	authUser = DUENIO;
	fake = createFakeSupabase({
		tables: {
			creative_generations: [
				{ id: ID_A, user_id: DUENIO.id, status: 'completed', output_path: `${DUENIO.id}/a.png` },
				{ id: ID_B, user_id: DUENIO.id, status: 'completed', output_path: `${DUENIO.id}/b.png` },
				{ id: ID_AJENO, user_id: AJENO.id, status: 'completed', output_path: `${AJENO.id}/c.png` },
			],
		},
		storage: {
			[`creative-assets/${DUENIO.id}/a.png`]: PNG_BYTES,
			[`creative-assets/${DUENIO.id}/b.png`]: PNG_BYTES,
			[`creative-assets/${AJENO.id}/c.png`]: PNG_BYTES,
		},
	});
});

const filas = () => fake.tables.creative_generations;

describe('borrar imágenes generadas', () => {
	test('la fila desaparece de la base, no solo de la pantalla', async () => {
		const respuesta = await DELETE(pedido([ID_A]));
		const cuerpo = await respuesta.json();
		assert.equal(respuesta.status, 200);
		assert.deepEqual(cuerpo.borradas, [ID_A]);
		assert.equal(filas().find((f: any) => f.id === ID_A), undefined, 'la imagen seguía en la base');
		assert.equal(filas().length, 2);
	});

	test('el archivo también se borra, para no dejarlo ocupando lugar sin dueño', async () => {
		await DELETE(pedido([ID_A]));
		assert.equal(fake.storage[`creative-assets/${DUENIO.id}/a.png`], undefined, 'el archivo quedó huérfano');
	});

	test('no se puede borrar la imagen de otra cuenta', async () => {
		const respuesta = await DELETE(pedido([ID_AJENO]));
		const cuerpo = await respuesta.json();
		assert.deepEqual(cuerpo.borradas, [], 'no tendría que haber borrado nada');
		assert.ok(filas().some((f: any) => f.id === ID_AJENO), 'se borró la imagen de otra cuenta');
	});

	test('mezclar una propia con una ajena borra solo la propia', async () => {
		const cuerpo = await (await DELETE(pedido([ID_A, ID_AJENO]))).json();
		assert.deepEqual(cuerpo.borradas, [ID_A]);
		assert.ok(filas().some((f: any) => f.id === ID_AJENO));
	});

	test('varias a la vez', async () => {
		const cuerpo = await (await DELETE(pedido([ID_A, ID_B]))).json();
		assert.equal(cuerpo.borradas.length, 2);
		assert.equal(filas().length, 1);
	});

	test('sin sesión no se borra nada', async () => {
		authUser = null;
		const respuesta = await DELETE(pedido([ID_A]));
		assert.equal(respuesta.status, 401);
		assert.equal(filas().length, 3);
	});

	test('un identificador que no es uuid se rechaza sin tocar la base', async () => {
		const respuesta = await DELETE(pedido(['no-es-un-uuid']));
		assert.equal(respuesta.status, 400);
		assert.equal(filas().length, 3);
	});

	test('una lista vacía no borra nada', async () => {
		assert.equal((await DELETE(pedido([]))).status, 400);
		assert.equal(filas().length, 3);
	});

	test('hay un tope por llamada', async () => {
		const muchos = Array.from({ length: 201 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`);
		assert.equal((await DELETE(pedido(muchos))).status, 400);
		assert.equal(filas().length, 3);
	});
});
