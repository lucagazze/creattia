export type SubscriptionPlanFeature = {
	name: string;
	active: boolean;
};

export type SubscriptionPlan = {
	code: 'free' | 'creator' | 'pro' | 'scale' | 'agency';
	name: string;
	price: number;
	credits?: number;
	/**
	 * Los tokens tal como se anuncian en la tarjeta, para poder resaltarlos.
	 *
	 * La cantidad vivía suelta dentro de un texto de la lista de beneficios
	 * ("40 tokens al mes"), así que se perdía entre los otros seis renglones: el
	 * dato que más pesa en la decisión se leía igual que "soporte por email". Acá
	 * queda como un campo aparte para que la pantalla lo imprima en negrita
	 * arriba, y no como una frase más.
	 *
	 * El plan gratuito también lo tiene aunque no venda créditos: su token mensual
	 * no se cobra, pero la persona necesita ver que existe y que se renueva.
	 */
	tokensLabel: string;
	/** Marcas activas simultáneas que habilita el plan. */
	brandLimit: number;
	description: string;
	featured: boolean;
	features: SubscriptionPlanFeature[];
};

/**
 * Meses que se pagan al contratar un año: 10 en vez de 12, o sea dos de regalo.
 *
 * El cobro anual existía en el código pero era inalcanzable —exigía planes
 * cargados a mano en Mercado Pago que nunca se crearon— y además nadie había
 * definido su precio. Vive acá para que la pantalla y el cobro no puedan
 * desincronizarse: el descuento se calcula una sola vez.
 */
export const YEARLY_PAID_MONTHS = 10;

/** Lo que se cobra de una por un año del plan. */
export function yearlyPriceFor(monthlyPrice: number): number {
	return Math.round(monthlyPrice * YEARLY_PAID_MONTHS * 100) / 100;
}

/** Cuánto se ahorra contra pagar mes a mes. */
export function yearlySavingsFor(monthlyPrice: number): number {
	return Math.round((monthlyPrice * 12 - yearlyPriceFor(monthlyPrice)) * 100) / 100;
}

/**
 * Fuente única de verdad para precios, tokens y beneficios de la oferta.
 *
 * La tabla completa con precio por token y margen está en el encabezado de
 * `pages/api/creativos/subscribe.ts`, que es donde se cobra. Acá va lo que ve el
 * usuario; los números tienen que ser los mismos y hay tests que lo verifican.
 *
 * El precio por token ya no se anuncia en ninguna tarjeta. Se decía "≈ $0.62 por
 * token" al lado de un token suelto de $0.49 y la gente leía que el plan era más
 * caro que comprar de a uno, cuando lo que compra un plan es la biblioteca
 * completa más el volumen. El número servía para justificar el precio adentro y
 * no para venderlo afuera.
 */
export const subscriptionPlans: SubscriptionPlan[] = [
	{
		code: 'free',
		name: 'Gratis',
		price: 0,
		// Decía "1 token" a secas y se leía como un token único de bienvenida: la
		// gente lo gastaba y daba por terminada la prueba. Se renueva todos los
		// meses, y decirlo es lo que hace que vuelva.
		tokensLabel: '1 token',
		description: 'Probá Creattia con 1 token por mes y una muestra de cada ángulo.',
		brandLimit: 1,
		featured: false,
		features: [
			{ name: '5 creativos por ángulo para explorar', active: true },
			{ name: 'Muestra gratuita de la biblioteca', active: true },
			{ name: 'Comprá tokens sueltos cuando quieras', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Sin tarjeta para empezar', active: true },
		],
	},
	{
		code: 'creator',
		name: 'Básico',
		price: 9.99,
		credits: 5,
		tokensLabel: '5 tokens',
		// Lo que se compra acá es la puerta, no el volumen: la biblioteca entera de
		// anuncios que hoy están funcionando. Los cinco tokens alcanzan para probar
		// el flujo completo con la marca propia; el que necesita producir de verdad
		// tiene el escalón siguiente a diez dólares de distancia.
		description: 'Entrá a la biblioteca completa de ganadores. Incluye 5 tokens por mes.',
		brandLimit: 1,
		featured: false,
		features: [
			{ name: 'Biblioteca completa de ganadores', active: true },
			{ name: 'Todos los ángulos, estáticos y carruseles', active: true },
			{ name: 'Tokens extra cuando los necesites', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Cancelá cuando quieras', active: true },
		],
	},
	{
		code: 'pro',
		name: 'Pro',
		price: 19.99,
		credits: 40,
		tokensLabel: '40 tokens',
		description: 'El primer plan de volumen: un anuncio nuevo por semana, sin quedarte corto.',
		brandLimit: 2,
		// El plan que se recomienda: es el primero que deja producir a ritmo real.
		// Destacar el de entrada empuja a un plan de cinco imágenes que se agota en
		// los primeros días y termina en una cancelación.
		featured: true,
		features: [
			{ name: 'Todo lo del plan Básico', active: true },
			{ name: 'Hasta 4 generaciones simultáneas', active: true },
			{ name: 'Hasta 2 marcas activas', active: true },
			{ name: 'Soporte prioritario por email', active: true },
		],
	},
	{
		code: 'scale',
		name: 'Scale',
		price: 39.99,
		credits: 82,
		tokensLabel: '82 tokens',
		description: 'Para probar varios ángulos por semana y renovar antes de que se cansen.',
		brandLimit: 4,
		featured: false,
		features: [
			{ name: 'Todo lo del plan Pro', active: true },
			{ name: 'Hasta 6 generaciones simultáneas', active: true },
			{ name: 'Hasta 4 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		],
	},
	{
		code: 'agency',
		name: 'Agency',
		price: 69.99,
		credits: 145,
		tokensLabel: '145 tokens',
		description: 'Para agencias y equipos que sostienen varias marcas al mismo tiempo.',
		brandLimit: 6,
		featured: false,
		features: [
			{ name: 'Todo lo del plan Scale', active: true },
			{ name: 'Generaciones simultáneas ilimitadas', active: true },
			{ name: 'Hasta 6 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		],
	},
];

/**
 * Marcas activas habilitadas por plan. Fuente única: la oferta comercial de
 * arriba. `brands.ts` tenía su propia tabla, sin 'agency', así que la cuenta más
 * cara del catálogo terminaba limitada a 1 marca — el valor de reserva.
 */
export function brandLimitForPlan(planCode?: string | null) {
	const plan = subscriptionPlans.find((item) => item.code === planCode);
	return plan?.brandLimit ?? 1;
}

/**
 * Créditos mensuales de cada plan pago. El webhook de Mercado Pago y el panel
 * admin leen de acá: tenían su propia copia de la tabla y se desincronizaron
 * —una renovación acreditaba 300 cuando el plan ya vendía 260—.
 */
export const planCredits: Record<string, number> = Object.fromEntries(
	subscriptionPlans.filter((plan) => plan.credits).map((plan) => [plan.code, plan.credits as number]),
);

/** Créditos del plan, o 0 si el código no corresponde a ningún plan pago. */
export function creditsForPlan(planCode?: string | null) {
	return planCredits[String(planCode || '')] ?? 0;
}
