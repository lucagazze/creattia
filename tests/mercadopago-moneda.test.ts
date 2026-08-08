import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

/**
 * El pago rechazado "por motivos de seguridad".
 *
 * La cuenta de Mercado Pago es argentina y `CREDIT_CURRENCY` estaba en USD. La
 * preferencia se creaba sin error, el checkout abría normalmente y el pago se
 * rechazaba recién al confirmarlo, con un mensaje que no menciona la moneda. Se
 * probó con varios medios de pago y falló siempre, porque el problema nunca fue
 * el medio: una cuenta de Argentina solo liquida pesos.
 *
 * Ahora la moneda se lee de la cuenta y el precio en dólares se convierte.
 */

import {
	esAutoPago,
	MENSAJE_AUTOPAGO,
	resolverMonto,
	type MercadoPagoAccount,
} from '../src/lib/creattia/mercadopago';

const cuentaArgentina: MercadoPagoAccount = {
	siteId: 'MLA',
	currency: 'ARS',
	email: 'cobros@creattia.app',
	nickname: 'ALGORITMIA',
};

describe('moneda de cobro', () => {
	test('una cuenta en dólares cobra el precio de lista sin convertir', () => {
		const monto = resolverMonto(0.49, 'USD', 0);
		assert.equal(monto.amount, 0.49);
		assert.equal(monto.currency, 'USD');
	});

	test('una cuenta argentina cobra en pesos al tipo de cambio configurado', () => {
		const monto = resolverMonto(0.49, 'ARS', 1400);
		assert.equal(monto.currency, 'ARS');
		assert.equal(monto.amount, 686);
	});

	test('sin tipo de cambio se corta con un mensaje que dice qué falta', () => {
		assert.throws(
			() => resolverMonto(9.99, 'ARS', 0),
			/MERCADO_PAGO_USD_RATE/,
			'el error tiene que nombrar la variable que hay que cargar',
		);
	});

	test('las monedas sin centavos se redondean a entero', () => {
		// El peso chileno rechaza un importe con decimales.
		assert.equal(resolverMonto(24.99, 'CLP', 950).amount, 23741);
		assert.equal(Number.isInteger(resolverMonto(24.99, 'CLP', 950).amount), true);
	});

	test('un plan anual se convierte igual que uno mensual', () => {
		const anual = resolverMonto(9.99 * 10, 'ARS', 1400);
		assert.equal(anual.amount, 139860);
	});
});

describe('autopago', () => {
	test('el dueño de la cuenta cobrando a su propio email queda detectado', () => {
		assert.equal(esAutoPago(cuentaArgentina, 'cobros@creattia.app'), true);
		// Mercado Pago lo rechaza igual, pero sin decir por qué: el valor de
		// detectarlo acá es poder explicarlo antes de abrir el checkout.
		assert.match(MENSAJE_AUTOPAGO, /otra cuenta/i);
	});

	test('el email se compara sin importar mayúsculas ni espacios', () => {
		assert.equal(esAutoPago(cuentaArgentina, '  Cobros@Creattia.App '), true);
	});

	test('cualquier otro comprador pasa', () => {
		assert.equal(esAutoPago(cuentaArgentina, 'cliente@gmail.com'), false);
	});

	test('sin datos de la cuenta no se bloquea a nadie', () => {
		// Si la consulta a Mercado Pago falla, lo último que puede hacer el sistema
		// es impedir que alguien pague.
		assert.equal(esAutoPago(null, 'cliente@gmail.com'), false);
	});
});
