export type SubscriptionPlanFeature = {
	name: string;
	active: boolean;
};

export type SubscriptionPlan = {
	code: 'free' | 'creator' | 'pro' | 'scale' | 'agency';
	name: string;
	price: number;
	credits?: number;
	description: string;
	featured: boolean;
	features: SubscriptionPlanFeature[];
};

/** Fuente única de verdad para precios, tokens y beneficios de la oferta. */
export const subscriptionPlans: SubscriptionPlan[] = [
	{
		code: 'free',
		name: 'Gratis',
		price: 0,
		description: 'Probá Creattia con 1 token y una muestra de cada ángulo.',
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
		featured: true,
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
		credits: 60,
		description: 'Hasta 60 tokens mensuales para marcas en crecimiento.',
		featured: false,
		features: [
			{ name: '60 tokens al mes', active: true },
			{ name: '≈ $0.42 por token — el mejor equilibrio', active: true },
			{ name: 'Hasta 4 generaciones simultáneas', active: true },
			{ name: 'Hasta 2 marcas activas', active: true },
			{ name: 'Soporte prioritario por email', active: true },
		],
	},
	{
		code: 'scale',
		name: 'Scale',
		price: 49.99,
		credits: 120,
		description: 'Hasta 120 tokens mensuales para producir a mayor volumen.',
		featured: false,
		features: [
			{ name: '120 tokens al mes', active: true },
			{ name: '≈ $0.42 por token — menor costo', active: true },
			{ name: 'Hasta 6 generaciones simultáneas', active: true },
			{ name: 'Hasta 4 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		],
	},
	{
		code: 'agency',
		name: 'Agency',
		price: 97.70,
		credits: 300,
		description: 'Hasta 300 tokens mensuales para agencias y equipos grandes.',
		featured: false,
		features: [
			{ name: '300 tokens al mes', active: true },
			{ name: '≈ $0.33 por token — mejor costo', active: true },
			{ name: 'Generaciones simultáneas ilimitadas', active: true },
			{ name: 'Hasta 6 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		],
	},
];
