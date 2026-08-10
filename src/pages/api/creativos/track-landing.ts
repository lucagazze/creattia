import type { APIRoute } from 'astro';
import { createHash, randomUUID } from 'node:crypto';
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
 *    —cuenta creada, compra— se deducen en el servidor contra la base.
 *  · Una visita por huella cada dos minutos: corta la recarga doble y cualquier
 *    bucle, pero sigue contando las visitas de verdad de una misma persona.
 *  · Si algo falla, responde ok igual. Perder una metrica es preferible a que la
 *    home devuelva un error por un contador.
 */

/**
 * La huella de un visitante, para poder contar PERSONAS y no recargas.
 *
 * Una persona que entra ocho veces no son ocho visitantes, y sin sesion no hay
 * `user_id` con el que agrupar. Se resuelve con un hash de IP + navegador, que
 * NO se puede revertir a una IP y NO se guarda junto a ella: en la fila queda
 * solo el hash.
 *
 * La sal se genera al arrancar el proceso y se rota todos los dias, asi que la
 * misma persona da un hash distinto manana: sirve para contar el dia y no para
 * seguir a nadie en el tiempo, que es exactamente el limite que se busca.
 */
const SAL = randomUUID();
let salDelDia = { dia: '', valor: '' };
function salDeHoy() {
	const dia = new Date().toISOString().slice(0, 10);
	if (salDelDia.dia !== dia) salDelDia = { dia, valor: `${SAL}:${dia}` };
	return salDelDia.valor;
}
function huella(ip: string, navegador: string) {
	return createHash('sha256').update(`${salDeHoy()}|${ip}|${navegador}`).digest('hex').slice(0, 16);
}

/** Huellas vistas hace poco. Vive en memoria: se pierde al reiniciar y esta bien. */
const vistasRecientes = new Map<string, number>();
const VENTANA_MS = 2 * 60 * 1000;

function yaContada(clave: string) {
	const ahora = Date.now();
	// Se limpia al pasar para que el mapa no crezca sin techo en un pico de trafico.
	if (vistasRecientes.size > 5000) {
		for (const [k, cuando] of vistasRecientes) {
			if (ahora - cuando > VENTANA_MS) vistasRecientes.delete(k);
		}
	}
	const anterior = vistasRecientes.get(clave);
	if (anterior && ahora - anterior < VENTANA_MS) return true;
	vistasRecientes.set(clave, ahora);
	return false;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
	try {
		const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || 'desconocida';
		const navegador = request.headers.get('user-agent') || '';
		const visitante = huella(ip, navegador);
		if (yaContada(visitante)) return json({ ok: true, ignorado: 'repetida' });
		const admin = getAdminClient();
		if (!admin) return json({ ok: true, ignorado: 'sin base' });
		/**
		 * De donde vino, si la URL lo traia.
		 *
		 * Solo se aceptan los campos conocidos y acotados: este endpoint es
		 * publico, asi que lo que llega en el cuerpo es texto de afuera y no puede
		 * convertirse en un props de cualquier tamano ni con cualquier clave.
		 */
		const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
		const origen: Record<string, string> = {};
		try {
			const body = await request.json();
			for (const campo of CAMPOS) {
				const valor = body?.[campo];
				if (typeof valor === 'string' && valor.trim()) origen[campo] = valor.trim().slice(0, 120);
			}
		} catch {
			// Sin cuerpo: es una visita directa y se cuenta igual.
		}
		// La huella viaja en los props del evento: es lo unico que permite separar
		// visitas de visitantes sin guardar nada que identifique a nadie.
		await trackEvent(admin, 'landing_vista', null, { visitante, ...origen });
		return json({ ok: true });
	} catch {
		return json({ ok: true, ignorado: 'error' });
	}
};
