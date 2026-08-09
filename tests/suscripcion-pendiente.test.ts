import assert from 'node:assert/strict';
import { beforeEach, describe, test, vi } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';

/**
 * Un checkout abandonado no puede dejar la cuenta trabada.
 *
 * Le pasó al dueño: una cuenta con la suscripción en `pending` dejó de poder
 * abrir un pago. El endpoint ya cancelaba el checkout viejo antes de abrir uno
 * nuevo, pero marcaba la fila local como 'cancelled' ANTES de saber si el nuevo
 * llegaba a existir. Mercado Pago rechaza crear un segundo preapproval mientras
 * el primero siga vivo —y un preapproval que nunca se autorizó tampoco se deja
 * cancelar—, así que el primer intento moría en 502 y, con la fila ya en
 * 'cancelled', ninguno de los siguientes volvía a intentar limpiar el pendiente:
 * la cuenta quedaba con un 502 en cada clic para siempre.
 *
 * Acá se recorre ese camino y todos sus vecinos: con y sin
 * `provider_subscription_id`, con Mercado Pago aceptando o rechazando la
 * cancelación, sobre el mismo plan o sobre otro.
 */

const USER = { id: '55555555-5555-4555-8555-555555555555', email: 'pendiente@example.com' };
const TOKEN_MP = 'token-mp-de-prueba';

let fake = createFakeSupabase();
/** Cada llamada a Mercado Pago, como `MÉTODO url`. */
let llamadas: string[] = [];
/** Cómo contesta Mercado Pago en esta corrida. */
let mp = {
	/** Respuesta del PUT que cancela: 200, un código de error, o la red caída. */
	cancelar: 200 as number | 'sin-red',
	/** Respuesta del POST que crea el checkout nuevo. */
	crear: 201 as number,
	/** El preapproval que se puede leer con GET, si es que Mercado Pago lo devuelve. */
	pendiente: null as Record<string, unknown> | null,
};
let preapprovalsCreados = 0;

vi.mock('../src/lib/creattia/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/server')>();
	return {
		...actual,
		getAdminClient: () => fake.client as any,
		authenticateRequest: async () => ({ user: USER, token: 'token-de-prueba' }),
	};
});
vi.mock('../src/lib/creattia/events', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/events')>();
	return { ...actual, trackEvent: async () => {} };
});

const { POST: subscribe, DELETE: cancelar } = await import('../src/pages/api/creativos/subscribe');
const { resetMercadoPagoAccountCache } = await import('../src/lib/creattia/mercadopago');

/**
 * La tabla real tiene `unique (user_id, provider)`, así que el upsert del
 * endpoint pisa la fila que ya existe. El cliente falso no tiene índices y
 * agregaría una segunda fila: sin esto, el segundo intento de una prueba leería
 * la fila vieja y estaríamos midiendo el comportamiento del doble.
 */
function conClavePorProveedor() {
	const fromOriginal = fake.client.from.bind(fake.client);
	fake.client.from = ((tabla: string) => {
		const chain = fromOriginal(tabla);
		if (tabla !== 'creative_subscriptions') return chain;
		const upsertOriginal = chain.upsert.bind(chain);
		chain.upsert = (rows: any) => {
			const nuevas = (Array.isArray(rows) ? rows : [rows]).filter((fila: any) => {
				const previa = (fake.tables[tabla] || []).find((r: any) => r.user_id === fila.user_id && r.provider === fila.provider);
				if (!previa) return true;
				Object.assign(previa, fila);
				return false;
			});
			if (!nuevas.length) return { ...chain, then: (resolver: any) => resolver({ data: null, error: null }) } as any;
			return upsertOriginal(nuevas);
		};
		return chain;
	}) as any;
}

/** Una cuenta con la suscripción en el estado que se quiera probar. */
function conSuscripcion(suscripcion: Record<string, unknown> | null) {
	fake = createFakeSupabase({
		tables: {
			creative_profiles: [{
				user_id: USER.id,
				credits_remaining: 0,
				credits_monthly: 0,
				subscription_status: suscripcion ? suscripcion.status : 'trial',
				plan_code: suscripcion ? suscripcion.plan_code : 'trial',
			}],
			creative_subscriptions: suscripcion ? [{ user_id: USER.id, provider: 'mercado_pago', ...suscripcion }] : [],
		},
	});
	conClavePorProveedor();
}

const pendienteDePro = {
	provider_subscription_id: 'sub-abandonada',
	status: 'pending',
	plan_code: 'pro',
	monthly_credits: 40,
};

function suscripcionGuardada() {
	return fake.tables.creative_subscriptions.find((fila: any) => fila.user_id === USER.id) as any;
}
function perfil() {
	return fake.tables.creative_profiles.find((fila: any) => fila.user_id === USER.id) as any;
}

async function pedirCheckout(planCode: string, changeCurrent = false) {
	const request = new Request('https://creattia.app/api/creativos/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ planCode, billingCycle: 'monthly', changeCurrent }),
	});
	const respuesta = await subscribe({ request, url: new URL('https://creattia.app/api/creativos/subscribe') } as any);
	return { status: respuesta.status, payload: await respuesta.json() as any };
}

beforeEach(() => {
	conSuscripcion(null);
	llamadas = [];
	preapprovalsCreados = 0;
	mp = { cancelar: 200, crear: 201, pendiente: null };
	// La cuenta se consulta una sola vez por token y queda en caché en el módulo.
	resetMercadoPagoAccountCache();
	process.env.MERCADO_PAGO_ACCESS_TOKEN = TOKEN_MP;
	(import.meta as any).env.MERCADO_PAGO_ACCESS_TOKEN = TOKEN_MP;

	vi.stubGlobal('fetch', async (input: any, init: any) => {
		const url = String(input?.url || input);
		const metodo = String(init?.method || 'GET');
		llamadas.push(`${metodo} ${url}`);
		const responder = (cuerpo: unknown, status: number) =>
			new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

		// Ecuador liquida en dólares: así la prueba no necesita tipo de cambio.
		if (url.includes('/users/me')) {
			return responder({ site_id: 'MEC', email: 'cobros@creattia.test', nickname: 'creattia' }, 200);
		}
		if (url.includes('/preapproval/')) {
			if (metodo === 'GET') {
				return mp.pendiente ? responder(mp.pendiente, 200) : responder({ message: 'Not found' }, 404);
			}
			if (mp.cancelar === 'sin-red') throw new Error('se cayó la red contra Mercado Pago');
			// El 400 real cuando el preapproval nunca se autorizó.
			return responder({ message: 'Invalid preapproval status param' }, mp.cancelar);
		}
		if (url.endsWith('/preapproval')) {
			preapprovalsCreados += 1;
			if (mp.crear >= 400) {
				return responder({ message: 'The payer already has a subscription for this plan' }, mp.crear);
			}
			return responder({ id: `sub-nueva-${preapprovalsCreados}`, init_point: `https://mp.test/pagar/${preapprovalsCreados}` }, 201);
		}
		throw new Error(`Mercado Pago no simulado: ${metodo} ${url}`);
	});
});

describe('volver a pagar con un checkout pendiente', () => {
	test('el pendiente se cancela y se abre un checkout nuevo', async () => {
		conSuscripcion(pendienteDePro);

		const { status, payload } = await pedirCheckout('pro', true);

		assert.equal(status, 200);
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/1');
		assert.ok(llamadas.includes(`PUT https://api.mercadopago.com/preapproval/sub-abandonada`), 'no se intentó limpiar el checkout viejo');
		assert.equal(suscripcionGuardada().provider_subscription_id, 'sub-nueva-1');
		assert.equal(suscripcionGuardada().status, 'pending');
	});

	test('si Mercado Pago no deja cancelar el pendiente, se abre uno nuevo igual', async () => {
		// El caso más común: un preapproval que nunca se autorizó no se puede
		// cancelar. No cobró nada, así que no puede impedir intentar de nuevo.
		conSuscripcion(pendienteDePro);
		mp.cancelar = 400;

		const { status, payload } = await pedirCheckout('pro', true);

		assert.equal(status, 200, 'un pendiente que no se puede cancelar dejó a la cuenta sin poder pagar');
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/1');
	});

	test('si se cae la red al cancelar, tampoco se corta el pago', async () => {
		conSuscripcion(pendienteDePro);
		mp.cancelar = 'sin-red';

		const { status, payload } = await pedirCheckout('pro', true);

		assert.equal(status, 200);
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/1');
	});

	test('un pendiente sin id de Mercado Pago no intenta cancelar nada y abre el checkout', async () => {
		// Pasa cuando el checkout se cortó antes de que la fila guardara el id.
		conSuscripcion({ ...pendienteDePro, provider_subscription_id: null });

		const { status, payload } = await pedirCheckout('pro', true);

		assert.equal(status, 200);
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/1');
		assert.equal(llamadas.some((llamada) => llamada.startsWith('PUT')), false, 'se intentó cancelar una suscripción que no existe');
	});

	test('con un pendiente encima se puede elegir otro plan', async () => {
		conSuscripcion(pendienteDePro);

		const { status, payload } = await pedirCheckout('scale');

		assert.equal(status, 200);
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/1');
		assert.equal(suscripcionGuardada().plan_code, 'scale');
		assert.equal(perfil().plan_code, 'scale');
	});

	test('tocar el mismo plan que quedó pendiente no contesta "ese ya es tu plan actual"', async () => {
		// Un checkout abierto y sin pagar no es un plan vigente. Cuando se trataban
		// igual, volver a tocar el plan que dejaste a medias devolvía 409 y Mercado
		// Pago no abría nunca más.
		conSuscripcion(pendienteDePro);

		const { status, payload } = await pedirCheckout('pro');

		assert.equal(status, 200);
		assert.notEqual(payload.code, 'SAME_PLAN');
	});
});

describe('cuando Mercado Pago tampoco deja abrir el checkout nuevo', () => {
	test('se devuelve el checkout abandonado, que sigue sirviendo para pagar', async () => {
		/**
		 * Las dos puertas cerradas a la vez: no se puede cancelar el pendiente
		 * porque nunca se autorizó, y no se puede crear otro porque el pendiente
		 * sigue vivo. El pago que la persona empezó no cobró nada y su enlace
		 * sigue siendo válido: es la única salida que no la deja a pie.
		 */
		conSuscripcion(pendienteDePro);
		mp.cancelar = 400;
		mp.crear = 400;
		mp.pendiente = {
			id: 'sub-abandonada',
			status: 'pending',
			external_reference: `${USER.id}:pro:monthly`,
			init_point: 'https://mp.test/pagar/abandonada',
		};

		const { status, payload } = await pedirCheckout('pro', true);

		assert.equal(status, 200, 'la cuenta quedó sin ninguna forma de pagar');
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar/abandonada');
		assert.equal(suscripcionGuardada().provider_subscription_id, 'sub-abandonada');
		assert.equal(suscripcionGuardada().status, 'pending');
	});

	test('no se manda a pagar un plan que la persona no eligió', async () => {
		// El pendiente es de Pro y ahora pidió Scale: reutilizar ese enlace sería
		// cobrarle otro plan. Ahí sí corresponde el error.
		conSuscripcion(pendienteDePro);
		mp.cancelar = 400;
		mp.crear = 400;
		mp.pendiente = {
			id: 'sub-abandonada',
			status: 'pending',
			external_reference: `${USER.id}:pro:monthly`,
			init_point: 'https://mp.test/pagar/abandonada',
		};

		const { status, payload } = await pedirCheckout('scale');

		assert.equal(status, 502);
		assert.notEqual(payload.checkoutUrl, 'https://mp.test/pagar/abandonada');
	});

	test('el intento fallido no deja la cuenta trabada: el siguiente vuelve a limpiar el pendiente', async () => {
		/**
		 * La regresión exacta que trababa la cuenta.
		 *
		 * La fila se marcaba 'cancelled' antes de que existiera el checkout nuevo.
		 * Cuando Mercado Pago rechazaba crearlo, el intento siguiente ya no veía un
		 * pendiente, no volvía a mandar la cancelación y chocaba contra el mismo
		 * rechazo: 502 en cada clic, para siempre.
		 */
		conSuscripcion(pendienteDePro);
		mp.cancelar = 400;
		mp.crear = 400;
		mp.pendiente = null; // ni siquiera se puede leer el pendiente para reutilizarlo

		const primero = await pedirCheckout('pro', true);
		assert.equal(primero.status, 502);
		assert.equal(suscripcionGuardada().status, 'pending', 'se perdió el rastro del pendiente que hay que limpiar');
		assert.equal(suscripcionGuardada().provider_subscription_id, 'sub-abandonada');

		// Mercado Pago se destraba (el pendiente venció y ahora sí se puede cancelar).
		llamadas = [];
		mp.cancelar = 200;
		mp.crear = 201;
		const segundo = await pedirCheckout('pro', true);

		assert.equal(segundo.status, 200);
		assert.ok(
			llamadas.includes('PUT https://api.mercadopago.com/preapproval/sub-abandonada'),
			'el reintento no volvió a limpiar el checkout viejo: la cuenta seguiría trabada',
		);
		assert.match(suscripcionGuardada().provider_subscription_id, /^sub-nueva-/, 'la fila quedó apuntando al checkout viejo');
	});
});

describe('cancelar desde la pantalla', () => {
	async function pedirBaja() {
		const request = new Request('https://creattia.app/api/creativos/subscribe', { method: 'DELETE' });
		const respuesta = await cancelar({ request, url: new URL('https://creattia.app/api/creativos/subscribe') } as any);
		return { status: respuesta.status, payload: await respuesta.json() as any };
	}

	test('un pendiente que Mercado Pago no deja cancelar igual se da de baja acá', async () => {
		// Nunca hubo un cobro: dejarlo pegado a la cuenta era condenarla a mostrar
		// "pago pendiente" para siempre, sin forma de sacárselo de encima.
		conSuscripcion(pendienteDePro);
		mp.cancelar = 400;

		const { status } = await pedirBaja();

		assert.equal(status, 200);
		assert.equal(suscripcionGuardada().status, 'cancelled');
		assert.equal(perfil().subscription_status, 'cancelled');
	});

	test('una suscripción autorizada que Mercado Pago no cancela NO se marca de baja', async () => {
		// Acá el cobro es real: darla de baja de nuestro lado sin que Mercado Pago
		// la corte es seguir cobrándole a alguien que cree que ya canceló.
		conSuscripcion({ ...pendienteDePro, status: 'authorized' });
		mp.cancelar = 400;

		const { status } = await pedirBaja();

		assert.equal(status, 502);
		assert.equal(suscripcionGuardada().status, 'authorized');
	});
});
