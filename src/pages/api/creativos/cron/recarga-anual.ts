import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { fail, getAdminClient, json } from '../../../../lib/creattia/server';
import { planCredits } from '../../../../lib/creattia/subscription-plans';
import { suscripcionVigente } from '../../../../lib/creattia/subscription-state';
import { cicloDelPlanAnual, claveDeRecarga } from '../../../../lib/creattia/ciclo-anual';
import { trackEvent } from '../../../../lib/creattia/events';

export const prerender = false;
export const maxDuration = 60;

/**
 * La recarga mensual de los planes anuales.
 *
 * En el plan anual Mercado Pago cobra y avisa UNA sola vez al año. Como la
 * entrega pasó a ser mensual, no queda ningún cobro que dispare los meses 2 al
 * 12: si no corre esto, quien pagó el año se queda con el primer mes y nada más.
 *
 * Corre todos los días —no una vez por mes— a propósito: cada suscripción cumple
 * su mes en el día que contrató, así que en cualquier fecha hay alguien que le
 * toca. Y correr de más no acredita de más: quién ya cobró su mes lo decide la
 * clave primaria de `creative_subscription_refills`, no el calendario del cron.
 */

/**
 * Solo el cron.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET` en cada ejecución
 * programada. Sin esta comprobación, la URL acredita tokens a cualquiera que la
 * conozca y ni siquiera hace falta una sesión.
 */
function llamadaDelCron(request: Request, secret: string) {
	const recibido = Buffer.from(request.headers.get('authorization') || '', 'utf8');
	const esperado = Buffer.from(`Bearer ${secret}`, 'utf8');
	return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export const GET: APIRoute = async ({ request }) => {
	const secret = import.meta.env.CRON_SECRET;
	/**
	 * Sin secreto configurado no se abre igual.
	 *
	 * Es la decisión contraria a la del limitador de uso, que ante una falla deja
	 * pasar para no tumbar la app. Acá lo que está del otro lado es acreditación
	 * de tokens: un endpoint abierto "hasta que alguien cargue la variable" es
	 * crédito gratis para el primero que pruebe la URL.
	 */
	if (!secret) return json({ error: 'La recarga programada no está configurada.' }, 503);
	if (!llamadaDelCron(request, secret)) return json({ error: 'No autorizado.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const ahora = new Date();
	/**
	 * También entran las canceladas y las pausadas.
	 *
	 * Quien cancela un plan anual en el mes tres ya pagó los doce: dejar de
	 * entregarle sería quedarse con nueve meses cobrados. Quién sigue teniendo
	 * derecho lo decide `suscripcionVigente` unas líneas más abajo, con la misma
	 * regla que usa la app para mostrar la biblioteca; cuando el año pagado
	 * termina, deja de entregar sola.
	 */
	const { data: suscripciones, error: lecturaError } = await admin.from('creative_subscriptions')
		.select('user_id,provider_subscription_id,plan_code,status,billing_cycle,cycle_anchor_at')
		.eq('provider', 'mercado_pago')
		.eq('billing_cycle', 'yearly')
		.in('status', ['authorized', 'paused', 'cancelled']);
	if (lecturaError) return fail('recarga-anual', lecturaError, 'No se pudieron leer las suscripciones anuales.');

	/**
	 * Sin anclaje no se toca.
	 *
	 * Son las suscripciones anuales que se vendieron con el esquema viejo: ya
	 * recibieron los doce meses juntos. `apply_subscription_refill` ASIGNA el
	 * saldo del mes, no lo suma, así que meterlas acá les bajaría el saldo de 480
	 * a 40. Entran solas cuando renueven el año.
	 */
	const candidatas = (suscripciones || []).filter((fila) => Boolean(fila.cycle_anchor_at));
	if (!candidatas.length) return json({ revisadas: 0, acreditadas: 0, salteadas: {} });

	const { data: perfiles, error: perfilesError } = await admin.from('creative_profiles')
		.select('user_id,plan_code,subscription_status,subscription_period_end')
		.in('user_id', candidatas.map((fila) => fila.user_id));
	if (perfilesError) return fail('recarga-anual', perfilesError, 'No se pudieron leer los perfiles.');
	const perfilPorUsuario = new Map((perfiles || []).map((perfil) => [perfil.user_id, perfil]));

	let acreditadas = 0;
	const salteadas: Record<string, number> = {};
	const saltar = (motivo: string) => { salteadas[motivo] = (salteadas[motivo] || 0) + 1; };

	for (const suscripcion of candidatas) {
		const userId = String(suscripcion.user_id);
		const perfil = perfilPorUsuario.get(userId);
		if (!perfil) { saltar('sin perfil'); continue; }

		// Cancelada con el año ya vencido, o vencida sin que llegara ningún aviso
		// de Mercado Pago: no hay período pagado que honrar.
		const vigente = suscripcionVigente({
			planCode: perfil.plan_code,
			subscriptionStatus: perfil.subscription_status,
			subscriptionPeriodEnd: perfil.subscription_period_end,
		}, ahora.getTime());
		if (!vigente) { saltar('suscripción vencida o dada de baja'); continue; }

		const creditosDelMes = planCredits[String(suscripcion.plan_code)];
		if (!creditosDelMes) { saltar('plan desconocido'); continue; }

		const ciclo = cicloDelPlanAnual(new Date(String(suscripcion.cycle_anchor_at)), ahora);
		if (!ciclo) { saltar('año consumido'); continue; }
		// El mes uno viaja con el cobro anual, lo entrega el webhook.
		if (ciclo.indice < 2) { saltar('primer mes, ya entregado con el cobro'); continue; }

		const subscriptionId = String(suscripcion.provider_subscription_id);
		const refillId = claveDeRecarga(subscriptionId, ciclo.inicio);
		/**
		 * Se anota primero y se acredita después.
		 *
		 * El insert es el que decide: si entra, este mes no se había entregado; si
		 * choca con la clave primaria (23505), ya se entregó y no se toca nada. Es
		 * la misma mecánica del webhook con el id del pago, y es lo único que
		 * aguanta dos ejecuciones solapadas del cron: la segunda choca contra la
		 * base, no contra una comparación de fechas que las dos ganarían.
		 */
		const { error: registroError } = await admin.from('creative_subscription_refills').insert({
			refill_id: refillId,
			user_id: userId,
			provider_subscription_id: subscriptionId,
			plan_code: suscripcion.plan_code,
			cycle_index: ciclo.indice,
			credits: creditosDelMes,
			source: 'cron',
			period_start: ciclo.inicio.toISOString(),
		});
		if (registroError) {
			if (registroError.code === '23505') { saltar('el mes ya estaba entregado'); continue; }
			console.error(`[recarga-anual] no se pudo anotar la recarga ${refillId}:`, registroError.message);
			saltar('error al anotar'); continue;
		}

		const { error: refillError } = await admin.rpc('apply_subscription_refill', {
			p_user_id: userId,
			p_monthly: creditosDelMes,
		});
		if (refillError) {
			// Se borra la anotación para que la corrida de mañana lo vuelva a
			// intentar: dejarla marca un mes como entregado que nunca se entregó, y
			// ese mes no lo recupera nadie.
			await admin.from('creative_subscription_refills').delete().eq('refill_id', refillId);
			console.error(`[recarga-anual] no se pudieron acreditar los tokens de ${userId}:`, refillError.message);
			saltar('error al acreditar'); continue;
		}

		acreditadas += 1;
		void trackEvent(admin, 'tokens_del_mes_acreditados', userId, {
			plan: suscripcion.plan_code, ciclo: 'anual', mes: ciclo.indice, cantidad: creditosDelMes,
		});
	}

	return json({ revisadas: candidatas.length, acreditadas, salteadas });
};
