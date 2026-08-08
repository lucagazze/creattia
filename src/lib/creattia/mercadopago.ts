/**
 * La cuenta de Mercado Pago, preguntada a Mercado Pago.
 *
 * El país y la moneda venían de variables de entorno cargadas a mano, y una sola
 * letra mal ahí rompe TODOS los pagos sin que nada falle en el código: la
 * preferencia se crea, el checkout abre, y recién al confirmar sale
 * "Por motivos de seguridad, esta transacción no puede ser finalizada". Desde
 * afuera es indistinguible de un problema de la tarjeta, así que se prueba con
 * otra y con otra y siempre da lo mismo.
 *
 * El caso concreto: la cuenta es argentina y `CREDIT_CURRENCY` decía USD. Una
 * cuenta de Argentina liquida en pesos y nada más; una preferencia en dólares se
 * crea igual y se rechaza al pagar.
 *
 * Acá la moneda deja de configurarse: se lee de la cuenta. Lo único que sigue
 * siendo una decisión es el tipo de cambio, porque los precios de la app están
 * en dólares y hay que pasarlos a la moneda que la cuenta puede cobrar.
 */

export type MercadoPagoAccount = {
	/** MLA, MLB, MLM, MLC, MCO, MPE, MLU… */
	siteId: string;
	/** La moneda que esta cuenta puede cobrar de verdad. */
	currency: string;
	/** El mail del cobrador. Nadie puede pagarse a sí mismo. */
	email: string;
	nickname: string;
};

/** Moneda de liquidación de cada país donde opera Mercado Pago. */
const SITE_CURRENCY: Record<string, string> = {
	MLA: 'ARS', // Argentina
	MLB: 'BRL', // Brasil
	MLM: 'MXN', // México
	MLC: 'CLP', // Chile
	MCO: 'COP', // Colombia
	MPE: 'PEN', // Perú
	MLU: 'UYU', // Uruguay
	MLV: 'VES', // Venezuela
	MBO: 'BOB', // Bolivia
	MPY: 'PYG', // Paraguay
	MEC: 'USD', // Ecuador
	MRD: 'DOP', // República Dominicana
	MCR: 'CRC', // Costa Rica
	MGT: 'GTQ', // Guatemala
	MHN: 'HNL', // Honduras
	MNI: 'NIO', // Nicaragua
	MPA: 'PAB', // Panamá
	MSV: 'USD', // El Salvador
};

/**
 * Se consulta una vez por instancia y se recuerda.
 *
 * Es un dato que no cambia —el país de una cuenta es fijo— y agregarle una
 * llamada de red a cada checkout solo suma latencia y un punto más de falla
 * justo en el camino del pago.
 */
let cached: { token: string; account: MercadoPagoAccount } | null = null;
let inFlight: Promise<MercadoPagoAccount | null> | null = null;

export async function getMercadoPagoAccount(accessToken: string): Promise<MercadoPagoAccount | null> {
	if (!accessToken) return null;
	if (cached && cached.token === accessToken) return cached.account;
	// Dos checkouts simultáneos con la caché fría pedían lo mismo dos veces.
	if (inFlight) return inFlight;
	inFlight = (async () => {
		try {
			const response = await fetch('https://api.mercadopago.com/users/me', {
				headers: { authorization: `Bearer ${accessToken}` },
			});
			if (!response.ok) {
				console.error(`[mercadopago] no se pudo leer la cuenta (${response.status}); se usa la configuración manual`);
				return null;
			}
			const data: any = await response.json();
			const siteId = String(data.site_id || '').toUpperCase();
			const currency = SITE_CURRENCY[siteId];
			if (!currency) {
				console.error(`[mercadopago] país desconocido "${siteId}"; se usa la configuración manual`);
				return null;
			}
			const account: MercadoPagoAccount = {
				siteId,
				currency,
				email: String(data.email || '').trim().toLowerCase(),
				nickname: String(data.nickname || ''),
			};
			cached = { token: accessToken, account };
			return account;
		} catch (error) {
			console.error('[mercadopago] no se pudo leer la cuenta:', error instanceof Error ? error.message : error);
			return null;
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

/** Solo para los tests: vuelve a preguntar en la próxima llamada. */
export function resetMercadoPagoAccountCache() {
	cached = null;
	inFlight = null;
}

export type MontoResuelto = {
	/** Lo que se le cobra a la persona, en la moneda de la cuenta. */
	amount: number;
	currency: string;
	/** El precio de lista, siempre en dólares, para reportar el valor real. */
	usd: number;
};

/**
 * Pasa un precio en dólares a lo que la cuenta puede cobrar.
 *
 * Si la cuenta ya liquida en dólares no hay nada que convertir. Si no, hace
 * falta el tipo de cambio: sin él no se puede cobrar bien, y cobrar mal es peor
 * que no cobrar, así que corta con un mensaje que dice exactamente qué falta.
 */
export function resolverMonto(usdPrice: number, currency: string, usdRate: number): MontoResuelto {
	if (currency === 'USD') return { amount: redondear(usdPrice), currency, usd: usdPrice };
	if (!Number.isFinite(usdRate) || usdRate <= 0) {
		throw new Error(
			`La cuenta de Mercado Pago cobra en ${currency}, así que falta configurar MERCADO_PAGO_USD_RATE `
			+ `con cuántos ${currency} vale un dólar. Sin ese dato no se puede cobrar el precio correcto.`,
		);
	}
	// Las monedas sin decimales (peso chileno, guaraní, peso colombiano) rechazan
	// un importe con centavos.
	const sinDecimales = ['CLP', 'PYG', 'COP'].includes(currency);
	const bruto = usdPrice * usdRate;
	return { amount: sinDecimales ? Math.round(bruto) : redondear(bruto), currency, usd: usdPrice };
}

function redondear(valor: number) {
	return Math.round(valor * 100) / 100;
}

/**
 * El tipo de cambio configurado.
 *
 * `MERCADO_PAGO_ARS_PER_USD` era el nombre viejo, atado a un solo país. Se sigue
 * leyendo para no romper la configuración que ya está cargada en producción.
 */
export function tipoDeCambioConfigurado(): number {
	const raw = import.meta.env.MERCADO_PAGO_USD_RATE
		|| process.env.MERCADO_PAGO_USD_RATE
		|| import.meta.env.MERCADO_PAGO_ARS_PER_USD
		|| process.env.MERCADO_PAGO_ARS_PER_USD
		|| 0;
	return Number(raw) || 0;
}

/**
 * Quien cobra no puede pagarse a sí mismo.
 *
 * Mercado Pago lo rechaza con el mismo mensaje genérico de seguridad, sin
 * explicar la causa. Detectarlo acá permite decirle a la persona lo que
 * realmente pasa en vez de dejarla probando tarjetas.
 */
export function esAutoPago(account: MercadoPagoAccount | null, payerEmail: string): boolean {
	if (!account?.email) return false;
	return account.email === String(payerEmail || '').trim().toLowerCase();
}

export const MENSAJE_AUTOPAGO = 'Esta cuenta es la misma que recibe los pagos, así que Mercado Pago la bloquea por seguridad. Probá desde otra cuenta o con otro email.';
