import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'vitest';

/**
 * El píxel de Meta: que la etiqueta pueda cargar y que el embudo esté completo.
 *
 * Estas dos cosas fallaban en silencio, que es lo peor que puede pasarle a una
 * medición: no hay error, no hay log, simplemente no llegan datos y las campañas
 * se optimizan a ciegas.
 *
 *  1. La política de seguridad del sitio no incluía `connect.facebook.net`, así
 *     que el navegador BLOQUEABA el script del píxel. Verificado contra la
 *     respuesta de producción: ni un PageView salía desde el navegador.
 *  2. El cobro de suscripciones —el ingreso principal— no reportaba ningún
 *     evento, ni interno ni a Meta.
 */

const raizProyecto = new URL('..', import.meta.url);

async function leer(ruta: string) {
	return readFile(new URL(ruta, raizProyecto), 'utf8');
}

describe('la política de seguridad deja cargar el píxel', () => {
	test('script-src incluye el dominio del script de Meta', async () => {
		const vercel = JSON.parse(await leer('vercel.json'));
		const csp = vercel.headers
			.flatMap((entrada: any) => entrada.headers)
			.find((header: any) => header.key === 'Content-Security-Policy')?.value as string;
		assert.ok(csp, 'no hay Content-Security-Policy configurada');

		const scriptSrc = csp.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith('script-src'));
		assert.ok(
			scriptSrc?.includes('https://connect.facebook.net'),
			'el CSP bloquea el script del píxel: no sale ni un PageView del navegador',
		);
	});

	test('connect-src deja que el píxel reporte los eventos', async () => {
		const vercel = JSON.parse(await leer('vercel.json'));
		const csp = vercel.headers
			.flatMap((entrada: any) => entrada.headers)
			.find((header: any) => header.key === 'Content-Security-Policy')?.value as string;
		const connectSrc = csp.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith('connect-src'));
		// El script puede cargar pero los eventos viajan a facebook.com: sin este
		// permiso cargaría y no reportaría nada, que es igual de inútil.
		assert.ok(connectSrc?.includes('https://www.facebook.com'), 'el píxel no puede enviar los eventos');
	});

	test('sigue siendo restrictiva: nada de comodines en script-src', async () => {
		const vercel = JSON.parse(await leer('vercel.json'));
		const csp = vercel.headers
			.flatMap((entrada: any) => entrada.headers)
			.find((header: any) => header.key === 'Content-Security-Policy')?.value as string;
		const scriptSrc = csp.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith('script-src')) || '';
		assert.equal(scriptSrc.includes('*'), false, 'un comodín en script-src abre la puerta a XSS');
		assert.equal(csp.includes("object-src 'none'"), true);
		assert.equal(csp.includes("base-uri 'self'"), true);
	});
});

describe('el embudo llega completo a Meta', () => {
	test('cada movimiento de plata se reporta como Purchase', async () => {
		const capi = await leer('src/lib/creattia/meta-capi.ts');
		// Las dos formas de que entre plata: créditos sueltos y suscripción.
		assert.match(capi, /tokens_comprados:\s*'Purchase'/);
		assert.match(capi, /suscripcion_pagada:\s*'Purchase'/);
	});

	test('los pasos previos tienen su evento estándar', async () => {
		const capi = await leer('src/lib/creattia/meta-capi.ts');
		for (const [interno, esperado] of [
			['url_escaneada', 'Lead'],
			['planes_vistos', 'ViewContent'],
			['checkout_abierto', 'InitiateCheckout'],
			['generacion_pedida', 'AddToCart'],
		]) {
			assert.ok(
				new RegExp(`${interno}:\\s*'${esperado}'`).test(capi),
				`${interno} no está mapeado a ${esperado}: Meta no lo puede usar para optimizar`,
			);
		}
	});

	test('los dos caminos de cobro reportan la suscripción', async () => {
		const webhook = await leer('src/pages/api/creativos/webhook/mercadopago.ts');
		// Uno por rama: la primera autorización y cada renovación mensual.
		const reportes = webhook.match(/suscripcion_pagada/g) || [];
		assert.ok(reportes.length >= 2, 'falta reportar el cobro en alguna de las dos ramas del webhook');
	});

	test('abrir el checkout se reporta en los dos caminos de pago', async () => {
		const suscripcion = await leer('src/pages/api/creativos/subscribe.ts');
		const creditos = await leer('src/pages/api/creativos/buy-credits.ts');
		assert.match(suscripcion, /trackEvent\([^)]*'checkout_abierto'/);
		// buy-credits importaba trackEvent y no lo llamaba nunca.
		assert.match(creditos, /trackEvent\([^)]*'checkout_abierto'/);
	});

	test('el navegador solo puede anotar eventos que no manejan plata', async () => {
		const track = await leer('src/pages/api/creativos/track.ts');
		const permitidos = track.match(/PERMITIDOS = new Set<ProductEvent>\(\[([^\]]*)\]\)/)?.[1] || '';
		assert.ok(permitidos.includes('app_abierta') && permitidos.includes('planes_vistos'));
		for (const prohibido of ['tokens_comprados', 'suscripcion_pagada', 'generacion_lista']) {
			assert.equal(
				permitidos.includes(prohibido),
				false,
				`${prohibido} no puede venir del navegador: serían conversiones inventadas`,
			);
		}
	});
});
