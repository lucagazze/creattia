import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const plans = {
	creator: { 
		monthly: { env: 'MERCADO_PAGO_PLAN_CREATOR_ID', fallback: 'MERCADO_PAGO_PLAN_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_CREATOR_YEARLY_ID', fallback: 'MERCADO_PAGO_PLAN_YEARLY_ID' },
		credits: 40, 
		reason: 'Creattia — Creator' 
	},
	pro: { 
		monthly: { env: 'MERCADO_PAGO_PLAN_PRO_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_PRO_YEARLY_ID' },
		credits: 120, 
		reason: 'Creattia — Pro' 
	},
	scale: { 
		monthly: { env: 'MERCADO_PAGO_PLAN_SCALE_ID' },
		yearly: { env: 'MERCADO_PAGO_PLAN_SCALE_YEARLY_ID' },
		credits: 300, 
		reason: 'Creattia — Scale' 
	},
} as const;

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

export const POST: APIRoute = async ({ request, url }) => {
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	const body = await request.json().catch(() => ({}));
	const planCode = String(body.planCode || 'creator') as keyof typeof plans;
	const billingCycle = String(body.billingCycle || 'monthly') as 'monthly' | 'yearly';
	const plan = plans[planCode];
	if (!plan) return json({ error: 'El plan elegido no existe.' }, 400);
	const auth = await authenticateRequest(request);
	if (!auth.user?.email) return json({ error: auth.error || 'La cuenta necesita un email válido.' }, 401);
	
	const cycleInfo = plan[billingCycle];
	const planId = import.meta.env[cycleInfo.env] || ('fallback' in cycleInfo ? import.meta.env[cycleInfo.fallback] : '');
	if (!accessToken || !planId) {
		return json({ error: `Mercado Pago todavía no está configurado para el plan ${planCode} (${billingCycle}).`, requiresConfiguration: true }, 503);
	}
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const { data: existing, error: existingError } = await admin.from('creative_subscriptions')
		.select('status,plan_code')
		.eq('user_id', auth.user.id)
		.eq('provider', 'mercado_pago')
		.maybeSingle();
	if (existingError) return json({ error: existingError.message }, 500);
	if (existing && ['authorized', 'pending', 'paused'].includes(existing.status)) {
		return json({ error: 'Ya tenés una suscripción activa o pendiente. Cancelala antes de elegir otro plan.', code: 'SUBSCRIPTION_EXISTS' }, 409);
	}

	const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;
	const response = await fetch('https://api.mercadopago.com/preapproval', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			preapproval_plan_id: planId,
			payer_email: auth.user.email,
			external_reference: `${auth.user.id}:${planCode}`,
			reason: plan.reason,
			back_url: `${siteUrl}/app/?subscription=return`,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok || !payload.init_point) {
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

	return json({ checkoutUrl: payload.init_point });
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
