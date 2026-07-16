import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

// Pago por imagen: entrada barata sin suscripción. El precio unitario se define
// en CREDIT_UNIT_PRICE (el doble del precio efectivo por imagen del suscriptor).
const packs = [1, 5, 10];

function getUnitPrice() {
	const raw = import.meta.env.CREDIT_UNIT_PRICE || process.env.CREDIT_UNIT_PRICE || '';
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const unitPrice = getUnitPrice();
	return json({
		unitPrice,
		currency: import.meta.env.CREDIT_CURRENCY || process.env.CREDIT_CURRENCY || 'ARS',
		packs,
		configured: unitPrice > 0 && Boolean(import.meta.env.MERCADO_PAGO_ACCESS_TOKEN),
	});
};

export const POST: APIRoute = async ({ request, url }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user?.email) return json({ error: auth.error || 'La cuenta necesita un email válido.' }, 401);
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	const unitPrice = getUnitPrice();
	if (!accessToken || !unitPrice) {
		return json({ error: 'La compra de créditos todavía no está configurada.', requiresConfiguration: true }, 503);
	}
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const body = await request.json().catch(() => ({}));
	const quantity = Number(body.quantity);
	if (!packs.includes(quantity)) return json({ error: 'Elegí un pack válido de créditos.' }, 400);

	const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;
	const currency = import.meta.env.CREDIT_CURRENCY || process.env.CREDIT_CURRENCY || 'ARS';
	const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
		method: 'POST',
		headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			items: [{
				title: `Creattia — ${quantity} ${quantity === 1 ? 'imagen' : 'imágenes'}`,
				quantity,
				unit_price: unitPrice,
				currency_id: currency,
			}],
			payer: { email: auth.user.email },
			external_reference: `${auth.user.id}:credits:${quantity}`,
			back_urls: {
				success: `${siteUrl}/app/?purchase=success`,
				pending: `${siteUrl}/app/?purchase=pending`,
				failure: `${siteUrl}/app/?purchase=failure`,
			},
			auto_return: 'approved',
			statement_descriptor: 'CREATTIA',
		}),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || !payload.init_point) {
		return json({ error: payload.message || 'Mercado Pago no pudo iniciar el pago.' }, 502);
	}
	return json({ checkoutUrl: payload.init_point });
};
