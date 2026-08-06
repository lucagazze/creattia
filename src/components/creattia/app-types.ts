import type { Session } from '@supabase/supabase-js';

/**
 * Tipos compartidos por las pantallas de la app. Vivían arriba de
 * CreativeApp.tsx, que mezclaba tipos, helpers y 30 componentes en un solo
 * archivo de 4.700 líneas.
 */

export type View = 'home' | 'library' | 'studio' | 'history' | 'plans' | 'brand' | 'winners' | 'generation' | 'saved' | 'discover' | 'admin';

// Lote de generación en curso: la API responde al instante y el trabajo pesado
// sigue en el servidor; el front lo sigue por batch_id en creative_generations.
export type ActiveBatch = {
	batchId: string;
	title: string;
	referenceUrl?: string;
	count: number;
	startedAt: number;
	status: 'processing' | 'completed' | 'failed';
	results: Generation[];
	error?: string;
};
export type AppProfile = {
	fullName: string;
	brandName: string;
	website: string;
	instagram: string;
	primaryColor: string;
	secondaryColor: string;
	credits: number;
	monthlyCredits: number;
	subscriptionStatus: string;
	planCode: string;
	subscriptionPeriodEnd: string;
	onboardingCompleted: boolean;
	brandSummary: string;
	catalogStatus: string;
	catalogLastSyncedAt: string;
	catalogError: string;
	logoDataUrl?: string;
};
export type DemoSession = { user: { id: string; email: string } };
export type AppSession = Session | DemoSession;

export type Generation = {
	id: string;
	/** Ruta en storage: permite pedir el original cuando se abre la imagen. */
	outputPath?: string | null;
	title: string;
	imageUrl: string;
	format: string;
	createdAt: string;
	category: string;
	templateId?: number;
	preset?: string;
	imageType?: string;
	productId?: string;
	productIds?: string[];
	batchId?: string;
	outputIndex?: number;
	referenceUrl?: string;
	/** Anuncio ganador que se usó como referencia para generar esta imagen. */
	referencePath?: string;
	/** De qué hablaba el anuncio: sirve para que regenerar no cambie de tema. */
	subjectMode?: 'product' | 'service' | 'saas' | 'brand' | 'catalog';
	/** URL de la que salió, para poder rehacerla con la misma fuente. */
	sourceUrl?: string;
	referenceName?: string;
	status?: 'processing' | 'completed' | 'failed';
	error?: string;
};

export type HistoryGroup = { key: string; createdAt: string; item: Generation; slides?: Generation[] };
export type LightboxState = { item: Generation; slides?: Generation[] };

/**
 * Las páginas de un mismo carrusel comparten batchId y variant_key='carrusel':
 * se agrupan en un solo creativo con paginado en vez de aparecer como imágenes sueltas.
 */

export type VariationStrength = 'exact' | 'light' | 'strong';
export type CreativeReference = {
	id: string;
	name: string;
	description: string;
	imageUrl: string;
	storagePath?: string;
};
export type Product = {
	id: string;
	name: string;
	description: string;
	priceText: string;
	currency: string;
	productUrl: string;
	imageUrl: string;
	imageUrls: string[];
	imageCount: number;
	source: string;
};
