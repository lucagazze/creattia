import { analyzeReferenceLayout, buildReferenceClonePrompt, LANGUAGE_NAMES, type LayoutAnalysis } from './ad-analysis';
import { buildPromptCorto } from './prompt-corto';
import { generateAdImage, type EngineImage, type EngineUsage } from './image-engines';
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
 * Hoy el PROMPT es uno solo: `buildClonePrompt` lo arman los tres. El render
 * completo (`renderReferenceClone`) lo usan el lote y el carrusel; el Studio
 * junta sus imágenes de entrada por su cuenta —necesita el mapa de etiquetas de
 * cada input— y llama al motor él mismo, con el mismo prompt y el mismo nivel.
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
/**
 * Quién aparece en el anuncio.
 *
 * - `none`: no aparece nadie.
 * - `ai`: decide el modelo, mirando el ganador y el producto.
 * - `described`: la persona la describe el usuario con palabras.
 * - `upload`: la persona viene en fotos de referencia.
 */
export type PersonMode = 'none' | 'ai' | 'described' | 'upload';

export const PERSON_MODES: PersonMode[] = ['none', 'ai', 'described', 'upload'];

/**
 * Lee el modo que llega del cliente sin confiar en él.
 *
 * El valor viaja por FormData y por el JSON del carrusel, y además hay
 * generaciones viejas guardadas sin este campo. El `fallback` existe para eso:
 * una fila anterior a este cambio que traía `avatarId` era una carga de fotos,
 * y sin decírselo se resolvía como 'ai' y el avatar se perdía en silencio.
 */
export function parsePersonMode(raw: unknown, fallback: PersonMode = 'ai'): PersonMode {
	const value = typeof raw === 'string' ? raw.trim() : '';
	return PERSON_MODES.includes(value as PersonMode) ? value as PersonMode : fallback;
}

/**
 * Qué opción viene marcada al abrir la revisión.
 *
 * Se mira lo que el análisis encontró en el ganador: si el aviso que se está
 * clonando muestra gente, sacarla de golpe rompe justo lo que lo hace funcionar,
 * así que lo razonable es dejar que el modelo la elija. Si no muestra a nadie,
 * lo razonable es que el clon tampoco.
 *
 * Se filtra igual que el bloque de personas del prompt: el analizador a veces
 * devuelve entradas vacías, y contarlas hacía que un anuncio sin una sola cara
 * abriera recomendando poner una.
 */
export function personModeRecomendado(people: LayoutAnalysis['people'] | null | undefined): PersonMode {
	const visibles = (people || []).filter((persona) => persona && (persona.description || persona.directive || persona.where));
	return visibles.length ? 'ai' : 'none';
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
	/** Quién aparece: lo elige el usuario en la revisión, antes de generar. */
	personMode?: PersonMode;
	/**
	 * La persona en palabras. La llena "yo la describo" con lo que escribió el
	 * usuario, y "cargar avatar" con la descripción guardada del avatar elegido.
	 */
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
	/** Consumo real informado por el motor, para poder costear cada creativo. */
	usage?: EngineUsage;
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

/**
 * Cuál de los dos prompts de render se usa.
 *
 * El largo ronda los 20.000 caracteres y treinta secciones marcadas CRITICAL:
 * cada defecto observado agregó un bloque. La hipótesis del corto —que vive en
 * `prompt-corto.ts` y ya estaba escrito— es que ese volumen DILUYE, y que dos
 * principios bien dichos gobiernan mejor en 7.000: nada que no esté en el
 * ganador, y nada del ganador salvo su estructura.
 *
 * ARRANCA EN EL LARGO, que es el que conoce todo lo que se fue agregando: que un
 * inmueble o un vehículo no se redibujen, los colores del ganador en
 * hexadecimal, el telón, quién aparece en el anuncio, la piel fotográfica, la web
 * visible en todas las páginas y la consistencia entre ellas. El corto es
 * anterior a todo eso y activarlo apaga esas siete cosas.
 *
 * `RENDER_PROMPT=corto` lo cambia para los tres caminos a la vez —Studio, lote y
 * carrusel— sin tocar código, que es lo que permite comparar la MISMA referencia
 * con los dos y decidir mirando en vez de discutiendo.
 */
function usaPromptCorto() {
	const elegido = String(process.env.RENDER_PROMPT || import.meta.env.RENDER_PROMPT || 'largo').toLowerCase();
	return elegido === 'corto';
}

/** El prompt clon a partir del análisis. Separado para poder testearlo solo. */
export function buildClonePrompt(input: ClonePromptInput, analysis: LayoutAnalysis | null, hasLogo: boolean) {
	const armar = usaPromptCorto() ? buildPromptCorto : buildReferenceClonePrompt;
	return armar({
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
		personMode: input.personMode,
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
	const { buffer, engine, usage } = await generateAdImage({
		googleKey: input.keys.googleKey,
		openAIKey: input.keys.openAIKey,
		prompt,
		images,
		format,
		tier: input.tier,
	});

	return { buffer, engine, prompt, analysis, format, usage };
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
