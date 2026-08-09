import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, fail, getAdminClient, json } from '../../../lib/creattia/server';

import { yearlyPriceFor } from '../../../lib/creattia/subscription-plans';
import { trackEvent } from '../../../lib/creattia/events';
import { datosDelNavegador, guardarDatosDelNavegador } from '../../../lib/creattia/meta-capi';
import {
	esAutoPago,
	getMercadoPagoAccount,
	MENSAJE_AUTOPAGO,
	resolverMonto,
	tipoDeCambioConfigurado,
} from '../../../lib/creattia/mercadopago';

export const prerender = false;

/**
 * Planes y créditos.
 *
 * Costo real por imagen terminada: USD 0.24 (0.236 de gpt-image-2 en calidad
 * 'high' más 0.004 del análisis del ganador). TODAS las imágenes salen en
 * 'high', sin nivel elegible por el usuario: en 'medium' el texto sale con
 * bordes blandos y el modelo le agrega sombras y halos, que es justo lo que
 * delata a un anuncio hecho con IA. Una imagen, un crédito.
 *
 * Los créditos de acá tienen que ir en línea con el precio configurado en
 * Mercado Pago. Con estos precios el margen queda por encima del 50% incluso si
 * el usuario consume el 100% de sus créditos:
 *
 *   Gratis    USD  0.00/mes ->   1 token  -> regalo               -> sin margen
 *   Básico    USD  9.99/mes ->   5 tokens -> USD 1.9980 por token -> margen 88.0%
 *   Pro       USD 19.99/mes ->  40 tokens -> USD 0.4998 por token -> margen 52.0%
 *   Scale     USD 39.99/mes ->  82 tokens -> USD 0.4877 por token -> margen 50.8%
 *   Agency    USD 69.99/mes -> 145 tokens -> USD 0.4827 por token -> margen 50.3%
 *
 * Esos márgenes son con el usuario consumiendo el 100% de sus créditos; con el
 * consumo real típico (55%) todos quedan bastante por encima.
 *
 * Compra suelta sin suscripción: USD 0.49 por imagen (margen 51.0%).
 *
 * REGLA: ningún plan puede quedar por debajo del 50% de margen. Con el costo
 * actual eso fija un piso de USD 0.48 por token. Lo verifica un test.
 *
 * Por qué Básico casi no trae tokens
 * ----------------------------------
 * Los USD 9.99 compran la entrada, no el volumen: la biblioteca completa de
 * anuncios que hoy están funcionando. Cinco tokens sueltos valen USD 2.45, así
 * que el resto del precio es, explícitamente, el acceso. Darle una cantidad que
 * compita con Pro rompe las dos reglas a la vez: para bajar de los USD 0.49 del
 * token suelto haría falta darle 21 tokens, y con 21 el margen cae a 49.5%. No
 * hay ningún número que sirva, así que este plan se vende por lo que abre y no
 * por lo que rinde.
 *
 * El techo y el piso casi se tocan
 * --------------------------------
 * El token suelto vale USD 0.49 y el piso de margen está en USD 0.48: los planes
 * de volumen tienen que vivir dentro de esa franja de un centavo. De ahí salen
 * cantidades raras como 82 y 145 en vez de 80 y 150 —con 80 el precio por token
 * queda por encima del de Pro y se rompe la escalera, y con 150 el margen cae a
 * 48.6%—, y de ahí sale también que entre Pro y Agency el ahorro por token sea
 * de apenas 3.4%: no entra más. Pro queda un centavo por encima del token suelto
 * (USD 0.4998) porque bajarlo a 41 tokens obliga a Scale y Agency a precios por
 * token que ya no respetan el piso del 50%. Si algún día se quiere una escalera
 * que se sienta como un descuento de verdad, la palanca no son estos cuatro
 * precios sino el token suelto: a USD 0.49 deja el mismo margen que un plan, así
 * que no puede funcionar como precio de lista.
 *
 * Si cambiás el precio en Mercado Pago, actualizá los créditos de acá o el
 * margen se rompe.
 */
const plans = {
	creator: {
		monthly: { env: 'MERCADO_PAGO_PLAN_CREATOR_ID', fallback: 'MERCADO_PAGO_PLAN_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_CREATOR_YEARLY_ID', fallback: 'MERCADO_PAGO_PLAN_YEARLY_ID' },
		price: 9.99,
		credits: 5,
		reason: 'Creattia — Básico'
	},
	pro: {
		monthly: { env: 'MERCADO_PAGO_PLAN_PRO_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_PRO_YEARLY_ID' },
		price: 19.99,
		credits: 40,
		reason: 'Creattia — Pro'
	},
	scale: {
		monthly: { env: 'MERCADO_PAGO_PLAN_SCALE_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_SCALE_YEARLY_ID' },
		price: 39.99,
		credits: 82,
		reason: 'Creattia — Scale'
	},
	agency: {
		monthly: { env: 'MERCADO_PAGO_PLAN_AGENCY_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_AGENCY_YEARLY_ID' },
		price: 69.99,
		credits: 145,
		reason: 'Creattia — Agency'
	},
} as const;

/**
 * La moneda de la suscripción sale de la cuenta de Mercado Pago.
 *
 * Antes se elegía por variable de entorno y solo se convertía cuando decía
 * exactamente 'ARS'. Con cualquier otro valor —incluido el 'USD' que quedó
 * cargado sobre una cuenta argentina— el precio viajaba en dólares a una cuenta
 * que solo liquida pesos, y el cobro se rechazaba al confirmar.
 */
function monedaDeCobro(account: { currency: string } | null) {
	return account?.currency
		|| String(
			import.meta.env.MERCADO_PAGO_SUBSCRIPTION_CURRENCY
			|| import.meta.env.MERCADO_PAGO_CURRENCY
			|| 'USD',
		).toUpperCase();
}

async function cancelProviderSubscription(subscriptionId: string, accessToken: string) {
	try {
		return await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
			method: 'PUT',
			headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=utf-8' },
			// Mercado Pago espera "cancelled", con dos eles. Con "canceled"
			// respondía 400 "Invalid preapproval status param", así que nadie podía
			// cancelar su suscripción ni volver a suscribirse tras abandonar un
			// checkout: el pendiente quedaba trabado para siempre.
			body: JSON.stringify({ status: 'cancelled' }),
		});
	} catch {
		return null;
	}
}

/**
 * El checkout que quedó abierto, si todavía sirve para pagar.
 *
 * Mercado Pago no deja tener dos suscripciones abiertas del mismo pagador para
 * el mismo plan: mientras el pendiente siga vivo de su lado, cada
 * `POST /preapproval` vuelve con 400. Y un pendiente que nunca se autorizó
 * tampoco se puede cancelar. Con las dos puertas cerradas la única salida real
 * es devolver el enlace del pago que la persona había empezado: no cobró nada y
 * sigue siendo válido.
 *
 * Solo se reutiliza si la referencia coincide exactamente —misma cuenta, mismo
 * plan, mismo ciclo—. Mandar a alguien a pagar un plan que no eligió es peor que
 * no abrirle nada.
 */
async function checkoutPendienteReutilizable(subscriptionId: string, accessToken: string, referencia: string) {
	try {
		const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) return null;
		const pendiente = await response.json().catch(() => null) as Record<string, any> | null;
		if (!pendiente || pendiente.status !== 'pending') return null;
		if (String(pendiente.external_reference || '') !== referencia) return null;
		const checkout = pendiente.init_point || pendiente.sandbox_init_point;
		return typeof checkout === 'string' && checkout ? checkout : null;
	} catch {
		return null;
	}
}

async function updateProviderSubscription(subscriptionId: string, accessToken: string, payload: Record<string, unknown>) {
	try {
		return await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
			method: 'PUT',
			headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify(payload),
		});
	} catch {
		return null;
	}
}

export const POST: APIRoute = async ({ request, url }) => {
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	const body = await request.json().catch(() => ({}));
	const requestedPlan = String(body.planCode || 'creator');
	const requestedCycle = String(body.billingCycle || 'monthly');
	// `plans[requestedPlan]` con un string arbitrario también resolvía cosas del
	// prototipo ("constructor", "toString"), que pasaban el chequeo de existencia
	// y reventaban más abajo con un 500. Se valida contra las claves propias.
	if (!Object.hasOwn(plans, requestedPlan)) return json({ error: 'El plan elegido no existe.' }, 400);
	if (requestedCycle !== 'monthly' && requestedCycle !== 'yearly') {
		return json({ error: 'La modalidad de cobro no es válida.' }, 400);
	}
	const planCode = requestedPlan as keyof typeof plans;
	const billingCycle = requestedCycle as 'monthly' | 'yearly';
	const plan = plans[planCode];
	const changeCurrent = body.changeCurrent === true;
	const auth = await authenticateRequest(request);
	if (!auth.user?.email) return json({ error: auth.error || 'La cuenta necesita un email válido.' }, 401);
	
	const cycleInfo = plan[billingCycle];
	const planId = import.meta.env[cycleInfo.env] || ('fallback' in cycleInfo ? import.meta.env[cycleInfo.fallback] : '');
	if (!accessToken) {
		return json({ error: 'Mercado Pago todavía no está configurado.', requiresConfiguration: true }, 503);
	}
	const account = await getMercadoPagoAccount(accessToken);
	const subscriptionCurrency = monedaDeCobro(account);
	// Nadie puede suscribirse a su propia cuenta: Mercado Pago lo rechaza con un
	// mensaje de seguridad que no dice cuál es la causa.
	if (esAutoPago(account, auth.user.email)) {
		return json({ error: MENSAJE_AUTOPAGO, code: 'SELF_PAYMENT' }, 409);
	}
	// El anual se cobra de una por los meses que valga el año.
	const precioDelCiclo = billingCycle === 'yearly' ? yearlyPriceFor(plan.price) : plan.price;
	let transactionAmount: number = precioDelCiclo;
	try {
		transactionAmount = resolverMonto(precioDelCiclo, subscriptionCurrency, tipoDeCambioConfigurado()).amount;
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'La conversión de moneda no está configurada.', requiresConfiguration: true }, 503);
	}

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	// Mismo criterio que la compra de créditos: cada llamada crea o modifica una
	// suscripción en Mercado Pago. Sin techo, una cuenta puede generar cientos de
	// preapprovals pendientes. No cierra por defecto: nunca hay que impedir pagar.
	const dentroDelLimite = await checkRateLimit(admin, auth.user.id, 'subscribe-checkout', 20, 3600);
	if (!dentroDelLimite) {
		return json({ error: 'Abriste muchos pagos seguidos. Esperá un momento antes de intentar de nuevo.' }, 429);
	}

	const { data: existing, error: existingError } = await admin.from('creative_subscriptions')
		.select('provider_subscription_id,status,plan_code,current_period_end')
		.eq('user_id', auth.user.id)
		.eq('provider', 'mercado_pago')
		.maybeSingle();
	if (existingError) return fail('subscribe', existingError, 'No se pudo completar la operación sobre tu suscripción.');
	const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;
	/**
	 * Un plan vigente de verdad, contra un checkout abierto sin pagar.
	 *
	 * Los dos se trataban igual, y eso rompía el caso más común: si dejabas el
	 * pago de Básico a medias y volvías a tocar Básico, la respuesta era
	 * 409 "Ese ya es tu plan actual" y Mercado Pago no abría nunca más. El
	 * pendiente tampoco es motivo para bloquear otro plan: no se cobró nada.
	 * Más abajo se cancela el checkout viejo y se abre uno nuevo.
	 */
	const existingIsActive = Boolean(existing && ['authorized', 'paused'].includes(existing.status));
	const existingIsPending = existing?.status === 'pending';
	if (existingIsActive && existing?.plan_code === planCode) {
		return json({ error: 'Ese ya es tu plan actual.', code: 'SAME_PLAN' }, 409);
	}

	if (existingIsActive && changeCurrent && existing?.provider_subscription_id && existing.status !== 'pending') {
		const updateResponse = await updateProviderSubscription(existing.provider_subscription_id, accessToken, {
			reason: plan.reason,
			external_reference: `${auth.user.id}:${planCode}:${billingCycle}`,
			back_url: `${siteUrl}/app/?subscription=return`,
			auto_recurring: {
				// La frecuencia viajaba sin declarar, así que Mercado Pago dejaba la
				// que ya tenía la suscripción. Pasar de mensual a anual mandaba el
				// precio del año entero sobre una recurrencia de un mes: diez veces
				// el importe, todos los meses. Al revés, cobraba un mes por año.
				frequency: billingCycle === 'yearly' ? 12 : 1,
				frequency_type: 'months',
				transaction_amount: transactionAmount,
				currency_id: subscriptionCurrency,
			},
		});
		const updatePayload = await updateResponse?.json().catch(() => ({})) || {};
		if (!updateResponse?.ok) {
			return json({ error: updatePayload.message || 'Mercado Pago no pudo actualizar tu suscripción. Tu plan actual sigue sin cambios.', code: 'SUBSCRIPTION_UPDATE_FAILED' }, 502);
		}

		const now = new Date().toISOString();
		const nextPeriod = updatePayload.next_payment_date || existing.current_period_end || null;

		// Mercado Pago aceptó el cambio de monto, pero todavía NO cobró el
		// importe nuevo: eso llega como `subscription_authorized_payment`.
		// Antes acá mismo se subía plan_code y se acreditaban los créditos del
		// plan nuevo, así que se podía saltar de Básico a Agency y llevarse 300
		// créditos antes de que existiera un solo cobro. Ahora se registra el
		// cambio como pendiente y los créditos los entrega el webhook cuando el
		// pago está aprobado.
		const { error: subscriptionUpdateError } = await admin.from('creative_subscriptions').update({
			plan_code: planCode,
			status: existing.status,
			monthly_credits: plan.credits,
			current_period_end: nextPeriod,
			updated_at: now,
		}).eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
		if (subscriptionUpdateError) return fail('subscribe-change', subscriptionUpdateError, 'No pudimos registrar el cambio de plan.');
		const { error: profileUpdateError } = await admin.from('creative_profiles').update({
			// Los créditos y el plan efectivo NO se tocan hasta que entre el pago.
			subscription_period_end: nextPeriod,
			mercado_pago_subscription_id: existing.provider_subscription_id,
			updated_at: now,
		}).eq('user_id', auth.user.id);
		if (profileUpdateError) return fail('subscribe-change', profileUpdateError, 'No pudimos registrar el cambio de plan.');
		return json({
			changed: true,
			planCode,
			status: existing.status,
			pendingPayment: true,
			message: 'Tu plan cambia en el próximo cobro. Los créditos nuevos se acreditan cuando Mercado Pago confirme el pago.',
			subscriptionPeriodEnd: nextPeriod,
		});
	}

	if (existingIsActive && !changeCurrent) {
		return json({ error: 'Ya tenés una suscripción activa.', code: 'SUBSCRIPTION_EXISTS', currentPlanCode: existing?.plan_code || null }, 409);
	}

	const pendienteViejo = existingIsPending ? existing?.provider_subscription_id || '' : '';
	/**
	 * El checkout viejo que Mercado Pago no dejó cancelar, si es que quedó uno.
	 *
	 * Se recuerda hasta el final: es la diferencia entre destrabar la cuenta y
	 * dejarla muerta cuando el pedido del checkout nuevo también falla.
	 */
	let pendienteSinCancelar = '';
	if (pendienteViejo) {
		// Un checkout abandonado no cobró nada: si Mercado Pago no lo deja
		// cancelar —porque nunca llegó a autorizarse, o porque ya venció— seguir
		// adelante es seguro y es lo único que destraba al usuario. Antes esto
		// cortaba con un 502 y dejaba la cuenta sin poder suscribirse jamás.
		const cancelResponse = await cancelProviderSubscription(pendienteViejo, accessToken);
		if (!cancelResponse?.ok) {
			const detalle = await cancelResponse?.text().catch(() => '') || 'sin respuesta';
			console.warn(`[subscribe] no se pudo cancelar el pendiente ${pendienteViejo}: ${detalle.slice(0, 200)}`);
			pendienteSinCancelar = pendienteViejo;
		}
		/**
		 * Acá la fila se marcaba como 'cancelled' ANTES de saber si el checkout
		 * nuevo llegaba a existir, y ese era el camino que trababa la cuenta.
		 *
		 * Mercado Pago rechaza el `POST /preapproval` justamente cuando el
		 * pendiente sigue vivo de su lado, que es el caso en el que el `PUT` de
		 * cancelación acaba de fallar. Con la fila ya en 'cancelled', el intento
		 * siguiente veía una suscripción dada de baja, no volvía a limpiar nada y
		 * mandaba otro pedido que Mercado Pago rechazaba igual: 502 en cada clic,
		 * para siempre, y sin ningún rastro local del pendiente que había que
		 * cancelar. No hace falta escribir nada: si el pago nuevo se crea, el
		 * upsert de más abajo pisa la fila entera.
		 */
	}

	const referenciaExterna = `${auth.user.id}:${planCode}:${billingCycle}`;
	const preapprovalPayload: Record<string, unknown> = {
		payer_email: auth.user.email,
		external_reference: referenciaExterna,
		reason: plan.reason,
		back_url: `${siteUrl}/app/?subscription=return`,
	};
	if (planId) {
		preapprovalPayload.preapproval_plan_id = planId;
	} else {
		// Mercado Pago permite crear la suscripción sin un plan previo, indicando
		// la recurrencia en el mismo pedido. Antes esto solo cubría el mensual y
		// el anual quedaba cortado con un 503 pidiendo una configuración que nadie
		// había hecho; con la frecuencia en 12 meses funciona igual, sin depender
		// de que existan planes cargados a mano en el panel.
		preapprovalPayload.auto_recurring = {
			frequency: billingCycle === 'yearly' ? 12 : 1,
			frequency_type: 'months',
			transaction_amount: transactionAmount,
			currency_id: subscriptionCurrency,
		};
	}

	const response = await fetch('https://api.mercadopago.com/preapproval', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify(preapprovalPayload),
	});

	const payload = await response.json().catch(() => ({}));
	let checkoutUrl: string = payload.init_point || payload.sandbox_init_point || '';
	let suscripcionEnMercadoPago: string = payload.id ? String(payload.id) : '';
	if (!response.ok || !checkoutUrl) {
		/**
		 * Último recurso antes de dejar a la persona sin poder pagar.
		 *
		 * Si el pendiente no se pudo cancelar, este rechazo es casi siempre el mismo
		 * problema visto del otro lado: Mercado Pago no abre un segundo checkout
		 * mientras el primero siga vivo. Ese primero no cobró nada y su enlace sigue
		 * sirviendo, así que se lo devolvemos y termina el pago que había empezado.
		 */
		const reutilizado = pendienteSinCancelar
			? await checkoutPendienteReutilizable(pendienteSinCancelar, accessToken, referenciaExterna)
			: null;
		if (!reutilizado) {
			return json({ error: payload.message || 'Mercado Pago no pudo iniciar la suscripción.' }, 502);
		}
		checkoutUrl = reutilizado;
		suscripcionEnMercadoPago = pendienteSinCancelar;
	}
	const navegador = datosDelNavegador(request);
	void trackEvent(admin, 'checkout_abierto', auth.user.id, { plan: planCode, ciclo: billingCycle, monto: transactionAmount }, {}, navegador);
	// Último momento en que la persona está del otro lado: el cobro lo va a
	// confirmar Mercado Pago contra el webhook, desde su servidor, sin la IP ni
	// las cookies del píxel. Se guardan acá para que el Purchase de la
	// suscripción —el ingreso principal— llegue a Meta con algo con qué atarlo.
	void guardarDatosDelNavegador(admin, auth.user.id, navegador);

	const { error: subscriptionError } = await admin.from('creative_subscriptions').upsert({
		user_id: auth.user.id,
		provider: 'mercado_pago',
		provider_subscription_id: suscripcionEnMercadoPago,
		plan_code: planCode,
		status: 'pending',
		monthly_credits: plan.credits,
		// El ciclo de cobro NO se escribe acá: un checkout abierto todavía no
		// contrató nada, y la modalidad real la fija el webhook cuando Mercado Pago
		// confirma. Escribirla desde este endpoint tampoco sería gratis: si el
		// despliegue se adelanta a la migración, la columna no existe y nadie
		// podría abrir un pago.
		updated_at: new Date().toISOString(),
	}, { onConflict: 'user_id,provider' });
	if (subscriptionError) {
		await cancelProviderSubscription(suscripcionEnMercadoPago, accessToken);
		return json({ error: 'No pudimos preparar el pago de forma segura. No se creó ninguna suscripción.' }, 500);
	}
	const { data: updatedProfile, error: profileError } = await admin.from('creative_profiles').update({
		subscription_status: 'pending',
		plan_code: planCode,
		credits_monthly: plan.credits,
		mercado_pago_subscription_id: suscripcionEnMercadoPago,
		updated_at: new Date().toISOString(),
	}).eq('user_id', auth.user.id).select('user_id').maybeSingle();
	if (profileError || !updatedProfile) {
		await cancelProviderSubscription(suscripcionEnMercadoPago, accessToken);
		await admin.from('creative_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() })
			.eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
		return json({ error: 'No pudimos preparar el pago de forma segura. No se creó ninguna suscripción.' }, 500);
	}

	return json({ checkoutUrl });
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	if (!accessToken) return json({ error: 'Mercado Pago todavía no está configurado.', requiresConfiguration: true }, 503);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const { data: subscription, error: readError } = await admin.from('creative_subscriptions')
		.select('provider_subscription_id,status')
		.eq('user_id', auth.user.id)
		.eq('provider', 'mercado_pago')
		.maybeSingle();
	if (readError) return fail('subscribe', readError, 'No se pudo completar la operación sobre tu suscripción.');
	if (!subscription?.provider_subscription_id) return json({ error: 'No encontramos una suscripción activa para cancelar.' }, 404);
	if (subscription.status === 'cancelled') return json({ ok: true, status: 'cancelled' });

	const response = await cancelProviderSubscription(subscription.provider_subscription_id, accessToken);
	const payload = await response?.json().catch(() => ({})) || {};
	if (response?.ok) void trackEvent(admin, 'plan_cancelado', auth.user.id, { plan: subscription.status }, {}, datosDelNavegador(request));
	/**
	 * Un checkout pendiente se da de baja acá aunque Mercado Pago diga que no.
	 *
	 * Sobre un preapproval que nunca se autorizó la API contesta 400: no hay nada
	 * que cancelar porque nunca hubo un cobro. Devolver 502 dejaba a la persona con
	 * un "pago pendiente" pegado a la cuenta que no se podía sacar de ninguna
	 * forma. Sobre una suscripción autorizada el 502 se mantiene: ahí el cobro es
	 * real, y marcarla de baja de nuestro lado sin que Mercado Pago la corte es
	 * seguir cobrándole todos los meses a alguien que cree que se dio de baja.
	 */
	if (!response?.ok && subscription.status !== 'pending') {
		return json({ error: payload.message || 'Mercado Pago no pudo cancelar la suscripción.' }, 502);
	}

	const now = new Date().toISOString();
	const { error: subscriptionError } = await admin.from('creative_subscriptions').update({ status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
	if (subscriptionError) return fail('subscribe', subscriptionError, 'No se pudo completar la operación sobre tu suscripción.');
	const { error: profileError } = await admin.from('creative_profiles').update({ subscription_status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id);
	if (profileError) return fail('subscribe', profileError, 'No se pudo completar la operación sobre tu suscripción.');
	return json({ ok: true, status: 'cancelled' });
};
