import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { ADMIN_PLAN_CODES, ADMIN_PLAN_CREDITS, ADMIN_PLAN_LABELS } from '../src/lib/creattia/admin';
import { PAID_PLAN_CODES, resolverSuscripcion } from '../src/lib/creattia/subscription-state';
import { subscriptionPlans } from '../src/lib/creattia/subscription-plans';

/**
 * Desde el panel se podía subir de plan pero no bajar.
 *
 * `free` no estaba entre los planes asignables, así que para sacarle a alguien
 * un plan regalado había que quitar el override y esperar a que el estado se
 * resolviera solo. Bajar a Gratis es la operación inversa de dar un plan y tiene
 * que poder hacerse igual de directo.
 */
describe('el admin puede bajar a alguien al plan gratis', () => {
	test('free está entre los planes asignables', () => {
		assert.ok(ADMIN_PLAN_CODES.has('free'));
	});

	test('los identificadores de los planes pagos siguen intactos', () => {
		// Viven en la base de los suscriptores y en Mercado Pago: si alguno se cae
		// de esta lista, el panel deja de poder asignarlo.
		for (const code of ['creator', 'pro', 'scale', 'agency']) {
			assert.ok(ADMIN_PLAN_CODES.has(code), code);
		}
	});

	test('el plan gratis carga el token mensual que anuncia la oferta', () => {
		assert.equal(ADMIN_PLAN_CREDITS.free, 1);
		assert.equal(subscriptionPlans.find((plan) => plan.code === 'free')?.tokensLabel, '1 token');
	});

	test('cada plan asignable tiene nombre para mostrar', () => {
		for (const code of ADMIN_PLAN_CODES) assert.ok(ADMIN_PLAN_LABELS[code], code);
	});

	/**
	 * El punto delicado: 'free' no es una suscripción y no puede quedar guardado
	 * como 'authorized'. Ese estado significa "hay un cobro vivo detrás".
	 */
	test('gratis no es un plan pago', () => {
		assert.ok(!PAID_PLAN_CODES.has('free'));
	});

	test('un perfil bajado a gratis no queda como suscripción activa', () => {
		// Es lo que escribe el endpoint: estado 'trial' y sin fecha de próximo cobro.
		const estado = resolverSuscripcion({ planCode: 'free', subscriptionStatus: 'trial', subscriptionPeriodEnd: '' });
		assert.equal(estado.activa, false);
		assert.equal(estado.planCode, 'trial');
		assert.equal(estado.enBaja, false);
		assert.equal(estado.vencida, false);
	});
});
