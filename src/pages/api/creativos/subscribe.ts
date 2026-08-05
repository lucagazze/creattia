import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

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
 * Costo real por imagen: USD 0.086. Todas las imágenes salen en gpt-image-2
 * medium — se descartó el ruteo automático a 'low' porque degradaba la letra
 * chica de las etiquetas, y no vale arriesgar un anuncio por unos centavos.
 *
 *   Básico    USD 9.99/mes  ->   5 créditos  -> precio de entrada del lanzamiento
 *   Pro       USD 24.99/mes -> 60 créditos  -> costo 5.16  -> margen 79.4%
 *   Scale     USD 49.99/mes -> 120 créditos -> costo 10.32 -> margen 79.4%
 *   Agency    USD 97.70/mes -> 300 créditos -> costo 25.80 -> margen 73.6%
 *
 * Esos márgenes son con el usuario consumiendo el 100% de sus créditos; con el
 * consumo real típico (55%) los tres superan el 70%.
 *
 * Compra suelta sin suscripción: USD 0.30 por imagen.
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
		credits: 60,
		reason: 'Creattia — Pro' 
	},
	scale: { 
		monthly: { env: 'MERCADO_PAGO_PLAN_SCALE_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_SCALE_YEARLY_ID' },
		price: 49.99,
		credits: 120,
		reason: 'Creattia — Scale' 
	},
	agency: {
		monthly: { env: 'MERCADO_PAGO_PLAN_AGENCY_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_AGENCY_YEARLY_ID' },
		price: 97.70,
		credits: 300,
		reason: 'Creattia — Agency'
	},
} as const;

const subscriptionCurrency = import.meta.env.MERCADO_PAGO_CURRENCY || 'USD';

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
	const planCode = String(body.planCode || 'creator') as keyof typeof plans;
	const billingCycle = String(body.billingCycle || 'monthly') as 'monthly' | 'yearly';
	const plan = plans[planCode];
	if (!plan) return json({ error: 'El plan elegido no existe.' }, 400);
	const changeCurrent = body.changeCurrent === true;
	const auth = await authenticateRequest(request);
	if (!auth.user?.email) return json({ error: auth.error || 'La cuenta necesita un email válido.' }, 401);
	
	const cycleInfo = plan[billingCycle];
	const planId = import.meta.env[cycleInfo.env] || ('fallback' in cycleInfo ? import.meta.env[cycleInfo.fallback] : '');
	if (!accessToken) {
		return json({ error: 'Mercado Pago todavía no está configurado.', requiresConfiguration: true }, 503);
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
	if (existingError) return json({ error: existingError.message }, 500);
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
				transaction_amount: plan.price,
				currency_id: subscriptionCurrency,
			},
		});
		const updatePayload = await updateResponse?.json().catch(() => ({})) || {};
		if (!updateResponse?.ok) {
			return json({ error: updatePayload.message || 'Mercado Pago no pudo actualizar tu suscripción. Tu plan actual sigue sin cambios.', code: 'SUBSCRIPTION_UPDATE_FAILED' }, 502);
		}

		const now = new Date().toISOString();
		const nextPeriod = updatePayload.next_payment_date || existing.current_period_end || null;
		const { data: currentProfile, error: currentProfileError } = await admin.from('creative_profiles')
			.select('credits_remaining,credits_monthly')
			.eq('user_id', auth.user.id).maybeSingle();
		if (currentProfileError) return json({ error: currentProfileError.message }, 500);
		const consumedCredits = Math.max(0, Number(currentProfile?.credits_monthly || 0) - Number(currentProfile?.credits_remaining || 0));
		const adjustedCredits = Math.max(0, plan.credits - consumedCredits);
		const { error: subscriptionUpdateError } = await admin.from('creative_subscriptions').update({
			plan_code: planCode,
			status: existing.status,
			monthly_credits: plan.credits,
			current_period_end: nextPeriod,
			updated_at: now,
		}).eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
		if (subscriptionUpdateError) return json({ error: subscriptionUpdateError.message }, 500);
		const { error: profileUpdateError } = await admin.from('creative_profiles').update({
			subscription_status: existing.status,
			plan_code: planCode,
			credits_monthly: plan.credits,
			credits_remaining: adjustedCredits,
			subscription_period_end: nextPeriod,
			mercado_pago_subscription_id: existing.provider_subscription_id,
			updated_at: now,
		}).eq('user_id', auth.user.id);
		if (profileUpdateError) return json({ error: profileUpdateError.message }, 500);
		return json({ changed: true, planCode, status: existing.status, creditsRemaining: adjustedCredits, subscriptionPeriodEnd: nextPeriod });
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
			transaction_amount: plan.price,
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
		return json({ error: 'No pudimos preparar el pago de forma segura. No se creó ninguna suscripción.', detail: subscriptionError.message }, 500);
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
		return json({ error: 'No pudimos preparar el pago de forma segura. No se creó ninguna suscripción.', detail: profileError?.message || 'Perfil no encontrado.' }, 500);
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
	if (readError) return json({ error: readError.message }, 500);
	if (!subscription?.provider_subscription_id) return json({ error: 'No encontramos una suscripción activa para cancelar.' }, 404);
	if (subscription.status === 'cancelled') return json({ ok: true, status: 'cancelled' });

	const response = await cancelProviderSubscription(subscription.provider_subscription_id, accessToken);
	const payload = await response?.json().catch(() => ({})) || {};
	if (!response?.ok) return json({ error: payload.message || 'Mercado Pago no pudo cancelar la suscripción.' }, 502);

	const now = new Date().toISOString();
	const { error: subscriptionError } = await admin.from('creative_subscriptions').update({ status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id).eq('provider', 'mercado_pago');
	if (subscriptionError) return json({ error: subscriptionError.message }, 500);
	const { error: profileError } = await admin.from('creative_profiles').update({ subscription_status: 'cancelled', updated_at: now })
		.eq('user_id', auth.user.id);
	if (profileError) return json({ error: profileError.message }, 500);
	return json({ ok: true, status: 'cancelled' });
};
