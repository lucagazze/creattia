import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { anotarRegistroSiEsNuevo, trackEvent, type ProductEvent } from '../../../lib/creattia/events';
import { datosDelNavegador } from '../../../lib/creattia/meta-capi';

export const prerender = false;

/**
 * Los momentos del embudo que solo el navegador puede ver.
 *
 * Casi todos los eventos se anotan donde ocurren, en el servidor. Pero un par de
 * pasos importantes del embudo no tocan el servidor: abrir la app y mirar la
 * pantalla de planes. Estaban declarados como eventos y no se disparaban desde
 * ningún lado, así que en el panel las dos preguntas que más importan —"de los
 * que entran, cuántos llegan a mirar los planes" y "de los que miran los planes,
 * cuántos abren el checkout"— no tenían con qué responderse.
 *
 * Es la única puerta por la que el navegador puede anotar un evento, y por eso
 * está cerrada con tres candados:
 *
 *  1. Sesión válida: el evento queda a nombre del usuario del token, nunca de un
 *     id que venga en el cuerpo del pedido.
 *  2. Lista blanca: solo entran estos dos eventos. `tokens_comprados` o
 *     `suscripcion_pagada` desde el navegador serían métricas —y conversiones de
 *     Meta— inventadas, así que no se aceptan por acá bajo ninguna forma.
 *  3. Tope de uso: un bucle en el cliente no puede inflar el embudo ni llenar la
 *     tabla de eventos.
 *
 * `cuenta_creada` NO está en la lista y es a propósito: es una conversión de las
 * que Meta usa para optimizar, así que aceptarla por acá sería regalársela a
 * cualquiera que sepa repetir un POST. Se deduce en el servidor, contra la base,
 * a partir de este mismo aviso.
 */
const PERMITIDOS = new Set<ProductEvent>(['app_abierta', 'planes_vistos']);

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const body = await request.json().catch(() => ({}));
	const evento = String(body?.event || '') as ProductEvent;
	if (!PERMITIDOS.has(evento)) return json({ error: 'Evento no admitido.' }, 400);

	// Sesenta por hora alcanza de sobra para una persona navegando y corta
	// cualquier bucle. Si el limitador está caído se deja pasar: perder una
	// métrica es preferible a romper la pantalla que la reporta.
	const dentroDelLimite = await checkRateLimit(admin, auth.user.id, `track:${evento}`, 60, 3600);
	if (!dentroDelLimite) return json({ ok: true, ignorado: 'limite' });

	// Este es el único evento que nace en el navegador, así que es donde las
	// cookies del píxel llegan más frescas: el `app_abierta` de la primera visita
	// desde un anuncio es el que trae la `_fbc` recién plantada.
	const navegador = datosDelNavegador(request);

	/**
	 * El alta de la cuenta se resuelve acá porque este es el primer pedido
	 * autenticado que hace cualquiera al entrar: no hay ningún endpoint por el que
	 * pase el registro y solo el registro —la sesión la crea Supabase de su lado y
	 * `/auth/callback` solo redirige—. La función decide sola si es la primera vez
	 * o no; llamarla en cada aviso es justamente lo que la hace confiable.
	 */
	await anotarRegistroSiEsNuevo(admin, auth.user, navegador);

	await trackEvent(admin, evento, auth.user.id, {}, {}, navegador);
	return json({ ok: true });
};
