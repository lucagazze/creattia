import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const plans = {
	creator: { env: 'MERCADO_PAGO_PLAN_CREATOR_ID', fallback: 'MERCADO_PAGO_PLAN_ID', credits: 40, reason: 'Creattia — Creator' },
	pro: { env: 'MERCADO_PAGO_PLAN_PRO_ID', credits: 120, reason: 'Creattia — Pro' },
	scale: { env: 'MERCADO_PAGO_PLAN_SCALE_ID', credits: 300, reason: 'Creattia — Scale' },
} as const;

export const POST: APIRoute = async ({ request, url }) => {
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	const body = await request.json().catch(() => ({}));
	const planCode = String(body.planCode || 'creator') as keyof typeof plans;
	const plan = plans[planCode];
	if (!plan) return json({ error: 'El plan elegido no existe.' }, 400);
	const planId = import.meta.env[plan.env] || ('fallback' in plan ? import.meta.env[plan.fallback] : '');
	if (!accessToken || !planId) {
		return json({ error: `Mercado Pago todavía no está configurado para el plan ${planCode}.`, requiresConfiguration: true }, 503);
	}

	const auth = await authenticateRequest(request);
	if (!auth.user?.email) return json({ error: auth.error || 'La cuenta necesita un email válido.' }, 401);

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

	const payload = await response.json();
	if (!response.ok || !payload.init_point) {
		return json({ error: payload.message || 'Mercado Pago no pudo iniciar la suscripción.' }, 502);
	}

	const admin = getAdminClient();
	await admin?.from('creative_subscriptions').upsert({
		user_id: auth.user.id,
		provider: 'mercado_pago',
		provider_subscription_id: payload.id,
		plan_code: planCode,
		status: 'pending',
		monthly_credits: plan.credits,
		updated_at: new Date().toISOString(),
	}, { onConflict: 'user_id,provider' });
	await admin?.from('creative_profiles').update({
		subscription_status: 'pending',
		plan_code: planCode,
		credits_monthly: plan.credits,
		mercado_pago_subscription_id: payload.id,
		updated_at: new Date().toISOString(),
	}).eq('user_id', auth.user.id);

	return json({ checkoutUrl: payload.init_point });
};
