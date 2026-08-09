import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
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

// Compra puntual: USD 0.49 por crédito. Con un costo de USD 0.24 por imagen
// deja 51% de margen, el mínimo que se fijó para toda la oferta.
const DEFAULT_UNIT_PRICE = 0.49;
const MAX_CREDITS_PER_CHECKOUT = 1000;

function getUnitPrice() {
	return DEFAULT_UNIT_PRICE;
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const unitPrice = getUnitPrice();
	const accessToken = import.meta.env.MERCADO_PAGO_ACCESS_TOKEN;
	// El precio que se muestra tiene que ser el que se va a cobrar: anunciar
	// dólares y cobrar pesos es la forma más rápida de que alguien abandone el
	// pago en la pantalla siguiente.
	const account = accessToken ? await getMercadoPagoAccount(accessToken) : null;
	const monedaDeCobro = account?.currency
		|| import.meta.env.CREDIT_CURRENCY
		|| process.env.CREDIT_CURRENCY
		|| 'USD';
	let montoACobrar = unitPrice;
	let convertible = true;
	try {
		montoACobrar = resolverMonto(unitPrice, monedaDeCobro, tipoDeCambioConfigurado()).amount;
	} catch {
		convertible = false;
	}
	/**
	 * Los precios se muestran en dólares y se cobran en la moneda de la cuenta.
	 *
	 * El precio de la oferta está pensado en dólares —es la unidad en la que se
	 * calculan los márgenes y la que figura en toda la web—, pero la cuenta de
	 * Mercado Pago solo liquida su moneda local. Devolver el importe ya convertido
	 * hacía que la app mostrara pesos en un lugar y dólares en otro. Van los dos:
	 * el de la vidriera y el que va a aparecer en el resumen de la tarjeta.
	 */
	return json({
		unitPrice,
		currency: 'USD',
		cobro: convertible && monedaDeCobro !== 'USD'
			? { monto: montoACobrar, moneda: monedaDeCobro }
			: null,
		maxCredits: MAX_CREDITS_PER_CHECKOUT,
		configured: unitPrice > 0 && Boolean(accessToken) && convertible,
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
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CREDITS_PER_CHECKOUT) {
		return json({ error: `Elegí entre 1 y ${MAX_CREDITS_PER_CHECKOUT} créditos.` }, 400);
	}

	// Cada llamada crea una preferencia en Mercado Pago. Nadie abre veinte
	// checkouts por hora de forma legítima, y sin tope una cuenta puede llenar de
	// preferencias basura la cuenta de Mercado Pago o hacernos pegar contra su
	// límite de API. No cierra por defecto: un limitador caído no puede impedir
	// que alguien pague.
	const dentroDelLimite = await checkRateLimit(admin, auth.user.id, 'buy-credits-checkout', 20, 3600);
	if (!dentroDelLimite) {
		return json({ error: 'Abriste muchos pagos seguidos. Esperá un momento antes de intentar de nuevo.' }, 429);
	}

	const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;

	/**
	 * La moneda la decide la cuenta, no una variable.
	 *
	 * Estaba configurada a mano en `CREDIT_CURRENCY` y decía USD sobre una cuenta
	 * argentina, que solo puede liquidar en pesos. La preferencia se creaba, el
	 * checkout abría y el pago se rechazaba con "por motivos de seguridad esta
	 * transacción no puede ser finalizada" — un mensaje que no menciona la moneda,
	 * así que la conclusión natural es que el problema es la tarjeta.
	 */
	const account = await getMercadoPagoAccount(accessToken);
	const currency = account?.currency
		|| import.meta.env.CREDIT_CURRENCY
		|| process.env.CREDIT_CURRENCY
		|| 'USD';
	let precioUnitario = unitPrice;
	try {
		precioUnitario = resolverMonto(unitPrice, currency, tipoDeCambioConfigurado()).amount;
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'La conversión de moneda no está configurada.', requiresConfiguration: true }, 503);
	}

	// Mercado Pago no deja que el dueño de la cuenta se cobre a sí mismo y lo
	// rechaza con el mismo mensaje genérico de seguridad. Decirlo antes de abrir
	// el checkout ahorra probar tarjeta por tarjeta buscando una que funcione.
	if (esAutoPago(account, auth.user.email)) {
		return json({ error: MENSAJE_AUTOPAGO, code: 'SELF_PAYMENT' }, 409);
	}

	/**
	 * El nombre de quien paga, si la cuenta lo tiene.
	 *
	 * No es un adorno: Mercado Pago puntúa el riesgo de cada operación con los
	 * datos que recibe, y una preferencia mínima —un email suelto y un ítem sin
	 * descripción— puntúa peor que una completa. Dos pagos reales se rechazaron
	 * con `cc_rejected_high_risk`, con dos tarjetas distintas, que es el rechazo
	 * del motor antifraude y no de la tarjeta.
	 */
	const nombreCompleto = String(
		(auth.user.user_metadata as Record<string, unknown> | undefined)?.full_name
		|| (auth.user.user_metadata as Record<string, unknown> | undefined)?.name
		|| '',
	).trim();
	const [nombre, ...resto] = nombreCompleto.split(/\s+/).filter(Boolean);
	const apellido = resto.join(' ');

	const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
		method: 'POST',
		headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=utf-8' },
		body: JSON.stringify({
			items: [{
				id: `creattia-creditos-${quantity}`,
				title: `Creattia — ${quantity} ${quantity === 1 ? 'imagen' : 'imágenes'}`,
				description: `${quantity} ${quantity === 1 ? 'crédito' : 'créditos'} para generar ${quantity === 1 ? 'una imagen publicitaria' : 'imágenes publicitarias'} en Creattia`,
				// Mercado Pago usa la categoría para calibrar el riesgo por rubro.
				category_id: 'services',
				quantity,
				unit_price: precioUnitario,
				currency_id: currency,
			}],
			payer: {
				email: auth.user.email,
				...(nombre ? { name: nombre } : {}),
				...(apellido ? { surname: apellido } : {}),
			},
			external_reference: `${auth.user.id}:credits:${quantity}`,
			back_urls: {
				success: `${siteUrl}/app/?purchase=success`,
				pending: `${siteUrl}/app/?purchase=pending`,
				failure: `${siteUrl}/app/?purchase=failure`,
			},
			auto_return: 'approved',
			// El aviso queda atado a esta preferencia y no solo a la configuración
			// general del panel: si alguien toca el panel, los pagos se siguen
			// acreditando.
			notification_url: `${siteUrl}/api/creativos/webhook/mercadopago`,
			metadata: { user_id: auth.user.id, creditos: quantity },
			statement_descriptor: 'CREATTIA',
		}),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || !payload.init_point) {
		return json({ error: payload.message || 'Mercado Pago no pudo iniciar el pago.' }, 502);
	}
	/**
	 * Abrir el checkout de créditos también es un `InitiateCheckout`.
	 *
	 * Este archivo importaba `trackEvent` y no lo llamaba nunca: la mitad del
	 * embudo de pago —la compra suelta de imágenes— no reportaba nada. Meta veía
	 * gente que compra sin haber iniciado un checkout, y desde el panel no había
	 * forma de saber cuántos abren el pago de créditos y no lo completan.
	 */
	// El valor que se reporta es el que se va a cobrar de verdad, en la moneda en
	// la que se cobra: un importe en pesos etiquetado como dólares le enseña a
	// Meta un ticket promedio que no existe y desajusta toda la optimización.
	const navegador = datosDelNavegador(request);
	void trackEvent(admin, 'checkout_abierto', auth.user.id, { tipo: 'creditos', cantidad: quantity, monto: precioUnitario * quantity }, {
		valor: precioUnitario * quantity,
		moneda: currency,
		email: auth.user.email,
	}, navegador);
	// Última parada antes de irse a Mercado Pago: acá se guardan la IP y las
	// cookies del píxel, porque cuando el pago se confirme quien va a avisar es
	// el servidor de Mercado Pago y no va a traer nada de esto.
	void guardarDatosDelNavegador(admin, auth.user.id, navegador);
	return json({ checkoutUrl: payload.init_point });
};
