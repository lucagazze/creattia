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

/**
 * De qué habla el anuncio.
 * - `product` / `service`: de una oferta concreta.
 * - `catalog`: del negocio en general, mostrando una selección de lo que vende.
 *   Es lo que corresponde cuando se pasó la home de la tienda o una categoría.
 */
export type SubjectMode = 'product' | 'service' | 'saas' | 'brand' | 'catalog';

/**
 * Los sujetos válidos, en un solo lugar.
 *
 * Estaban repetidos a mano en cada endpoint como `['product','service','saas','brand']`,
 * y cuando se sumó 'catalog' al tipo esas listas quedaron desactualizadas: el
 * valor llegaba, no matcheaba, y caía silenciosamente en 'product'. Un anuncio
 * de la tienda terminaba hablando de un solo artículo sin que nada fallara.
 */
export const SUBJECT_MODES: SubjectMode[] = ['product', 'service', 'saas', 'brand', 'catalog'];

/**
 * De qué habla el anuncio, en los términos en que lo piensa una persona.
 *
 * Antes se elegía entre tres: "la tienda", "un producto" y "un servicio". Las
 * dos primeras responden a la misma pregunta —¿de todo o de una cosa?— y la
 * tercera responde a otra distinta: si eso que se vende es un objeto o no. Eso
 * último no hace falta preguntarlo: se sabe mirando si hay fotos de producto.
 *
 * Queda una sola decisión, que es la única que el usuario tiene que tomar.
 */
export type Alcance = 'general' | 'especifico';

/**
 * Traduce la elección de la persona al modo interno del generador.
 *
 * `conFotos` distingue lo que se puede mostrar de lo que no: un servicio o un
 * software no tienen packaging, y pedirle al modelo que invente uno es lo que
 * producía envases genéricos que no existen.
 */
export function subjectModeDesde(alcance: Alcance, conFotos: boolean): SubjectMode {
	if (alcance === 'general') return conFotos ? 'catalog' : 'brand';
	return conFotos ? 'product' : 'service';
}

/** El alcance que corresponde a un modo interno, para mostrarlo ya elegido. */
export function alcanceDesde(mode: SubjectMode | null | undefined): Alcance {
	return mode === 'catalog' || mode === 'brand' ? 'general' : 'especifico';
}

/** Ficha y catálogo se apoyan en fotos reales de productos; el resto no. */
export function usesRealProductPhotos(mode: SubjectMode): boolean {
	return mode === 'product' || mode === 'catalog';
}
export type StyleMode = 'winner' | 'url' | 'brand';
/** Paleta detectada de la web de la marca, tal como la entiende ad-analysis. */
export type BrandPalette = { background?: string; text?: string; accent?: string; secondary?: string; source?: string };

const PALETTE_ROLES = ['background', 'text', 'accent', 'secondary'] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Corrección manual de la paleta detectada.
 *
 * La detección de colores se equivoca —toma el gris de un banner, o el color de
 * un botón de cookies— y hasta ahora no había forma de corregirla: el creativo
 * salía con una identidad que no era la de la marca. Solo se aceptan colores
 * hexadecimales completos, así que un valor raro del cliente no puede colarse
 * dentro del prompt.
 */
export function mergePaletteOverride(detected: BrandPalette | undefined, raw: unknown): BrandPalette | undefined {
	if (!raw || typeof raw !== 'object') return detected;
	const override = raw as Record<string, unknown>;
	const corrected: BrandPalette = { ...(detected || {}) };
	let touched = false;
	for (const role of PALETTE_ROLES) {
		const value = override[role];
		if (typeof value === 'string' && HEX_COLOR.test(value.trim())) {
			corrected[role] = value.trim().toLowerCase();
			touched = true;
		}
	}
	if (!touched) return detected;
	// Queda anotado que la paleta la corrigió una persona, no la detección.
	return { ...corrected, source: 'corregida por el usuario' };
}

/** Lee la corrección que viaja como JSON en el formulario o el body. */
export function parsePaletteOverride(raw: unknown): Record<string, string> | null {
	if (!raw) return null;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!parsed || typeof parsed !== 'object') return null;
		const clean: Record<string, string> = {};
		for (const role of PALETTE_ROLES) {
			const value = (parsed as any)[role];
			if (typeof value === 'string' && HEX_COLOR.test(value.trim())) clean[role] = value.trim().toLowerCase();
		}
		return Object.keys(clean).length ? clean : null;
	} catch {
		return null;
	}
}

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
		// El idioma que eligió el usuario manda sobre el que traía el anuncio
		// ganador. Estaba al revés: el análisis devuelve el idioma que LEYÓ en la
		// referencia, así que con un ganador en español el creativo salía en
		// español aunque se hubiera pedido inglés.
		languageCode: (input.language && LANGUAGE_NAMES[input.language]) ? input.language : analysis?.language,
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

/** Identidad tomada de una URL que el usuario pega al regenerar. */
export type BrandOverride = {
	name?: string;
	logoUrl?: string;
	palette?: BrandPalette;
	typography?: { headings?: string; body?: string };
};

/**
 * Valida la identidad que manda el cliente al regenerar.
 *
 * Todo esto entra al prompt y el logo se descarga, así que no se confía en el
 * cliente: los colores tienen que ser hexadecimales, la URL del logo tiene que
 * ser http(s) —la descarga la hace safeExternalFetch, que bloquea redes
 * privadas— y los textos se recortan.
 */
export function parseBrandOverride(raw: unknown): BrandOverride | null {
	if (!raw) return null;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!parsed || typeof parsed !== 'object') return null;
		const source = parsed as Record<string, any>;
		const override: BrandOverride = {};

		if (typeof source.name === 'string' && source.name.trim()) override.name = source.name.trim().slice(0, 80);
		if (typeof source.logoUrl === 'string') {
			try {
				const url = new URL(source.logoUrl.trim());
				if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) {
					override.logoUrl = url.toString();
				}
			} catch { /* URL inválida: se ignora el logo */ }
		}
		const palette = parsePaletteOverride(source.palette);
		if (palette) override.palette = palette as BrandPalette;
		if (source.typography && typeof source.typography === 'object') {
			const headings = typeof source.typography.headings === 'string' ? source.typography.headings.trim().slice(0, 60) : '';
			const body = typeof source.typography.body === 'string' ? source.typography.body.trim().slice(0, 60) : '';
			if (headings || body) override.typography = { headings, body };
		}
		return Object.keys(override).length ? override : null;
	} catch {
		return null;
	}
}
