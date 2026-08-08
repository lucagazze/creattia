import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMetaEvent, type DatosCompra } from './meta-capi';

/**
 * Registro de eventos de producto.
 *
 * Quién generó una imagen o quién pagó se sabía, porque eso deja fila en su
 * tabla. Lo que no se sabía es qué pasa con quien NO llega hasta ahí: cuánta
 * gente abre la app y no escanea nada, cuánta escanea y no genera, cuánta mira
 * los planes y no abre el checkout. Ese tramo es donde se pierde casi todo el
 * mundo y no dejaba ningún rastro.
 *
 * Se escribe siempre desde el servidor: si el navegador pudiera mandar eventos,
 * cualquiera podría inventar métricas.
 */

export type ProductEvent =
	| 'app_abierta'
	| 'url_escaneada'
	| 'referencia_analizada'
	| 'generacion_pedida'
	| 'generacion_lista'
	| 'generacion_fallida'
	| 'carrusel_pedido'
	| 'lote_pedido'
	| 'planes_vistos'
	| 'checkout_abierto'
	| 'checkout_duplicado'
	| 'tokens_comprados'
	/**
	 * El cobro de una suscripción, tanto el primero como cada renovación.
	 *
	 * Faltaba, y era el agujero grande de la medición: la suscripción es el
	 * ingreso principal y no reportaba NADA —ni a la tabla de eventos ni a Meta—.
	 * O sea que las campañas se optimizaban con la única compra que sí se
	 * reportaba, la de créditos sueltos, que es la venta chica. Ahora cada cobro
	 * confirmado por Mercado Pago sale como Purchase con su importe real.
	 */
	| 'suscripcion_pagada'
	| 'plan_cancelado'
	| 'webhook_recibido'
	| 'webhook_firma_rechazada'
	| 'marca_analizada'
	| 'avatar_guardado';

/**
 * Deja constancia de un evento. Nunca lanza: una métrica que no se pudo guardar
 * no puede romper la acción que el usuario estaba haciendo.
 */
export async function trackEvent(
	admin: SupabaseClient | null,
	event: ProductEvent,
	userId?: string | null,
	props: Record<string, unknown> = {},
	/** Valor y comprador, para los eventos que Meta necesita costear. */
	compra: DatosCompra = {},
): Promise<void> {
	// El envío a Meta va acá y no en cada endpoint a propósito: si algo quedó
	// anotado en la base, salió también hacia Meta. Una sola lista que mantener.
	void sendMetaEvent(event, userId, props, compra);
	if (!admin) return;
	try {
		await admin.from('creative_events').insert({
			user_id: userId || null,
			event,
			// Se recorta a propósito: acá no va nada personal ni payloads grandes.
			props: JSON.parse(JSON.stringify(props).slice(0, 2000)),
		});
	} catch (error) {
		console.warn(`[events] no se pudo registrar ${event}:`, error instanceof Error ? error.message : error);
	}
}
