import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, test, vi } from 'vitest';
import { aplicarClavesPrimarias, createFakeSupabase, type FakeSupabaseOptions } from './helpers/fake-supabase';

/**
 * El circuito del dinero, de punta a punta.
 *
 * Se ejercitan los endpoints de verdad —abrir el checkout, y el webhook que
 * acredita— con Mercado Pago simulado. Lo que se comprueba es lo que le cuesta
 * plata a alguien si se rompe:
 *
 *  · que un cobro confirmado acredite los créditos exactos del plan;
 *  · que un webhook repetido NO acredite dos veces;
 *  · que un pago rechazado no acredite nada;
 *  · que cada movimiento de plata quede reportado como evento (y por lo tanto
 *    llegue al píxel de Meta), que era justamente lo que faltaba: la suscripción
 *    —el ingreso principal— no reportaba nada y la compra de créditos no
 *    reportaba la apertura del checkout.
 */

const USER = { id: '33333333-3333-4333-8333-333333333333', email: 'pagador@example.com' };
const SECRETO = 'secreto-de-prueba';
const TOKEN_MP = 'token-mp-de-prueba';

let fake = createFakeSupabase();
let authUser: { id: string; email: string } | null = USER;
/** Todo lo que se reportó como evento durante la prueba. */
let eventos: Array<{ event: string; userId: string | null; props: Record<string, unknown>; compra: Record<string, unknown> }> = [];
/** Respuestas simuladas de la API de Mercado Pago, por fragmento de URL. */
let respuestasMP: Array<{ contiene: string; body: unknown; ok?: boolean }> = [];

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

// El envío a Meta se intercepta acá: lo que importa es QUÉ se reporta y con qué
// importe, no que salga el pedido HTTP.
vi.mock('../src/lib/creattia/events', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/events')>();
	return {
		...actual,
		trackEvent: async (_admin: unknown, event: string, userId: string | null, props = {}, compra = {}) => {
			eventos.push({ event, userId, props, compra });
		},
	};
});

const { GET: opcionesDeCompra, POST: buyCredits } = await import('../src/pages/api/creativos/buy-credits');
const { POST: webhook } = await import('../src/pages/api/creativos/webhook/mercadopago');

const perfilGratis = {
	user_id: USER.id, credits_remaining: 0, credits_monthly: 0,
	subscription_status: 'trial', plan_code: 'trial', subscription_period_end: null,
};

function setup(overrides: FakeSupabaseOptions = {}) {
	fake = createFakeSupabase({
		tables: {
			creative_profiles: [{ ...perfilGratis }],
			creative_subscriptions: [],
			creative_credit_purchases: [],
			creative_subscription_payments: [],
			creative_subscription_refills: [],
			...overrides.tables,
		},
		rpc: {
			add_purchased_credits: ({ p_user_id, p_amount }) => {
				const perfil = fake.tables.creative_profiles.find((row: any) => row.user_id === p_user_id);
				if (perfil) {
					perfil.credits_remaining = Number(perfil.credits_remaining || 0) + Number(p_amount);
					// Lo comprado se recuerda aparte: es lo que NO caduca con el mes.
					perfil.credits_purchased = Number(perfil.credits_purchased || 0) + Number(p_amount);
				}
				return { data: perfil?.credits_remaining ?? 0 };
			},
			/**
			 * La recarga del mes, igual que en la base.
			 *
			 * Antes el endpoint escribía `credits_remaining = plan` directo en el
			 * update del perfil. Eso borraba los créditos comprados sueltos, así que
			 * ahora lo resuelve una función de Postgres y esta copia reproduce su
			 * comportamiento para poder ejercitarlo.
			 */
			apply_subscription_refill: ({ p_user_id, p_monthly }) => {
				const perfil = fake.tables.creative_profiles.find((row: any) => row.user_id === p_user_id);
				if (!perfil) return { data: -1 };
				const sobreviven = Math.min(
					Number(perfil.credits_purchased || 0),
					Math.max(Number(perfil.credits_remaining || 0), 0),
				);
				perfil.credits_remaining = Number(p_monthly) + sobreviven;
				perfil.credits_purchased = sobreviven;
				perfil.last_credit_refill_at = new Date().toISOString();
				return { data: perfil.credits_remaining };
			},
			...overrides.rpc,
		},
	});
	aplicarClavePrimaria();
}

/**
 * La idempotencia real la da la base, no el código: la clave natural del cobro
 * es la clave primaria de la tabla, así que insertar el mismo pago dos veces
 * revienta con `23505` y el endpoint lo trata como ya acreditado. Ese choque es
 * justamente la señal de "este cobro ya se pagó una vez". El mes del plan anual
 * usa el mismo mecanismo con `refill_id`.
 */
const CLAVES_PRIMARIAS = {
	creative_credit_purchases: 'payment_id',
	creative_subscription_payments: 'payment_id',
	creative_subscription_refills: 'refill_id',
};

function aplicarClavePrimaria() {
	aplicarClavesPrimarias(fake, CLAVES_PRIMARIAS);
}

function creditos() {
	return Number(fake.tables.creative_profiles.find((row: any) => row.user_id === USER.id)?.credits_remaining ?? 0);
}
function perfil() {
	return fake.tables.creative_profiles.find((row: any) => row.user_id === USER.id) as any;
}

/** Notificación firmada como la firma Mercado Pago. */
function notificacion(topic: string, dataId: string) {
	const ts = '1700000000';
	const v1 = createHmac('sha256', SECRETO).update(`id:${dataId};ts:${ts};`).digest('hex');
	return new Request(`https://creattia.app/api/creativos/webhook/mercadopago?type=${topic}&data.id=${dataId}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}` },
		body: JSON.stringify({ type: topic, data: { id: dataId } }),
	});
}

beforeEach(() => {
	setup();
	eventos = [];
	authUser = USER;
	respuestasMP = [];
	process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRETO;
	process.env.MERCADO_PAGO_ACCESS_TOKEN = TOKEN_MP;
	// `import.meta.env` de Astro se apoya en process.env en los tests.
	(import.meta as any).env.MERCADO_PAGO_WEBHOOK_SECRET = SECRETO;
	(import.meta as any).env.MERCADO_PAGO_ACCESS_TOKEN = TOKEN_MP;

	vi.stubGlobal('fetch', async (input: any) => {
		const url = String(input?.url || input);
		const respuesta = respuestasMP.find((candidata) => url.includes(candidata.contiene));
		if (!respuesta) throw new Error(`Mercado Pago no simulado para: ${url}`);
		return new Response(JSON.stringify(respuesta.body), {
			status: respuesta.ok === false ? 400 : 200,
			headers: { 'content-type': 'application/json' },
		});
	});
});

describe('compra suelta de créditos', () => {
	test('abrir el checkout devuelve el enlace y queda reportado como InitiateCheckout', async () => {
		respuestasMP = [{ contiene: 'checkout/preferences', body: { init_point: 'https://mp.test/pagar' } }];

		const respuesta = await buyCredits({ request: new Request('https://creattia.app/api/creativos/buy-credits', {
			method: 'POST', body: JSON.stringify({ quantity: 20 }), headers: { 'content-type': 'application/json' },
		}), url: new URL('https://creattia.app/api/creativos/buy-credits') } as any);
		const payload = await respuesta.json();

		assert.equal(respuesta.status, 200);
		assert.equal(payload.checkoutUrl, 'https://mp.test/pagar');
		// El agujero que había: este archivo importaba trackEvent y no lo llamaba.
		const abierto = eventos.find((evento) => evento.event === 'checkout_abierto');
		assert.ok(abierto, 'abrir el checkout de créditos no reportó nada');
		assert.equal(abierto!.props.cantidad, 20);
		assert.equal(abierto!.compra.valor, 0.49 * 20);
	});

	test('una cantidad fuera de rango no llega a Mercado Pago', async () => {
		for (const quantity of [0, -3, 1001, 12.5, 'muchos']) {
			const respuesta = await buyCredits({ request: new Request('https://creattia.app/api/creativos/buy-credits', {
				method: 'POST', body: JSON.stringify({ quantity }), headers: { 'content-type': 'application/json' },
			}), url: new URL('https://creattia.app/api/creativos/buy-credits') } as any);
			assert.equal(respuesta.status, 400, `se aceptó una cantidad inválida: ${quantity}`);
		}
	});

	/**
	 * Los tokens sueltos se venden de a 5 y arrancan en 10.
	 *
	 * La regla vive en la pantalla y en el endpoint, y la que manda es la del
	 * endpoint: el campo de cantidad está en el navegador y el pedido se puede
	 * armar a mano, así que sin esta validación el mínimo y el paso son una
	 * sugerencia y se puede seguir pagando de a un token.
	 */
	describe('mínimo de 10 tokens y de a 5', () => {
		async function comprar(quantity: unknown) {
			return buyCredits({ request: new Request('https://creattia.app/api/creativos/buy-credits', {
				method: 'POST', body: JSON.stringify({ quantity }), headers: { 'content-type': 'application/json' },
			}), url: new URL('https://creattia.app/api/creativos/buy-credits') } as any);
		}

		test('por debajo de 10 no se puede comprar', async () => {
			for (const quantity of [1, 2, 5, 9]) {
				const respuesta = await comprar(quantity);
				assert.equal(respuesta.status, 400, `se aceptaron ${quantity} tokens, por debajo del mínimo`);
			}
		});

		test('entre escalón y escalón tampoco', async () => {
			for (const quantity of [11, 13, 17, 22, 999]) {
				const respuesta = await comprar(quantity);
				assert.equal(respuesta.status, 400, `se aceptaron ${quantity} tokens, que no caen en un escalón de 5`);
			}
		});

		test('10, 15, 20 y el tope entran', async () => {
			for (const quantity of [10, 15, 20, 25, 100, 1000]) {
				respuestasMP = [{ contiene: 'checkout/preferences', body: { init_point: 'https://mp.test/pagar' } }];
				const respuesta = await comprar(quantity);
				assert.equal(respuesta.status, 200, `se rechazaron ${quantity} tokens, que sí cumplen la regla`);
			}
		});

		test('la pantalla recibe el mínimo y el paso desde el servidor', async () => {
			// Si estuvieran escritos a mano en el componente, cambiar la regla acá
			// dejaría la app ofreciendo cantidades que el checkout rechaza con 400.
			const respuesta = await opcionesDeCompra({ request: new Request('https://creattia.app/api/creativos/buy-credits'), url: new URL('https://creattia.app/api/creativos/buy-credits') } as any);
			const payload = await respuesta.json();
			assert.equal(payload.minCredits, 10);
			assert.equal(payload.creditStep, 5);
		});
	});

	test('el pago aprobado acredita exactamente lo comprado y reporta la compra', async () => {
		respuestasMP = [{ contiene: '/v1/payments/', body: {
			id: 'pago-1', status: 'approved', transaction_amount: 4.9, currency_id: 'USD',
			external_reference: `${USER.id}:credits:10`, payer: { email: USER.email },
		} }];

		const respuesta = await webhook({ request: notificacion('payment', 'pago-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=payment&data.id=pago-1') } as any);
		const payload = await respuesta.json();

		assert.equal(payload.credited, 10);
		assert.equal(creditos(), 10);
		const compra = eventos.find((evento) => evento.event === 'tokens_comprados');
		assert.ok(compra, 'la compra de créditos no se reportó');
		assert.equal(compra!.compra.valor, 4.9);
	});

	test('el mismo webhook repetido no acredita dos veces', async () => {
		respuestasMP = [{ contiene: '/v1/payments/', body: {
			id: 'pago-1', status: 'approved', transaction_amount: 4.9, currency_id: 'USD',
			external_reference: `${USER.id}:credits:10`,
		} }];
		const pedir = () => webhook({ request: notificacion('payment', 'pago-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=payment&data.id=pago-1') } as any);

		await pedir();
		const segunda = await pedir();
		const payload = await segunda.json();

		assert.equal(payload.duplicated, true, 'el reintento no se detectó como duplicado');
		assert.equal(creditos(), 10, 'un webhook repetido acreditó de más');
	});

	test('un pago rechazado no acredita nada', async () => {
		respuestasMP = [{ contiene: '/v1/payments/', body: {
			id: 'pago-2', status: 'rejected', transaction_amount: 4.9,
			external_reference: `${USER.id}:credits:10`,
		} }];

		await webhook({ request: notificacion('payment', 'pago-2'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=payment&data.id=pago-2') } as any);

		assert.equal(creditos(), 0);
		assert.equal(eventos.some((evento) => evento.event === 'tokens_comprados'), false);
	});

	test('una referencia de otra cuenta no acredita en la nuestra', async () => {
		respuestasMP = [{ contiene: '/v1/payments/', body: {
			id: 'pago-3', status: 'approved', transaction_amount: 4.9,
			external_reference: 'no-es-un-uuid:credits:500',
		} }];

		await webhook({ request: notificacion('payment', 'pago-3'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=payment&data.id=pago-3') } as any);
		assert.equal(creditos(), 0);
	});
});

describe('suscripción', () => {
	const preapproval = (extra: Record<string, unknown> = {}) => ({
		contiene: '/preapproval/',
		body: {
			id: 'sub-1', status: 'authorized', external_reference: `${USER.id}:pro:monthly`,
			next_payment_date: '2026-09-07T00:00:00Z', payer_email: USER.email,
			auto_recurring: { transaction_amount: 24.99, currency_id: 'USD' },
			...extra,
		},
	});

	test('la primera autorización activa el plan, acredita los créditos y reporta la compra', async () => {
		respuestasMP = [preapproval()];

		await webhook({ request: notificacion('subscription_preapproval', 'sub-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		assert.equal(perfil().subscription_status, 'authorized');
		assert.equal(perfil().plan_code, 'pro');
		assert.equal(perfil().credits_remaining, 40, 'los créditos del plan Pro no se acreditaron');
		// El agujero grande: la suscripción no reportaba NADA, ni al panel ni a Meta.
		const compra = eventos.find((evento) => evento.event === 'suscripcion_pagada');
		assert.ok(compra, 'activar la suscripción no reportó ninguna compra');
		assert.equal(compra!.compra.valor, 24.99);
		assert.equal(compra!.props.renovacion, false);
	});

	test('el aviso repetido del mismo estado no vuelve a acreditar ni a reportar otra compra', async () => {
		respuestasMP = [preapproval()];
		const pedir = () => webhook({ request: notificacion('subscription_preapproval', 'sub-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		await pedir();
		perfil().credits_remaining = 12; // el usuario ya gastó parte del mes
		eventos = [];
		await pedir();

		assert.equal(perfil().credits_remaining, 12, 'un aviso repetido rellenó los créditos ya usados');
		assert.equal(eventos.some((evento) => evento.event === 'suscripcion_pagada'), false, 'se reportó una compra que no existió');
	});

	test('la renovación mensual rellena los créditos y reporta el cobro', async () => {
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: {
				preapproval_id: 'sub-1', payment_type_id: 'credit_card',
				payment: { status: 'approved', transaction_amount: 24.99, currency_id: 'USD', date_approved: '2026-09-07T00:00:00Z', payer: { email: USER.email } },
			} },
			preapproval({ next_payment_date: '2026-10-07T00:00:00Z' }),
		];

		await webhook({ request: notificacion('subscription_authorized_payment', 'factura-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-1') } as any);

		assert.equal(perfil().credits_remaining, 40);
		const cobro = eventos.find((evento) => evento.event === 'suscripcion_pagada');
		assert.ok(cobro, 'la renovación no reportó el cobro');
		assert.equal(cobro!.props.renovacion, true);
		assert.equal(cobro!.compra.valor, 24.99);
	});

	test('la renovación acredita aunque Mercado Pago todavía no haya movido la fecha del próximo cobro', async () => {
		/**
		 * El caso que dejaba a un cliente pagando sin recibir sus tokens.
		 *
		 * Se decidía recargar comparando `next_payment_date` con la fecha guardada.
		 * Pero esa fecha la mueve Mercado Pago de su lado, y el aviso del cobro
		 * puede llegar ANTES de que la mueva: la fecha vuelve igual, el estado ya
		 * era 'authorized', y no se acreditaba nada. Sin error, sin log, sin forma
		 * de enterarse salvo que el cliente reclame.
		 *
		 * Acá la suscripción devuelve a propósito la MISMA fecha que ya tenía el
		 * perfil, que es el escenario exacto de la carrera.
		 */
		perfil().subscription_status = 'authorized';
		perfil().subscription_period_end = '2026-09-07T00:00:00Z';
		perfil().credits_remaining = 3; // ya gastó casi todo el mes anterior
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: {
				preapproval_id: 'sub-1',
				payment: { status: 'approved', transaction_amount: 24.99, currency_id: 'USD' },
			} },
			preapproval({ next_payment_date: '2026-09-07T00:00:00Z' }),
		];

		await webhook({ request: notificacion('subscription_authorized_payment', 'factura-nueva'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-nueva') } as any);

		assert.equal(perfil().credits_remaining, 40, 'el cliente pagó el mes y no recibió sus tokens');
	});

	test('los créditos comprados sueltos sobreviven a la renovación del plan', async () => {
		/**
		 * Se pagaba dos veces y se perdía lo más caro.
		 *
		 * La compra suelta SUMA a credits_remaining, pero la renovación escribía
		 * `credits_remaining = créditos del plan`: una asignación absoluta. Quien
		 * compraba 100 imágenes y después renovaba su plan Pro se quedaba con 40.
		 * Sin error y sin aviso: la única forma de notarlo era mirar el saldo antes
		 * y después.
		 */
		perfil().subscription_status = 'authorized';
		perfil().subscription_period_end = '2026-09-07T00:00:00Z';
		// 100 comprados + 12 que le quedaban del mes.
		perfil().credits_remaining = 112;
		perfil().credits_purchased = 100;
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: {
				preapproval_id: 'sub-1',
				payment: { status: 'approved', transaction_amount: 24.99, currency_id: 'USD' },
			} },
			preapproval({ next_payment_date: '2026-10-07T00:00:00Z' }),
		];

		await webhook({ request: notificacion('subscription_authorized_payment', 'factura-con-comprados'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-con-comprados') } as any);

		assert.equal(perfil().credits_remaining, 140, 'la renovación borró los créditos que el cliente había comprado');
		assert.equal(perfil().credits_purchased, 100, 'lo comprado tiene que seguir marcado como comprado');
	});

	test('lo comprado que ya se gastó no revive en la renovación', async () => {
		// Si compró 100 y gastó 95, no le quedan 100 esperando: sobrevive lo que
		// realmente quedaba sin usar.
		perfil().subscription_status = 'authorized';
		perfil().subscription_period_end = '2026-09-07T00:00:00Z';
		perfil().credits_remaining = 5;
		perfil().credits_purchased = 100;
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: {
				preapproval_id: 'sub-1',
				payment: { status: 'approved', transaction_amount: 24.99, currency_id: 'USD' },
			} },
			preapproval({ next_payment_date: '2026-10-07T00:00:00Z' }),
		];

		await webhook({ request: notificacion('subscription_authorized_payment', 'factura-gastados'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-gastados') } as any);

		assert.equal(perfil().credits_remaining, 45, 'sobreviven los 5 que quedaban, no los 100 originales');
	});

	test('la misma factura reintentada no regala un mes extra', async () => {
		// La otra cara de lo mismo: si la llave fuera la fecha, un reintento de
		// Mercado Pago sobre la misma factura volvería a llenar los créditos.
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: {
				preapproval_id: 'sub-1',
				payment: { status: 'approved', transaction_amount: 24.99, currency_id: 'USD' },
			} },
			preapproval({ next_payment_date: '2026-10-07T00:00:00Z' }),
		];
		const pedir = () => webhook({ request: notificacion('subscription_authorized_payment', 'factura-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-1') } as any);

		await pedir();
		perfil().credits_remaining = 11; // el usuario ya usó parte del mes
		eventos = [];
		const segunda = await pedir();
		const payload = await segunda.json();

		assert.equal(payload.duplicated, true);
		assert.equal(perfil().credits_remaining, 11, 'un reintento de la misma factura regaló otro mes');
		assert.equal(eventos.some((evento) => evento.event === 'suscripcion_pagada'), false, 'se reportó dos veces la misma compra');
	});

	test('una factura rechazada no acredita ni reporta', async () => {
		respuestasMP = [
			{ contiene: '/authorized_payments/', body: { preapproval_id: 'sub-1', payment: { status: 'rejected' } } },
			preapproval(),
		];

		await webhook({ request: notificacion('subscription_authorized_payment', 'factura-2'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_authorized_payment&data.id=factura-2') } as any);

		assert.equal(creditos(), 0);
		assert.equal(eventos.some((evento) => evento.event === 'suscripcion_pagada'), false);
	});

	test('el plan anual acredita UN mes, no doce', async () => {
		/**
		 * Se acreditaba `planCredits × 12` de una: Pro anual arrancaba con 480
		 * tokens disponibles. El año se cobra igual, pero el costo real de esos 480
		 * —USD 0.24 cada uno— se puede consumir en la primera semana con once meses
		 * de servicio todavía por delante. Los meses siguientes los entrega la
		 * tarea diaria, un mes por vez.
		 */
		respuestasMP = [preapproval({ external_reference: `${USER.id}:pro:yearly` })];

		await webhook({ request: notificacion('subscription_preapproval', 'sub-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		assert.equal(perfil().credits_remaining, 40, 'el anual entregó más de un mes de una sola vez');
		assert.equal(perfil().credits_monthly, 40, 'el plan tiene que quedar valuado en tokens por mes, no por año');
		const suscripcion = fake.tables.creative_subscriptions.find((fila: any) => fila.user_id === USER.id) as any;
		assert.equal(suscripcion.billing_cycle, 'yearly');
		assert.ok(suscripcion.cycle_anchor_at, 'sin anclaje la recarga mensual no sabe desde cuándo contar');
		// El primer mes queda anotado como entregado para que la tarea diaria no lo
		// vuelva a entregar.
		assert.equal(fake.tables.creative_subscription_refills.length, 1);
		assert.equal(fake.tables.creative_subscription_refills[0].cycle_index, 1);
	});

	test('el anual repetido no mueve el anclaje ni suma otro mes', async () => {
		// Si el anclaje se moviera con cada aviso, el reparto de los doce meses
		// arrancaría de cero cada vez que Mercado Pago reintenta una notificación.
		respuestasMP = [preapproval({ external_reference: `${USER.id}:pro:yearly` })];
		const pedir = () => webhook({ request: notificacion('subscription_preapproval', 'sub-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		await pedir();
		const anclaje = (fake.tables.creative_subscriptions[0] as any).cycle_anchor_at;
		perfil().credits_remaining = 9; // ya gastó parte del mes
		await pedir();

		assert.equal((fake.tables.creative_subscriptions[0] as any).cycle_anchor_at, anclaje, 'un aviso repetido corrió el arranque del año');
		assert.equal(perfil().credits_remaining, 9, 'un aviso repetido rellenó el mes');
		assert.equal(fake.tables.creative_subscription_refills.length, 1);
	});

	test('una notificación sin firma válida no toca nada', async () => {
		respuestasMP = [preapproval()];
		const sinFirma = new Request('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'subscription_preapproval', data: { id: 'sub-1' } }),
		});

		const respuesta = await webhook({ request: sinFirma, url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		assert.equal(respuesta.status, 401);
		assert.equal(perfil().subscription_status, 'trial');
		assert.equal(creditos(), 0);
	});

	test('un plan que no se puede resolver no acredita nada', async () => {
		// Sin plan resoluble se corta: antes caía en 'creator' y una referencia rara
		// terminaba regalando un plan que nadie contrató.
		respuestasMP = [preapproval({ external_reference: `${USER.id}:planInventado:monthly`, preapproval_plan_id: 'no-configurado' })];

		const respuesta = await webhook({ request: notificacion('subscription_preapproval', 'sub-1'), url: new URL('https://creattia.app/api/creativos/webhook/mercadopago?type=subscription_preapproval&data.id=sub-1') } as any);

		assert.equal(respuesta.status, 422);
		assert.equal(perfil().subscription_status, 'trial');
		assert.equal(creditos(), 0);
	});
});
