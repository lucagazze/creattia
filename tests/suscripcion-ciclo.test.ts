import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { resolverSuscripcion, suscripcionVigente } from '../src/lib/creattia/subscription-state';

/**
 * El ciclo de vida de una suscripción, día por día.
 *
 * Es la regla que decide quién ve la biblioteca paga y quién recibe tokens cada
 * mes, y antes se resumía en `subscriptionStatus === 'authorized'`. Eso falla por
 * los dos extremos: cierra el acceso apenas cancelás —aunque el mes esté pagado
 * y la pantalla de baja prometa lo contrario— y lo deja abierto para siempre si
 * el período vence sin que llegue ningún aviso de Mercado Pago.
 *
 * Las fechas se pasan a mano para poder recorrer meses sin esperarlos.
 */

const DIA = 24 * 60 * 60 * 1000;
const HOY = new Date('2026-08-07T12:00:00Z').getTime();
const en = (dias: number) => new Date(HOY + dias * DIA).toISOString();

describe('plan activo', () => {
	test('una suscripción al día tiene acceso y su plan', () => {
		const estado = resolverSuscripcion({ planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(20) }, HOY);
		assert.equal(estado.activa, true);
		assert.equal(estado.planCode, 'pro');
		assert.equal(estado.vencida, false);
	});

	test('recién autorizada, sin fecha todavía, no se le cierra la puerta', () => {
		// Entre que se autoriza y llega el primer aviso con la fecha no hay dato.
		// Cortarle el acceso a alguien que acaba de pagar es el peor de los errores.
		const estado = resolverSuscripcion({ planCode: 'creator', subscriptionStatus: 'authorized', subscriptionPeriodEnd: null }, HOY);
		assert.equal(estado.activa, true);
	});

	test('el día de la renovación no se corta el servicio por unas horas', () => {
		// Mercado Pago cobra y avisa cuando puede. Sin margen, quien paga todos los
		// meses se queda sin biblioteca el día de la renovación hasta que entre el
		// webhook.
		const estado = resolverSuscripcion({ planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(-1) }, HOY);
		assert.equal(estado.activa, true, 'un día de demora de Mercado Pago no puede cortar el servicio');
	});
});

describe('baja: sigue hasta el fin del período pagado', () => {
	const dadaDeBaja = { planCode: 'pro' as const, subscriptionStatus: 'cancelled', subscriptionPeriodEnd: en(12) };

	test('al cancelar NO se pierde el acceso en el momento', () => {
		/**
		 * El bug que se arregló. La pantalla de baja promete, con todas las letras,
		 * "seguís con el plan hasta el {fecha}" y "tus tokens actuales siguen
		 * disponibles". Con la regla vieja la biblioteca se cerraba en el mismo
		 * segundo en que confirmabas: cobrarle el mes a alguien y no entregárselo.
		 */
		const estado = resolverSuscripcion(dadaDeBaja, HOY);
		assert.equal(estado.activa, true, 'canceló pero el mes está pagado: tiene que seguir teniendo todo');
		assert.equal(estado.planCode, 'pro');
		assert.equal(estado.enBaja, true, 'y tiene que quedar marcado que no se le va a cobrar más');
	});

	test('el último día todavía lo tiene', () => {
		assert.equal(suscripcionVigente({ ...dadaDeBaja, subscriptionPeriodEnd: en(0.4) }, HOY), true);
	});

	test('pasada la fecha, cae al plan gratis', () => {
		const estado = resolverSuscripcion({ ...dadaDeBaja, subscriptionPeriodEnd: en(-1) }, HOY);
		assert.equal(estado.activa, false);
		assert.equal(estado.planCode, 'trial', 'el plan efectivo tiene que ser el gratis');
		assert.equal(estado.vencida, true);
	});

	test('una baja no recibe el margen de gracia de las renovaciones', () => {
		// El margen existe para no cortarle el servicio a quien SÍ va a pagar. Para
		// una baja la fecha es la fecha: no hay ningún cobro en camino.
		assert.equal(suscripcionVigente({ ...dadaDeBaja, subscriptionPeriodEnd: en(-2) }, HOY), false);
	});

	test('una baja sin fecha conocida no extiende el acceso', () => {
		/**
		 * El caso opuesto al de la recién autorizada, y hay que distinguirlos: si
		 * no se sabe hasta cuándo llegaba lo pagado, no hay período que honrar.
		 * Darlo por vigente sería acceso pago indefinido después de cancelar.
		 */
		const estado = resolverSuscripcion({ planCode: 'pro', subscriptionStatus: 'cancelled', subscriptionPeriodEnd: null }, HOY);
		assert.equal(estado.activa, false);
		assert.equal(estado.planCode, 'trial');
	});
});

describe('el período vence sin que llegue ningún aviso', () => {
	test('una suscripción vencida deja de dar acceso aunque el estado diga "authorized"', () => {
		/**
		 * El otro extremo. Si la tarjeta deja de funcionar, la suscripción termina o
		 * el webhook se pierde, el estado guardado se queda en 'authorized' para
		 * siempre: acceso pago vitalicio y gratis, sin que nada lo note. Al mirar la
		 * fecha, la cuenta cae sola al plan gratis.
		 */
		const estado = resolverSuscripcion({ planCode: 'agency', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(-40) }, HOY);
		assert.equal(estado.activa, false, 'un plan vencido no puede seguir dando la biblioteca paga');
		assert.equal(estado.planCode, 'trial');
		assert.equal(estado.vencida, true);
	});

	test('una pausa de Mercado Pago también termina cayendo al gratis', () => {
		assert.equal(suscripcionVigente({ planCode: 'scale', subscriptionStatus: 'paused', subscriptionPeriodEnd: en(5) }, HOY), true);
		assert.equal(suscripcionVigente({ planCode: 'scale', subscriptionStatus: 'paused', subscriptionPeriodEnd: en(-5) }, HOY), false);
	});
});

describe('cuentas sin plan', () => {
	test('una cuenta nueva es del plan gratis', () => {
		const estado = resolverSuscripcion({ planCode: 'trial', subscriptionStatus: 'trial', subscriptionPeriodEnd: null }, HOY);
		assert.equal(estado.activa, false);
		assert.equal(estado.planCode, 'trial');
	});

	test('un checkout abierto y sin pagar no da acceso a nada', () => {
		/**
		 * Al abrir el checkout el perfil ya queda con `plan_code = 'pro'` y estado
		 * 'pending'. Si eso contara como plan, alcanzaría con empezar un pago y
		 * abandonarlo para tener la biblioteca completa gratis.
		 */
		const estado = resolverSuscripcion({ planCode: 'pro', subscriptionStatus: 'pending', subscriptionPeriodEnd: en(30) }, HOY);
		assert.equal(estado.activa, false, 'un pago sin confirmar no puede dar acceso');
		assert.equal(estado.planCode, 'trial');
	});

	test('una fecha con basura no se interpreta como acceso eterno', () => {
		const estado = resolverSuscripcion({ planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: 'cualquier cosa' }, HOY);
		// Una fecha ilegible no se puede comparar: se trata como "sin fecha", que es
		// el caso de la suscripción recién autorizada.
		assert.equal(estado.activa, true);
	});

	test('un plan que no existe no da acceso', () => {
		assert.equal(suscripcionVigente({ planCode: 'plan-inventado', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(30) }, HOY), false);
	});
});

describe('un mes completo, de punta a punta', () => {
	test('contrata, se le cobra, cancela y termina en gratis', () => {
		const linea = [
			{ dia: 0, datos: { planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(30) }, activa: true, nota: 'contrató' },
			{ dia: 15, datos: { planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(30) }, activa: true, nota: 'mitad de mes' },
			{ dia: 31, datos: { planCode: 'pro', subscriptionStatus: 'authorized', subscriptionPeriodEnd: en(60) }, activa: true, nota: 'se renovó solo' },
			{ dia: 40, datos: { planCode: 'pro', subscriptionStatus: 'cancelled', subscriptionPeriodEnd: en(60) }, activa: true, nota: 'canceló, sigue hasta el 60' },
			{ dia: 59, datos: { planCode: 'pro', subscriptionStatus: 'cancelled', subscriptionPeriodEnd: en(60) }, activa: true, nota: 'último día' },
			{ dia: 61, datos: { planCode: 'pro', subscriptionStatus: 'cancelled', subscriptionPeriodEnd: en(60) }, activa: false, nota: 'pasó a gratis' },
		];
		for (const punto of linea) {
			const estado = resolverSuscripcion(punto.datos, HOY + punto.dia * DIA);
			assert.equal(estado.activa, punto.activa, `día ${punto.dia} (${punto.nota})`);
		}
	});
});
