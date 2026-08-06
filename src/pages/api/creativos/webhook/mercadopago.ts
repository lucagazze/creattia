import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail, getAdminClient, json } from '../../../../lib/creattia/server';

export const prerender = false;

const planCredits: Record<string, number> = { creator: 5, pro: 60, scale: 120, agency: 300 };

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
		if (profileReadError || !currentProfile) return fail('mercadopago-webhook', profileReadError, 'Perfil no encontrado.');

		const nextPeriod = subscription.next_payment_date || null;
		const periodChanged = Boolean(nextPeriod && nextPeriod !== currentProfile.subscription_period_end);
		const shouldRefill = currentProfile.subscription_status !== 'authorized' || periodChanged;
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
		const payment = invoice.payment || {};
		const { error: paymentLogError } = await admin.from('creative_subscription_payments').upsert({
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
		if (paymentLogError && paymentLogError.code !== '42P01') return fail('mercadopago-webhook', paymentLogError, 'No se pudo procesar la notificación.');

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
		if (profileUpdateError || !updatedProfile) return fail('mercadopago-webhook', profileUpdateError, 'Perfil no encontrado.');
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
			.select('subscription_status,subscription_period_end')
			.eq('user_id', userId).maybeSingle();
		if (profileReadError || !currentProfile) return fail('mercadopago-webhook', profileReadError, 'Perfil no encontrado.');
		const periodChanged = Boolean(nextPeriod && nextPeriod !== currentProfile?.subscription_period_end);
		const shouldRefill = status === 'authorized' && (currentProfile?.subscription_status !== 'authorized' || periodChanged);
		// Anual: se acreditan los 12 meses juntos en cada renovación anual.
		const monthlyCredits = planCredits[planCode] * (yearly ? 12 : 1);
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
		const { error: subscriptionError } = await admin.from('creative_subscriptions').upsert({
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
		if (subscriptionError) return fail('mercadopago-webhook', subscriptionError, 'No se pudo procesar la notificación.');
		const { data: updatedProfile, error: profileUpdateError } = await admin.from('creative_profiles')
			.update(profileUpdate).eq('user_id', userId).select('user_id').maybeSingle();
		if (profileUpdateError || !updatedProfile) return fail('mercadopago-webhook', profileUpdateError, 'Perfil no encontrado.');
	}

	return json({ received: true });
};
