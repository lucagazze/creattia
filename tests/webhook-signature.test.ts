import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, test } from 'vitest';

/**
 * La firma de Mercado Pago tiene más de una forma válida.
 *
 * El manifiesto se armaba siempre con id, request-id y ts, y se rechazaba todo
 * lo demás. Pero Mercado Pago no manda `x-request-id` en todas las
 * notificaciones, y cuando no lo manda su manifiesto tampoco lleva esa parte.
 * Resultado: 401 en llamadas legítimas. Se comprobó con la prueba del panel, que
 * llegaba correctamente firmada y se rechazaba igual — y eso mismo le habría
 * pasado a cada pago real, que es como se pierde una venta sin enterarse.
 */

const SECRETO = 'secreto-de-prueba';

/** Copia exacta de la verificación del endpoint, para poder ejercitarla. */
function verificar(headers: Record<string, string>, dataId: string, secret: string) {
	const signature = headers['x-signature'] || '';
	const requestId = headers['x-request-id'] || '';
	const parts = Object.fromEntries(signature.split(',').map((part) => {
		const [key, value] = part.trim().split('=');
		return [key, value];
	}));
	const timestamp = parts.ts;
	const received = parts.v1;
	if (!timestamp || !received || !dataId) return false;
	const ids = [...new Set([String(dataId), String(dataId).toLowerCase()])];
	const candidatos: string[] = [];
	for (const id of ids) {
		if (requestId) candidatos.push(`id:${id};request-id:${requestId};ts:${timestamp};`);
		candidatos.push(`id:${id};ts:${timestamp};`);
	}
	return candidatos.some((manifest) => createHmac('sha256', secret).update(manifest).digest('hex') === received);
}

const firmar = (manifest: string) => createHmac('sha256', SECRETO).update(manifest).digest('hex');

describe('firma del webhook de Mercado Pago', () => {
	test('acepta la forma completa, con request-id', () => {
		const v1 = firmar('id:123456;request-id:abc-123;ts:1700000000;');
		assert.equal(verificar({ 'x-signature': `ts=1700000000,v1=${v1}`, 'x-request-id': 'abc-123' }, '123456', SECRETO), true);
	});

	test('acepta la forma sin request-id', () => {
		// El caso que devolvía 401 y habría tumbado todos los pagos.
		const v1 = firmar('id:123456;ts:1700000000;');
		assert.equal(verificar({ 'x-signature': `ts=1700000000,v1=${v1}` }, '123456', SECRETO), true);
	});

	test('acepta el id alfanumérico en minúsculas', () => {
		const v1 = firmar('id:ab12cd;ts:1700000000;');
		assert.equal(verificar({ 'x-signature': `ts=1700000000,v1=${v1}` }, 'AB12CD', SECRETO), true);
	});

	test('sigue rechazando una firma que no corresponde', () => {
		assert.equal(verificar({ 'x-signature': 'ts=1700000000,v1=' + '0'.repeat(64) }, '123456', SECRETO), false);
	});

	test('sigue rechazando cuando no hay firma', () => {
		assert.equal(verificar({}, '123456', SECRETO), false);
	});

	test('no acepta una firma válida de OTRO pago', () => {
		// Lo importante de aflojar el formato es no aflojar la seguridad.
		const v1 = firmar('id:999999;ts:1700000000;');
		assert.equal(verificar({ 'x-signature': `ts=1700000000,v1=${v1}` }, '123456', SECRETO), false);
	});
});
