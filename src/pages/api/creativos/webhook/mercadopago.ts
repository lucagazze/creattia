import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAdminClient, json } from '../../../../lib/creattia/server';

export const prerender = false;

const planCredits: Record<string, number> = { creator: 40, pro: 120, scale: 300 };

function resolvePlan(subscription: any) {
	const external = String(subscription.external_reference || '');
	const [userId, requestedPlan] = external.split(':');
	if (planCredits[requestedPlan]) return { userId, planCode: requestedPlan };
	const providerPlan = String(subscription.preapproval_plan_id || '');
	const configured: Record<string, string> = {
		[String(import.meta.env.MERCADO_PAGO_PLAN_CREATOR_ID || import.meta.env.MERCADO_PAGO_PLAN_ID || '')]: 'creator',
		[String(import.meta.env.MERCADO_PAGO_PLAN_PRO_ID || '')]: 'pro',
		[String(import.meta.env.MERCADO_PAGO_PLAN_SCALE_ID || '')]: 'scale',
	};
	return { userId: external, planCode: configured[providerPlan] || 'creator' };
}

function verifySignature(request: Request, dataId: string, secret: string) {
	const signature = request.headers.get('x-signature') || '';
	const requestId = request.headers.get('x-request-id') || '';
	const parts = Object.fromEntries(signature.split(',').map((part) => {
		const [key, value] = part.trim().split('=');
		return [key, value];
	}));
	const timestamp = parts.ts;
	const received = parts.v1;
	if (!timestamp || !received || !requestId || !dataId) return false;

	const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
	const expected = createHmac('sha256', secret).update(manifest).digest('hex');
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const receivedBuffer = Buffer.from(received, 'utf8');
	return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export const POST: APIRoute = async ({ request, url }) => {
	const secret = import.meta.env.MERCADO_PAGO_WEBHOOK_SECRET;
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	if (!secret || !accessToken) return json({ error: 'Webhook no configurado.' }, 503);

	const body = await request.json().catch(() => ({}));
	const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id') || body?.data?.id || '';
	if (!verifySignature(request, String(dataId), secret)) return json({ error: 'Firma inválida.' }, 401);

	const topic = url.searchParams.get('type') || body?.type || '';
	if (topic !== 'subscription_preapproval' || !dataId) return json({ received: true });

	const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
	if (!mpResponse.ok) return json({ error: 'No se pudo verificar la suscripción.' }, 502);
	const subscription = await mpResponse.json();

	const { userId, planCode } = resolvePlan(subscription);
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
		const nextPeriod = subscription.next_payment_date || null;
		const { data: currentProfile } = await admin?.from('creative_profiles')
			.select('subscription_status,subscription_period_end')
			.eq('user_id', userId).maybeSingle() || { data: null };
		const periodChanged = Boolean(nextPeriod && nextPeriod !== currentProfile?.subscription_period_end);
		const shouldRefill = status === 'authorized' && (currentProfile?.subscription_status !== 'authorized' || periodChanged);
		const monthlyCredits = planCredits[planCode] || planCredits.creator;
		const profileUpdate: Record<string, string | number | null> = {
			subscription_status: status,
			plan_code: planCode,
			credits_monthly: monthlyCredits,
			subscription_period_end: nextPeriod,
			mercado_pago_subscription_id: subscription.id,
			updated_at: new Date().toISOString(),
		};
		if (shouldRefill) {
			profileUpdate.credits_remaining = monthlyCredits;
			profileUpdate.last_credit_refill_at = new Date().toISOString();
		}
		await admin?.from('creative_subscriptions').upsert({
			user_id: userId,
			provider: 'mercado_pago',
			provider_subscription_id: subscription.id,
			plan_code: planCode,
			status,
			monthly_credits: monthlyCredits,
			current_period_end: nextPeriod,
			last_event_id: String(dataId),
			updated_at: new Date().toISOString(),
		}, { onConflict: 'user_id,provider' });
		await admin?.from('creative_profiles').update(profileUpdate).eq('user_id', userId);
	}

	return json({ received: true });
};
