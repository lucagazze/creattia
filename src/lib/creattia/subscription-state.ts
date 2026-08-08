/**
 * Qué plan rige HOY para una cuenta. Una sola definición, servidor y navegador.
 *
 * El problema que resuelve. El acceso se decidía con `subscriptionStatus ===
 * 'authorized'` y nada más, y eso falla por los dos lados:
 *
 *  · Al cancelar, la baja pone el estado en 'cancelled' en el momento. Pero la
 *    pantalla de cancelación promete, con todas las letras, "seguís con el plan
 *    hasta el {fecha}" y "después pasás al plan Gratis". Con la regla vieja la
 *    biblioteca se cerraba en el mismo segundo en que confirmabas la baja,
 *    aunque el mes ya estuviera pagado. Es cobrar un mes y no entregarlo.
 *
 *  · Al revés: si el período vence y no llega ningún aviso de Mercado Pago —la
 *    tarjeta dejó de funcionar, la suscripción terminó, el webhook se perdió—
 *    el estado se queda en 'authorized' PARA SIEMPRE. Acceso pago vitalicio
 *    gratis, sin que nada lo note.
 *
 * La regla real de una suscripción es de tiempo, no de estado: vale mientras
 * dure el período que se pagó. Esto se calcula en el momento de preguntar, así
 * que no hace falta ninguna tarea programada que pueda no correr — y no puede
 * quedar desincronizado entre lo que muestra la pantalla y lo que permite el
 * servidor, porque los dos llaman a la misma función.
 */

export const PAID_PLAN_CODES = new Set(['creator', 'pro', 'scale', 'agency']);

/**
 * Margen después de la fecha de renovación, solo para suscripciones vivas.
 *
 * Mercado Pago cobra y avisa cuando puede, no al segundo. Sin margen, quien
 * paga religiosamente se quedaría sin biblioteca unas horas cada mes, el día de
 * la renovación, hasta que entre el webhook. Tres días cubre cualquier demora
 * razonable y es poco tiempo si el cobro de verdad falló.
 *
 * No aplica a una suscripción dada de baja: ahí la fecha es la fecha.
 */
const GRACIA_MS = 3 * 24 * 60 * 60 * 1000;

export type DatosSuscripcion = {
	planCode?: string | null;
	subscriptionStatus?: string | null;
	/** Hasta cuándo está pagado el período en curso. */
	subscriptionPeriodEnd?: string | null;
};

export type EstadoSuscripcion = {
	/** El plan que rige hoy: 'trial' si el período pagado ya venció. */
	planCode: string;
	/** ¿Tiene la biblioteca completa y la carga mensual de tokens? */
	activa: boolean;
	/** Pagó y canceló: sigue andando, pero no se le vuelve a cobrar. */
	enBaja: boolean;
	/** El período pagado ya terminó. */
	vencida: boolean;
	/** Hasta cuándo vale, si se sabe. */
	terminaEl: string | null;
};

function fechaFin(valor?: string | null) {
	if (!valor) return null;
	const tiempo = new Date(valor).getTime();
	return Number.isFinite(tiempo) ? tiempo : null;
}

/**
 * Resuelve el estado real a partir de lo guardado en el perfil.
 *
 * `ahora` se puede pasar para poder probar el paso del tiempo sin esperarlo.
 */
export function resolverSuscripcion(datos: DatosSuscripcion, ahora: number = Date.now()): EstadoSuscripcion {
	const planCode = String(datos.planCode || 'trial');
	const status = String(datos.subscriptionStatus || 'trial');
	const fin = fechaFin(datos.subscriptionPeriodEnd);
	const esPlanPago = PAID_PLAN_CODES.has(planCode);
	const enBaja = status === 'cancelled' || status === 'paused';

	/**
	 * Sin plan pago no hay nada que resolver. Incluye 'pending', que es un
	 * checkout abierto y todavía sin pagar: no da acceso a nada.
	 */
	if (!esPlanPago || (status !== 'authorized' && !enBaja)) {
		return { planCode: 'trial', activa: false, enBaja: false, vencida: false, terminaEl: null };
	}

	/**
	 * Sin fecha de fin, el estado decide.
	 *
	 * Una suscripción VIVA sin fecha se considera vigente: es lo que pasa entre
	 * que se autoriza y llega el primer aviso con la fecha, y cerrarle la puerta a
	 * alguien que acaba de pagar sería el peor de los dos errores.
	 *
	 * Una DADA DE BAJA sin fecha, en cambio, no tiene ningún período pagado que
	 * honrar: si no se sabe hasta cuándo llegaba lo pagado, no hay nada que
	 * extender. Tratarla como vigente sería acceso pago indefinido después de
	 * cancelar, que es justamente lo contrario de lo que tiene que pasar.
	 */
	if (fin === null) {
		const activaSinFecha = status === 'authorized';
		return {
			planCode: activaSinFecha ? planCode : 'trial',
			activa: activaSinFecha,
			enBaja: false,
			vencida: !activaSinFecha,
			terminaEl: null,
		};
	}

	const vencida = ahora > fin + (status === 'authorized' ? GRACIA_MS : 0);
	const activa = !vencida;

	return {
		planCode: activa ? planCode : 'trial',
		activa,
		enBaja: enBaja && activa,
		vencida,
		terminaEl: datos.subscriptionPeriodEnd || null,
	};
}

/** Atajo: ¿esta cuenta puede ver la biblioteca completa y recibir tokens del plan? */
export function suscripcionVigente(datos: DatosSuscripcion, ahora?: number) {
	return resolverSuscripcion(datos, ahora).activa;
}
