export type SubscriptionPlanFeature = {
	name: string;
	active: boolean;
};

export type SubscriptionPlan = {
	code: 'free' | 'creator' | 'pro' | 'scale' | 'agency';
	name: string;
	price: number;
	credits?: number;
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

/** Fuente única de verdad para precios, tokens y beneficios de la oferta. */
export const subscriptionPlans: SubscriptionPlan[] = [
	{
		code: 'free',
		name: 'Gratis',
		price: 0,
		description: 'Probá Creattia con 1 token y una muestra de cada ángulo.',
		brandLimit: 1,
		featured: false,
		features: [
			{ name: '1 token de regalo', active: true },
			{ name: '5 creativos por ángulo para explorar', active: true },
			{ name: 'Biblioteca completa bloqueada', active: true },
			{ name: 'Comprá tokens cuando quieras', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Sin tarjeta para empezar', active: true },
		],
	},
	{
		code: 'creator',
		name: 'Básico',
		price: 9.99,
		credits: 5,
		description: 'Biblioteca completa y 5 tokens mensuales para empezar a crear.',
		brandLimit: 1,
		featured: false,
		features: [
			{ name: 'Biblioteca completa de ganadores', active: true },
			{ name: '5 tokens incluidos por mes', active: true },
			{ name: 'Tokens extra disponibles', active: true },
			{ name: 'Todos los ángulos, estáticos y carruseles', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Cancelá cuando quieras', active: true },
		],
	},
	{
		code: 'pro',
		name: 'Pro',
		price: 24.99,
		credits: 40,
		description: 'Hasta 40 tokens mensuales para marcas en crecimiento.',
		brandLimit: 2,
		// El plan que se recomienda: es el que mejor relación deja por token y el
		// que sostiene un ritmo de producción real. Destacar el más barato empuja
		// a un plan de cinco imágenes que se agota en la primera semana.
		featured: true,
		features: [
			{ name: '40 tokens al mes', active: true },
			{ name: '≈ $0.62 por token — el mejor equilibrio', active: true },
			{ name: 'Hasta 4 generaciones simultáneas', active: true },
			{ name: 'Hasta 2 marcas activas', active: true },
			{ name: 'Soporte prioritario por email', active: true },
		],
	},
	{
		code: 'scale',
		name: 'Scale',
		price: 49.99,
		credits: 90,
		description: 'Hasta 90 tokens mensuales para producir a mayor volumen.',
		brandLimit: 4,
		featured: false,
		features: [
			{ name: '90 tokens al mes', active: true },
			{ name: '≈ $0.56 por token — menor costo', active: true },
			{ name: 'Hasta 6 generaciones simultáneas', active: true },
			{ name: 'Hasta 4 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		],
	},
	{
		code: 'agency',
		name: 'Agency',
		price: 97.70,
		credits: 190,
		description: 'Hasta 190 tokens mensuales para agencias y equipos grandes.',
		brandLimit: 6,
		featured: false,
		features: [
			{ name: '190 tokens al mes', active: true },
			{ name: '≈ $0.51 por token — mejor costo', active: true },
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
