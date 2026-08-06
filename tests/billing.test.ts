import assert from 'node:assert/strict';
import { test } from 'vitest';

import { getEffectiveAccess } from '../src/lib/creattia/admin-access';
import { isAdminEmail } from '../src/lib/creattia/admin';
import { checkReferencePath, FREE_PREVIEW_REFERENCE_PATHS, hasFullLibraryAccess } from '../src/lib/creattia/library-access';
import { brandLimitForPlan, subscriptionPlans } from '../src/lib/creattia/subscription-plans';
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

test('los créditos por plan coinciden con los que acredita el webhook', () => {
	// Mismos valores que `planCredits` en webhook/mercadopago.ts: si se
	// desincronizan, una renovación acredita distinto de lo vendido.
	const expected: Record<string, number> = { creator: 5, pro: 60, scale: 120, agency: 300 };
	for (const [code, credits] of Object.entries(expected)) {
		const plan = subscriptionPlans.find((item) => item.code === code);
		assert.ok(plan, `falta el plan ${code}`);
		assert.equal(plan.credits, credits, `los créditos de ${code} no coinciden con el webhook`);
	}
});

test('la cuenta administradora se reconoce y ninguna otra pasa por admin', () => {
	assert.equal(isAdminEmail('algoritmiadesarrollos@gmail.com'), true);
	// Mayúsculas y espacios no deberían cambiar el resultado.
	assert.equal(isAdminEmail('  Algoritmiadesarrollos@Gmail.com '), true);
	assert.equal(isAdminEmail('otra@gmail.com'), false);
	// Un email vacío o ausente nunca puede resolver como admin: antes cualquier
	// cuenta sin email comparaba '' contra '' si el default cambiaba.
	assert.equal(isAdminEmail(''), false);
	assert.equal(isAdminEmail(null), false);
	assert.equal(isAdminEmail(undefined), false);
});
