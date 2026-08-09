import assert from 'node:assert/strict';
import { beforeEach, describe, test, vi } from 'vitest';
import { aplicarClavesPrimarias, createFakeSupabase } from './helpers/fake-supabase';
import { aniversarioMensual, cicloDelPlanAnual, claveDeRecarga } from '../src/lib/creattia/ciclo-anual';

/**
 * La entrega mensual del plan anual.
 *
 * El anual se cobra una vez y entregaba los doce meses de tokens en el mismo
 * webhook: Pro anual arrancaba con 480 tokens disponibles, que a USD 0.24 de
 * costo real son USD 115 que se pueden consumir en la primera semana con once
 * meses de servicio todavía por delante.
 *
 * Como Mercado Pago no vuelve a avisar hasta el año siguiente, los meses 2 al 12
 * los reparte una tarea diaria. Lo que se ejercita acá es lo que cuesta plata si
 * se rompe:
 *
 *  · que entregue el mes que corresponde y no más;
 *  · que dos corridas del mismo día no entreguen el mismo mes dos veces;
 *  · que una suscripción vencida o dada de baja deje de recibir;
 *  · que la URL no acredite nada si no la llama el cron.
 */

const USER = { id: '55555555-5555-4555-8555-555555555555' };
const OTRO = { id: '66666666-6666-4666-8666-666666666666' };
const SECRETO_CRON = 'secreto-del-cron';
const SUB_ID = 'sub-anual-1';

let fake = createFakeSupabase();
let eventos: Array<{ event: string; userId: string | null; props: Record<string, unknown> }> = [];

vi.mock('../src/lib/creattia/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/server')>();
	return { ...actual, getAdminClient: () => fake.client as any };
});

vi.mock('../src/lib/creattia/events', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/events')>();
	return {
		...actual,
		trackEvent: async (_admin: unknown, event: string, userId: string | null, props = {}) => {
			eventos.push({ event, userId, props });
		},
	};
});

const { GET: recargaAnual } = await import('../src/pages/api/creativos/cron/recarga-anual');

/** Arranque del año pagado. Todo lo demás se cuenta contra esta fecha. */
const ANCLAJE = new Date('2026-01-15T10:00:00Z');

type Escenario = {
	status?: string;
	billingCycle?: string;
	anclaje?: string | null;
	planCode?: string;
	creditos?: number;
	comprados?: number;
	perfilStatus?: string;
	finDelPeriodo?: string | null;
	recargas?: Array<Record<string, unknown>>;
};

function armar(escenario: Escenario = {}) {
	const planCode = escenario.planCode ?? 'pro';
	fake = createFakeSupabase({
		tables: {
			creative_subscriptions: [{
				user_id: USER.id,
				provider: 'mercado_pago',
				provider_subscription_id: SUB_ID,
				plan_code: planCode,
				status: escenario.status ?? 'authorized',
				monthly_credits: 40,
				billing_cycle: escenario.billingCycle ?? 'yearly',
				cycle_anchor_at: escenario.anclaje === undefined ? ANCLAJE.toISOString() : escenario.anclaje,
			}],
			creative_profiles: [{
				user_id: USER.id,
				plan_code: planCode,
				subscription_status: escenario.perfilStatus ?? 'authorized',
				// Un anual paga hasta un año después del anclaje.
				subscription_period_end: escenario.finDelPeriodo === undefined
					? aniversarioMensual(ANCLAJE, 12).toISOString()
					: escenario.finDelPeriodo,
				credits_remaining: escenario.creditos ?? 3,
				credits_purchased: escenario.comprados ?? 0,
			}],
			creative_subscription_refills: escenario.recargas ?? [],
		},
		rpc: {
			// Misma cuenta que hace `apply_subscription_refill` en Postgres: el saldo
			// del mes se ASIGNA y lo comprado suelto sobrevive.
			apply_subscription_refill: ({ p_user_id, p_monthly }) => {
				const perfil = fake.tables.creative_profiles.find((fila: any) => fila.user_id === p_user_id);
				if (!perfil) return { data: -1 };
				const sobreviven = Math.min(
					Number(perfil.credits_purchased || 0),
					Math.max(Number(perfil.credits_remaining || 0), 0),
				);
				perfil.credits_remaining = Number(p_monthly) + sobreviven;
				perfil.credits_purchased = sobreviven;
				return { data: perfil.credits_remaining };
			},
		},
	});
	aplicarClavesPrimarias(fake, { creative_subscription_refills: 'refill_id' });
}

function perfil() {
	return fake.tables.creative_profiles.find((fila: any) => fila.user_id === USER.id) as any;
}

/** Llamada como la hace Vercel: el secreto viaja en la cabecera Authorization. */
async function correrCron(opciones: { secreto?: string | null } = {}) {
	const headers: Record<string, string> = {};
	const secreto = opciones.secreto === undefined ? SECRETO_CRON : opciones.secreto;
	if (secreto !== null) headers.authorization = `Bearer ${secreto}`;
	const request = new Request('https://creattia.app/api/creativos/cron/recarga-anual', { headers });
	const respuesta = await recargaAnual({ request, url: new URL(request.url) } as any);
	return { status: respuesta.status, payload: await respuesta.json() };
}

/** Congela el reloj en el mes `n` del año pagado, unos días después de cumplirlo. */
function viajarAlMes(n: number) {
	vi.setSystemTime(new Date(aniversarioMensual(ANCLAJE, n - 1).getTime() + 2 * 24 * 60 * 60 * 1000));
}

beforeEach(() => {
	armar();
	eventos = [];
	vi.useFakeTimers();
	viajarAlMes(2);
	process.env.CRON_SECRET = SECRETO_CRON;
	(import.meta as any).env.CRON_SECRET = SECRETO_CRON;
});

describe('quién puede llamar a la recarga', () => {
	test('sin el secreto del cron no acredita nada', async () => {
		const respuesta = await correrCron({ secreto: null });

		assert.equal(respuesta.status, 401);
		assert.equal(perfil().credits_remaining, 3, 'una llamada anónima acreditó tokens');
	});

	test('con un secreto equivocado tampoco', async () => {
		const respuesta = await correrCron({ secreto: 'otro-secreto' });

		assert.equal(respuesta.status, 401);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('sin CRON_SECRET configurado el endpoint queda cerrado, no abierto', async () => {
		/**
		 * Es la decisión contraria a la del limitador de uso, que ante una falla
		 * deja pasar para no tumbar la app. Acá lo que hay del otro lado es
		 * acreditación de tokens: quedar abierto "hasta que carguen la variable" es
		 * regalarle el producto al primero que pruebe la URL.
		 */
		delete process.env.CRON_SECRET;
		delete (import.meta as any).env.CRON_SECRET;

		const respuesta = await correrCron({ secreto: null });

		assert.equal(respuesta.status, 503);
		assert.equal(perfil().credits_remaining, 3);
	});
});

describe('entrega un mes por vez', () => {
	test('en el mes dos acredita los tokens de UN mes', async () => {
		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 1);
		assert.equal(perfil().credits_remaining, 40, 'tenía que entregar un mes del plan, no doce');
		const anotada = fake.tables.creative_subscription_refills[0] as any;
		assert.equal(anotada.cycle_index, 2);
		assert.equal(anotada.credits, 40);
		assert.equal(anotada.source, 'cron');
	});

	test('los tokens comprados sueltos sobreviven a la recarga del mes', async () => {
		// Misma regla que la renovación mensual: lo comprado no caduca con el mes.
		armar({ creditos: 25, comprados: 20 });

		await correrCron();

		assert.equal(perfil().credits_remaining, 60, 'la recarga se comió los tokens comprados');
		assert.equal(perfil().credits_purchased, 20);
	});

	test('durante el primer mes no entrega nada: ese mes viajó con el cobro', async () => {
		viajarAlMes(1);

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('pasado el año deja de entregar', async () => {
		// El mes trece no existe: o Mercado Pago cobró la renovación anual —y el
		// webhook mueve el anclaje— o la suscripción se terminó.
		viajarAlMes(13);

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('recorre los doce meses entregando uno cada vez', async () => {
		let entregados = 0;
		for (let mes = 1; mes <= 13; mes += 1) {
			viajarAlMes(mes);
			const primera = await correrCron();
			entregados += Number(primera.payload.acreditadas);
			// Segunda corrida el mismo día: el cron corre todos los días, no una vez
			// al mes, así que la mayoría de las corridas no tienen nada que entregar.
			const segunda = await correrCron();
			assert.equal(segunda.payload.acreditadas, 0, `el mes ${mes} se entregó dos veces el mismo día`);
		}

		// Once entregas: del mes 2 al 12. El 1 lo entregó el webhook con el cobro y
		// el 13 ya no existe.
		assert.equal(entregados, 11);
		assert.equal(fake.tables.creative_subscription_refills.length, 11);
		assert.equal(perfil().credits_remaining, 40, 'los meses no se acumulan: cada uno reemplaza al anterior');
	});
});

describe('no entrega dos veces el mismo mes', () => {
	test('dos corridas el mismo día entregan una sola vez', async () => {
		const primera = await correrCron();
		perfil().credits_remaining = 11; // el usuario ya usó parte del mes
		const segunda = await correrCron();

		assert.equal(primera.payload.acreditadas, 1);
		assert.equal(segunda.payload.acreditadas, 0, 'la segunda corrida volvió a entregar el mes');
		assert.equal(perfil().credits_remaining, 11, 'la segunda corrida rellenó tokens ya usados');
		assert.equal(fake.tables.creative_subscription_refills.length, 1);
	});

	test('correr todos los días del mes entrega una sola vez', async () => {
		await correrCron();
		perfil().credits_remaining = 2;
		for (let dia = 3; dia < 28; dia += 1) {
			vi.setSystemTime(new Date(aniversarioMensual(ANCLAJE, 1).getTime() + dia * 24 * 60 * 60 * 1000));
			await correrCron();
		}

		assert.equal(perfil().credits_remaining, 2, 'una corrida diaria rellenó el mes ya entregado');
		assert.equal(fake.tables.creative_subscription_refills.length, 1);
	});

	test('un mes ya anotado por otra corrida no se vuelve a acreditar', async () => {
		/**
		 * El caso de dos ejecuciones solapadas: la primera anotó y todavía no
		 * terminó de acreditar. La segunda choca contra la clave primaria, que es
		 * exactamente la garantía que da Postgres y no una comparación de fechas
		 * que las dos ganarían.
		 */
		const yaEntregado = claveDeRecarga(SUB_ID, aniversarioMensual(ANCLAJE, 1));
		armar({ recargas: [{ refill_id: yaEntregado, user_id: USER.id, cycle_index: 2 }] });

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('si la acreditación falla no queda el mes marcado como entregado', async () => {
		// Dejarlo anotado sin acreditar pierde el mes para siempre: nadie lo
		// reclama porque, para el sistema, ya se entregó.
		armar();
		fake.client.rpc = (async () => ({ data: null, error: { code: 'XX000', message: 'se cayó la base' } })) as any;

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(fake.tables.creative_subscription_refills.length, 0, 'quedó un mes anotado que nunca se entregó');
	});
});

describe('suscripciones que no corresponde recargar', () => {
	test('una cancelada con el año ya vencido no recibe nada', async () => {
		armar({
			status: 'cancelled',
			perfilStatus: 'cancelled',
			finDelPeriodo: aniversarioMensual(ANCLAJE, 1).toISOString(),
		});

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('una que venció sin ningún aviso de Mercado Pago tampoco', async () => {
		// El estado guardado se queda en 'authorized' para siempre si el webhook se
		// pierde o la tarjeta deja de andar: la fecha es la que manda. La fecha va
		// bien atrás a propósito, fuera de los tres días de gracia que existen para
		// no cortarle el servicio a quien sí va a pagar.
		armar({ finDelPeriodo: ANCLAJE.toISOString() });

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('la que canceló pero todavía tiene año pagado SÍ recibe su mes', async () => {
		/**
		 * Pagó los doce meses de una. Cortarle la entrega en el mes tres sería
		 * quedarse con nueve meses cobrados y no entregados, que es justo lo
		 * contrario de lo que promete la pantalla de baja. Deja de recibir sola
		 * cuando se termina el año, que es el caso de más arriba.
		 */
		armar({ status: 'cancelled', perfilStatus: 'cancelled' });

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 1);
		assert.equal(perfil().credits_remaining, 40);
	});

	test('un plan mensual no entra: sus tokens los entrega el cobro de cada mes', async () => {
		armar({ billingCycle: 'monthly' });

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.revisadas, 0);
		assert.equal(perfil().credits_remaining, 3);
	});

	test('una anual vendida antes del cambio, sin anclaje, no se toca', async () => {
		/**
		 * Ya recibió los doce meses por adelantado. Como la recarga ASIGNA el saldo
		 * del mes en vez de sumarlo, meterla en el circuito nuevo le bajaría el
		 * saldo de 480 a 40: sacarle tokens a alguien que ya los pagó.
		 */
		armar({ anclaje: null, creditos: 480 });

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.revisadas, 0);
		assert.equal(perfil().credits_remaining, 480);
	});

	test('una suscripción sin perfil no rompe la corrida del resto', async () => {
		armar();
		fake.tables.creative_subscriptions.push({
			user_id: OTRO.id, provider: 'mercado_pago', provider_subscription_id: 'sub-huerfana',
			plan_code: 'pro', status: 'authorized', monthly_credits: 40,
			billing_cycle: 'yearly', cycle_anchor_at: ANCLAJE.toISOString(),
		});

		const respuesta = await correrCron();

		assert.equal(respuesta.payload.acreditadas, 1);
		assert.equal(perfil().credits_remaining, 40);
	});
});

describe('cuándo cumple el mes', () => {
	test('el 2 de febrero todavía no cumplió el mes quien contrató el 28 de enero', async () => {
		// El mes del calendario cambió pero el día no llegó. Con la resta ingenua
		// de meses, esta cuenta cobraría su segundo mes cinco días antes.
		const anclaje = new Date('2026-01-28T10:00:00Z');
		assert.equal(cicloDelPlanAnual(anclaje, new Date('2026-02-02T10:00:00Z'))?.indice, 1);
		assert.equal(cicloDelPlanAnual(anclaje, new Date('2026-02-28T10:00:00Z'))?.indice, 2);
	});

	test('quien contrató un 31 cumple el último día de los meses cortos', async () => {
		// Con `setMonth` el 31 de enero se desborda al 3 de marzo y el cliente
		// espera tres días de más por sus tokens, todos los febreros.
		const anclaje = new Date('2026-01-31T10:00:00Z');
		assert.equal(aniversarioMensual(anclaje, 1).toISOString().slice(0, 10), '2026-02-28');
		assert.equal(cicloDelPlanAnual(anclaje, new Date('2026-02-28T12:00:00Z'))?.indice, 2);
		// Y en marzo vuelve al 31: el recorte es del mes corto, no permanente.
		assert.equal(aniversarioMensual(anclaje, 2).toISOString().slice(0, 10), '2026-03-31');
	});

	test('la clave de un mes es la misma la calcule quien la calcule', async () => {
		const inicio = aniversarioMensual(ANCLAJE, 1);
		assert.equal(claveDeRecarga(SUB_ID, inicio), `${SUB_ID}:2026-02-15`);
		// Y la renovación del año que viene cae en otra fecha, así que no choca con
		// el primer mes del año anterior.
		assert.notEqual(claveDeRecarga(SUB_ID, aniversarioMensual(ANCLAJE, 12)), claveDeRecarga(SUB_ID, ANCLAJE));
	});
});

describe('deja rastro de que corrió', () => {
	test('cada entrega queda reportada como evento', async () => {
		await correrCron();

		const entrega = eventos.find((evento) => evento.event === 'tokens_del_mes_acreditados');
		assert.ok(entrega, 'sin evento, que la tarea deje de correr se descubre recién cuando reclama un cliente');
		assert.equal(entrega!.userId, USER.id);
		assert.equal(entrega!.props.mes, 2);
		assert.equal(entrega!.props.cantidad, 40);
	});
});
