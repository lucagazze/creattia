import type { APIRoute } from 'astro';
import { authenticateRequest, fail, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

/**
 * Planes y créditos.
 *
 * Costo real por imagen terminada: USD 0.082 — USD 0.078 de gpt-image-2 medium
 * más USD 0.004 del análisis de layout (medido con el consumo de tokens que
 * devuelven las APIs, jul-2026).
 *
 * Los créditos de acá tienen que ir en línea con el precio configurado en
 * Mercado Pago. Con estos precios el margen queda por encima del 50% incluso si
 * el usuario consume el 100% de sus créditos:
 *
 * Costo real por imagen: USD 0.24 (0.236 de gpt-image-2 'high' + 0.004 del
 * análisis del ganador). TODAS las imágenes salen en 'high', sin nivel elegible
 * por el usuario: en 'medium' el texto sale con bordes blandos y el modelo le
 * agrega sombras y halos, que es justo lo que delata a un anuncio hecho con IA.
 * Una imagen, un crédito.
 *

 *
 *   Básico    USD 9.99/mes  ->   5 tokens -> USD 2.00 por token -> margen 88%
 *   Pro       USD 24.99/mes ->  40 tokens -> USD 0.62 por token -> margen 62%
 *   Scale     USD 49.99/mes ->  90 tokens -> USD 0.56 por token -> margen 57%
 *   Agency    USD 97.70/mes -> 190 tokens -> USD 0.51 por token -> margen 53%
 *
 * Esos márgenes son con el usuario consumiendo el 100% de sus créditos; con el
 * consumo real típico (55%) todos quedan bastante por encima.
 *
 * Compra suelta sin suscripción: USD 0.49 por imagen (margen 51%).
 *
 * REGLA: ningún plan puede quedar por debajo del 50% de margen. Con el costo
 * actual eso fija un piso de USD 0.48 por token. Lo verifica un test.
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
		price: 24.99,
		credits: 40,
		reason: 'Creattia — Pro' 
	},
	scale: { 
		monthly: { env: 'MERCADO_PAGO_PLAN_SCALE_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_SCALE_YEARLY_ID' },
		price: 49.99,
		credits: 90,
		reason: 'Creattia — Scale' 
	},
	agency: {
		monthly: { env: 'MERCADO_PAGO_PLAN_AGENCY_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_AGENCY_YEARLY_ID' },
		price: 97.70,
		credits: 190,
		reason: 'Creattia — Agency'
	},
} as const;

const subscriptionCurrency = String(
	import.meta.env.MERCADO_PAGO_SUBSCRIPTION_CURRENCY
	|| import.meta.env.MERCADO_PAGO_CURRENCY
	|| 'USD'
).toUpperCase();
const arsPerUsd = Number(import.meta.env.MERCADO_PAGO_ARS_PER_USD || 0);

function providerAmount(usdPrice: number) {
	if (subscriptionCurrency !== 'ARS') return usdPrice;
	if (!Number.isFinite(arsPerUsd) || arsPerUsd <= 0) {
		throw new Error('Falta configurar MERCADO_PAGO_ARS_PER_USD para cobrar suscripciones en pesos.');
	}
	return Math.round(usdPrice * arsPerUsd * 100) / 100;
}

async function cancelProviderSubscription(subscriptionId: string, accessToken: string) {
	try {
		return await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
			method: 'PUT',
			headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'canceled' }),
		});
	} catch {
		return null;
	}
}

async function updateProviderSubscription(subscriptionId: string, accessToken: string, payload: Record<string, unknown>) {
	try {
		return await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
			method: 'PUT',
			headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
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
	let transactionAmount: number = plan.price;
	try {
		transactionAmount = providerAmount(plan.price);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'La conversión de moneda no está configurada.' }, 503);
	}
	if (!planId && billingCycle !== 'monthly') {
		return json({ error: `Mercado Pago todavía no está configurado para la modalidad ${billingCycle}.`, requiresConfiguration: true }, 503);
	}
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const { data: existing, error: existingError } = await admin.from('creative_subscriptions')
		.select('provider_subscription_id,status,plan_code,current_period_end')
		.eq('user_id', auth.user.id)
		.eq('provider', 'mercado_pago')
		.maybeSingle();
	if (existingError) return fail('subscribe', existingError, 'No se pudo completar la operación sobre tu suscripción.');
	const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;
	const existingIsActive = Boolean(existing && ['authorized', 'pending', 'paused'].includes(existing.status));
	if (existingIsActive && existing?.plan_code === planCode) {
		return json({ error: 'Ese ya es tu plan actual.', code: 'SAME_PLAN' }, 409);
	}

	if (existingIsActive && changeCurrent && existing?.provider_subscription_id && existing.status !== 'pending') {
		const updateResponse = await updateProviderSubscription(existing.provider_subscription_id, accessToken, {
			reason: plan.reason,
			external_reference: `${auth.user.id}:${planCode}:${billingCycle}`,
			back_url: `${siteUrl}/app/?subscription=return`,
			auto_recurring: {
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
		return json({ error: 'Ya tenés una suscripción activa o pendiente.', code: 'SUBSCRIPTION_EXISTS', currentPlanCode: existing?.plan_code || null }, 409);
	}

	if (existing?.status === 'pending' && existing.provider_subscription_id) {
		const cancelResponse = await cancelProviderSubscription(existing.provider_subscription_id, accessToken);
		if (!cancelResponse?.ok) return json({ error: 'No pudimos cancelar el checkout pendiente. Tu plan actual sigue sin cambios.', code: 'PENDING_SUBSCRIPTION_CANCEL_FAILED' }, 502);
		await admin.from('creative_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() })
			.eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
	}

	const preapprovalPayload: Record<string, unknown> = {
		payer_email: auth.user.email,
		external_reference: `${auth.user.id}:${planCode}:${billingCycle}`,
		reason: plan.reason,
		back_url: `${siteUrl}/app/?subscription=return`,
	};
	if (planId) {
		preapprovalPayload.preapproval_plan_id = planId;
	} else {
		// Mercado Pago permite crear una suscripción mensual sin un plan previo.
		// Esto mantiene funcionando el checkout aunque todavía no se hayan cargado
		// los IDs opcionales de cada plan en Vercel.
		preapprovalPayload.auto_recurring = {
			frequency: 1,
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
	const checkoutUrl = payload.init_point || payload.sandbox_init_point;
	if (!response.ok || !checkoutUrl) {
		return json({ error: payload.message || 'Mercado Pago no pudo iniciar la suscripción.' }, 502);
	}

	const { error: subscriptionError } = await admin.from('creative_subscriptions').upsert({
		user_id: auth.user.id,
		provider: 'mercado_pago',
		provider_subscription_id: payload.id,
		plan_code: planCode,
		status: 'pending',
		monthly_credits: plan.credits,
		updated_at: new Date().toISOString(),
	}, { onConflict: 'user_id,provider' });
	if (subscriptionError) {
		await cancelProviderSubscription(String(payload.id), accessToken);
		return json({ error: 'No pudimos preparar el pago de forma segura. No se creó ninguna suscripción.' }, 500);
	}
	const { data: updatedProfile, error: profileError } = await admin.from('creative_profiles').update({
		subscription_status: 'pending',
		plan_code: planCode,
		credits_monthly: plan.credits,
		mercado_pago_subscription_id: payload.id,
		updated_at: new Date().toISOString(),
	}).eq('user_id', auth.user.id).select('user_id').maybeSingle();
	if (profileError || !updatedProfile) {
		await cancelProviderSubscription(String(payload.id), accessToken);
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
	if (!response?.ok) return json({ error: payload.message || 'Mercado Pago no pudo cancelar la suscripción.' }, 502);

	const now = new Date().toISOString();
	const { error: subscriptionError } = await admin.from('creative_subscriptions').update({ status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
	if (subscriptionError) return fail('subscribe', subscriptionError, 'No se pudo completar la operación sobre tu suscripción.');
	const { error: profileError } = await admin.from('creative_profiles').update({ subscription_status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id);
	if (profileError) return fail('subscribe', profileError, 'No se pudo completar la operación sobre tu suscripción.');
	return json({ ok: true, status: 'cancelled' });
};
