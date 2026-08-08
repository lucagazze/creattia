import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail, getAdminClient, json } from '../../../../lib/creattia/server';
import { planCredits } from '../../../../lib/creattia/subscription-plans';
import { trackEvent } from '../../../../lib/creattia/events';

export const prerender = false;



function resolvePlan(subscription: any) {
	const external = String(subscription.external_reference || '');
	const [userId, requestedPlan, requestedCycle] = external.split(':');
	const yearly = requestedCycle === 'yearly';
	if (Object.hasOwn(planCredits, requestedPlan)) return { userId, planCode: requestedPlan, yearly };
	const providerPlan = String(subscription.preapproval_plan_id || '');
	const configured: Record<string, { planCode: string; yearly: boolean }> = {};
	const addConfiguredPlan = (id: string | undefined, planCode: string, isYearly: boolean) => {
		if (id) configured[id] = { planCode, yearly: isYearly };
	};
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_CREATOR_ID || import.meta.env.MERCADO_PAGO_PLAN_ID, 'creator', false);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_PRO_ID, 'pro', false);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_SCALE_ID, 'scale', false);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_AGENCY_ID, 'agency', false);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_CREATOR_YEARLY_ID || import.meta.env.MERCADO_PAGO_PLAN_YEARLY_ID, 'creator', true);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_PRO_YEARLY_ID, 'pro', true);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_SCALE_YEARLY_ID, 'scale', true);
	addConfiguredPlan(import.meta.env.MERCADO_PAGO_PLAN_AGENCY_YEARLY_ID, 'agency', true);
	const resolved = configured[providerPlan];
	// Sin plan resuelto no se inventa uno: antes caía en 'creator' y una
	// suscripción con referencia rara terminaba acreditando un plan que nadie
	// contrató. Ahora el llamador corta y queda registrado en el log.
	return {
		userId: external.split(':')[0] || external,
		planCode: resolved?.planCode || null,
		yearly: resolved?.yearly || false,
	};
}

/**
 * Verifica la firma de Mercado Pago.
 *
 * El manifiesto se armaba de una sola forma —id, request-id y ts— y se rechazaba
 * todo lo que no coincidiera. Pero Mercado Pago no manda `x-request-id` en todas
 * las notificaciones, y cuando no lo manda su propio manifiesto no lleva esa
 * parte. Con el formato fijo, esas llamadas devolvían 401: verificado contra la
 * prueba del panel, que llegaba firmada y se rechazaba igual. Eso mismo le
 * habría pasado a cada pago real.
 *
 * Se prueban las variantes que Mercado Pago documenta y se acepta si alguna
 * coincide. Sigue siendo estricto: sin firma válida en ninguna forma, no pasa.
 * La comparación es de tiempo constante en todos los casos.
 */
function verifySignature(request: Request, dataId: string, secret: string) {
	const signature = request.headers.get('x-signature') || '';
	const requestId = request.headers.get('x-request-id') || '';
	const parts = Object.fromEntries(signature.split(',').map((part) => {
		const [key, value] = part.trim().split('=');
		return [key, value];
	}));
	const timestamp = parts.ts;
	const received = parts.v1;
	if (!timestamp || !received || !dataId) return false;

	// El id alfanumérico va en minúsculas según la documentación; el numérico no
	// cambia, así que probar ambos no debilita nada.
	const ids = [...new Set([String(dataId), String(dataId).toLowerCase()])];
	const candidatos: string[] = [];
	for (const id of ids) {
		if (requestId) candidatos.push(`id:${id};request-id:${requestId};ts:${timestamp};`);
		candidatos.push(`id:${id};ts:${timestamp};`);
	}

	const receivedBuffer = Buffer.from(received, 'utf8');
	for (const manifest of candidatos) {
		const expected = createHmac('sha256', secret).update(manifest).digest('hex');
		const expectedBuffer = Buffer.from(expected, 'utf8');
		if (expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)) return true;
	}
	return false;
}

export const POST: APIRoute = async ({ request, url }) => {
	const secret = import.meta.env.MERCADO_PAGO_WEBHOOK_SECRET;
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	if (!secret || !accessToken) return json({ error: 'Webhook no configurado.' }, 503);

	const body = await request.json().catch(() => ({}));
	const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id') || url.searchParams.get('id') || body?.data?.id || '';
	/**
	 * Mercado Pago manda el tipo de aviso de dos formas.
	 *
	 * Las notificaciones modernas traen `type`; las que el panel llama "Pagos
	 * (legacy)" —que están tildadas en la configuración— traen `topic`. Leyendo
	 * solo `type`, un aviso legacy caía al final del archivo y salía con
	 * `{received:true}` y estado 200: Mercado Pago lo daba por entregado, no lo
	 * reintentaba nunca, y el pago quedaba cobrado sin acreditar. Un 200 que no
	 * hizo nada es el peor resultado posible acá, porque no deja rastro de error.
	 */
	const topic = url.searchParams.get('type') || url.searchParams.get('topic') || body?.type || body?.topic || '';

	/**
	 * Constancia de que Mercado Pago llamó.
	 *
	 * Un cliente pagó, se le debitó y nunca recibió sus tokens: el webhook no
	 * estaba registrado en Mercado Pago, así que jamás se ejecutó. Desde afuera
	 * eso es indistinguible de que se ejecute y falle —en los dos casos el
	 * resultado es "no llegaron los tokens"—, y no había forma de saber cuál de
	 * las dos cosas pasaba.
	 *
	 * Ahora queda registrada TODA llamada entrante, incluso las que se rechazan
	 * por firma. Si no hay ninguna, el problema es la configuración; si las hay,
	 * el problema es nuestro y se ve cuál.
	 */
	void trackEvent(getAdminClient(), 'webhook_recibido', null, {
		topic: String(topic).slice(0, 40),
		conFirma: Boolean(request.headers.get('x-signature')),
		dataId: String(dataId).slice(0, 40),
	});

	const firmaValida = verifySignature(request, String(dataId), secret);
	if (!firmaValida) {
		// Una firma rechazada teniendo x-signature es un problema nuestro, no de
		// Mercado Pago: queda anotado para poder verlo desde el panel.
		void trackEvent(getAdminClient(), 'webhook_firma_rechazada', null, {
			topic: String(topic).slice(0, 40),
			conRequestId: Boolean(request.headers.get('x-request-id')),
			dataId: String(dataId).slice(0, 40),
		});
		return json({ error: 'Firma inválida.' }, 401);
	}

	// ── Pago único de créditos (pago por imagen) ─────────────────────────
	if (topic === 'payment' && dataId) {
		const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!paymentResponse.ok) return json({ error: 'No se pudo verificar el pago.' }, 502);
		const payment = await paymentResponse.json();
		const reference = String(payment.external_reference || '');
		const match = reference.match(/^([0-9a-f-]{36}):credits:(\d+)$/i);
		if (!match || payment.status !== 'approved') return json({ received: true });
		const [, userId, creditsRaw] = match;
		const credits = Number(creditsRaw);
		if (!Number.isInteger(credits) || credits < 1 || credits > 1000) return json({ received: true });

		const admin = getAdminClient();
		if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
		// Idempotencia: si el pago ya fue registrado, no volver a acreditar.
		const { error: purchaseError } = await admin.from('creative_credit_purchases').insert({
			payment_id: String(payment.id),
			user_id: userId,
			credits,
			amount: payment.transaction_amount || null,
			currency: payment.currency_id || null,
		});
		if (purchaseError) {
			if (purchaseError.code === '23505') return json({ received: true, duplicated: true });
			return fail('mercadopago-webhook', purchaseError, 'No se pudo procesar la notificación.');
		}
		// El id del pago hace de clave del evento: si el webhook se reintenta —o si
		// el navegador también lo reporta— Meta lo cuenta una sola vez.
		void trackEvent(admin, 'tokens_comprados', userId, { cantidad: credits, monto: payment.transaction_amount || null, paymentId: String(payment.id) }, {
			valor: Number(payment.transaction_amount) || 0,
			moneda: payment.currency_id || 'USD',
			email: payment.payer?.email || null,
		});
		const { error: creditError } = await admin.rpc('add_purchased_credits', { p_user_id: userId, p_amount: credits });
		if (creditError) {
			// Permitimos que Mercado Pago reintente el webhook si la acreditación
			// falló después de registrar el pago.
			await admin.from('creative_credit_purchases').delete().eq('payment_id', String(payment.id));
			return fail('mercadopago-webhook', creditError, 'No se pudo procesar la notificación.');
		}
		return json({ received: true, credited: credits });
	}

	// ── Renovación recurrente de una suscripción ────────────────────────────
	// Mercado Pago notifica cada factura por separado. Verificamos la factura y
	// la suscripción en la API antes de renovar los créditos; así un webhook
	// repetido o una factura rechazada nunca entrega créditos de más.
	if (topic === 'subscription_authorized_payment' && dataId) {
		const invoiceResponse = await fetch(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(dataId)}`, {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!invoiceResponse.ok) return json({ error: 'No se pudo verificar la factura recurrente.' }, 502);
		const invoice = await invoiceResponse.json();
		if (invoice?.payment?.status !== 'approved') return json({ received: true });

		const preapprovalId = String(invoice.preapproval_id || '');
		if (!preapprovalId) return json({ received: true });
		const subscriptionResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!subscriptionResponse.ok) return json({ error: 'No se pudo verificar la suscripción renovada.' }, 502);
		const subscription = await subscriptionResponse.json();
		const { userId, planCode, yearly } = resolvePlan(subscription);
		if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
			return json({ received: true });
		}
		if (!planCode) {
			console.error('[mercadopago-webhook] renovación sin plan resoluble', {
				preapprovalId, externalReference: subscription.external_reference, preapprovalPlanId: subscription.preapproval_plan_id,
			});
			return json({ error: 'No se pudo resolver el plan de la suscripción.' }, 422);
		}

		const admin = getAdminClient();
		if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
		const { data: currentProfile, error: profileReadError } = await admin.from('creative_profiles')
			.select('subscription_status,subscription_period_end')
			.eq('user_id', userId).maybeSingle();
		if (profileReadError) return fail('mercadopago-webhook', profileReadError, 'No se pudo leer el perfil.', 500, userId);
		// Sin perfil no hay nada que actualizar, y no es un error nuestro: pasa con
		// las notificaciones de prueba del panel —que traen usuarios inventados— y
		// con cuentas borradas. Responder 500 hacía que Mercado Pago reintentara
		// una y otra vez el mismo aviso imposible: los cuatro errores seguidos del
		// registro son un solo aviso reintentado.
		if (!currentProfile) return json({ received: true, ignored: 'perfil inexistente' });

		const nextPeriod = subscription.next_payment_date || null;
		const monthlyCredits = planCredits[planCode] * (yearly ? 12 : 1);
		const now = new Date().toISOString();
		const { error: subscriptionError } = await admin.from('creative_subscriptions').upsert({
			user_id: userId,
			provider: 'mercado_pago',
			provider_subscription_id: subscription.id,
			plan_code: planCode,
			status: 'authorized',
			monthly_credits: monthlyCredits,
			current_period_end: nextPeriod,
			last_event_id: String(dataId),
			updated_at: now,
		}, { onConflict: 'user_id,provider' });
		if (subscriptionError) return fail('mercadopago-webhook', subscriptionError, 'No se pudo procesar la notificación.');

		/**
		 * Un cobro, una recarga. La factura es la que manda, no las fechas.
		 *
		 * Acá se decidía recargar comparando `next_payment_date` con la fecha
		 * guardada: si había cambiado, se entendía que era un mes nuevo. El problema
		 * es que esa fecha la actualiza Mercado Pago de su lado y no hay ninguna
		 * garantía de que ya lo haya hecho cuando llega el aviso del cobro. Si el
		 * webhook entra antes, la fecha vuelve igual, `periodChanged` da falso, el
		 * estado ya era 'authorized' — y el usuario paga el mes y NO recibe sus
		 * tokens. Peor todavía: el registro del pago se guardaba con `upsert`, así
		 * que el reintento de Mercado Pago recalculaba lo mismo y el mes se perdía
		 * para siempre, sin ningún error en ningún lado.
		 *
		 * El identificador de la factura ya es clave primaria de esta tabla, así que
		 * sirve de llave natural: si el `insert` entra, este cobro es nuevo y hay que
		 * acreditar; si choca con la clave (23505), ya se acreditó y se ignora. Es la
		 * misma mecánica que usa la compra suelta de créditos, que nunca dio
		 * problemas.
		 */
		const payment = invoice.payment || {};
		const { error: paymentLogError } = await admin.from('creative_subscription_payments').insert({
			payment_id: String(dataId),
			user_id: userId,
			provider_subscription_id: String(subscription.id || preapprovalId),
			plan_code: planCode,
			status: 'approved',
			amount: payment.transaction_amount ?? null,
			currency: payment.currency_id ?? null,
			paid_at: payment.date_approved || payment.date_created || now,
			metadata: { paymentType: invoice.payment_type_id || null, statusDetail: payment.status_detail || null },
		});
		const cobroYaAcreditado = paymentLogError?.code === '23505';
		const sinTablaDePagos = paymentLogError?.code === '42P01';
		if (paymentLogError && !cobroYaAcreditado && !sinTablaDePagos) {
			return fail('mercadopago-webhook', paymentLogError, 'No se pudo procesar la notificación.');
		}

		/**
		 * Sin la tabla de pagos —despliegue a medias, migración sin aplicar— se
		 * vuelve al criterio viejo de las fechas. Es peor, pero es lo único que
		 * queda, y es preferible a no acreditar nada.
		 */
		const periodChanged = Boolean(nextPeriod && nextPeriod !== currentProfile.subscription_period_end);
		const shouldRefill = sinTablaDePagos
			? (currentProfile.subscription_status !== 'authorized' || periodChanged)
			: !cobroYaAcreditado;
		if (cobroYaAcreditado) return json({ received: true, duplicated: true });

		const profileUpdate: Record<string, string | number | null> = {
			subscription_status: 'authorized',
			plan_code: planCode,
			credits_monthly: monthlyCredits,
			subscription_period_end: nextPeriod,
			mercado_pago_subscription_id: subscription.id,
			updated_at: now,
		};
		if (shouldRefill) {
			profileUpdate.credits_remaining = monthlyCredits;
			profileUpdate.last_credit_refill_at = now;
		}
		const { data: updatedProfile, error: profileUpdateError } = await admin.from('creative_profiles')
			.update(profileUpdate).eq('user_id', userId).select('user_id').maybeSingle();
		if (profileUpdateError) return fail('mercadopago-webhook', profileUpdateError, 'No se pudo actualizar el perfil.', 500, userId);
		if (!updatedProfile) return json({ received: true, ignored: 'perfil inexistente' });
		// Cobro de suscripción confirmado: es una compra y se reporta como tal. El
		// id de la factura hace de clave del evento, así que un reintento del
		// webhook no la cuenta dos veces.
		void trackEvent(admin, 'suscripcion_pagada', userId, {
			plan: planCode, ciclo: yearly ? 'anual' : 'mensual', renovacion: true, paymentId: String(dataId),
		}, {
			valor: Number(payment.transaction_amount) || 0,
			moneda: payment.currency_id || 'USD',
			// El mail se manda hasheado y mejora mucho la atribución: sin ningún
			// identificador del comprador, Meta cuenta la compra pero no la puede
			// asociar a quien vio el anuncio.
			email: payment.payer?.email || subscription.payer_email || null,
			plan: planCode,
		});
		return json({ received: true, refilled: shouldRefill ? monthlyCredits : 0 });
	}

	if (topic !== 'subscription_preapproval' || !dataId) return json({ received: true });

	const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
	if (!mpResponse.ok) return json({ error: 'No se pudo verificar la suscripción.' }, 502);
	const subscription = await mpResponse.json();

	const { userId, planCode, yearly } = resolvePlan(subscription);
	if (!planCode) {
		if (userId) {
			console.error('[mercadopago-webhook] preapproval sin plan resoluble', {
				dataId, externalReference: subscription.external_reference, preapprovalPlanId: subscription.preapproval_plan_id,
			});
			return json({ error: 'No se pudo resolver el plan de la suscripción.' }, 422);
		}
		return json({ received: true });
	}
	const mappedStatus: Record<string, string> = {
		authorized: 'authorized',
		pending: 'pending',
		paused: 'paused',
		cancelled: 'cancelled',
		canceled: 'cancelled',
	};
	const status = mappedStatus[subscription.status] || 'pending';
	if (userId) {
		const admin = getAdminClient();
		if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
			return json({ error: 'La suscripción no tiene una cuenta válida asociada.' }, 400);
		}
		const nextPeriod = subscription.next_payment_date || null;
		const { data: currentProfile, error: profileReadError } = await admin.from('creative_profiles')
			.select('subscription_status,subscription_period_end,plan_code')
			.eq('user_id', userId).maybeSingle();
		if (profileReadError) return fail('mercadopago-webhook', profileReadError, 'No se pudo leer el perfil.', 500, userId);
		// Sin perfil no hay nada que actualizar, y no es un error nuestro: pasa con
		// las notificaciones de prueba del panel —que traen usuarios inventados— y
		// con cuentas borradas. Responder 500 hacía que Mercado Pago reintentara
		// una y otra vez el mismo aviso imposible: los cuatro errores seguidos del
		// registro son un solo aviso reintentado.
		if (!currentProfile) return json({ received: true, ignored: 'perfil inexistente' });
		const periodChanged = Boolean(nextPeriod && nextPeriod !== currentProfile?.subscription_period_end);
		const shouldRefill = status === 'authorized' && (currentProfile?.subscription_status !== 'authorized' || periodChanged);
		// Anual: se acreditan los 12 meses juntos en cada renovación anual.
		const monthlyCredits = planCredits[planCode] * (yearly ? 12 : 1);
		/**
		 * La fecha de fin solo se pisa cuando llega una nueva.
		 *
		 * Al cancelar, Mercado Pago deja de informar `next_payment_date`. Esto
		 * escribía ese null encima de la fecha guardada y borraba justo el dato del
		 * que depende todo: hasta cuándo sigue valiendo el mes que la persona YA
		 * pagó. Se quedaba sin biblioteca el mismo día que canceló, después de que
		 * la pantalla de baja le prometiera lo contrario.
		 */
		const profileUpdate: Record<string, string | number | null> = {
			subscription_status: status,
			plan_code: planCode,
			credits_monthly: monthlyCredits,
			mercado_pago_subscription_id: subscription.id,
			updated_at: new Date().toISOString(),
		};
		if (nextPeriod) profileUpdate.subscription_period_end = nextPeriod;
		if (shouldRefill) {
			profileUpdate.credits_remaining = monthlyCredits;
			profileUpdate.last_credit_refill_at = new Date().toISOString();
		}
		const { error: subscriptionError } = await admin.from('creative_subscriptions').upsert({
			user_id: userId,
			provider: 'mercado_pago',
			provider_subscription_id: subscription.id,
			plan_code: planCode,
			status,
			monthly_credits: monthlyCredits,
			// Mismo criterio que el perfil: no borrar la fecha con el null que manda
			// Mercado Pago cuando la suscripción se da de baja.
			current_period_end: nextPeriod || currentProfile?.subscription_period_end || null,
			last_event_id: String(dataId),
			updated_at: new Date().toISOString(),
		}, { onConflict: 'user_id,provider' });
		if (subscriptionError) return fail('mercadopago-webhook', subscriptionError, 'No se pudo procesar la notificación.');
		const { data: updatedProfile, error: profileUpdateError } = await admin.from('creative_profiles')
			.update(profileUpdate).eq('user_id', userId).select('user_id').maybeSingle();
		if (profileUpdateError) return fail('mercadopago-webhook', profileUpdateError, 'No se pudo actualizar el perfil.', 500, userId);
		if (!updatedProfile) return json({ received: true, ignored: 'perfil inexistente' });
		/**
		 * La primera autorización de la suscripción: acá es donde se convierte.
		 *
		 * Solo cuando pasa a `authorized` y es la primera vez —`shouldRefill`, el
		 * mismo criterio con el que se acreditan los créditos—, así que las
		 * notificaciones repetidas del mismo estado no reportan una compra nueva.
		 * El monto sale de la suscripción, que es lo que Mercado Pago va a cobrar.
		 */
		if (status === 'authorized' && shouldRefill) {
			void trackEvent(admin, 'suscripcion_pagada', userId, {
				plan: planCode, ciclo: yearly ? 'anual' : 'mensual', renovacion: false, paymentId: String(subscription.id || dataId),
			}, {
				valor: Number(subscription.auto_recurring?.transaction_amount) || 0,
				moneda: subscription.auto_recurring?.currency_id || 'USD',
				email: subscription.payer_email || null,
				plan: planCode,
			});
		}
	}

	return json({ received: true });
};
