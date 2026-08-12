import { analyzeReferenceLayout, buildReferenceClonePrompt, LANGUAGE_NAMES, type LayoutAnalysis, type LogoMode } from './ad-analysis';
import { buildPromptCorto } from './prompt-corto';
import { buildPromptLibre, fotosParaElMotor, leerElProducto, refotografiarProducto, todasSonPlacas, type LecturaDelProducto } from './clon-libre';
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
 * La selección manual de fotos del producto, cuando el usuario la hizo.
 *
 * Mismo patrón que la persona y el logo: el default —TODAS las fotos, que es
 * b8ded8c— no se toca, y una elección explícita lo REEMPLAZA. Cada foto se
 * identifica por su ruta de storage, o por `upload:N` para las subidas a mano.
 * Vacío o inválido devuelve null y rige el default: nadie se queda sin fotos
 * por un checkbox mal mandado.
 */
export function parseFotosElegidas(raw: unknown): string[] | null {
	if (!raw) return null;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!Array.isArray(parsed)) return null;
		const claves = [...new Set(parsed
			.map((valor) => String(valor || '').trim())
			.filter((valor) => valor && valor.length <= 300))].slice(0, 24);
		return claves.length ? claves : null;
	} catch {
		return null;
	}
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

export type { LogoMode };

export const LOGO_MODES: LogoMode[] = ['texto', 'imagen', 'nada'];

/**
 * Lee el modo de firma sin confiar en el cliente.
 *
 * Devuelve `undefined` —y no un default— cuando no vino ninguno, que es el caso
 * de todo lo anterior a este campo: el historial y los lotes viejos guardaron un
 * sí/no. Resolverlo acá como 'nada' rompía esas generaciones, porque el sí/no en
 * `false` NO quería decir "sin firma": con un ganador que firmaba escribiendo su
 * nombre, el clon escribía el del negocio. Quién sabe eso es el prompt, que tiene
 * el análisis del ganador delante; acá todavía no se leyó nada.
 */
export function parseLogoMode(raw: unknown): LogoMode | undefined {
	const value = typeof raw === 'string' ? raw.trim() : '';
	return LOGO_MODES.includes(value as LogoMode) ? value as LogoMode : undefined;
}

/**
 * Qué opción viene marcada al abrir la revisión.
 *
 * Si el ganador firma en algún lado, el clon firma en ese mismo lado y con el
 * nombre ESCRITO. Es lo que sale bien casi siempre: el lugar de la firma en
 * estos avisos es una línea de tipografía chica, y meterle ahí el archivo de un
 * logo —que suele ser un escudo, o un lockup con símbolo— cambia el peso visual
 * de esa esquina y se lee como pegoteado. El archivo queda a un toque de
 * distancia para el que lo quiera.
 *
 * Si el ganador no firma en ningún lado, el clon tampoco: abrirle un hueco a una
 * marca es agregarle al diseño algo que el original no tenía.
 */
export function logoModeRecomendado(analisis: LayoutAnalysis | null | undefined | Array<LayoutAnalysis | null | undefined>): LogoMode {
	const paginas = Array.isArray(analisis) ? analisis : [analisis];
	return paginas.some((pagina) => pagina?.templateHasLogoSlot) ? 'texto' : 'nada';
}

const ROLES_DE_COLOR = ['fondo', 'titulo', 'texto', 'acento', 'boton', 'textoBoton'] as const;
export type RolesDeColor = Partial<Record<typeof ROLES_DE_COLOR[number], string>>;

/**
 * Los colores por función que llegan del cliente.
 *
 * Todo esto entra al prompt, así que se valida igual que la paleta: solo
 * hexadecimales de seis dígitos y solo los cinco roles conocidos. Un valor raro
 * acá no rompe nada visible, pero sería texto del usuario metido en el prompt.
 */
export function parseRolesDeColor(raw: unknown): RolesDeColor | null {
	if (!raw) return null;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!parsed || typeof parsed !== 'object') return null;
		const roles: RolesDeColor = {};
		for (const rol of ROLES_DE_COLOR) {
			const valor = String((parsed as any)[rol] || '').trim();
			if (HEX_COLOR.test(valor)) roles[rol] = valor.toUpperCase();
		}
		return Object.keys(roles).length ? roles : null;
	} catch {
		return null;
	}
}

/**
 * La tipografía corregida a mano en la pantalla de confirmar.
 *
 * El escaneo lee el CSS del sitio y a veces devuelve el nombre interno de la
 * fuente —"judgemestar"— que no le dice nada al modelo. Corregirlo a "Playfair
 * Display" cambia el aviso; dejarlo sin poder tocar era ver el error y no poder
 * hacer nada. Los nombres se recortan y se limpian: van derecho al prompt.
 */
export function parseTipografiaElegida(raw: unknown): { headings?: string; body?: string } | null {
	if (!raw) return null;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!parsed || typeof parsed !== 'object') return null;
		const limpio = (valor: unknown) => String(valor || '').replace(/[^\p{L}\p{N} .,'&+-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
		const headings = limpio((parsed as any).headings);
		const body = limpio((parsed as any).body);
		return (headings || body) ? { ...(headings ? { headings } : {}), ...(body ? { body } : {}) } : null;
	} catch {
		return null;
	}
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
	/** Con qué se firma: el nombre escrito, el archivo del logo, o nada. */
	logoMode?: LogoMode;
	/** Dónde pasa la escena, cuando el usuario lo pidió. Sustituye, no suma. */
	lugarElegido?: string;
	pressRowMode?: 'quitar' | 'texto' | 'logos';
	pressRowItems?: string[];
	/**
	 * La persona en palabras. La llena "yo la describo" con lo que escribió el
	 * usuario, y "cargar avatar" con la descripción guardada del avatar elegido.
	 */
	avatarDescription?: string;
	/** Cuántas fotos del avatar se adjuntan: cambia el texto del prompt. */
	avatarImageCount?: number;
	/** Para una página de carrusel: en cuál va y de cuántas. */
	carousel?: { index: number; total: number };
	/**
	 * Cuántas páginas hermanas se adjuntan como contexto.
	 *
	 * El prompt TIENE que nombrarlas. Viajaban como imágenes y ninguna línea decía
	 * qué eran, así que el modelo recibía dos o tres anuncios terminados de más sin
	 * una palabra sobre ellos — y el riesgo es que copie una hermana en vez de la
	 * referencia, que es exactamente lo que se quería evitar.
	 */
	otrasPaginasCount?: number;
	/** La URL de la que salió el producto, y el logo del sitio. Van a la ficha. */
	productUrl?: string;
	logoUrl?: string;
	/** Los colores de la web por función, corregidos a mano si hizo falta. */
	rolesDeColor?: RolesDeColor;
	storeDescription?: string;
	productCategory?: string;
	/** Lo que devolvió `leerElProducto`: cómo se ve y a quién le habla. */
	lectura?: LecturaDelProducto | null;
};

export type ReferenceCloneInput = ClonePromptInput & {
	keys: { openAIKey: string; googleKey: string };
	/** El anuncio ganador, ya normalizado. */
	reference: EngineImage;
	/** Fotos reales del producto (o de los productos, si son varios). */
	productImages: EngineImage[];
	/**
	 * Las otras páginas del mismo carrusel, como contexto.
	 *
	 * Van al final de las imágenes de entrada: la primera sigue siendo la página
	 * que hay que hacer. Sirven para que esta página no repita lo que dicen las
	 * demás, no para copiarlas.
	 */
	otrasPaginas?: EngineImage[];
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
 * Cuál de los tres prompts de render se usa.
 *
 * ARRANCA EN EL LIBRE (`clon-libre.ts`), que es el que se probó contra siete
 * referencias reales y salió mejor en las siete. Le da el ganador y la ficha del
 * producto y lo deja rediseñar; no le dicta dónde va cada texto.
 *
 * El DETALLADO es el anterior: mide el ganador zona por zona y le dicta al motor
 * cada cuerpo, peso, alineación y hexadecimal. Sabe cosas que el libre no —que un
 * inmueble o un vehículo no se redibujen, el telón, la fila de medios, la web
 * visible en todas las páginas del carrusel— así que se queda entero y andando
 * por si alguna de esas hace falta. Su problema es que el prompt CRECE con la
 * referencia: con un ganador cargado de texto pasa los 32.000 caracteres de
 * OpenAI y la generación falla. El libre es fijo y ese techo no lo toca nunca.
 *
 * El CORTO es un intento anterior al libre, se deja por historia.
 *
 * `RENDER_PROMPT=detallado` (o `corto`) lo cambia para los tres caminos a la vez
 * —Studio, lote y carrusel— sin tocar código, que es lo que permite comparar la
 * MISMA referencia con los dos y decidir mirando en vez de discutiendo.
 */
function caminoDeRender(): 'libre' | 'detallado' | 'corto' {
	const elegido = String(process.env.RENDER_PROMPT || import.meta.env.RENDER_PROMPT || 'libre').toLowerCase();
	if (elegido === 'detallado' || elegido === 'largo') return 'detallado';
	if (elegido === 'corto') return 'corto';
	return 'libre';
}

/**
 * Quién aparece, cuando el usuario lo eligió.
 *
 * `ai` es no haber elegido: devuelve undefined y el aviso lo resuelve mirando el
 * ganador, que es lo que sale bien casi siempre.
 */
function quienAparece(mode: PersonMode | undefined, hayFotos: boolean, descripcion?: string) {
	if (mode === 'none') return 'No person appears anywhere in this ad — not a face, not a hand, not a silhouette. If the reference showed someone, that space is filled by the product or by the setting.';
	// Lo que se sube es una CARA y un FÍSICO, no un vestuario ni una pose. Decirle
	// que copie la foto entera hacía que el aviso heredara la ropa y el encuadre
	// de una foto que se sacó para otra cosa, y que una foto de teléfono movida
	// saliera movida en el aviso.
	if (mode === 'upload' && hayFotos) {
		return 'The person in this ad is the one in the supplied photos, and THE FACE HAS TO COME OUT IDENTICAL: the same bone structure, the same eyes, nose and mouth and the same distances between them, the same jaw and hairline, the same skin tone, the same moles, freckles, scars and lines. Somebody who knows them has to recognise them at a glance — a person who merely looks like them is a failure, not a variation. If the photos show their whole body, their build and proportions are theirs too. Rebuild that face as a real photograph at the highest fidelity you can reach: pores, fine lines and stubble in the skin, hair strand by strand, catchlights in the eyes, light passing through the skin, the shallow depth of field of a real lens. Do this even if the photos come small, soft, compressed or badly lit — you are re-photographing that person, not upscaling their snapshot, and you never smooth the skin, even out the tone or let it drift into the waxy look of a render. Everything else is yours: what they wear, how they pose, how they are lit and where in the frame they stand all belong to this ad, so dress them for it and put them wherever the composition wants them.';
	}
	if (mode === 'described' && descripcion?.trim()) return `The person in it is: ${descripcion.trim()}. Put them where the reference puts its own person, in that pose and that framing.`;
	return undefined;
}

/** La decisión de firma del usuario, dicha en una línea que reemplaza la regla. */
function firmaElegida(logoMode: LogoMode | undefined, hasLogo: boolean) {
	if (logoMode === 'nada') return 'This ad carries no logo, no wordmark and no brand line anywhere, at any size.';
	if (logoMode === 'texto') return 'Sign it by writing the brand name, in the same place, size and style the reference signs its own.';
	// Sin archivo de logo no se puede firmar con imagen: se escribe el nombre.
	if (logoMode === 'imagen') {
		return hasLogo
			? 'Sign it with the supplied logo file, in the same place and at the same size the reference signs its own.'
			: 'Sign it by writing the brand name, in the same place, size and style the reference signs its own.';
	}
	return undefined;
}

/**
 * Las fotos del producto que se le mandan al motor, fabricando una si hace falta.
 *
 * Cuando la tienda no publica una sola foto limpia del objeto —galería entera de
 * placas promocionales, que es lo normal en Tiendanube y Shopify— mandar esas
 * placas es peor que no mandar nada: el motor las lee como el producto y termina
 * clonando el diseño de la tienda en vez del anuncio ganador. Pasó exactamente
 * eso con una mojarra de pesca cuya galería era toda bandera, caja y "SORTEO DÍA
 * 30 DE CADA MES", y el aviso salió siendo esa placa.
 *
 * `refotografiarProducto` re-fotografía el objeto solo, sobre fondo neutro y sin
 * una letra encima: es la diferencia entre un aviso y una placa fotocopiada.
 */
async function fotosLimpiasDelProducto(
	input: ReferenceCloneInput,
	lectura: LecturaDelProducto,
	referenciaMuestraProducto: boolean,
): Promise<EngineImage[]> {
	const limpias = fotosParaElMotor(input.productImages, lectura);
	if (limpias.length || !input.productImages.length) return limpias;
	// Si el ganador no muestra ningún producto, las fotos no se adjuntan igual:
	// fabricar una sería pagar diez segundos y ocho centavos por una imagen que se
	// descarta dos líneas más abajo.
	if (!referenciaMuestraProducto) return [];
	// Y solo si el clasificador dijo que TODAS son placas: si quedó vacío por otro
	// motivo, mandar una foto regenerada por IA es peor que mandar el texto solo.
	if (!todasSonPlacas(input.productImages, lectura)) return [];

	const label = input.logLabel || '[pipeline]';
	console.log(`${label} ninguna foto limpia del producto: se rehace una en estudio`);
	// La primera es la que la tienda eligió como principal, así que es la que más
	// probablemente muestre el objeto entero aunque tenga diseño encima.
	const packshot = await refotografiarProducto(input.keys, input.productImages[0], lectura.aspecto);
	if (!packshot) {
		console.warn(`${label} no se pudo rehacer la foto del producto: se genera sin fotos`);
		return [];
	}
	return [packshot];
}

/**
 * Los colores corregidos a mano en la pantalla de confirmar.
 *
 * Mandan sobre los que trajo el escaneo: si alguien se tomó el trabajo de
 * arreglar un color es porque el escaneo lo leyó mal. No agregan ninguna línea al
 * prompt — son los mismos colores de la marca que ya se usaban, mejor leídos.
 */
function coloresCorregidos(roles: RolesDeColor | undefined) {
	const lista = [...new Set([roles?.fondo, roles?.titulo, roles?.texto, roles?.acento, roles?.boton].filter(Boolean) as string[])];
	return lista.length ? lista : null;
}

/** La ficha con la que se arma el prompt libre, y también su versión magra. */
function fichaDesde(input: ClonePromptInput, hasLogo: boolean, analysis?: LayoutAnalysis | null) {
	return {
			nombres: input.productNames,
			datos: input.productFacts.filter(Boolean),
			marca: input.brandName,
			queVendeLaTienda: input.storeDescription,
			categoria: input.productCategory,
			url: input.productUrl,
			logoUrl: input.logoUrl,
			paleta: input.brandColors,
			// Los dos únicos controles: 'winner' deja los del ganador, cualquier otro
			// origen trae los de la marca o los de la web del usuario. Los corregidos
			// a mano mandan sobre los del escaneo: si alguien se tomó el trabajo de
			// arreglar un color es porque el escaneo lo leyó mal.
			coloresDeLaMarca: input.colorMode !== 'winner'
				? (coloresCorregidos(input.rolesDeColor) || input.brandColors)
				: undefined,
			// Y qué color va en qué. La pantalla deja elegirlo uno por uno y hasta
			// ahora se aplastaba en una lista sin decir cuál era cuál: al modelo le
			// llegaban cinco hexadecimales y los repartía a su criterio, así que el
			// fondo de la marca terminaba de titular.
			rolesDeColor: input.colorMode !== 'winner' ? input.rolesDeColor : undefined,
			tipografiaDeLaMarca: input.typoMode !== 'winner' ? input.brandTypography : undefined,
			indicaciones: input.brief,
			aspecto: input.lectura?.aspecto,
			ambiente: input.lectura?.ambiente,
			icp: input.lectura?.icp,
		seUsaEnElCuerpo: input.lectura?.seUsaEnElCuerpo,
			// El idioma que eligió el usuario manda; sin elección se usa el de la ficha.
			idioma: input.language ? LANGUAGE_NAMES[input.language] : undefined,
			decisionDeLogo: firmaElegida(input.logoMode, hasLogo),
		decisionDePersona: quienAparece(input.personMode, (input.avatarImageCount || 0) > 0, input.avatarDescription),
		lugarElegido: input.lugarElegido,
		carrusel: input.carousel ? { indice: input.carousel.index, total: input.carousel.total } : undefined,
		otrasPaginas: input.otrasPaginasCount,
		// Lo que el análisis del ganador ya devolvía y se tiraba. Cuando el usuario
		// los corrigió en la pantalla de confirmar, llegan corregidos.
		textos: analysis?.textZones,
	};
}

/**
 * El prompt para reintentar cuando OpenAI rechaza el pedido por su filtro.
 *
 * Devuelve `null` cuando no hay nada que sacar —sin ICP ni indicaciones el
 * prompt magro es idéntico— para que el motor no gaste un reintento en mandar
 * exactamente lo mismo.
 */
export function buildClonePromptDeRespaldo(input: ClonePromptInput, hasLogo: boolean): string | null {
	if (caminoDeRender() !== 'libre') return null;
	const ficha = fichaDesde(input, hasLogo);
	// Sin ICP ni indicaciones el magro es idéntico al completo y el reintento
	// gastaría una llamada en mandar lo mismo. El bloque de prendas del PROMPT B
	// no cuenta: está escrito sin vocabulario que el filtro castigue y viaja
	// también en el magro.
	if (!ficha.icp && !ficha.indicaciones?.trim()) return null;
	return buildPromptLibre(ficha, true);
}

/** El prompt clon a partir del análisis. Separado para poder testearlo solo. */
export function buildClonePrompt(input: ClonePromptInput, analysis: LayoutAnalysis | null, hasLogo: boolean) {
	const camino = caminoDeRender();
	if (camino === 'libre') return buildPromptLibre(fichaDesde(input, hasLogo, analysis));
	const armar = camino === 'corto' ? buildPromptCorto : buildReferenceClonePrompt;
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
		logoMode: input.logoMode,
		// Que hacer con la fila de medios del ganador. Sin esto el render no se
		// entera de lo que se decidio en la revision y siempre la saca.
		pressRowMode: input.pressRowMode,
		pressRowItems: input.pressRowItems,
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
export function buildEngineImages(input: ReferenceCloneInput, analysis: LayoutAnalysis | null, fotos: EngineImage[]): EngineImage[] {
	const referenceShowsProduct = analysis?.referenceHasProduct !== false;
	return [
		input.reference,
		...(referenceShowsProduct ? fotos : []),
		...(input.otrasPaginas || []),
		...(input.avatarImages || []),
		...(input.logo ? [input.logo] : []),
	];
}

/** Analiza, arma el prompt y renderiza. */
export async function renderReferenceClone(input: ReferenceCloneInput): Promise<ReferenceCloneResult> {
	const label = input.logLabel || '[pipeline]';
	// Los dos análisis no dependen entre sí: van juntos para no sumar dos esperas.
	const [analysis, lectura] = await Promise.all([
		analyzeReference(input),
		leerElProducto(input.keys, {
			fotos: input.productImages,
			nombre: input.productNames.filter(Boolean).join(' + '),
			datos: input.productFacts.filter(Boolean).join('\n') || input.brief,
			url: input.productUrl,
		}),
	]);
	const prompt = buildClonePrompt({
		...input,
		avatarImageCount: (input.avatarImages || []).length,
		otrasPaginasCount: (input.otrasPaginas || []).length || undefined,
		lectura,
	}, analysis, Boolean(input.logo));
	const format = await resolveFormat(input.requestedFormat, input.reference);
	const images = buildEngineImages(input, analysis, await fotosLimpiasDelProducto(input, lectura, analysis?.referenceHasProduct !== false));

	console.log(`${label} generando en ${format} (${images.length} imágenes de entrada, calidad ${input.tier})`);
	const { buffer, engine, usage } = await generateAdImage({
		googleKey: input.keys.googleKey,
		openAIKey: input.keys.openAIKey,
		prompt,
		promptDeRespaldo: buildClonePromptDeRespaldo({ ...input, lectura }, Boolean(input.logo)) || undefined,
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
