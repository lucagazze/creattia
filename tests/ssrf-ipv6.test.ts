import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

/**
 * Una IPv4 privada escrita como IPv6 seguía siendo alcanzable.
 *
 * El filtro comparaba prefijos de texto contra cuatro casos sueltos
 * (`::ffff:127.`, `::ffff:10.`, `::ffff:172.`, `::ffff:192.168.`), así que
 * alcanzaba con publicar un registro AAAA apuntando al servicio de metadatos de
 * la nube —`::ffff:169.254.169.254`— y pegar ese dominio como sitio de la marca
 * para que el servidor fuera a buscarlo creyéndolo público.
 */

import { esPrivadaParaPruebas } from '../src/lib/creattia/safe-fetch';

describe('direcciones que no se pueden visitar', () => {
	test('las IPv4 privadas siguen bloqueadas', () => {
		for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0']) {
			assert.equal(esPrivadaParaPruebas(ip), true, `${ip} tendría que estar bloqueada`);
		}
	});

	test('las mismas direcciones escritas como IPv6 mapeada también', () => {
		for (const ip of ['::ffff:169.254.169.254', '::ffff:127.0.0.1', '::ffff:100.100.100.200', '::ffff:10.1.2.3']) {
			assert.equal(esPrivadaParaPruebas(ip), true, `${ip} tendría que estar bloqueada`);
		}
	});

	test('los túneles NAT64 y 6to4 hacia una privada también', () => {
		// 64:ff9b::a9fe:a9fe es 169.254.169.254 pasada por NAT64.
		assert.equal(esPrivadaParaPruebas('64:ff9b::a9fe:a9fe'), true);
		assert.equal(esPrivadaParaPruebas('2002:a9fe:a9fe::1'), true);
	});

	test('las link-local y las privadas nativas de IPv6', () => {
		for (const ip of ['::', '::1', 'fe80::1', 'fe9f::1', 'fea0::1', 'feb0::1', 'fc00::1', 'fd12::1']) {
			assert.equal(esPrivadaParaPruebas(ip), true, `${ip} tendría que estar bloqueada`);
		}
	});

	test('una dirección pública de verdad sigue pasando', () => {
		for (const ip of ['8.8.8.8', '1.1.1.1', '190.2.3.4', '2606:4700::1111', '2800:3f0::1']) {
			assert.equal(esPrivadaParaPruebas(ip), false, `${ip} tendría que pasar`);
		}
	});
});
