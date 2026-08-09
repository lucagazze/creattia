import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Los doce meses de un plan anual, uno por vez.
 *
 * El anual se cobra de una y se entregaba de una: `planCredits × 12` en el
 * mismo webhook que autorizaba la suscripción. Pro anual arrancaba con 480
 * tokens disponibles, o sea USD 115 de costo real que podían irse en la primera
 * semana con once meses de servicio por delante.
 *
 * Ahora entrega un mes por vez. Como Mercado Pago avisa una sola vez al año, los
 * meses 2 al 12 los reparte una tarea diaria, y esa tarea necesita dos cosas que
 * viven acá: saber qué mes corresponde hoy contando desde el arranque del año
 * pagado, y una clave estable por mes para que dos ejecuciones del mismo día no
 * puedan acreditar lo mismo dos veces.
 */

export const MESES_DEL_PLAN_ANUAL = 12;

/**
 * El aniversario mensual número `meses` del anclaje.
 *
 * El día se recorta al último del mes cuando no existe: quien contrató un 31 de
 * enero cumple su primer mes el 28 de febrero, no el 3 de marzo. Con la
 * aritmética ingenua de `setMonth` ese caso se desborda al mes siguiente y el
 * cliente esperaba tres días de más por sus tokens, todos los febreros.
 */
export function aniversarioMensual(anclaje: Date, meses: number): Date {
	const anio = anclaje.getUTCFullYear();
	const mes = anclaje.getUTCMonth() + meses;
	// Día 0 del mes siguiente = último día del mes buscado. `Date.UTC` normaliza
	// solo los meses fuera de rango, así que sirve igual para meses > 11.
	const diasDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
	const dia = Math.min(anclaje.getUTCDate(), diasDelMes);
	return new Date(Date.UTC(
		anio, mes, dia,
		anclaje.getUTCHours(), anclaje.getUTCMinutes(), anclaje.getUTCSeconds(), anclaje.getUTCMilliseconds(),
	));
}

/** Cuántos aniversarios mensuales ya pasaron. 0 = todavía está corriendo el primer mes. */
function mesesCumplidos(anclaje: Date, ahora: Date): number {
	const calendario = (ahora.getUTCFullYear() - anclaje.getUTCFullYear()) * 12
		+ (ahora.getUTCMonth() - anclaje.getUTCMonth());
	if (calendario <= 0) return 0;
	// El mes del calendario puede haber cambiado sin que llegue el día: el 2 de
	// febrero la diferencia de meses da 1, pero quien contrató el 28 de enero
	// todavía no cumplió su primer mes.
	return aniversarioMensual(anclaje, calendario).getTime() > ahora.getTime() ? calendario - 1 : calendario;
}

export type CicloAnual = {
	/** 1 a 12. El 1 lo entrega el webhook junto con el cobro; del 2 en adelante, la tarea diaria. */
	indice: number;
	/** Desde cuándo corre este mes. Es lo que identifica la recarga. */
	inicio: Date;
};

/**
 * Qué mes del año pagado corre hoy, o `null` si el año ya se consumió.
 *
 * Pasado el mes doce no se entrega nada más: si Mercado Pago cobró la renovación
 * anual, el webhook mueve el anclaje y el conteo vuelve a empezar; si no cobró,
 * la suscripción venció y no corresponde entregar nada.
 */
export function cicloDelPlanAnual(anclaje: Date, ahora: Date): CicloAnual | null {
	const tiempo = anclaje.getTime();
	if (!Number.isFinite(tiempo)) return null;
	const cumplidos = mesesCumplidos(anclaje, ahora);
	if (cumplidos >= MESES_DEL_PLAN_ANUAL) return null;
	return { indice: cumplidos + 1, inicio: aniversarioMensual(anclaje, cumplidos) };
}

/**
 * La clave del mes entregado, que es la clave primaria de
 * `creative_subscription_refills`.
 *
 * Se arma con datos que cualquier ejecución puede recalcular igual —el id de la
 * suscripción y el día en que arranca ese mes—, así que dos corridas del mismo
 * día, o una corrida que se solapa con otra, generan la MISMA clave y la segunda
 * choca contra la clave primaria. La renovación del año que viene cae en otra
 * fecha, así que no colisiona con el mes uno del año anterior.
 */
export function claveDeRecarga(subscriptionId: string, inicio: Date): string {
	return `${subscriptionId}:${inicio.toISOString().slice(0, 10)}`;
}

/**
 * Anota en qué modalidad se está cobrando esta suscripción.
 *
 * Va aparte del upsert de la suscripción y a propósito: si esto viajara dentro
 * del mismo insert, un despliegue que corriera antes de aplicar la migración
 * haría fallar el upsert entero —la columna no existe— y el webhook devolvería
 * 500 sobre un cobro real. Dejar de acreditar plata cobrada por un dato de
 * contabilidad interna es el peor intercambio posible, así que este update falla
 * solo.
 *
 * El mensual también limpia el anclaje: quien baja de anual a mensual pasa a
 * recibir sus tokens con cada cobro, y si le quedara el anclaje puesto la tarea
 * diaria le seguiría entregando meses del año anterior.
 */
export async function registrarCicloDeCobro(admin: SupabaseClient, userId: string, yearly: boolean): Promise<void> {
	const { error } = await admin.from('creative_subscriptions').update(
		yearly ? { billing_cycle: 'yearly' } : { billing_cycle: 'monthly', cycle_anchor_at: null },
	).eq('user_id', userId).eq('provider', 'mercado_pago');
	if (error) console.error('[ciclo-anual] no se pudo anotar la modalidad de cobro:', error.message);
}

/**
 * Marca el arranque del año pagado y anota su primer mes como ya entregado.
 *
 * Se llama DESPUÉS de acreditar, no antes: el anclaje es lo que define desde
 * cuándo cuenta la tarea diaria, y moverlo por un aviso repetido que no cobró
 * nada haría que los doce meses volvieran a repartirse desde cero.
 *
 * Nunca lanza ni corta el webhook. En este punto los tokens del mes YA están
 * acreditados y el cobro ya quedó registrado en `creative_subscription_payments`:
 * devolver un error haría que Mercado Pago reintente, y el reintento se corta
 * solo contra ese registro sin volver a pasar por acá. O sea que fallar acá deja
 * al cliente peor, no mejor. Queda el log para poder anclarlo a mano.
 */
export async function anclarCicloAnual(
	admin: SupabaseClient,
	datos: { userId: string; subscriptionId: string; planCode: string; credits: number; desde?: Date },
): Promise<void> {
	const inicio = datos.desde || new Date();
	const { error: anclajeError } = await admin.from('creative_subscriptions').update({
		billing_cycle: 'yearly',
		cycle_anchor_at: inicio.toISOString(),
		updated_at: inicio.toISOString(),
	}).eq('user_id', datos.userId).eq('provider', 'mercado_pago');
	if (anclajeError) {
		console.error(
			`[ciclo-anual] la suscripción anual ${datos.subscriptionId} quedó sin anclaje: `
			+ 'sus meses 2 al 12 no se van a entregar solos. ' + anclajeError.message,
		);
	}

	const { error: registroError } = await admin.from('creative_subscription_refills').insert({
		refill_id: claveDeRecarga(datos.subscriptionId, inicio),
		user_id: datos.userId,
		provider_subscription_id: datos.subscriptionId,
		plan_code: datos.planCode,
		cycle_index: 1,
		credits: datos.credits,
		source: 'webhook',
		period_start: inicio.toISOString(),
	});
	// 23505 es lo esperado si el aviso se reintentó: el mes ya estaba anotado.
	// 42P01 es la migración sin aplicar todavía, y tampoco es motivo para romper
	// un cobro que ya entró.
	if (registroError && registroError.code !== '23505' && registroError.code !== '42P01') {
		console.error('[ciclo-anual] no se pudo anotar el primer mes del año:', registroError.message);
	}
}
