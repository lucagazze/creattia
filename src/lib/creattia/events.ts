import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMetaEvent, type DatosCompra, type DatosNavegador } from './meta-capi';
import { checkRateLimit } from './server';

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
	/**
	 * La entrega mensual de un plan anual.
	 *
	 * No es un cobro —el año se pagó una sola vez— pero sí es la única señal de
	 * que la tarea diaria está corriendo. Sin esto, que la recarga deje de
	 * ejecutarse se descubre recién cuando un cliente anual reclama que hace dos
	 * meses no le entran tokens.
	 */
	| 'tokens_del_mes_acreditados'
	| 'plan_cancelado'
	| 'webhook_recibido'
	| 'webhook_firma_rechazada'
	| 'marca_analizada'
	| 'avatar_guardado'
	/**
	 * El alta de la cuenta, una vez por persona.
	 *
	 * El embudo empezaba en `app_abierta` y saltaba directo a la compra, así que
	 * el único escalón que Meta podía usar para optimizar era Purchase. Con un
	 * producto que regala un token, las compras de la primera semana no llegan
	 * ni cerca de las cincuenta que un conjunto de anuncios necesita para salir
	 * de aprendizaje: los conjuntos se quedaban ahí, gastando sin estabilizar.
	 * El registro es el paso con volumen suficiente para sacarlos.
	 */
	| 'cuenta_creada';

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
	/**
	 * IP, user-agent y cookies del píxel de quien está del otro lado. Sale de
	 * `datosDelNavegador(request)` en cada endpoint: es lo que le permite a Meta
	 * atar el evento al anuncio que la persona clickeó. No se guarda en
	 * `creative_events` —esa tabla es a propósito anónima— y viaja solo hacia
	 * Meta, que ya tiene esos datos de su lado.
	 */
	navegador: DatosNavegador = {},
): Promise<void> {
	// El envío a Meta va acá y no en cada endpoint a propósito: si algo quedó
	// anotado en la base, salió también hacia Meta. Una sola lista que mantener.
	void sendMetaEvent(event, userId, props, compra, navegador);
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

/**
 * Desde cuándo una cuenta cuenta como alta nueva.
 *
 * El registro se deduce de la primera vez que el servidor ve a un usuario, y el
 * evento se agregó con la app ya en la calle y con cuentas creadas desde hacía
 * semanas. Sin este corte, el día que se despliega TODOS los que vuelvan a
 * entrar salen hacia Meta como CompleteRegistration: cientos de altas que en
 * realidad pasaron meses atrás, contadas hoy y atribuidas a las campañas que
 * estén corriendo. Sería envenenar justo la señal con la que esos anuncios
 * aprenden a quién mostrarse.
 */
const REGISTROS_MEDIDOS_DESDE = Date.parse('2026-08-09T00:00:00Z');

/**
 * El candado que serializa el instante en que se decide el alta.
 *
 * No es lo que garantiza el "una sola vez" y no se puede confiar en él para eso:
 * la función del limitador limpia `rate_limit_events` por fecha sin mirar de
 * quién ni de qué es cada fila, así que cualquier otra llamada con una ventana
 * corta se lleva puesta también esta marca a las pocas horas. Pedir una ventana
 * enorme no cambia nada, la borra el de al lado igual.
 *
 * Lo que sí hace, y para lo que no hay otra herramienta en la base, es que de
 * varios avisos que llegan juntos pase uno solo: toma un advisory lock, con lo
 * cual dos pedidos simultáneos no pueden leer los dos "acá no hay nada anotado".
 * Una hora cubre de sobra una carga de página, y de paso deja la consulta a la
 * tabla de eventos en una por hora y por usuario en vez de una por aviso.
 */
const CANDADO_DEL_REGISTRO = 'registro-de-cuenta';
const VENTANA_DEL_CANDADO_EN_SEGUNDOS = 3600;

/**
 * Anota el alta de la cuenta la primera vez que se ve a este usuario, y nunca
 * más.
 *
 * Lo difícil no es disparar el evento sino NO repetirlo: el navegador avisa que
 * está abierto en cada carga y en cada login, así que cualquier cosa que se
 * decida del lado del cliente termina contando un registro por visita. Meta ni
 * siquiera lo rechaza —recibe cinco CompleteRegistration de la misma persona y
 * los toma por buenos—, con lo cual las campañas optimizarían hacia gente que
 * vuelve a entrar en vez de hacia gente que se da de alta.
 *
 * Por eso la respuesta sale de la base y de nada más, con tres candados en este
 * orden, que importa:
 *
 *  1. La fecha de alta que trae la propia sesión. `auth.users.created_at` viene
 *     dentro del usuario que devuelve la verificación del token, así que no
 *     cuesta una consulta y —a diferencia de `creative_profiles.created_at`— no
 *     puede faltar: la fila del perfil la crea el navegador cuando termina de
 *     cargar la cuenta, y ese upsert corre en paralelo con este aviso. Mirando
 *     el perfil, el primer ingreso de una cuenta nueva salía cara o ceca según
 *     cuál de las dos llamadas ganara.
 *  2. El candado atómico. Dos pedidos simultáneos —el aviso de "abrí la app" y
 *     el de "miré los planes" salen casi juntos, y React monta dos veces en
 *     desarrollo— leerían los dos que no hay nada anotado y anotarían los dos.
 *     El limitador toma un advisory lock en Postgres, así que gana uno solo.
 *  3. La tabla de eventos. Es la única prueba que dura: sus filas no las borra
 *     nadie. Es la que decide de verdad, y cubre tanto al usuario que vuelve
 *     mañana —para entonces la marca del candado ya no existe— como al caso en
 *     que el limitador no esté disponible, que cuando falla deja pasar a
 *     propósito para no tumbar la app.
 *
 * Ganar el candado y no anotar nada no pierde el alta: si la escritura falla, no
 * se avisa a Meta tampoco, y en la próxima visita —pasada la hora del candado—
 * se vuelve a intentar entera.
 */
export async function anotarRegistroSiEsNuevo(
	admin: SupabaseClient | null,
	usuario: { id: string; email?: string | null; created_at?: string | null } | null | undefined,
	navegador: DatosNavegador = {},
): Promise<boolean> {
	if (!admin || !usuario?.id) return false;
	try {
		const alta = Date.parse(String(usuario.created_at || ''));
		if (!Number.isFinite(alta) || alta < REGISTROS_MEDIDOS_DESDE) return false;

		const primeroEnLlegar = await checkRateLimit(admin, usuario.id, CANDADO_DEL_REGISTRO, 1, VENTANA_DEL_CANDADO_EN_SEGUNDOS);
		if (!primeroEnLlegar) return false;

		const { data: yaAnotado } = await admin.from('creative_events')
			.select('id').eq('user_id', usuario.id).eq('event', 'cuenta_creada').limit(1).maybeSingle();
		if (yaAnotado) return false;

		/**
		 * Acá se anota PRIMERO y se avisa a Meta después, al revés que en el resto
		 * de los eventos.
		 *
		 * `trackEvent` reporta antes de escribir, y para casi todo está bien: si el
		 * proceso muere en el medio, al menos la conversión salió, y que un
		 * `AddToCart` aparezca dos veces no cambia nada. Este evento es el opuesto:
		 * la fila anotada es lo único que impide volver a contar la misma alta, y
		 * el cliente de Supabase no lanza cuando la escritura falla —devuelve el
		 * error en la respuesta—, así que con el orden de siempre un insert
		 * rechazado (la tabla sin migrar, por ejemplo) pasaba inadvertido: Meta ya
		 * tenía el CompleteRegistration, la prueba no existía, y la misma persona
		 * volvía a salir como alta nueva una vez por hora, para siempre. Sin
		 * constancia anotada no se reporta nada.
		 */
		const { error } = await admin.from('creative_events')
			.insert({ user_id: usuario.id, event: 'cuenta_creada', props: {} });
		if (error) {
			console.warn('[events] el alta no se pudo anotar, así que tampoco se reporta:', error.message);
			return false;
		}
		// El mail va porque es lo que le permite a Meta emparejar el alta con la
		// persona que vio el anuncio; sin él el evento entra sin dueño.
		void sendMetaEvent('cuenta_creada', usuario.id, {}, { email: usuario.email || null }, navegador);
		return true;
	} catch (error) {
		console.warn('[events] no se pudo resolver el registro:', error instanceof Error ? error.message : error);
		return false;
	}
}
