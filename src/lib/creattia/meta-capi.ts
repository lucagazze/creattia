import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
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
	// El escalón que le falta al embudo para poder optimizar sin depender de la
	// compra: con un token gratis de regalo se registra mucha más gente de la que
	// paga, y CompleteRegistration junta las conversiones semanales que un
	// conjunto de anuncios necesita para salir de la fase de aprendizaje.
	cuenta_creada: 'CompleteRegistration',
	checkout_abierto: 'InitiateCheckout',
	tokens_comprados: 'Purchase',
	// La suscripción va como Purchase y no como el evento `Subscribe` de Meta:
	// Purchase es el que las campañas usan para optimizar y el que acumula valor
	// junto con las compras de créditos, que es el ingreso total del negocio.
	suscripcion_pagada: 'Purchase',
};

export type DatosCompra = { valor?: number; moneda?: string; email?: string | null; plan?: string | null };

/**
 * Con qué empareja Meta el evento con la persona que vio el anuncio.
 *
 * Hasta acá el evento viajaba con el mail y el id de usuario y nada más, y eso
 * alcanza para que Meta lo reciba pero no para que lo atribuya: quien navega sin
 * sesión iniciada, o con un mail distinto al de Facebook, quedaba sin emparejar.
 * La `fbc` es la que más pesa de las cuatro porque ES el clic en el anuncio —la
 * planta el píxel cuando alguien llega con `fbclid` en la URL—, así que sin ella
 * Meta se entera de que hubo una compra pero no de qué campaña salió: se paga la
 * conversión y después no aparece en el panel.
 */
export type DatosNavegador = {
	ip?: string | null;
	userAgent?: string | null;
	fbp?: string | null;
	fbc?: string | null;
};

/** Una cookie puntual del header `cookie`, sin traerse una librería para eso. */
function leerCookie(header: string, nombre: string): string | null {
	for (const parte of header.split(';')) {
		const separador = parte.indexOf('=');
		if (separador < 0) continue;
		if (parte.slice(0, separador).trim() !== nombre) continue;
		return decodeURIComponent(parte.slice(separador + 1).trim()) || null;
	}
	return null;
}

/**
 * Saca del pedido HTTP los cuatro datos de emparejamiento.
 *
 * La IP no se puede leer del socket: en Vercel el pedido llega desde el borde,
 * así que la IP de la conexión es la de la infraestructura y no la del
 * visitante. La real viaja en `x-forwarded-for`, que puede traer varias
 * separadas por coma —la del visitante primero, después cada proxy—; quedarse
 * con la cabecera entera mandaría a Meta una cadena que no es ninguna IP.
 */
export function datosDelNavegador(request: Request): DatosNavegador {
	const reenviada = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
	const cookies = request.headers.get('cookie') || '';
	return {
		ip: reenviada || request.headers.get('x-real-ip') || null,
		userAgent: request.headers.get('user-agent') || null,
		fbp: leerCookie(cookies, '_fbp'),
		fbc: leerCookie(cookies, '_fbc'),
	};
}

/**
 * El comprador no está del otro lado cuando se confirma la compra.
 *
 * El pago lo confirma Mercado Pago llamando a nuestro webhook desde SU servidor:
 * ese pedido no trae ni la IP, ni el user-agent, ni las cookies de quien compró.
 * O sea que justo el evento más caro —Purchase, el que usan las campañas para
 * optimizar— era el único que llegaba a Meta sin nada con qué emparejarlo.
 *
 * Se guardan cuando la persona abre el checkout, que sí pasa por su navegador, y
 * el webhook los recupera por usuario. Entre las dos cosas pasan minutos y la
 * `_fbc` dura noventa días, así que es el mismo clic.
 */
export async function guardarDatosDelNavegador(
	admin: SupabaseClient | null,
	userId: string | null | undefined,
	navegador: DatosNavegador,
): Promise<void> {
	if (!admin || !userId) return;
	/**
	 * Solo se escribe lo que vino con valor.
	 *
	 * Alguien con bloqueador no manda `_fbp` ni `_fbc`, y un upsert completo
	 * pisaría con null los datos buenos de una visita anterior. Guardar de menos
	 * es perder una atribución; borrar lo guardado es perderlas todas.
	 */
	const fila: Record<string, string> = {};
	if (navegador.ip) fila.client_ip_address = navegador.ip.slice(0, 64);
	if (navegador.userAgent) fila.client_user_agent = navegador.userAgent.slice(0, 500);
	if (navegador.fbp) fila.fbp = navegador.fbp.slice(0, 256);
	if (navegador.fbc) fila.fbc = navegador.fbc.slice(0, 256);
	if (!Object.keys(fila).length) return;
	try {
		const { error } = await admin.from('creative_meta_identity')
			.upsert({ user_id: userId, ...fila, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
		if (error) console.warn('[meta] no se pudieron guardar los datos de emparejamiento:', error.message);
	} catch (error) {
		console.warn('[meta] no se pudieron guardar los datos de emparejamiento:', error instanceof Error ? error.message : error);
	}
}

/**
 * Lo último que se supo del navegador de este usuario. Devuelve vacío ante
 * cualquier problema —tabla sin migrar, usuario sin paso por el checkout—:
 * un Purchase con menos datos vale muchísimo más que un Purchase que no se
 * manda porque la consulta falló.
 */
export async function datosDelNavegadorGuardados(
	admin: SupabaseClient | null,
	userId: string | null | undefined,
): Promise<DatosNavegador> {
	if (!admin || !userId) return {};
	try {
		const { data, error } = await admin.from('creative_meta_identity')
			.select('client_ip_address,client_user_agent,fbp,fbc')
			.eq('user_id', userId).maybeSingle();
		if (error || !data) return {};
		return { ip: data.client_ip_address, userAgent: data.client_user_agent, fbp: data.fbp, fbc: data.fbc };
	} catch (error) {
		console.warn('[meta] no se pudieron leer los datos de emparejamiento:', error instanceof Error ? error.message : error);
		return {};
	}
}

/**
 * Manda un evento a Meta. Nunca lanza: una métrica que no se pudo enviar no
 * puede romper un pago ni una generación.
 */
export async function sendMetaEvent(
	event: ProductEvent,
	userId: string | null | undefined,
	props: Record<string, unknown> = {},
	compra: DatosCompra = {},
	navegador: DatosNavegador = {},
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
				//
				// El alta de la cuenta se identifica solo por la persona, sin la hora:
				// pasa una vez en la vida, así que si llegara a salir dos veces —dos
				// pedidos simultáneos con el candado de la base sin aplicar— Meta las
				// une en lugar de contar dos registros y enseñarle a las campañas a
				// buscar gente que ya está registrada.
				event_id: event === 'cuenta_creada'
					? `${event}-${userId || 'anon'}`
					: `${event}-${userId || 'anon'}-${props.paymentId || props.batchId || Math.floor(Date.now() / 1000)}`,
				user_data: {
					...(hash(compra.email) ? { em: [hash(compra.email)] } : {}),
					...(userId ? { external_id: [hash(userId)] } : {}),
					/**
					 * Estos cuatro van EN CLARO, y no es un descuido.
					 *
					 * La API de Conversiones hashea lo que identifica a una persona por sí
					 * solo —mail, teléfono, nombre, el id nuestro—, pero la IP, el
					 * user-agent y las cookies del píxel las espera tal cual. Hashearlas
					 * "por las dudas" no las protege: las rompe. Meta compara la `fbc`
					 * contra el clic que registró de su lado, y un sha256 no va a coincidir
					 * nunca con nada; el evento entra igual, sin error visible, y se queda
					 * sin atribuir para siempre.
					 *
					 * Tampoco van en arreglo como `em`: son un valor solo.
					 */
					...(navegador.ip ? { client_ip_address: navegador.ip } : {}),
					...(navegador.userAgent ? { client_user_agent: navegador.userAgent } : {}),
					...(navegador.fbp ? { fbp: navegador.fbp } : {}),
					...(navegador.fbc ? { fbc: navegador.fbc } : {}),
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
