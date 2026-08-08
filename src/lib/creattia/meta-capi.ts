import crypto from 'node:crypto';
import type { ProductEvent } from './events';
import { META_PIXEL_ID } from './meta-pixel';

/**
 * Los eventos que ya se registran, también hacia Meta.
 *
 * El píxel del navegador se pierde una parte del embudo: los bloqueadores lo
 * frenan, y sobre todo el pago se confirma en un webhook de Mercado Pago que
 * llega cuando el usuario ya cerró la pestaña. Un Purchase disparado desde el
 * navegador no llega nunca en esos casos, que son justo los que hay que medir.
 *
 * Por eso los eventos se mandan desde el servidor, apoyados en el mismo punto
 * donde ya se registran internamente: si algo quedó anotado en la base, salió
 * también hacia Meta. No hay dos listas que mantener sincronizadas.
 */

const API_VERSION = 'v21.0';

/**
 * El token es lo único que se configura por entorno.
 *
 * El identificador del píxel se exigía también por variable y eso dejó los
 * envíos mudos: estaba el token cargado y faltaba el id, así que no salía nada
 * y no había forma de notarlo. Es un dato público, no una credencial.
 */
function config() {
	const token = process.env.META_CAPI_TOKEN || (typeof import.meta !== 'undefined' && (import.meta as any).env?.META_CAPI_TOKEN) || '';
	return { pixelId: META_PIXEL_ID, token: String(token) };
}

/**
 * Meta exige que todo dato personal viaje hasheado. El mail se normaliza antes
 * —minúsculas y sin espacios— porque si no el hash no coincide con el que Meta
 * calculó de su lado y el evento queda sin atribuir a nadie.
 */
function hash(value?: string | null): string | undefined {
	const limpio = String(value || '').trim().toLowerCase();
	if (!limpio) return undefined;
	return crypto.createHash('sha256').update(limpio).digest('hex');
}

/**
 * Qué evento estándar de Meta corresponde a cada momento de la app.
 *
 * Los que no tienen equivalente se mandan igual, con su nombre propio: sirven
 * para armar públicos y para ver el embudo completo, aunque Meta no los use
 * para optimizar campañas.
 */
const ESTANDAR: Partial<Record<ProductEvent, string>> = {
	app_abierta: 'PageView',
	url_escaneada: 'Lead',
	referencia_analizada: 'ViewContent',
	generacion_pedida: 'AddToCart',
	generacion_lista: 'AddToWishlist',
	planes_vistos: 'ViewContent',
	checkout_abierto: 'InitiateCheckout',
	tokens_comprados: 'Purchase',
	// La suscripción va como Purchase y no como el evento `Subscribe` de Meta:
	// Purchase es el que las campañas usan para optimizar y el que acumula valor
	// junto con las compras de créditos, que es el ingreso total del negocio.
	suscripcion_pagada: 'Purchase',
};

export type DatosCompra = { valor?: number; moneda?: string; email?: string | null; plan?: string | null };

/**
 * Manda un evento a Meta. Nunca lanza: una métrica que no se pudo enviar no
 * puede romper un pago ni una generación.
 */
export async function sendMetaEvent(
	event: ProductEvent,
	userId: string | null | undefined,
	props: Record<string, unknown> = {},
	compra: DatosCompra = {},
): Promise<void> {
	const { pixelId, token } = config();
	if (!pixelId || !token) return;

	const nombre = ESTANDAR[event] || event;
	const esCompra = nombre === 'Purchase';
	try {
		const cuerpo = {
			data: [{
				event_name: nombre,
				event_time: Math.floor(Date.now() / 1000),
				action_source: 'website',
				// Sin esto, un mismo pago contado por el navegador y por el servidor
				// aparece dos veces. Con un id estable Meta los une en uno solo.
				event_id: `${event}-${userId || 'anon'}-${props.paymentId || props.batchId || Math.floor(Date.now() / 1000)}`,
				user_data: {
					...(hash(compra.email) ? { em: [hash(compra.email)] } : {}),
					...(userId ? { external_id: [hash(userId)] } : {}),
				},
				custom_data: {
					...(esCompra ? { currency: compra.moneda || 'USD', value: Number(compra.valor) || 0 } : {}),
					...(compra.plan ? { content_name: compra.plan } : {}),
					evento_interno: event,
				},
			}],
		};
		const respuesta = await fetch(`https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(cuerpo),
		});
		if (!respuesta.ok) {
			const detalle = await respuesta.text().catch(() => '');
			console.warn(`[meta] ${nombre} rechazado (${respuesta.status}): ${detalle.slice(0, 200)}`);
		}
	} catch (error) {
		console.warn(`[meta] no se pudo enviar ${nombre}:`, error instanceof Error ? error.message : error);
	}
}
