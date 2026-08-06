import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'vitest';

import { getEffectiveAccess } from '../src/lib/creattia/admin-access';
import { isAdminEmail } from '../src/lib/creattia/admin';
import { checkReferencePath, FREE_PREVIEW_REFERENCE_PATHS, hasFullLibraryAccess } from '../src/lib/creattia/library-access';
import { brandLimitForPlan, creditsForPlan, subscriptionPlans } from '../src/lib/creattia/subscription-plans';
import { videoCreditCost, videoCreditCostForAccount } from '../src/lib/creattia/video-pipeline';

/**
 * Lo que se prueba acá es lo que decide quién paga y cuánto. Son las reglas que
 * fallaron en la auditoría: acceso a la biblioteca paga, límites por plan y
 * costo en créditos. No hace falta base de datos: se le pasa un cliente falso.
 */

function fakeAdmin(profile: Record<string, unknown> | null, override: Record<string, unknown> | null = null) {
	return {
		from(table: string) {
			const data = table === 'creative_profiles' ? profile : override;
			return {
				select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
			};
		},
	} as any;
}

const paidProfile = { credits_remaining: 10, credits_monthly: 60, subscription_status: 'authorized', plan_code: 'pro' };
const freeProfile = { credits_remaining: 1, credits_monthly: 0, subscription_status: 'trial', plan_code: 'trial' };

test('una cuenta gratuita no tiene acceso a la biblioteca paga', async () => {
	const access = await getEffectiveAccess(fakeAdmin(freeProfile), 'user-1', 'free@example.com');
	assert.equal(access.isPaidLibrary, false);
	assert.equal(hasFullLibraryAccess(access), false);
});

test('una suscripción activa sí tiene acceso a la biblioteca completa', async () => {
	const access = await getEffectiveAccess(fakeAdmin(paidProfile), 'user-2', 'pro@example.com');
	assert.equal(access.isPaidLibrary, true);
});

test('una suscripción cancelada pierde el acceso a la biblioteca', async () => {
	const cancelled = { ...paidProfile, subscription_status: 'cancelled' };
	const access = await getEffectiveAccess(fakeAdmin(cancelled), 'user-3', 'ex@example.com');
	assert.equal(access.isPaidLibrary, false);
});

test('el admin siempre queda como ilimitado', async () => {
	const access = await getEffectiveAccess(fakeAdmin(freeProfile), 'user-4', 'algoritmiadesarrollos@gmail.com');
	assert.equal(access.isUnlimited, true);
	assert.equal(access.isPaidLibrary, true);
});

test('una referencia arbitraria del cliente nunca se acepta a ciegas', async () => {
	const access = await getEffectiveAccess(fakeAdmin(freeProfile), 'user-5', 'free@example.com');
	// Sin manifiesto accesible el chequeo falla cerrado (503); con manifiesto,
	// una ruta inventada no existe (400) o está bloqueada por plan (402). En los
	// tres casos lo que importa es que NUNCA devuelva ok.
	const verdict = await checkReferencePath('99/deadbeefdeadbeef.png', access, 'https://creattia.app');
	assert.equal(verdict.ok, false);
	if (!verdict.ok) assert.ok([400, 402, 503].includes(verdict.status));
});

test('una ruta vacía se rechaza sin siquiera mirar la biblioteca', async () => {
	const access = await getEffectiveAccess(fakeAdmin(paidProfile), 'user-6', 'pro@example.com');
	const verdict = await checkReferencePath('   ', access, 'https://creattia.app');
	assert.equal(verdict.ok, false);
	if (!verdict.ok) assert.equal(verdict.status, 400);
});

test('las rutas del preview gratuito están declaradas', () => {
	assert.ok(FREE_PREVIEW_REFERENCE_PATHS.size >= 5);
	for (const path of FREE_PREVIEW_REFERENCE_PATHS) {
		assert.match(path, /^\d+\/[a-f0-9]+\.(png|jpe?g|webp|avif)$/i);
	}
});

test('cada plan declara un límite de marcas y el de Agency es el más alto', () => {
	for (const plan of subscriptionPlans) {
		assert.ok(plan.brandLimit >= 1, `${plan.code} sin límite de marcas`);
	}
	const agency = brandLimitForPlan('agency');
	assert.equal(agency, 6);
	assert.ok(agency > brandLimitForPlan('scale'));
	assert.ok(brandLimitForPlan('scale') > brandLimitForPlan('pro'));
	assert.ok(brandLimitForPlan('pro') > brandLimitForPlan('creator'));
	// Un plan desconocido nunca puede habilitar más que el gratuito.
	assert.equal(brandLimitForPlan('plan-que-no-existe'), 1);
	assert.equal(brandLimitForPlan(null), 1);
});

test('los créditos de video crecen con la duración y el admin no paga', () => {
	const short = videoCreditCost('8');
	const long = videoCreditCost('24');
	assert.ok(long > short, 'un video más largo tiene que costar más');
	assert.equal(videoCreditCostForAccount('24', true), 0);
	assert.equal(videoCreditCostForAccount('24', false), long);
});

test('el límite de marcas que se cobra es el que promete la página de precios', () => {
	// La landing arma sus features desde este mismo archivo, así que el número
	// que ve el usuario y el que aplica brands.ts no pueden separarse. Antes la
	// página decía 2 y 4 mientras el backend permitía 3 y 5, y Agency no estaba
	// en la tabla del backend: la cuenta más cara quedaba limitada a 1 marca.
	for (const plan of subscriptionPlans) {
		const feature = plan.features.find((item) => /marcas? activas?/.test(item.name));
		assert.ok(feature, `el plan ${plan.code} no dice cuántas marcas incluye`);
		const advertised = Number(feature.name.match(/\d+/)?.[0]);
		assert.equal(plan.brandLimit, advertised, `${plan.code}: la página dice ${advertised} y se aplican ${plan.brandLimit}`);
	}
});

test('los créditos que acredita el webhook salen de la misma oferta que se vende', () => {
	// Antes esta tabla estaba escrita tres veces —oferta, webhook y panel admin—
	// y se desincronizaron: el webhook acreditaba 300 cuando el plan vendía 260.
	for (const plan of subscriptionPlans) {
		assert.equal(creditsForPlan(plan.code), plan.credits ?? 0, `${plan.code} no coincide`);
	}
	assert.equal(creditsForPlan('plan-inventado'), 0);
});

// ── Margen ───────────────────────────────────────────────────────────────────

/**
 * Costo de una imagen para verificar márgenes.
 *
 * Se usa a propósito el escenario CARO —render en nivel alto— y no el que está
 * configurado hoy: así el test no se afloja solo cuando alguien baja el nivel, y
 * los precios quedan validados contra el peor caso. El costo exacto del tamaño
 * que se pide hoy lo mide `npm run compare-quality`.
 */
const ANALYSIS_COST = 0.004;
const WORST_CASE_RENDER = 0.236;
const IMAGE_COST = WORST_CASE_RENDER + ANALYSIS_COST;
/** Regla de negocio: ningún plan por debajo de esto. */
const MIN_MARGIN = 0.50;

test('ningún plan deja menos del 50% de margen', () => {
	// Si mañana sube el costo del modelo o alguien baja un precio, este test
	// falla antes de que la oferta empiece a perder plata en silencio.
	const failures: string[] = [];
	for (const plan of subscriptionPlans) {
		if (!plan.credits) continue; // el plan gratuito no vende créditos
		const perCredit = plan.price / plan.credits;
		const margin = (perCredit - IMAGE_COST) / perCredit;
		if (margin < MIN_MARGIN) {
			failures.push(`${plan.code}: USD ${perCredit.toFixed(3)} por token → ${(margin * 100).toFixed(0)}%`);
		}
	}
	assert.deepEqual(failures, [], `planes por debajo del ${MIN_MARGIN * 100}%:\n  ${failures.join('\n  ')}`);
});

test('el crédito suelto también deja más del 50%', () => {
	// Mismo número que DEFAULT_UNIT_PRICE en buy-credits.ts.
	const singleCreditPrice = 0.49;
	const margin = (singleCreditPrice - IMAGE_COST) / singleCreditPrice;
	assert.ok(margin >= MIN_MARGIN, `el crédito suelto deja ${(margin * 100).toFixed(0)}%`);
});

test('a más volumen, mejor precio por token', () => {
	// La escalera comercial: un plan más caro nunca puede salir más caro por token.
	const paid = subscriptionPlans.filter((plan) => plan.credits).sort((a, b) => a.price - b.price);
	for (let index = 1; index < paid.length; index += 1) {
		const previous = paid[index - 1].price / paid[index - 1].credits!;
		const current = paid[index].price / paid[index].credits!;
		assert.ok(current <= previous, `${paid[index].code} sale más caro por token que ${paid[index - 1].code}`);
	}
});

/**
 * Mercado Pago espera "cancelled", con dos eles.
 *
 * Con "canceled" respondía 400 "Invalid preapproval status param", y eso
 * encadenaba dos fallos: nadie podía cancelar su suscripción, y quien abandonaba
 * un checkout quedaba con un pendiente que no se podía limpiar, así que el
 * siguiente intento de suscribirse moría en 502 para siempre.
 */
describe('cancelación en Mercado Pago', () => {
	test('se manda el estado que la API acepta', async () => {
		const fuente = await readFile('src/pages/api/creativos/subscribe.ts', 'utf8');
		assert.match(fuente, /status: 'cancelled'/);
		assert.doesNotMatch(fuente, /status: 'canceled'/);
	});

	test('un checkout abandonado no puede dejar la cuenta trabada', async () => {
		const fuente = await readFile('src/pages/api/creativos/subscribe.ts', 'utf8');
		// El camino del pendiente ya no corta con 502: sigue y libera al usuario.
		assert.doesNotMatch(fuente, /PENDING_SUBSCRIPTION_CANCEL_FAILED/);
	});
});
