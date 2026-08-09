import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, test, vi } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';

/**
 * El alta de la cuenta: que se cuente una vez, y una sola.
 *
 * El embudo saltaba de "abrió la app" a "pagó", así que lo único que Meta podía
 * usar para optimizar era Purchase. Con un token de regalo, las compras de la
 * primera semana no llegan a las cincuenta semanales que un conjunto de anuncios
 * necesita para salir de aprendizaje; el registro sí. Por eso se agregó.
 *
 * El riesgo de esto no es que falte el evento —eso se ve enseguida— sino que
 * sobre: el navegador avisa que está abierto en cada carga y en cada login, y un
 * CompleteRegistration por visita no da ningún error. Meta lo recibe, lo cuenta
 * como bueno, y los anuncios terminan aprendiendo a buscar gente que ya está
 * registrada y vuelve a entrar. Se ejercita el endpoint de verdad, con la base
 * simulada, porque la garantía de "una sola vez" vive ahí y no en el código.
 */

const NUEVO = {
	id: '11111111-1111-4111-8111-111111111111',
	email: 'recien.llegado@example.com',
	// Una cuenta creada ahora: siempre posterior al corte desde el que se mide.
	created_at: new Date().toISOString(),
};
const OTRO_NUEVO = {
	id: '22222222-2222-4222-8222-222222222222',
	email: 'otra.persona@example.com',
	created_at: new Date().toISOString(),
};
/** Alguien que ya usaba la app cuando el evento no existía. */
const VIEJO = {
	id: '33333333-3333-4333-8333-333333333333',
	email: 'de.siempre@example.com',
	created_at: '2026-06-01T10:00:00Z',
};

let fake = createFakeSupabase();
let authUser: { id: string; email: string; created_at: string } = NUEVO;
/** Lo que salió hacia Meta, con nombre interno y datos de emparejamiento. */
let aMeta: Array<{ event: string; userId: unknown; compra: Record<string, unknown> }> = [];

vi.mock('../src/lib/creattia/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/server')>();
	return {
		...actual,
		getAdminClient: () => fake.client as any,
		authenticateRequest: async () => ({ user: authUser, token: 'token-de-prueba' }),
	};
});

// El pedido HTTP a Meta se intercepta: lo que importa es qué se reporta y a
// nombre de quién, no que salga el fetch.
vi.mock('../src/lib/creattia/meta-capi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/meta-capi')>();
	return {
		...actual,
		sendMetaEvent: async (event: string, userId: unknown, _props = {}, compra = {}) => {
			aMeta.push({ event, userId, compra: compra as Record<string, unknown> });
		},
	};
});

const { POST: track } = await import('../src/pages/api/creativos/track');

/**
 * El limitador tal como corre en Postgres: cuenta lo usado en la ventana y, si
 * hay lugar, deja su marca en la misma operación. Esa indivisibilidad —en la
 * base la da un advisory lock— es justamente lo que se está probando cuando
 * llegan dos avisos juntos, así que la copia tiene que leer e insertar sin
 * ceder el control en el medio.
 */
function candadoDePostgres(args: Record<string, any>) {
	const filas = fake.tables.rate_limit_events;
	const desde = Date.now() - Math.max(Number(args.p_window_seconds), 1) * 1000;
	const usados = filas.filter((fila: any) => fila.user_id === args.p_user_id
		&& fila.event_key === args.p_event_key
		&& Date.parse(fila.created_at) >= desde).length;
	if (usados >= Math.max(Number(args.p_max_count), 0)) return { data: false };
	filas.push({ user_id: args.p_user_id, event_key: args.p_event_key, created_at: new Date().toISOString() });
	return { data: true };
}

function setup({ conCandado = true } = {}) {
	fake = createFakeSupabase({
		tables: { creative_events: [], rate_limit_events: [] },
		rpc: conCandado ? { check_rate_limit: candadoDePostgres } : {},
	});
}

function ingresar(evento = 'app_abierta') {
	return track({
		request: new Request('https://creattia.app/api/creativos/track', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (prueba)' },
			body: JSON.stringify({ event: evento }),
		}),
	} as any);
}

function anotados(evento: string, usuario?: string) {
	return fake.tables.creative_events.filter((fila: any) => fila.event === evento
		&& (!usuario || fila.user_id === usuario));
}

beforeEach(() => {
	setup();
	aMeta = [];
	authUser = NUEVO;
});

describe('el alta de la cuenta', () => {
	test('la primera vez que alguien entra queda anotada', async () => {
		const respuesta = await ingresar();

		assert.equal(respuesta.status, 200);
		assert.equal(anotados('cuenta_creada').length, 1, 'el registro no se anotó');
		assert.equal(anotados('cuenta_creada')[0].user_id, NUEVO.id);
		// Y sale hacia Meta, que es para lo que existe el evento.
		assert.ok(aMeta.some((salida) => salida.event === 'cuenta_creada'), 'el registro no salió hacia Meta');
	});

	test('el registro viaja con el mail para que Meta pueda emparejarlo', async () => {
		await ingresar();

		const registro = aMeta.find((salida) => salida.event === 'cuenta_creada');
		// Sin nada con qué emparejar, Meta recibe el alta pero no la atribuye a
		// ninguna campaña: se paga la conversión y no aparece en el panel.
		assert.equal(registro?.compra.email, NUEVO.email);
	});

	test('volver a entrar NO lo vuelve a anotar', async () => {
		// Tres ingresos: la carga inicial, una recarga de la pantalla y un login
		// posterior. Para el navegador los tres son idénticos.
		await ingresar();
		await ingresar('planes_vistos');
		await ingresar();

		assert.equal(anotados('cuenta_creada').length, 1, 'se contó un alta por visita');
		assert.equal(aMeta.filter((salida) => salida.event === 'cuenta_creada').length, 1);
		// El resto del embudo sí se sigue anotando en cada aviso.
		assert.equal(anotados('app_abierta').length, 2);
	});

	test('dos avisos simultáneos del mismo usuario anotan un solo registro', async () => {
		/**
		 * Pasa de verdad: "abrí la app" y "miré los planes" salen casi juntos
		 * cuando alguien llega con `?plan=` en la URL, y en desarrollo React monta
		 * el componente dos veces. Sin el candado atómico las dos llamadas leen que
		 * no hay nada anotado antes de que ninguna escriba, y anotan las dos.
		 */
		await Promise.all([ingresar(), ingresar('planes_vistos')]);

		assert.equal(anotados('cuenta_creada').length, 1, 'una carrera duplicó el alta');
	});

	test('cada cuenta tiene su propio registro', async () => {
		await ingresar();
		authUser = OTRO_NUEVO;
		await ingresar();

		assert.equal(anotados('cuenta_creada', NUEVO.id).length, 1);
		assert.equal(anotados('cuenta_creada', OTRO_NUEVO.id).length, 1, 'el alta de uno tapó la del siguiente');
	});

	test('vuelve al día siguiente, con el candado ya vencido, y sigue habiendo un solo registro', async () => {
		/**
		 * El caso que hace que el candado no alcance como garantía. La función del
		 * limitador limpia `rate_limit_events` por fecha y sin filtrar por usuario
		 * ni por evento, así que la marca del registro se la lleva puesta cualquier
		 * otra llamada con una ventana corta a las pocas horas. Quien vuelve al otro
		 * día encuentra el candado libre: lo único que lo frena es lo ya anotado.
		 */
		await ingresar();
		fake.tables.rate_limit_events.length = 0;

		await ingresar();

		assert.equal(anotados('cuenta_creada').length, 1, 'con el candado vencido se anotó un alta de más');
	});

	test('si el candado de la base no está, la tabla de eventos evita el duplicado', async () => {
		/**
		 * El limitador deja pasar a propósito cuando no puede contar —una migración
		 * sin aplicar no puede dejar la app sin funcionar—, así que apoyarse solo en
		 * él sería contar un alta por carga en cuanto falte la función. Lo anotado
		 * es la prueba que sobrevive a todo.
		 */
		setup({ conCandado: false });

		await ingresar();
		await ingresar();

		assert.equal(anotados('cuenta_creada').length, 1, 'sin candado se duplicó el alta');
	});

	test('una cuenta que ya existía antes del corte no se reporta como alta nueva', async () => {
		/**
		 * El día del despliegue todos los usuarios de siempre vuelven a entrar. Si
		 * cada uno saliera como CompleteRegistration, Meta recibiría de golpe
		 * cientos de altas que pasaron meses atrás y se las atribuiría a las
		 * campañas que estén corriendo esa semana.
		 */
		authUser = VIEJO;

		await ingresar();

		assert.equal(anotados('cuenta_creada').length, 0, 'se inventó un alta vieja');
		assert.equal(anotados('app_abierta').length, 1, 'el resto del embudo tiene que seguir andando');
	});

	test('si la base rechaza la anotación, el alta tampoco se reporta', async () => {
		/**
		 * El cliente de Supabase no lanza cuando la escritura falla: devuelve el
		 * error dentro de la respuesta. Reportando primero y anotando después, una
		 * tabla sin migrar hacía que Meta recibiera el CompleteRegistration y la
		 * prueba nunca quedara, así que la misma persona volvía a salir como alta
		 * nueva en cada visita, para siempre. Sin constancia no se avisa.
		 */
		const originalFrom = fake.client.from.bind(fake.client);
		fake.client.from = ((nombre: string) => {
			const cadena = originalFrom(nombre);
			if (nombre !== 'creative_events') return cadena;
			return new Proxy(cadena, {
				get(objetivo: any, propiedad: string | symbol) {
					if (propiedad === 'insert') return () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } });
					const valor = objetivo[propiedad];
					return typeof valor === 'function' ? valor.bind(objetivo) : valor;
				},
			});
		}) as any;

		await ingresar();

		assert.equal(
			aMeta.filter((salida) => salida.event === 'cuenta_creada').length,
			0,
			'se reportó un alta que no quedó anotada en ningún lado',
		);
	});

	test('el navegador no puede declarar su propia alta', async () => {
		// Es una conversión de las que Meta usa para optimizar: aceptarla por la
		// puerta del cliente sería regalársela a cualquiera que repita un POST.
		const respuesta = await ingresar('cuenta_creada');

		assert.equal(respuesta.status, 400);
		assert.equal(anotados('cuenta_creada').length, 0);
	});
});

describe('el registro en el embudo de Meta', () => {
	test('está mapeado al evento estándar CompleteRegistration', async () => {
		const capi = await readFile(new URL('../src/lib/creattia/meta-capi.ts', import.meta.url), 'utf8');
		assert.match(
			capi,
			/cuenta_creada:\s*'CompleteRegistration'/,
			'sin evento estándar Meta no lo puede usar para optimizar: queda como evento propio y solo sirve para armar públicos',
		);
	});
});
