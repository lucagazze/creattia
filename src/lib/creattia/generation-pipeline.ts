import { analyzeReferenceLayout, buildReferenceClonePrompt, LANGUAGE_NAMES, type LayoutAnalysis } from './ad-analysis';
import { generateAdImage, type EngineImage } from './image-engines';
import { closestFormat } from './formats';
import type { QualityTier } from './quality-router';

/**
 * Clonar un anuncio ganador con el producto real del usuario.
 *
 * Es EL camino de generación de Creattia: analizar el ganador con visión, armar
 * el prompt clon con ese análisis y renderizar. Estaba implementado dos veces
 * —una en `generate.ts` (Studio) y otra en `batch-worker.ts` (lotes y
 * carruseles)— y las copias se fueron separando: la del lote soportaba un solo
 * producto, tomaba menos fotos y no podía pedir calidad alta. Resultado: la
 * misma referencia daba mejores imágenes desde el Studio que desde un lote.
 *
 * Ahora las dos entran por acá, así que cualquier mejora del prompt o del
 * análisis llega a las imágenes sueltas, a los lotes y a los carruseles a la vez.
 */

export type SubjectMode = 'product' | 'service' | 'saas' | 'brand';
export type StyleMode = 'winner' | 'url' | 'brand';
/** Paleta detectada de la web de la marca, tal como la entiende ad-analysis. */
export type BrandPalette = { background?: string; text?: string; accent?: string; secondary?: string; source?: string };

/**
 * Lo que necesita el prompt. Se separa del render porque el Studio arma sus
 * imágenes de entrada por su cuenta (con mapa de etiquetas) y solo necesita el
 * texto: pedirle buffers de relleno para poder llamar acá no tenía sentido.
 */
export type ClonePromptInput = {
	productNames: string[];
	productFacts: string[];
	brandName: string;
	brief: string;
	language?: string;
	subjectMode: SubjectMode;
	colorMode: StyleMode;
	typoMode: StyleMode;
	brandColors?: string[];
	brandTypography?: { headings?: string; body?: string };
	brandPalette?: BrandPalette;
	avatarDescription?: string;
	/** Cuántas fotos del avatar se adjuntan: cambia el texto del prompt. */
	avatarImageCount?: number;
	/** Para una página de carrusel: en cuál va y de cuántas. */
	carousel?: { index: number; total: number };
};

export type ReferenceCloneInput = ClonePromptInput & {
	keys: { openAIKey: string; googleKey: string };
	/** El anuncio ganador, ya normalizado. */
	reference: EngineImage;
	/** Fotos reales del producto (o de los productos, si son varios). */
	productImages: EngineImage[];
	avatarImages?: EngineImage[];
	logo?: EngineImage | null;
	/** Plan ya revisado por el usuario: si viene, no se vuelve a analizar. */
	approvedPlan?: LayoutAnalysis | null;
	/** 'original' toma la proporción real del ganador. */
	requestedFormat: string;
	tier: QualityTier;
	/** Prefijo de los logs, para poder seguir una generación puntual. */
	logLabel?: string;
};

export type ReferenceCloneResult = {
	buffer: Buffer;
	engine: string;
	prompt: string;
	analysis: LayoutAnalysis | null;
	format: string;
};

/** Proporción real del ganador cuando se pidió 'original'. */
export async function resolveFormat(requestedFormat: string, reference: EngineImage) {
	if (requestedFormat !== 'original') return requestedFormat;
	try {
		const sharp = (await import('sharp')).default;
		const metadata = await sharp(reference.buffer).metadata();
		if (metadata.width && metadata.height) return closestFormat(metadata.width / metadata.height);
	} catch { /* sin metadata legible: cuadrado */ }
	return '1:1';
}

/**
 * Lee el ganador con visión. Un fallo acá no corta la generación: se sigue sin
 * análisis, que es peor prompt pero imagen al fin.
 */
export async function analyzeReference(input: ReferenceCloneInput): Promise<LayoutAnalysis | null> {
	if (input.approvedPlan) return input.approvedPlan;
	try {
		return await analyzeReferenceLayout(input.keys, {
			referenceB64: input.reference.buffer.toString('base64'),
			referenceMime: input.reference.type,
			productB64: input.productImages[0]?.buffer.toString('base64'),
			productMime: input.productImages[0]?.type,
			productName: input.productNames[0] || 'the product in the supplied photo',
			productFacts: input.productFacts.filter(Boolean).join('\n') || input.brief,
			productImages: input.productImages.map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
			avatarImages: (input.avatarImages || []).map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
			avatarDescription: input.avatarDescription,
			brandName: input.brandName,
			language: input.language || '',
			subjectMode: input.subjectMode,
			brandPalette: input.brandPalette,
		});
	} catch (error) {
		console.error(`${input.logLabel || '[pipeline]'} el análisis de layout falló, se sigue sin él:`, error);
		return null;
	}
}

/** El prompt clon a partir del análisis. Separado para poder testearlo solo. */
export function buildClonePrompt(input: ClonePromptInput, analysis: LayoutAnalysis | null, hasLogo: boolean) {
	return buildReferenceClonePrompt({
		productNames: input.productNames,
		productFacts: input.productFacts,
		brandName: input.brandName,
		hasLogo,
		brief: input.brief,
		analysis,
		languageCode: analysis?.language || (input.language && LANGUAGE_NAMES[input.language] ? input.language : undefined),
		adCopy: analysis?.adCopy ? {
			headline: analysis.adCopy.headline,
			subheadline: analysis.adCopy.description,
			cta: analysis.adCopy.cta,
			language: analysis.language,
		} : undefined,
		colorMode: input.colorMode,
		typoMode: input.typoMode,
		brandColors: input.brandColors,
		brandTypography: input.brandTypography,
		brandPalette: input.brandPalette,
		subjectMode: input.subjectMode,
		hasAvatarReference: (input.avatarImageCount || 0) > 0,
		avatarDescription: input.avatarDescription,
		carousel: input.carousel,
	});
}

/**
 * Las imágenes que se le mandan al modelo, en orden: el ganador primero.
 *
 * Cuando el ganador no muestra ningún producto (puro texto sobre un fondo) las
 * fotos NO se adjuntan: tenerlas a la vista hace que el modelo las pegue igual y
 * arruine el diseño original.
 */
export function buildEngineImages(input: ReferenceCloneInput, analysis: LayoutAnalysis | null): EngineImage[] {
	const referenceShowsProduct = analysis?.referenceHasProduct !== false;
	return [
		input.reference,
		...(referenceShowsProduct ? input.productImages : []),
		...(input.avatarImages || []),
		...(input.logo ? [input.logo] : []),
	];
}

/** Analiza, arma el prompt y renderiza. */
export async function renderReferenceClone(input: ReferenceCloneInput): Promise<ReferenceCloneResult> {
	const label = input.logLabel || '[pipeline]';
	const analysis = await analyzeReference(input);
	const prompt = buildClonePrompt({ ...input, avatarImageCount: (input.avatarImages || []).length }, analysis, Boolean(input.logo));
	const format = await resolveFormat(input.requestedFormat, input.reference);
	const images = buildEngineImages(input, analysis);

	console.log(`${label} generando en ${format} (${images.length} imágenes de entrada, calidad ${input.tier})`);
	const { buffer, engine } = await generateAdImage({
		googleKey: input.keys.googleKey,
		openAIKey: input.keys.openAIKey,
		prompt,
		images,
		format,
		tier: input.tier,
	});

	return { buffer, engine, prompt, analysis, format };
}

/**
 * Extensión y content-type reales a partir de los bytes: Gemini devuelve JPEG y
 * OpenAI PNG, y etiquetarlo a ojo rompía la descarga.
 */
export function detectImageType(buffer: Buffer) {
	const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50;
	return { extension: isPng ? 'png' : 'jpg', contentType: isPng ? 'image/png' : 'image/jpeg' };
}
