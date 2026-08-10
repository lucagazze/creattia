import type { APIRoute } from 'astro';
import { getAdminClient, json } from '../../../lib/creattia/server';
import { trackEvent } from '../../../lib/creattia/events';

export const prerender = false;

/**
 * Una visita a la home publica.
 *
 * Es el unico aviso que se acepta SIN sesion, y tiene que serlo: quien mira la
 * landing todavia no tiene cuenta, y ese tramo —cuanta gente llega y cuanta
 * entra— es justamente el que mide una campana. El embudo arrancaba en "abrio la
 * app", asi que de todo lo anterior no quedaba ningun rastro.
 *
 * Por ser publico se acota fuerte:
 *
 *  · Un solo evento posible. No recibe el nombre del evento, asi que nadie puede
 *    inventar una conversion desde afuera. Las que Meta usa para optimizar
 *    —cuenta creada, compra— se deducen en el servidor contra la base y no se
 *    aceptan por ningun endpoint.
 *  · No lleva user_id ni nada que identifique a nadie. Solo cuenta.
 *  · Una visita por IP cada media hora. Alcanza para contar personas y corta
 *    cualquier bucle o script que quiera inflar el numero. La IP se usa para
 *    contar y se descarta: no se guarda en la fila.
 *  · Si algo falla, responde ok igual. Perder una metrica es preferible a que la
 *    home devuelva un error por un contador.
 */

/** IPs vistas hace poco. Vive en memoria: se pierde al reiniciar y esta bien. */
const vistasRecientes = new Map<string, number>();
const VENTANA_MS = 30 * 60 * 1000;

function yaContada(ip: string) {
	const ahora = Date.now();
	// Se limpia al pasar para que el mapa no crezca sin techo en un pico de trafico.
	if (vistasRecientes.size > 5000) {
		for (const [clave, cuando] of vistasRecientes) {
			if (ahora - cuando > VENTANA_MS) vistasRecientes.delete(clave);
		}
	}
	const anterior = vistasRecientes.get(ip);
	if (anterior && ahora - anterior < VENTANA_MS) return true;
	vistasRecientes.set(ip, ahora);
	return false;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
	try {
		const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || 'desconocida';
		if (yaContada(ip)) return json({ ok: true, ignorado: 'repetida' });
		const admin = getAdminClient();
		if (!admin) return json({ ok: true, ignorado: 'sin base' });
		await trackEvent(admin, 'landing_vista', null, {});
		return json({ ok: true });
	} catch {
		return json({ ok: true, ignorado: 'error' });
	}
};
