import OpenAI from 'openai';
import { normalizeAdCopy, stripWebReferences, type AdaptedAdCopy } from './ad-copy';
import { cifrasSinRespaldo, textoVerificado, type CifraDetectada } from './claims';

const TEXT_RENDERING_RULE = `
TEXT RENDERING QUALITY (CRITICAL — HIGHEST PRIORITY, overrides fidelity to the template) — Every letter of publication text must be rendered as clean, flat, vector-like graphic typography: opaque solid fill, razor-sharp edges, correct kerning, even anti-aliasing, no softness anywhere.

ABSOLUTELY FORBIDDEN on publication text, even if the winning reference clearly shows it — do NOT reproduce these from the template under any circumstance:
- drop shadows, cast shadows or any offset copy of a letter
- glows, outer glows, blurred outlines, white halos, ghost copies, feathering or fuzzy bloom
- bevels, embossing, extrusions, 3D depth or gradients inside the letterform
- any blur, softening, motion blur or depth-of-field applied to a letter

If the template's text has a shadow or glow, render the SAME text WITHOUT it: flat and clean. Losing a decorative shadow is always preferable to a dirty, blurry or amateur-looking letter — soft text is the single clearest sign of an AI-generated ad and makes the whole creative look unprofessional.

Text must read as if it were typed in a design tool and exported at full resolution: perfectly crisp at 100% zoom, with a hard edge between the letter and the background. Keep every line fully inside its original zone and never sacrifice legibility for a decorative effect. This rule does NOT apply to text physically printed on the real product packaging, which keeps its natural photographic appearance.`;

// ── Compartido entre /api/creativos/plan y /api/creativos/generate ──────────

/**
 * Con qué se firma el aviso.
 *
 * 'texto' escribe el nombre del negocio con la tipografía del ganador, 'imagen'
 * pega el archivo del logo, 'nada' deja el lugar limpio. Es el default 'texto'
 * el que importa: la mayoría de los ganadores firman con el nombre escrito, y
 * pegar un escudo donde había una línea de tipografía se ve mal hecho de lejos.
 */
export type LogoMode = 'texto' | 'imagen' | 'nada';

export type LayoutAnalysis = {
	/** What the target represents: a physical item, a service, or a SaaS/brand. */
	subjectType?: 'physical-product' | 'service' | 'saas' | 'brand-led' | 'unknown';
	/**
	 * QUE CLASE de cosa se vende, medida en las fotos que subio el usuario.
	 *
	 * Se paso la URL de un departamento y el anuncio salio con OTRO departamento.
	 * El sistema trataba todo como "producto" y para un inmueble eso ordena
	 * justamente lo que no hay que hacer: el bloque de producto pide
	 * re-fotografiar el objeto DENTRO de la escena del ganador, y un departamento
	 * no es un objeto que se lleva a otra escena — ES la escena. Al
	 * "re-fotografiarlo" el modelo corria un sillon o cambiaba una ventana, y con
	 * eso ya se publica una unidad que no existe. Con un auto pasa lo mismo: el
	 * anio, la llanta y el detalle de la trompa son la identidad de ESE usado.
	 */
	targetClass?: 'object' | 'property' | 'vehicle' | 'service';
	/** Semantic palette selected for the generation and shown in review. */
	brandPalette?: { background?: string; text?: string; accent?: string; secondary?: string; source?: string };
	/** Analysis used to adapt the winning message and render it in the generated image. */
	messageStrategy?: string;
	adCopy?: AdaptedAdCopy;
	textZones?: Array<{
		slide?: number;
		where?: string;
		onProduct?: boolean;
		original?: string;
		/** Cuántas líneas ocupa el bloque en el ganador, contadas mirando la imagen. */
		lines?: number;
			/** Si el texto va sobre una curva: qué arco describe. */
		onCurve?: string;
	/** Si es un rótulo con línea guía, la parte del producto que señala. */
		labels?: string;
		/**
		 * Cómo está compuesto ESTE bloque: cuerpo, peso, caja e interlineado.
		 *
		 * La letra se medía para dos roles nada más —titular y cuerpo— y el tamaño
		 * para dos bloques: el titular y el texto más chico. Un aviso tiene más de
		 * dos: en una tarjeta hay título, copia y descargo, y los tres se componen
		 * distinto. Lo que quedaba entre los extremos no lo medía nadie, y es justo
		 * donde el clon lo agranda y lo separa hasta que la tarjeta deja de
		 * parecerse aunque cada bloque haya caído en su lugar.
		 */
		setIn?: string;
		messageRole?: string;
		replacement?: string;
	}>;
	/**
	 * La letra del ganador en atributos accionables.
	 *
	 * `styleNotes` la describía como sensación —"tipografía elegante"— y con eso
	 * el modelo elegía cualquier grotesca: el clon salía igual en todo menos en
	 * la letra, que es lo primero que se nota al comparar las dos imágenes.
	 */
	typography?: { headline?: string; body?: string; pairing?: string };
	/**
	 * Con qué está HECHA la imagen del ganador: foto, render 3D, ilustración.
	 *
	 * El prompt del render pedía "photorealistic" en cinco lugares distintos, sin
	 * mirar el ganador. Con una referencia que es un dibujo 3D —un husky de
	 * caricatura, por ejemplo— eso ordena literalmente lo contrario de copiarla: el
	 * clon salía con una foto de producto donde el ganador tenía el personaje, y
	 * ahí se pierde de golpe casi todo el parecido. Ahora el medio se observa y
	 * manda sobre cualquier default.
	 */
	renderingMedium?: string;
	/**
	 * La GEOMETRÍA del ganador en números: dónde cae la división, qué fracción
	 * del alto ocupa cada banda, qué tan grande es el titular respecto del ancho.
	 *
	 * "Misma composición" es una instrucción sin contenido si no se dice en
	 * proporciones: el modelo la cumple a ojo y el resultado tiene los bloques en
	 * el orden correcto pero con otros tamaños, que es exactamente lo que hace que
	 * el clon "no se parezca" aunque cada elemento esté.
	 */
	compositionGeometry?: string;
	productHasPackaging?: boolean;
	referenceHasProduct?: boolean;
	/**
	 * La fila de medios del ganador ("As seen on: Forbes, NBC").
	 *
	 * Son marcas de terceros y afirman una cobertura que el anunciante no tiene,
	 * asi que nunca se copian. Pero el analisis tiene que REPORTARLA igual: sin
	 * eso, la pantalla no puede preguntar si el negocio tiene prensa propia, y la
	 * unica salida es borrar el bloque a ciegas.
	 */
	pressRow?: { detected?: boolean; heading?: string; outlets?: string[]; where?: string };
	templateHasLogoSlot?: boolean;
	logoDescription?: string;
	/**
	 * La marca del ganador está escrita como TEXTO, no dibujada como logo.
	 *
	 * Si no se distingue, al pedir "incluir logo" se pega el archivo de logo del
	 * cliente —un escudo, un sello— donde el ganador solo tenía el nombre en
	 * tipografía limpia. Queda un bloque gráfico pesado en un lugar pensado para
	 * una línea de texto, y es de lo primero que se ve como "mal hecho".
	 */
	logoIsWordmark?: boolean;
	/**
	 * Dónde está la firma del ganador, en castellano y en dos palabras.
	 *
	 * Vivía adentro de `logoDescription`, en inglés y pegado a la descripción
	 * de la marca ("small wordmark bottom-right"). Servía para el prompt pero
	 * no para mostrárselo a alguien: al recomendar poner el logo había que
	 * elegir sin saber en qué parte de la imagen iba a aparecer.
	 */
	logoWhere?: string;
	productPlacement?: string;
	/**
	 * TODAS las apariciones del producto del ganador, no solo la principal.
	 * Sin esto se reemplazaba una sola y el resto quedaba en el anuncio final
	 * (la modelo seguía con el corpiño del template, los pies con los mocasines).
	 */
	productInstances?: Array<{ where?: string; howShown?: string; onBody?: boolean }>;
	/** El producto del ganador se usa puesto sobre el cuerpo de una persona. */
	productOnBody?: boolean;
	/** Tamaño real del producto del ganador y cómo lo manipulan en la foto. */
	templateProductScale?: string;
	/** Tamaño real del producto del usuario, leído de su foto. */
	targetProductScale?: string;
	/** Orientación física y ubicación de gráficos/detalles (frente, dorso, laterales). */
	productOrientation?: string;
	/**
	 * Cómo hay que sostener/apoyar el producto nuevo para que la escena sea
	 * físicamente creíble conservando el mismo tipo de plano.
	 */
	stagingAdaptation?: string;
	/**
	 * Cada ÁREA DE IMAGEN del ganador (foto, panel, viñeta, collage, fondo) con
	 * qué muestra hoy y qué debería mostrar para el producto nuevo.
	 *
	 * Es la diferencia entre clonar y copiar: el ganador funciona por su
	 * estructura y su idea, no por su contenido. Sin esto quedaban las fotos
	 * originales del template — un aviso de una veterinaria clonado para un
	 * proveedor de cuero conservaba las fotos de chicas con perros.
	 */
	imageSlots?: Array<{
		where?: string;
		showsNow?: string;
		/**
		 * La IDEA que carga esa área, cuando no es una foto de producto: una
		 * reacción física, una metáfora, un chiste visual, una demostración.
		 *
		 * Un ganador que susurra una oferta al oído y muestra la piel erizada se
		 * clonaba como dos fotos del producto nuevo: la maqueta salía perfecta y
		 * el anuncio perdía lo único que lo hacía funcionar.
		 */
		idea?: string;
		replaceWith?: string;
	}>;
	/**
	 * Lectura creativa del ganador: por qué funciona más allá de dónde va cada
	 * cosa. Alimenta tres cosas a la vez — un prompt de generación mejor, el
	 * puntaje que se le muestra al usuario, y la búsqueda de creativos parecidos.
	 */
	creative?: {
		emotion?: string;
		adType?: string;
		photographyStyle?: string;
		lighting?: string;
		depth?: string;
		composition?: string;
		colorPsychology?: string;
		designPattern?: string;
		/** Familia estética: Apple, Nike, Temu, Lujo, Minimal, Editorial, Skincare... */
		styleFamily?: string;
		score?: number;
		scoreReasons?: string[];
	};
	creativeOptions?: string[];
	/** Sensación tipográfica, paleta y recursos gráficos observados en el ganador. */
	styleNotes?: string;
	language?: string;
	// Personas visibles en el anuncio (el usuario puede indicar cómo se reconstruyen).
	people?: Array<{ slide?: number; where?: string; description?: string; role?: string; directive?: string }>;
	// Decisiones contextuales que pueden mejorar la fidelidad sin limitarse a
	// comparaciones: personas, escenas, objetos secundarios, styling, etc.
	creativeDecisions?: Array<{
		slide?: number;
		type?: 'person' | 'scene' | 'styling' | 'object' | 'comparison' | 'product-handling' | 'other';
		title?: string;
		where?: string;
		description?: string;
		question?: string;
		defaultStrategy?: string;
		/** Tres respuestas sugeridas, para no tener que escribir. */
		options?: string[];
		confidence?: 'high' | 'medium' | 'low';
		directive?: string;
	}>;
	// Lectura de una comparación real. Se muestra al usuario solo cuando la IA
	// detecta una estructura comparativa o tiene una duda que conviene resolver.
	comparison?: {
		detected?: boolean;
		type?: 'us-vs-them' | 'before-after' | 'comparison-grid' | 'other';
		confidence?: 'high' | 'medium' | 'low';
		summary?: string;
		question?: string;
		defaultStrategy?: string;
		userGuidance?: string;
	};
	// Elementos de comparación que NO son el producto héroe (ej: barritas de la competencia).
	comparisonItems?: Array<{ slide?: number; where?: string; description?: string; role?: string; directive?: string }>;
};

export const LANGUAGE_NAMES: Record<string, string> = {
	es: 'natural Argentine Spanish',
	en: 'natural American English',
	fr: 'natural French',
	it: 'natural Italian',
	pt: 'natural Brazilian Portuguese',
	de: 'natural German',
};

// La API de imágenes de OpenAI solo decodifica PNG/JPEG de forma confiable
// (p. ej. rechaza WebP VP8X con "Invalid image file or mode"). Todo input
// pasa por acá: PNG/JPEG siguen igual, el resto se recodifica a PNG.
export async function normalizeImageInput(buffer: Buffer): Promise<{ buffer: Buffer; type: string } | null> {
	if (buffer.length > 3 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return { buffer, type: 'image/png' };
	}
	if (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
		return { buffer, type: 'image/jpeg' };
	}
	try {
		const sharp = (await import('sharp')).default;
		const png = await sharp(buffer).png().toBuffer();
		return { buffer: png, type: 'image/png' };
	} catch (error) {
		console.error('No se pudo normalizar una imagen de input, se omite:', error);
		return null;
	}
}

/**
 * Reescribe los textos que traen una cifra que nadie verificó.
 *
 * El mecanismo de persuasión de muchos ganadores ES el número, así que al
 * adaptarlos el análisis lo arrastra: un anuncio que prometía "resolvé el 50%"
 * volvió como "incrementá 50% tu facturación en solo 90 días" para una agencia
 * que nunca dijo ninguna de las dos cosas. Prohibirlo en el prompt no alcanzó.
 *
 * La mayoría de los anuncios no tienen cifras, así que esto no cuesta nada casi
 * siempre: solo se llama al modelo cuando efectivamente hay algo que sacar.
 */
export async function repararCifrasInventadas(
	keys: { openAIKey?: string },
	analysis: LayoutAnalysis,
	verificado: string,
	language: string,
): Promise<LayoutAnalysis> {
	type Pendiente = { texto: string; cifras: CifraDetectada[]; aplicar: (nuevo: string) => void };
	const pendientes: Pendiente[] = [];
	const revisar = (texto: string | undefined, aplicar: (nuevo: string) => void) => {
		const cifras = cifrasSinRespaldo(texto, verificado);
		if (cifras.length) pendientes.push({ texto: texto as string, cifras, aplicar });
	};

	(analysis.textZones || []).forEach((zone) => revisar(zone.replacement, (nuevo) => { zone.replacement = nuevo; }));
	const copy = analysis.adCopy as Record<string, string> | undefined;
	if (copy) {
		for (const campo of ['primaryText', 'headline', 'description', 'cta']) {
			revisar(copy[campo], (nuevo) => { copy[campo] = nuevo; });
		}
	}
	if (!pendientes.length) return analysis;

	const idioma = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.es;
	// El pedido es chico a propósito: reescribir frases, no volver a analizar nada.
	const instruccion = `You are rewriting ad copy to remove figures the advertiser cannot back up. For each numbered line, rewrite the text in ${idioma} keeping the SAME meaning, the SAME persuasive force, the SAME case (ALL CAPS stays ALL CAPS) and roughly the same length, but WITHOUT the listed figures and without replacing them with any other number, percentage, price, timeframe, rating or guarantee. Say the benefit qualitatively instead. Return STRICT JSON: {"lines":["rewritten 1","rewritten 2"]} with exactly ${pendientes.length} entries, in order.

${pendientes.map((pendiente, indice) => `${indice + 1}. "${pendiente.texto}" — remove: ${pendiente.cifras.map((cifra) => cifra.texto).join(', ')}`).join('\n')}`;

	try {
		if (!keys.openAIKey) throw new Error('sin clave para reparar');
		const openai = new OpenAI({ apiKey: keys.openAIKey });
		const model = (typeof import.meta.env !== 'undefined' && import.meta.env.OPENAI_REPAIR_MODEL) || process.env.OPENAI_REPAIR_MODEL || 'gpt-4o-mini';
		const response = await openai.chat.completions.create({
			model,
			response_format: { type: 'json_object' },
			messages: [{ role: 'user', content: instruccion }],
		});
		const lineas = JSON.parse(response.choices[0]?.message?.content || 'null')?.lines;
		if (!Array.isArray(lineas)) throw new Error('respuesta sin lines');
		pendientes.forEach((pendiente, indice) => {
			const nuevo = typeof lineas[indice] === 'string' ? lineas[indice].trim() : '';
			// Si la reescritura vuelve a traer una cifra sin respaldo no sirve: se
			// prefiere el recorte, que es feo pero no promete nada.
			pendiente.aplicar(nuevo && !cifrasSinRespaldo(nuevo, verificado).length ? nuevo : quitarCifras(pendiente.texto, pendiente.cifras));
		});
	} catch (error) {
		console.error('No se pudieron reescribir las cifras sin respaldo, se recortan:', error);
		pendientes.forEach((pendiente) => pendiente.aplicar(quitarCifras(pendiente.texto, pendiente.cifras)));
	}
	return analysis;
}

/**
 * Saca la cifra a mano cuando la reescritura no está disponible.
 *
 * Queda más pobre que una frase pensada, y es el punto: entre publicar un
 * porcentaje inventado y publicar una frase más floja, la frase floja no le
 * genera un problema a nadie.
 */
export function quitarCifras(texto: string, cifras: CifraDetectada[]): string {
	let resultado = texto;
	for (const cifra of cifras) resultado = resultado.split(cifra.texto).join(' ');
	return resultado
		// Conectores que quedaron colgando de la cifra que ya no está.
		.replace(/\s+(en solo|en apenas|in just|in only|hasta|up to|de hasta)\s*(?=[.,;!?]|$)/gi, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([.,;:!?])/g, '$1')
		.replace(/([.,;:]){2,}/g, '$1')
		.trim();
}

// Analiza el anuncio ganador + la foto real del producto con un modelo de visión:
// decodifica la estructura visual y enumera las áreas de imagen que deben
// reconstruirse para el producto del usuario.
// Intenta Gemini primero (barato y rápido) y cae a OpenAI si falla.
export async function analyzeReferenceLayout(keys: { openAIKey?: string; googleKey?: string }, input: {
	referenceB64: string;
	referenceMime: string;
	/** All pages of a carousel reference. The first page is also sent as referenceB64. */
	referenceSlides?: Array<{ b64: string; mime: string }>;
	productB64?: string;
	productMime?: string;
	/** Additional views of the SAME real product/SKU, usually uploaded manually. */
	productImages?: Array<{ b64: string; mime?: string }>;
	/** Reference photos for a person/avatar, never treated as product photos. */
	avatarImages?: Array<{ b64: string; mime?: string }>;
	avatarDescription?: string;
	subjectMode?: 'product' | 'service' | 'saas' | 'brand' | 'catalog';
	brandPalette?: { background?: string; text?: string; accent?: string; secondary?: string; source?: string };
	productName: string;
	productFacts: string;
	brandName: string;
	language?: string;
}): Promise<LayoutAnalysis | null> {
	const referenceInputs = (input.referenceSlides?.length ? input.referenceSlides : [{ b64: input.referenceB64, mime: input.referenceMime }]).slice(0, 12);
	const isCarouselReference = referenceInputs.length > 1;
	const productInputs = [
		...(input.productB64 ? [{ b64: input.productB64, mime: input.productMime }] : []),
		...(input.productImages || []),
	].filter((photo, index, all) => Boolean(photo.b64) && all.findIndex((candidate) => candidate.b64 === photo.b64) === index).slice(0, 5);
	const hasProductImages = productInputs.length > 0;
	const avatarInputs = (input.avatarImages || []).filter((photo, index, all) => Boolean(photo.b64) && all.findIndex((candidate) => candidate.b64 === photo.b64) === index).slice(0, 8);
	const hasAvatarImages = avatarInputs.length > 0;
	const subjectMode = input.subjectMode || (hasProductImages ? 'product' : 'brand');
	// De qué habla el anuncio. Antes solo se distinguía "producto" de "todo lo
	// demás", así que un catálogo caía en la rama de servicio/SaaS —que prohíbe
	// mostrar producto físico— y el copy sugerido hablaba igual de un artículo
	// suelto. El sujeto tiene que gobernar tanto la imagen como cada texto.
	const subjectDirective = subjectMode === 'product'
		? 'The target is ONE physical product and its exact geometry must be preserved.'
		: subjectMode === 'catalog'
			? 'The target is a STORE, not a single item. The supplied photos are a selection of what it sells: treat them as a group of equals. Preserve the real geometry of each one, never promote one to hero with the others as props, and never invent a product that was not supplied. EACH SUPPLIED PHOTO IS A DIFFERENT PRODUCT with its own colour, material and shape: every one of them has to appear, and none may be recoloured, retextured or reshaped to look like another. What makes a store ad work is the visible RANGE — collapsing everything into one look destroys exactly that.'
			: 'The target is a service, SaaS or brand-led offer. Do not invent a physical package or generic product. Build the visual around the interface, logo/avatar, people, result, workflow, environment or abstract brand world that best communicates the offer.';
	// 'brand' es "en general" cuando no hay nada que fotografiar: un servicio, un
	// software, una consultora. Habla del negocio entero igual que un catálogo,
	// pero sin objetos que mostrar.
	const copyDirective = subjectMode === 'catalog' || subjectMode === 'brand'
		? `COPY SUBJECT (CRITICAL) — Every string you write (primaryText, headline, description, cta and every textZone replacement) must talk about THE BUSINESS AS A WHOLE${input.brandName ? ` (${input.brandName})` : ''}: its range, what it sells, who it is for, and why buy there. Never name a single product as the protagonist, never write a price, a spec, a size or a stock claim that belongs to one item, and never write a CTA that leads to one product page ("Comprá el modelo X"). Write what would still be true if the selection of products changed tomorrow.`
		: subjectMode === 'product'
			? `COPY SUBJECT (CRITICAL) — Every string you write (primaryText, headline, description, cta and every textZone replacement) must talk about THIS SPECIFIC PRODUCT: ${input.productName || 'the supplied product'}. Use its real name, its verified facts and its actual benefit. Do not fall back to generic store or brand messaging ("nuestra tienda", "envíos a todo el país", "las mejores marcas") when the ad is about one product: that wastes the space the winning ad used to sell.`
			: `COPY SUBJECT (CRITICAL) — Every string you write must talk about the offer as a whole: the outcome it delivers and the problem it removes. Do not describe a physical object that does not exist.`;
	// La gramática no es un detalle de estilo: un rótulo mal concordado ("Otros
	// Cuero de Latigo") se imprime tal cual dentro de la imagen y arruina un
	// anuncio que por lo demás salió bien.
	const grammarRule = ' Every replacement must be GRAMMATICALLY CORRECT in that language, not a word-by-word transposition of the original: agreement of number and gender, correct articles and prepositions, correct accents. Write what a native speaker would actually write on an ad, and re-read each string before returning it.';
	const languageRule = input.language && LANGUAGE_NAMES[input.language]
		? `TARGET LANGUAGE IS ${LANGUAGE_NAMES[input.language].toUpperCase()} AND IT IS NOT NEGOTIABLE. Every replacement string you produce — headline, description, CTA, every text zone — must be written in ${LANGUAGE_NAMES[input.language]}, even when the template you are analysing is written in a different language. Do NOT copy or keep the template's original language. Translate and adapt the message instead. Set "language" to "${input.language}".${grammarRule}`
		: `Detect the language used by the winning ad, set "language" to "es", "en", "fr", "it", "pt" or "de", and write replacement suggestions in that language.${grammarRule}`;
	const systemPrompt = `You are a senior performance ad designer. You receive: (1) ${isCarouselReference ? 'multiple pages of one winning carousel, in order' : 'one winning static ad TEMPLATE image'}${hasProductImages ? ', (2) one or more photos of the SAME real product/SKU from different views' : ''}${hasAvatarImages ? ', (3) several reference photos of the same person/avatar' : ''}, and verified context.

TARGET SUBJECT MODE: ${subjectMode}. ${subjectDirective}
${copyDirective}
${input.brandPalette ? `VERIFIED URL/BRAND PALETTE: background ${input.brandPalette.background || 'unknown'}, accent ${input.brandPalette.accent || 'unknown'}, text ${input.brandPalette.text || 'unknown'}${input.brandPalette.secondary ? `, secondary ${input.brandPalette.secondary}` : ''}.` : ''}
${hasAvatarImages ? `AVATAR REFERENCE: ${input.avatarDescription || 'Use these photos only to preserve the chosen person/avatar identity; do not treat them as a product.'}` : ''}

Return STRICT JSON:
{
  "messageStrategy": "2-3 sentences decoding the winning ad's persuasion: the emotion it triggers, the objection it removes, the promise it makes and the mechanism it uses (social proof, price anchor, before/after, authority, scarcity, contrast, curiosity, etc.).",
  "subjectType": "physical-product|service|saas|brand-led|unknown",
  "targetClass": "object|property|vehicle|service",
  "adCopy": {
    "primaryText": "adapted publication copy for the target product, using only verified facts",
    "headline": "adapted headline, maximum 60 characters",
    "description": "adapted supporting detail, maximum 90 characters",
    "cta": "short adapted action, maximum 30 characters"
  },
  "textZones": [
    { "slide": 1, "where": "PRECISE position: which corner or edge, and whether the block sits over the photo or outside it (e.g. 'white box overlapping the bottom-LEFT of the photo', 'red breadcrumb line above the headline')", "onProduct": true|false, "original": "exact text visibly present in the winning image", "lines": how many lines this block actually occupies in the template image, counted with your eyes (a headline broken across three lines is 3, not 1), "onCurve": "if this text sits on a CURVED baseline, say which corner or element the arc hugs, how much of a turn it covers and in which direction. Null when the baseline is straight", "labels": "if this text is a callout that names a part of the product (usually joined to it by a leader line or an arrow), name the part it points at; otherwise null", "setIn": "HOW THIS EXACT BLOCK IS SET, measured on the template image and not guessed from its role: cap-height as a % of the canvas WIDTH, weight, case, colour, alignment inside its own block (flush-left / centred / flush-right / justified) and — only if it wraps — line spacing as a multiple of its own cap-height (e.g. '3.1% of width, bold, sentence case, near-black, flush-left, lines at 1.15x'). Measure every block separately: an ad has more than two text sizes, and the ones between the headline and the smallest print are exactly where a clone drifts bigger and looser than the original.", "messageRole": "the persuasive job this text performs", "replacement": "honest equivalent for the target product. NO INVENTED FIGURES: this string may contain a number, percentage, price, discount, timeframe, rating, review count or guarantee ONLY if that exact figure appears in the verified facts above. The template's own figures are NOT verified and must not be reused or adapted — if the original says 50%, the replacement says neither 50% nor 45%. Carry the same persuasive force with a qualitative claim instead. COPY THE CASE OF THE ORIGINAL EXACTLY: if the original is ALL CAPS the replacement is ALL CAPS, if it is Title Case it is Title Case, if it is sentence case it is sentence case. La caja es parte del diseño, no del contenido: cambiarla desarma la jerarquía aunque el texto sea correcto. LENGTH IS A HARD CONSTRAINT AND IT IS COUNTED IN CHARACTERS, NOT ESTIMATED: the replacement must be within 3 characters of the original — count them one by one before returning it — and never use more lines than the original. A 24-character original admits 21 to 27, nothing else. If the honest message does not fit, cut it down until it does — a shorter phrase that keeps the design intact beats a complete one that breaks it", "emphasis": "the visual emphasis applied to PART of this text and WHICH words carry it. The most common by far is a few words set in a HEAVIER WEIGHT than the rest of the same line, and it is the easiest one to miss: compare the stroke thickness of each word against its neighbours before deciding there is none. Also look for highlighter/marker background (say the colour), underline, a different colour, italics, a larger size or a boxed word. Write null ONLY when every word in this block is genuinely identical in weight, colour and size. Examples: 'the words \"10g\" and \"7 days\" are bold, the rest of the line is regular'; 'marker highlight in soft yellow over \"62 and have $1.3 million saved up\"'" }
  ],
  "pressRow": { "detected": true|false, "heading": "the exact wording that introduces the row (\"As seen on\", \"As featured in\"), or null", "outlets": ["each outlet or seal shown, by name, so the advertiser can see what the winner claimed"], "where": "where the row sits in the layout" },
  "referenceHasProduct": true|false,
  "renderingMedium": "WHAT THIS IMAGE IS MADE OF, judged by looking at it, not by what it advertises. Be specific and name the medium first: 'photograph' / '3D cartoon render (Pixar-like stylised characters)' / '3D product render' / 'flat vector illustration' / 'hand-drawn illustration' / 'comic-book art' / '3D render composited with photographic elements' / 'screenshot or UI mockup' / 'photo collage with cut-out edges' / 'typographic poster, no imagery'. If characters or animals appear, say explicitly whether they are REAL PHOTOGRAPHED ones or STYLISED/ILLUSTRATED ones and describe the style (proportions, outlines, shading, eyes). This field decides how the whole new ad is rendered, so an error here makes the clone look like a different ad even when every block is in place.",
  "compositionGeometry": "THE LAYOUT IN PROPORTIONS, as fractions of the canvas, so it can be rebuilt exactly. State: where the canvas is divided and by how much (e.g. 'a vertical divider at exactly 50% splits the canvas into two equal halves'); for each horizontal band, what it holds and what fraction of the height it takes (e.g. 'headline block occupies the top 18%, the two subjects the middle 62%, the closing text the bottom 20%'); the cap-height of the headline as a fraction of the canvas width; and the outer margin as a fraction of the width. Measure with your eyes against the edges of the image — do not estimate from memory of similar ads.",
  "templateHasLogoSlot": true|false — does the template visibly display a brand logo or brand wordmark (a natural spot where the advertiser brand belongs)?,
  "logoIsWordmark": true|false — is that brand mark simply the BRAND NAME SET IN TYPE (letters only, no emblem, shield, crest, seal, badge or pictorial symbol)? A name written in a styled typeface is still a wordmark → true. Only an actual drawn symbol, or a symbol locked up with the name, is false. Null if there is no brand mark at all.,
  "logoDescription": "if templateHasLogoSlot is true, briefly describe the mark itself (e.g. 'small wordmark in white caps'); else null",
  "logoWhere": "if templateHasLogoSlot is true, WHERE that mark sits, in Spanish and in a few plain words someone who knows nothing about design would understand (e.g. 'abajo a la derecha', 'arriba centrado, sobre el titular'); else null",
  "productHasPackaging": true|false,
  "productPlacement": "precise description of where/how the template's MAIN product sits: position, scale relative to canvas, angle, cropping, lighting, shadow — or null if the template shows no product",
  "productInstances": [
    { "where": "position of THIS appearance of the template's product (e.g. 'hero shot bottom-left', 'worn by the model on the right half', 'on the feet, center', 'the 6 items arranged in a circle')",
      "howShown": "how it appears there: standalone pack shot, worn on a body, held in a hand, repeated in a grid, colour variants, close-up texture...",
      "onBody": true|false }
  ],
  "productOnBody": true|false,
  "templateProductScale": "real-world size of the TEMPLATE's product and how it is handled in the shot (e.g. 'a pill, a couple of centimetres, pinched between two fingertips', 'a 500ml bottle held in one hand', 'a sofa filling the room')",
  "targetProductScale": "real-world size of the TARGET product judging by its photo and facts (e.g. 'a full cowhide shoulder, roughly 60x80cm, needs both hands or a surface')",
  "productOrientation": "for garments or objects with distinct sides, state exactly which details belong to the front, back and sides; use verified product facts when available, otherwise describe only what is visible in the supplied photos",
  "stagingAdaptation": "if copying the template's handling would look physically impossible, describe how to re-stage the target product so the scene is believable, keeping the SAME shot type, crop, framing and composition. Be specific about hands: if the template holds a small object in one hand and the target product is large and floppy (a hide, a rug, a panel, a textile), a single hand cannot hold it — say so and propose the alternative, preferring to REMOVE the hand and show the product alone, resting on a surface, hanging, rolled or held with both hands. If the sizes are comparable, say 'same handling as the template'.",
  "imageSlots": [
    { "where": "position and shape of THIS image area (e.g. 'three tilted photo cards stacked on the right third', 'full-bleed background photo', 'small circular avatar top-left', 'left half of a 50/50 split')",
      "showsNow": "what that area currently depicts in the template",
      "idea": "if this area carries an IDEA rather than a product — a physical reaction (goosebumps, a shiver, a face), a metaphor or stand-in object (a shaved football standing for a groomed body), a visual joke, a demonstration, a gesture, a before/after state — say what the idea IS and how it works. Otherwise null. This is the difference between an ad that is funny and an ad that is two product photos: the layout can be copied perfectly and the ad still dies here",
      "replaceWith": "what that SAME area must depict for the target product. IF \"idea\" IS NOT NULL, KEEP THE IDEA AND CHANGE ONLY WHAT IT IS ABOUT: the reaction, the metaphor, the joke or the demonstration is the reason this ad won, and swapping it for a product photo throws away everything except the layout. A whispered sale that gives someone goosebumps becomes a whispered sale about the new offer that gives someone goosebumps — not a photo of the new product. Only when \"idea\" is null propose a concrete, photographable scene tied to the product, its user, its making, its use or its result. Keep the same shot type, crop, angle and mood as the original so the composition still works. Never keep the template's original subject. THE SCENE MUST BE PLAUSIBLE IN THE TARGET'S OWN WORLD: do not carry over the template's setting, surface, prop or environment when it makes no sense for the target — a leather hide does not float on rippling water, a sofa does not sit on a kitchen counter, a laptop does not lie on wet sand. Name the surface and the setting explicitly so nothing is left to inherit from the template." }
  ],
  "people": [
    { "slide": 1, "where": "where the person appears (e.g. 'right half, holding the product')",
      "role": "their job in the ad (e.g. 'testimonial author', 'lifestyle model', 'before/after subject')",
      "description": "what they look like now in Argentine Spanish (apparent gender, age range, hair, expression, setting) so the user can decide how to reconstruct them" }
  ],
  "comparison": {
    "detected": true|false,
    "type": "us-vs-them|before-after|comparison-grid|other",
    "confidence": "high|medium|low",
    "summary": "qué está comparando la pieza, en una frase corta en español argentino",
    "question": "pregunta concreta para el usuario solo si hay una ambigüedad importante; si no, cadena vacía",
    "defaultStrategy": "qué debe hacer la IA si el usuario deja la aclaración vacía",
    "userGuidance": "cadena vacía"
  },
  "comparisonItems": [
    { "slide": 1, "where": "position of a NON-hero item that the ad compares AGAINST the product (e.g. 'left and right columns/products in a 3-way comparison')",
      "role": "what it represents (e.g. 'competitor bar', 'the old way', 'other brand')",
      "description": "short Argentine-Spanish description of that comparison item so the user can decide what to put there" }
  ],
  "creativeDecisions": [
    { "slide": 1, "type": "person|scene|styling|object|comparison|product-handling|other",
      "title": "título corto y claro para la decisión",
      "where": "dónde aparece el elemento, en pocas palabras (ej: 'esquina inferior izquierda')",
      "question": "pregunta concreta para el usuario; vacía si no hace falta preguntar. Debe bastarse sola: no expliques primero el razonamiento, preguntá directo",
      "defaultStrategy": "qué debe hacer la IA si el usuario deja la aclaración vacía",
      "options": ["3 respuestas posibles a la pregunta, cortas (máx 8 palabras), concretas y CLARAMENTE distintas entre sí, en el idioma del usuario. La primera debe ser la más segura para este anuncio. Escribilas como la elegiría alguien, no como una explicación: 'En una laptop', 'En un celular en mano', 'Sobre un monitor de escritorio'"],
      "confidence": "high|medium|low",
      "directive": "cadena vacía" }
  ],
  "typography": {
    "headline": "the headline letterforms ACTUALLY VISIBLE in the template, as attributes a designer could act on. Do not judge by how the line feels — MEASURE each one against the letters themselves, because 'normal' is the answer that gets written by default and it is usually wrong: · class: serif / sans / slab / script / display / mono. · weight: compare stroke thickness to the height of a capital — thinner than a tenth of it is thin or light, about a sixth is regular or medium, a quarter or more is bold or black. · width: compare the width of an O to its height — clearly narrower is condensed, clearly wider is extended. · case: ALL CAPS / Title Case / sentence case. · letter-spacing: look at the GAPS between letters — a gap as wide as one stroke is wide, a gap as wide as a whole letter is very wide, letters nearly touching is tight. · alignment. Example: 'sans, light weight, extended, ALL CAPS, very wide letter-spacing, centred'",
    "body": "the same six attributes for the secondary/body text",
    "pairing": "one sentence on the size and contrast relationship between the two (e.g. 'headline roughly 4x the body, both in the same family, contrast comes from weight not from font')"
  },
  "creative": {
    "emotion": "la emoción dominante que dispara el anuncio (deseo, alivio, urgencia, pertenencia, culpa, orgullo, curiosidad, seguridad...)",
    "adType": "qué tipo de anuncio es (hero de producto, testimonial, comparativa, oferta, educativo, UGC, autoridad, antes y después, listado...)",
    "photographyStyle": "estilo de la imagen (packshot de estudio, lifestyle, UGC de celular, flat lay, macro de textura, render 3D, gráfico plano, collage...)",
    "lighting": "la luz (suave difusa, dura direccional, contraluz, luz natural de ventana, neón, clave alta, clave baja...)",
    "depth": "profundidad y foco (fondo desenfocado, todo nítido, capas superpuestas, plano comprimido...)",
    "composition": "cómo se ordena (centrado simétrico, regla de tercios, división 50/50, grilla, diagonal, apilado vertical...)",
    "colorPsychology": "qué comunica la paleta y por qué ayuda a vender esta categoría",
    "designPattern": "el patrón reutilizable en una frase, como se lo explicarías a un diseñador para que lo replique",
    "styleFamily": "la familia estética DEL TEMPLATE, elegida de esta lista y solo de esta lista: Apple, Nike, Temu, Amazon, Lujo, Minimal, Editorial, Skincare, Suplementos, Retro, Brutalista, Corporativo. Nunca el nombre de la marca del template ni el de la marca objetivo",
    "score": 0-100 — qué tan fuerte es este anuncio como creativo de performance,
    "scoreReasons": ["3 a 5 razones cortas en español que expliquen el puntaje, cada una empezando con el aspecto: contraste, jerarquía, CTA, oferta, legibilidad, foco del producto"]
  },
  "creativeOptions": ["3 to 5 SHORT optional visual directions specific to THIS template and THIS product"],
  "styleNotes": "the TEMPLATE's background colour(s), palette and graphic devices (badges, pills, dividers, rules, frames) worth preserving, described as they are. Describe the DESIGN, never the photographic content of the image areas — what the photos show belongs to imageSlots, and repeating it here makes the renderer keep the template's original scene"
}

Rules:
- Analyze the winner's wording before analyzing the visual layout. Enumerate EVERY text zone that is actually visible, including headline, subcopy, review, badges, pills, CTA, small print and text printed on packaging. ONE EXCEPTION: the row of press logos or outlet names under an "As seen on" / "As featured in" heading does NOT go in textZones, and neither does that heading. Those are third-party marks that never survive into the clone, so listing them as replaceable text asks the renderer to fill a row that has to disappear — and it fills it, with whatever it finds. Report the row in "pressRow" instead. Do not invent zones that are not visible. If the image has no publication text, return an empty textZones array.
- "messageStrategy" must explain why the original copy works, not merely describe what it says. Keep the same emotional mechanism and rhetorical device in the internal replacements.
- "adCopy" is the adapted publication copy and "textZones" are the exact visible text areas used by the generator. The text-zone replacements MUST be rendered inside the final image in the same positions and hierarchy; do not remove the winner's visible message. Text physically printed on the supplied product or inside its official logo must remain faithful to those supplied assets.
- ${languageRule}
- ${isCarouselReference ? 'CAROUSEL ANALYSIS: Analyze EVERY supplied page, not only the first. Read all publication copy and visible text zones page by page, preserve each page\'s persuasion and composition, and include the page number in every text zone, person, comparison item and contextual decision. Return one coherent aggregate analysis: comparison/people/objects may reference the relevant page in "where". Do not treat pages from the same carousel as unrelated ads.' : 'For a static reference, analyze the complete supplied image.'}
- "targetClass" (CRITICAL): WHAT KIND OF THING IS BEING SOLD, judged from the SUPPLIED PRODUCT PHOTOS and the verified facts — never from the template, which is somebody else's ad. "property" = a home, apartment, house, office, lot or any real-estate listing. "vehicle" = a specific car, van, truck, motorcycle or machine offered as one unit. "service" = nothing physical is on sale. "object" = everything else, and it is the default. This is not a label, it changes what the renderer may do: for a property or a vehicle the supplied photos are the thing for sale AND the scene it lives in at the same time. That apartment cannot be re-photographed anywhere else — moving a sofa or changing a window advertises a different unit than the one for sale. So when you choose "property" or "vehicle": every "replaceWith" must say WHICH supplied photo goes in that area and how it is cropped, never a scene to be built; and "stagingAdaptation" is "same handling as the template".
- "referenceHasProduct": true only if the TEMPLATE visibly features a physical product shot (box, bottle, object). Lifestyle/person-only or pure-text ads → false.
- "productInstances" (CRITICAL): list EVERY separate place where the TEMPLATE'S OWN product is visible — not just the hero shot. Count the product worn by a model, on someone's feet, held in a hand, repeated as colour variants, shown again small in a corner, or duplicated across a grid. If the same product appears 6 times in a circle, that is 6 instances (or one instance describing the whole arrangement, but say so explicitly). Missing one means it survives into the final ad and the ad ends up selling two different products at once.
- "productOnBody": true if ANY instance is worn on / used on a human body (garment, underwear, shoes, jewellery, a patch on skin). This decides whether the layout can host a product that cannot be worn.
- "renderingMedium" (CRITICAL): this is the single field that most often ruins a clone. Decide it by LOOKING at the pixels, never by assuming an ad must be a photograph. Stylised 3D characters, illustrated animals, vector shapes and comic art are extremely common in winning ads, and rendering them as photographs produces a completely different piece. If the template's subjects are illustrated, say so plainly and describe the illustration style precisely enough that it could be matched.
- "compositionGeometry" (CRITICAL): give proportions, not adjectives. "Split in two" is useless; "a vertical divider at exactly 50%, headline band across the top 18%, subjects in the middle 62%, closing line in the bottom 20%" can be rebuilt. This is what keeps the clone from drifting into a similar-but-different layout. Measure the SMALL text as carefully as the headline: without a number for it the clone sets it larger and looser than the template, which quietly changes how the whole ad reads.
- DESCRIBE THE TEMPLATE, NOT THE AD YOU WOULD MAKE (CRITICAL): "styleNotes", "typography" and every field inside "creative" describe THE TEMPLATE IMAGE EXACTLY AS IT IS. They are the only record of what the winner looks like, and they are handed to the renderer as the art direction to reproduce — so a wrong word there actively pushes the new ad away from the winner. If the template is a black ad and the target product is warm and homely, the palette is still BLACK. If the template is lit hard and dramatic, the lighting is still hard and dramatic. Never let the target product, its colours, its category or the ad you are imagining for it leak into these fields, and never write an instruction ("keeps the comparison layout") where a description belongs.
- NUMBERS AND CLAIMS MUST BE VERIFIED (CRITICAL): a percentage, price, discount, rating, review count, timeframe, quantity, award, certification or guarantee may appear in a replacement ONLY if it is present in the verified facts supplied to you. Never invent one, never adapt the template's number into a similar-looking new one ("50%" → "45%"), and never write a guarantee or a promise of results. If the winner's persuasion rests on a number you do not have, keep the same emotional force with a qualitative claim that is true instead — a strong honest line beats a fabricated statistic that the advertiser cannot back up and could be held to.
- "creative": read the ad the way a senior art director would. This is not decoration: "designPattern" and "styleFamily" have to be precise enough that another designer could rebuild the ad from them, and "score" has to be honest — a weak ad gets a low number even if it is in the library.
  - PHYSICAL SCALE (CRITICAL): judge the REAL size of both products. A pill pinched between two fingertips and a full leather hide are not interchangeable: rendering the hide at pill size gives an absurd ad. Fill "templateProductScale", "targetProductScale" and "stagingAdaptation" so the new product appears at its true size. The rule is to keep the SHOT (same crop, same framing, same part of the body in frame, same area of the canvas occupied) and change only HOW the product is handled so it is physically possible.
  - ORIENTATION AND SURFACE DETAILS (CRITICAL): for garments and any product with a front, back, side or inside, inspect EVERY supplied product photo as a multi-view set and the verified page facts. Treat all photos as the SAME real product/SKU, not different variants to blend. Fill "productOrientation" with the exact placement of each print, embroidery, patch, label or other distinctive detail. Never mirror, flip, turn inside out or move a detail to another physical side. A graphic specified as BACK must never appear on the FRONT; when a front-facing view is requested, show only front details, and when a back-facing view is requested, show only back details. If a side is not visible and not verified, do not invent its artwork.
- "imageSlots" (CRITICAL): a winning ad wins because of its STRUCTURE and its IDEA — the layout, the rhythm, the way attention is directed — not because of the specific photos it happens to contain. List EVERY visual area of the template: the hero shot, each photo in a collage or grid, the background image, avatars, before/after panels, lifestyle scenes, and decorative photo strips. For each one, propose what that area should depict for the TARGET product instead. Think like an art director briefing a photographer: if the template shows three photos of people hugging dogs and the target product is wholesale leather, the replacement is three photos of artisans cutting, stitching and finishing leather at a workbench — same tilt, same crop, same lighting mood, same energy. Never propose keeping the template's original subject, and never propose an empty or generic "product photo" when the slot is clearly a lifestyle or context shot. If the template has a single product shot and nothing else, one entry is enough.${subjectMode === 'catalog' ? ` GRIDS AND LINEUPS: when the template repeats a slot (a grid of cells, a row of items, a collage), say explicitly WHICH of the supplied products goes in each one, naming it. Spread all ${productInputs.length} of them across the available cells and, if there are more cells than products, repeat them changing only the angle or the crop. Never fill every cell with the same product and never describe them all with one shared description — the grid exists to show variety, and losing it turns a catalogue ad into a single-product ad. Keep the grid UNIFORM: if the cells are packshots on a plain background, every replacement is a packshot on a plain background. Do not propose a lifestyle, workshop or in-use scene for one cell of a regular grid, and do not propose hands, tools, workbenches, raw materials or steps of the process — a catalogue grid shows the PRODUCTS FOR SALE and nothing else. The regularity is what makes it read as a catalogue.` : ''}
- "productHasPackaging": look ONLY at the REAL product photo — true ONLY if that photo clearly shows a printed box, wrapper or label belonging to the product. Raw materials (leather hides, fabrics, wood), unpackaged food, plants, garments or bare objects have NO packaging → false. The template's product is irrelevant for this field.
- TESTIMONIALS: if the template shows a person's photo next to a quote, the replacement quote and attribution must plausibly belong to that SAME visible person (never mismatch apparent gender or age; a neutral attribution like 'Cliente verificada' is fine).
- PEOPLE: list in "people" EVERY human clearly visible in the ad (models, testimonial faces, before/after subjects). Empty array if none. The user may later specify how they want each person to look.
- COMPARISON: first decide whether the ad genuinely compares two or more sides. Do not confuse a product collage, multiple views of one SKU, or decorative repetition with a comparison. If it is a real comparison (including "us vs them", old vs new, before/after, competitor vs hero or a comparison grid), set "comparison.detected" to true, identify its type and confidence, summarize the contrast, and list every OTHER item being compared against the HERO in "comparisonItems". If the exact alternative is unclear, set confidence to "low" and ask one concrete question in "comparison.question". If it is not a comparison, set detected to false, use an empty question, and return an empty comparisonItems array. Never treat the hero product itself as a comparison item. Always provide a practical "defaultStrategy" so the generator can make a coherent, neutral, unbranded choice when the user leaves the clarification empty.
- CONTEXTUAL CREATIVE DECISIONS: this is broader than comparison detection. Return up to 5 decisions only when a visual element could materially change the fidelity, meaning or believability of the generated ad and a user preference would help. Consider people (appearance, age range, pose, role or testimonial identity), scenes (home, studio, workplace, outdoors), styling (clothes, makeup, mood), secondary objects, pets, product handling/scale/orientation, before-after or comparison alternatives, and ambiguous text or claims. For each decision, describe what you detected, ask one useful concrete question when appropriate, and give a safe default. Do not ask about trivial details, do not ask the user to repeat information already visible or verified, and do not create a decision merely because the ad contains multiple photos of the same product. If a person is clearly visible, include a person decision when the appearance or role affects the adaptation. If there are no material ambiguities, return an empty array.
- Never use the template's brand name in replacements.${input.brandName ? ` The advertiser brand is "${input.brandName}".` : ''}`;
	const userText = `Target offer: ${input.productName}. Verified facts/context: ${input.productFacts || 'No physical product was supplied; infer a coherent service or brand-led visual treatment.'}`;
	// Lo único contra lo que se puede contrastar una cifra antes de imprimirla.
	const verificado = textoVerificado({ productFacts: input.productFacts, productNames: [input.productName], brandName: input.brandName });

	const validate = (raw: string | null | undefined): LayoutAnalysis | null => {
		try {
			const parsed = JSON.parse(raw || 'null');
			if (!parsed || typeof parsed !== 'object') return null;
			parsed.textZones = Array.isArray(parsed.textZones) ? parsed.textZones : [];
			parsed.adCopy = normalizeAdCopy(parsed.adCopy, {
				productName: input.productName,
				productFacts: input.productFacts,
				brandName: input.brandName,
			});
			parsed.messageStrategy = typeof parsed.messageStrategy === 'string' ? parsed.messageStrategy.trim().slice(0, 1200) : '';
			if (parsed.comparison && typeof parsed.comparison === 'object') {
				parsed.comparison = {
					detected: parsed.comparison.detected === true,
					type: ['us-vs-them', 'before-after', 'comparison-grid', 'other'].includes(parsed.comparison.type) ? parsed.comparison.type : 'other',
					confidence: ['high', 'medium', 'low'].includes(parsed.comparison.confidence) ? parsed.comparison.confidence : 'medium',
					summary: typeof parsed.comparison.summary === 'string' ? parsed.comparison.summary.trim().slice(0, 500) : '',
					question: typeof parsed.comparison.question === 'string' ? parsed.comparison.question.trim().slice(0, 500) : '',
					defaultStrategy: typeof parsed.comparison.defaultStrategy === 'string' ? parsed.comparison.defaultStrategy.trim().slice(0, 800) : '',
				};
			} else {
				parsed.comparison = { detected: false, confidence: 'high', type: 'other', summary: '', question: '', defaultStrategy: '' };
			}
			parsed.people = Array.isArray(parsed.people) ? parsed.people.map((person: any) => ({
				...person,
				slide: Number.isInteger(Number(person?.slide)) && Number(person.slide) >= 1 ? Number(person.slide) : undefined,
			})) : [];
			parsed.comparisonItems = Array.isArray(parsed.comparisonItems) ? parsed.comparisonItems.map((item: any) => ({
				...item,
				slide: Number.isInteger(Number(item?.slide)) && Number(item.slide) >= 1 ? Number(item.slide) : undefined,
			})) : [];
			parsed.styleNotes = typeof parsed.styleNotes === 'string' ? parsed.styleNotes.trim().slice(0, 400) : '';
			// El medio y la geometría entran tal cual al render, así que se acotan
			// igual que el resto de los campos descriptivos.
			parsed.renderingMedium = typeof parsed.renderingMedium === 'string' ? parsed.renderingMedium.trim().slice(0, 300) : '';
			parsed.compositionGeometry = typeof parsed.compositionGeometry === 'string' ? parsed.compositionGeometry.trim().slice(0, 700) : '';
			parsed.logoIsWordmark = parsed.logoIsWordmark === true;
			parsed.logoWhere = typeof parsed.logoWhere === 'string' ? parsed.logoWhere.trim().slice(0, 80) : '';
			parsed.pressRow = parsed.pressRow && typeof parsed.pressRow === 'object' && parsed.pressRow.detected === true
				? {
					detected: true,
					heading: typeof parsed.pressRow.heading === 'string' ? parsed.pressRow.heading.trim().slice(0, 80) : '',
					outlets: Array.isArray(parsed.pressRow.outlets) ? parsed.pressRow.outlets.map((v: any) => String(v || '').trim().slice(0, 60)).filter(Boolean).slice(0, 8) : [],
					where: typeof parsed.pressRow.where === 'string' ? parsed.pressRow.where.trim().slice(0, 120) : '',
				}
				: undefined;
			// Un valor raro aca no puede caer en la rama de inmueble por accidente: lo
			// que no se reconoce se trata como objeto, que es lo que hacia antes.
			parsed.targetClass = ['object', 'property', 'vehicle', 'service'].includes(parsed.targetClass) ? parsed.targetClass : undefined;
			// La tipografía observada, en atributos. Se acota igual que el bloque
			// creativo porque también entra tal cual al prompt del render.
			if (parsed.typography && typeof parsed.typography === 'object') {
				const linea = (valor: unknown, max: number) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');
				parsed.typography = {
					headline: linea(parsed.typography.headline, 220),
					body: linea(parsed.typography.body, 220),
					pairing: linea(parsed.typography.pairing, 200),
				};
			} else {
				parsed.typography = undefined;
			}

			// El bloque creativo entra tal cual al prompt del render: se acota acá
			// para que una respuesta larga o rara del analizador no se cuele ni
			// infle el prompt sin control.
			if (parsed.creative && typeof parsed.creative === 'object') {
				const texto = (valor: unknown, max: number) => (typeof valor === 'string' ? valor.trim().slice(0, max) : undefined);
				parsed.creative = {
					...parsed.creative,
					adType: texto(parsed.creative.adType, 120),
					styleFamily: texto(parsed.creative.styleFamily, 60),
					photographyStyle: texto(parsed.creative.photographyStyle, 200),
					lighting: texto(parsed.creative.lighting, 200),
					depth: texto(parsed.creative.depth, 200),
					composition: texto(parsed.creative.composition, 240),
					colorPsychology: texto(parsed.creative.colorPsychology, 240),
					emotion: texto(parsed.creative.emotion, 120),
					designPattern: texto(parsed.creative.designPattern, 300),
					scoreReasons: Array.isArray(parsed.creative.scoreReasons)
						? parsed.creative.scoreReasons.map((razon: any) => String(razon || '').trim().slice(0, 120)).filter(Boolean).slice(0, 5)
						: [],
				};
			}

			parsed.creativeDecisions = Array.isArray(parsed.creativeDecisions)
				? parsed.creativeDecisions.slice(0, 5).map((decision: any) => ({
					type: ['person', 'scene', 'styling', 'object', 'comparison', 'product-handling', 'other'].includes(decision?.type) ? decision.type : 'other',
					title: typeof decision?.title === 'string' ? decision.title.trim().slice(0, 160) : '',
					// Tres respuestas listas para tocar: escribir a mano una indicación
					// era el paso donde la gente se trababa o directamente lo saltaba.
					options: Array.isArray(decision?.options)
						? decision.options.map((opcion: any) => String(opcion || '').trim().slice(0, 120)).filter(Boolean).slice(0, 3)
						: [],
					where: typeof decision?.where === 'string' ? decision.where.trim().slice(0, 240) : '',
					description: typeof decision?.description === 'string' ? decision.description.trim().slice(0, 500) : '',
					question: typeof decision?.question === 'string' ? decision.question.trim().slice(0, 500) : '',
					defaultStrategy: typeof decision?.defaultStrategy === 'string' ? decision.defaultStrategy.trim().slice(0, 700) : '',
					confidence: ['high', 'medium', 'low'].includes(decision?.confidence) ? decision.confidence : 'medium',
					directive: '',
				}))
				: [];
			// Si el usuario eligió idioma, ese es el idioma del creativo: no es una
			// sugerencia que el modelo pueda pisar con el idioma de la referencia.
			parsed.language = (input.language && LANGUAGE_NAMES[input.language])
				? input.language
				: (typeof parsed.language === 'string' && LANGUAGE_NAMES[parsed.language] ? parsed.language : 'es');
			parsed.textZones = parsed.textZones.map((zone: any) => ({
				...zone,
				slide: Number.isInteger(Number(zone?.slide)) && Number(zone.slide) >= 1 ? Number(zone.slide) : undefined,
				// Cuántas líneas ocupa el bloque en el ganador. Antes se deducía de
				// los saltos de línea del texto original, que nunca vienen: un titular
				// de tres líneas se contaba como una y el prompt terminaba pidiendo
				// justamente lo contrario de lo que hay que reproducir.
				lines: Number.isInteger(Number(zone?.lines)) && Number(zone.lines) >= 1 && Number(zone.lines) <= 12 ? Number(zone.lines) : undefined,
				setIn: typeof zone?.setIn === 'string' && zone.setIn.trim() && !/^(null|none|n\/a)$/i.test(zone.setIn.trim()) ? zone.setIn.trim().slice(0, 95) : undefined,
				labels: typeof zone?.labels === 'string' && zone.labels.trim() && !/^(null|none|n\/a)$/i.test(zone.labels.trim()) ? zone.labels.trim().slice(0, 160) : undefined,
				replacement: stripWebReferences(zone?.replacement),
			}));
			parsed.creativeDecisions = parsed.creativeDecisions.map((decision: any) => ({
				...decision,
				slide: Number.isInteger(Number(decision?.slide)) && Number(decision.slide) >= 1 ? Number(decision.slide) : undefined,
			}));
			return parsed as LayoutAnalysis;
		} catch { return null; }
	};

	if (keys.googleKey) {
		try {
			const model = (typeof import.meta.env !== 'undefined' && import.meta.env.GEMINI_ANALYSIS_MODEL) || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
			const parts: any[] = [{ text: `${systemPrompt}\n\n${userText}\n\n${isCarouselReference ? `The next ${referenceInputs.length} images are CAROUSEL PAGES in order. Analyze every page and use the page number in each text zone and decision.` : 'The first image is the TEMPLATE.'}${hasProductImages ? ` The next ${productInputs.length} images after the reference${isCarouselReference ? ' pages' : ''} are REAL PRODUCT PHOTOS of the SAME SKU, in different views; reconcile them instead of blending or averaging them.` : ''}` }];
		referenceInputs.forEach((reference, index) => {
			parts.push({ text: isCarouselReference ? `CAROUSEL PAGE ${index + 1} OF ${referenceInputs.length}:` : 'TEMPLATE:' });
			parts.push({ inline_data: { mime_type: reference.mime, data: reference.b64 } });
		});
			productInputs.forEach((photo, index) => {
				parts.push({ text: `REAL PRODUCT PHOTO ${index + 1} OF THE SAME SKU:` });
				parts.push({ inline_data: { mime_type: photo.mime || 'image/jpeg', data: photo.b64 } });
			});
			avatarInputs.forEach((photo, index) => {
				parts.push({ text: `AVATAR/PERSON REFERENCE PHOTO ${index + 1}:` });
				parts.push({ inline_data: { mime_type: photo.mime || 'image/jpeg', data: photo.b64 } });
			});
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.googleKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts }],
					// Sin thinking: medido, tarda la mitad (9s contra 18s), cuesta menos
					// de la mitad (USD 0.004 contra 0.0095) y en la prueba enumeró MÁS
					// zonas de texto que con thinking activado. El razonamiento largo no
					// aportaba nada en una tarea de enumerar lo que se ve.
					generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
				}),
			});
			const data: any = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(data.error || data).slice(0, 160)}`);
			const parsed = validate(data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join(''));
			if (parsed) return repararCifrasInventadas(keys, parsed, verificado, parsed.language || "es");
		} catch (geminiError) {
			console.error('Gemini layout analysis failed, trying OpenAI:', geminiError);
		}
	}

	if (keys.openAIKey) {
		try {
			const openai = new OpenAI({ apiKey: keys.openAIKey });
			const model = (typeof import.meta.env !== 'undefined' && import.meta.env.OPENAI_ANALYSIS_MODEL) || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
			const content: any[] = [{ type: 'text', text: `${userText}\n${isCarouselReference ? `Analyze all ${referenceInputs.length} carousel pages in order and include the page number in every text zone and contextual decision.` : 'Analyze the supplied template.'}` }];
			referenceInputs.forEach((reference, index) => {
				content.push({ type: 'text', text: isCarouselReference ? `CAROUSEL PAGE ${index + 1} OF ${referenceInputs.length}:` : 'TEMPLATE:' });
				content.push({ type: 'image_url', image_url: { url: `data:${reference.mime};base64,${reference.b64}` } });
			});
			productInputs.forEach((photo, index) => {
				content.push({ type: 'text', text: `REAL PRODUCT PHOTO ${index + 1} OF THE SAME SKU:` });
				content.push({ type: 'image_url', image_url: { url: `data:${photo.mime || 'image/jpeg'};base64,${photo.b64}` } });
			});
			avatarInputs.forEach((photo, index) => {
				content.push({ type: 'text', text: `AVATAR/PERSON REFERENCE PHOTO ${index + 1}:` });
				content.push({ type: 'image_url', image_url: { url: `data:${photo.mime || 'image/jpeg'};base64,${photo.b64}` } });
			});
			const response = await openai.chat.completions.create({
				model,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content },
				],
			});
			const parsed = validate(response.choices[0]?.message?.content);
			if (parsed) return repararCifrasInventadas(keys, parsed, verificado, parsed.language || "es");
		} catch (openAIError) {
			console.error('OpenAI layout analysis (fallback) failed:', openAIError);
		}
	}

	return null;
}

	// Prompt para el modo "Fiel al ganador": conserva la estructura, adapta el
	// producto y vuelve a escribir los textos visibles dentro de la imagen.
export function buildReferenceClonePrompt(input: {
	productNames: string[];
	productFacts?: string[];
	brandName: string;
	hasLogo: boolean;
	/**
	 * Cómo se firma el aviso: con el nombre escrito, con el archivo del logo,
	 * o sin firma.
	 *
	 * Antes era el sí/no de `hasLogo`, y el "sí" significaba siempre PEGAR EL
	 * ARCHIVO. El caso más común no tenía forma de pedirse: el ganador firma
	 * con el nombre en tipografía y ahí va escrito el nombre del negocio, no un
	 * escudo. Se colaba igual, pero solo si el analizador había marcado la
	 * marca del ganador como wordmark, o sea por casualidad y no por decisión.
	 */
	logoMode?: LogoMode;
	brief: string;
	analysis?: LayoutAnalysis | null;
	languageCode?: string;
	colorMode?: 'winner' | 'url' | 'brand';
	typoMode?: 'winner' | 'url' | 'brand';
	brandColors?: string[];
	brandTypography?: { headings?: string; body?: string };
	brandPalette?: { background?: string; text?: string; accent?: string; secondary?: string; source?: string };
	subjectMode?: 'product' | 'service' | 'saas' | 'brand' | 'catalog';
	hasAvatarReference?: boolean;
	/** Quien aparece en el anuncio: lo elige el usuario antes de generar. */
	personMode?: 'none' | 'ai' | 'described' | 'upload';
	avatarDescription?: string;
	/**
	 * Que hacer con la fila de medios del ganador, decidido en la revision.
	 *
	 * 'quitar' es el default y lo correcto: reproducir "As seen on Forbes" cuando
	 * el negocio no salio en Forbes es una afirmacion falsa. 'texto' y 'logos' son
	 * para cuando el anunciante SI tiene prensa o sellos propios, que es
	 * perfectamente legitimo y hoy no habia forma de mostrar.
	 */
	pressRowMode?: 'quitar' | 'texto' | 'logos';
	pressRowItems?: string[];
	includeWebsite?: boolean;
	displayWebsite?: string;
	adCopy?: { headline?: string; subheadline?: string; reviewText?: string; cta?: string; language?: string };
	carousel?: { index: number; total: number };
}) {
	const languageCode = input.languageCode || input.analysis?.language || input.adCopy?.language || 'es';
	const language = LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.es;
	const subjectMode = input.subjectMode || 'product';
	const isCatalogSubject = subjectMode === 'catalog';
	const isPhysicalSubject = subjectMode === 'product' || isCatalogSubject;
	// A qué se refieren las instrucciones de texto. Para un catálogo NO puede ser
	// la lista de nombres: "adaptá el mensaje a A + B + C" empuja al modelo a
	// hablar de artículos sueltos, que es justo lo contrario de un anuncio de la
	// tienda. Ahí el sujeto es el negocio, y los productos son la muestra.
	const productLabel = isCatalogSubject
		? `${input.brandName ? `the store ${input.brandName}` : 'the store'} as a whole, using the supplied products only as a sample of its range`
		: input.productNames.length
			? input.productNames.join(' + ')
			: (isPhysicalSubject ? 'the real product supplied by the user' : 'the service or SaaS offer supplied by the user');
	const verifiedProductFacts = (input.productFacts || []).filter(Boolean);
	const referenceHasProduct = input.analysis?.referenceHasProduct !== false;

	/**
	 * Un inmueble y un vehiculo no se re-fotografian: sus fotos YA son el anuncio.
	 *
	 * Se paso la URL de un departamento y salio otro departamento. La causa no era
	 * el modelo: todo el bloque de producto le pide "re-fotografia el objeto DENTRO
	 * de la escena del ganador, mismo angulo, misma luz, mismo ambiente". Con una
	 * botella eso es exactamente lo que se quiere; con un departamento es una orden
	 * de redibujar el ambiente, y redibujar el ambiente es cambiar la unidad. Aca no
	 * se agrega una regla mas: se cambia de rama, y de paso se sacan las que no
	 * aplican —silueta, packaging, orientacion del grafico, manos y escala— que
	 * ademas eran las que empujaban en la direccion equivocada.
	 */
	const targetClass = input.analysis?.targetClass || 'object';
	const fotoEsLaEscena = isPhysicalSubject && (targetClass === 'property' || targetClass === 'vehicle');
	const esVehiculo = targetClass === 'vehicle';
	const claseNombre = esVehiculo ? 'vehicle' : 'property';

	/**
	 * Con qué está hecho el ganador, y con qué hay que hacer el clon.
	 *
	 * Antes el prompt exigía "photorealistic" en cuatro lugares distintos sin
	 * mirar la referencia. Cuando el ganador es un dibujo —un personaje 3D, una
	 * ilustración plana— eso ordena lo contrario de copiarlo: el clon reemplaza al
	 * personaje por una foto del producto y deja de parecerse al anuncio que se
	 * eligió, aunque la maqueta esté bien. El medio observado manda siempre.
	 */
	const medium = (input.analysis?.renderingMedium || '').trim();
	const looksIllustrated = /illustrat|cartoon|vector|render|3d|comic|drawn|anime|clay|claymation|stylis|stylized|flat art|collage|graphic|mockup|screenshot/i.test(medium);
	const mediumWord = medium
		? `rendered in EXACTLY the same medium as the template — ${medium}`
		: 'photorealistic';
	const mediumRule = medium
		? `
RENDERING MEDIUM (CRITICAL — READ BEFORE ANYTHING ELSE) — The template is: ${medium}. The new ad must be made the SAME WAY. This decides more of the resemblance than any other single instruction: an illustrated ad redrawn as a photograph, or a photographic ad redrawn as an illustration, reads as a completely different piece even when every block sits in the right place.${looksIllustrated
			? ` This template is NOT a photograph. Do NOT render photographic subjects. Every character, animal, object and scene must be drawn in that same style, with the same proportions, the same outline treatment, the same shading and the same level of stylisation. Where the template shows an illustrated character, the new ad shows an illustrated character too — replacing it with a real photograph of a product is a hard failure. If the user's product photo is a real photograph, RE-DRAW the product in the template's style instead of pasting the photo${isPhysicalSubject ? ', keeping its true silhouette, colours, materials and identifying details recognisable through the stylisation' : ''}.`
			: ' This template IS photographic: render photographic scenes, not illustrations, drawings, 3D renders or vector art.'}`
		: '';

	/**
	 * La maqueta en proporciones. "Misma composición" se cumple a ojo y da
	 * bloques bien ordenados con otros tamaños, que es justo lo que hace que un
	 * clon correcto no se parezca al original.
	 */
	const geometryRule = input.analysis?.compositionGeometry
		? `
GEOMETRY LOCK (CRITICAL) — Rebuild the template's layout at these exact proportions, measured on the template itself: ${input.analysis.compositionGeometry}
Treat these as fixed dimensions, not as suggestions. Any divider stays at its exact position; every band keeps its share of the height; the headline keeps its size relative to the canvas width; every smaller text block keeps ITS measured cap-height and ITS measured line spacing; the outer margins stay the same. Secondary text — captions, card and panel copy, disclaimers — is where this slips most: setting it a little larger and opening the leading toward a comfortable reading size is the most common way a layout that is otherwise faithful still reads as a different ad. Editorial ads set that copy small and tight on purpose. Do not enlarge the type "so it reads better", do not grow a subject until it fills more of the frame, and do not shift a divider to make something fit. If content does not fit in its band, shorten the content — never resize the band.`
		: '';

	/**
	 * Comparación partida: cada lado se queda de su lado.
	 *
	 * Un producto que cruza la división rompe justo lo que hace legible a una
	 * comparativa, y el texto positivo cayendo sobre la mitad "mala" invierte el
	 * sentido del anuncio: se lee como que lo bueno es lo que hay que evitar.
	 */
	const splitComparisonRule = input.analysis?.comparison?.detected
		? `
SPLIT INTEGRITY (CRITICAL) — This is a comparison and the two sides must stay separated exactly as the template separates them. Each side's subject stays ENTIRELY inside its own half: nothing crosses, overlaps, leans into or covers the divider or the opposite half, at any size. The divider itself stays at the position given above, full length, in the same style.
SIDE MEANING MUST NOT FLIP — Whatever the template puts on the negative/"before"/"other option" side stays on that side, and whatever it puts on the positive/"our product" side stays on that side. Every text block keeps the side it had: a positive line ("choose ours", "the better way") may never end up over the negative half, and a problem statement may never end up over the hero half. Read each replacement, decide which side it argues for, and place it on the same side the template placed its equivalent. If the template's bottom-left line is a transition that spans both sides, keep it spanning both sides in the same place — do not turn it into a one-sided claim.`
		: '';

	// Zonas de texto: son las palabras que sí deben volver a aparecer dentro del
	// creativo. Las zonas impresas sobre un producto sin packaging no se inventan.
	const isJunkReplacement = (value?: string) => {
		const text = (value || '').trim();
		return !text || /^(null|undefined|none|n\/a|nan|-|—)$/i.test(text);
	};
	const zones = (input.analysis?.textZones || [])
		.filter((zone) => (input.analysis?.productHasPackaging ? true : !zone.onProduct))
		.filter((zone) => !isJunkReplacement(zone.replacement));
	const droppedOnProduct = (input.analysis?.textZones?.length || 0) - zones.length;
	let textSwap = '';
	if (zones.length) {
		textSwap = zones.map((zone, index) => {
			// El formato de la zona es parte del diseño que hace funcionar al
			// ganador: un resaltado o un subrayado que no se reproduce cambia
			// dónde cae el ojo y el anuncio deja de verse igual.
			const emphasis = typeof (zone as any).emphasis === 'string' && (zone as any).emphasis.trim() && (zone as any).emphasis.trim().toLowerCase() !== 'null'
				? ` — KEEP THIS FORMATTING: ${(zone as any).emphasis.trim()}. Apply the same treatment to the equivalent words of the new text.`
				: '';
			// El largo importa tanto como el contenido: un reemplazo más largo que el
			// original obliga a que el texto pase a dos líneas, y ahí se desarma el
			// ritmo de toda la columna aunque la maqueta se haya respetado.
			const largo = (zone.original || '').trim().length;
			// La caja del original: en mayúsculas o no. Es lo primero que se pierde
			// al reemplazar un texto y lo que más cambia la jerarquía de un anuncio.
			const soloLetras = (zone.original || '').replace(/[^\p{L}]/gu, '');
			const enMayusculas = soloLetras.length > 2 && soloLetras === soloLetras.toUpperCase();
			const caja = enMayusculas ? ' — RENDER IT IN ALL CAPS, exactly like the original' : '';
			// Las líneas las cuenta el analizador mirando la imagen. Deducirlas de los
			// saltos del texto original daba siempre 1, así que a un titular partido en
			// tres líneas se le pedía una sola: el prompt rompía lo que quería copiar.
			// Sin el dato es preferible no decir nada que afirmar un número inventado.
			const lineas = typeof zone.lines === 'number' && zone.lines >= 1
				? `; EXACTLY ${zone.lines} line${zone.lines > 1 ? 's' : ''}, broken where the template breaks them`
				: '';
			// La medida de ESTE bloque, que es lo que le falta a "al mismo tamaño"
			// para poder ganar: sin un número, el modelo compone al tamaño que le
			// resulta cómodo de leer y la copia sale más grande y más aireada.
			const compuesto = typeof (zone as any).setIn === 'string' && (zone as any).setIn.trim()
				? `; as measured: ${(zone as any).setIn.trim()}`
				: '';
			const encaje = largo || lineas || compuesto
				? ` — the original is ${largo} characters${lineas}${compuesto || '; the replacement must occupy the same block at the same size'}${caja}`
				: caja;
			// Un rótulo con línea guía solo funciona si lo que señala existe.
			const rotulo = zone.labels
				? ` — this is a callout labelling ${zone.labels}: its leader line must end on the equivalent part of the NEW product, and the label must name something actually visible in it. If the new product has no equivalent part, label a different real feature rather than pointing the line at nothing.`
				: '';
			// Un arco se dibujó para un texto de ese largo exacto: si el reemplazo es
			// más largo, el arco se estira de acento de esquina a banda que cruza la
			// imagen. Lo que cede es el TEXTO, nunca la geometría.
			const arco = typeof (zone as any).onCurve === 'string' && (zone as any).onCurve.trim() && (zone as any).onCurve.trim().toLowerCase() !== 'null'
				? ` — THIS TEXT SITS ON A CURVE: ${(zone as any).onCurve.trim()}. Keep that exact arc — same anchor, same radius, same angular span — and fit the replacement inside it: no more than ${largo || 12} characters. If it does not fit, cut words until it does; never lengthen the arc.`
				: '';
			return `${index + 1}. [${zone.where || 'text zone'}${zone.messageRole ? ` — persuasive job: ${zone.messageRole}` : ''}] Replace "${zone.original || ''}" with "${zone.replacement}"${encaje}${arco}${rotulo}${emphasis}`;
		}).join('\n');
	}

	const placement = input.analysis?.productPlacement
		? ` — same position, generous scale, dynamic angle and prominence described here: ${input.analysis.productPlacement}`
		: ', in its exact position, with the same scale and prominence,';
	// Regla incondicional: respetar la forma física real del producto aunque
	// el análisis se equivoque con productHasPackaging.
	const packagingRule = input.analysis && !input.analysis.productHasPackaging
		? `\nCRITICAL: the real product has NO printed packaging. Its surface must stay completely clean — do NOT print any words, logos, badges, spec bubbles or graphics on the product itself.${droppedOnProduct > 0 ? " The template's on-product texts are intentionally omitted; do not recreate or relocate them." : ''}`
		: `\nNEVER invent a box, wrapper or label that is not visible in the product photo.`;

	// El texto impreso en el envase se copia carácter por carácter. Inventar una
	// letra puede convertir el nombre real del producto en otra palabra
	// (p. ej. "PDRN" leído como "PORN") y arruinar el anuncio.
	// En modo tienda los nombres son varios productos distintos, no uno solo: decir
	// que la etiqueta dice "A + B + C" hacía que se imprimiera esa concatenación.
	const nombreEnEtiqueta = input.productNames.length && !isCatalogSubject
		? `; the product name is literally "${input.productNames.join(' + ')}" and must be spelled exactly that way on the label`
		: '';
	const labelFidelityRule = `\nLABEL TEXT FIDELITY (CRITICAL) — Any text printed on the product's own packaging must be reproduced CHARACTER BY CHARACTER exactly as it appears in the product photo${nombreEnEtiqueta}. Never re-spell, auto-correct, translate or "improve" a word on the packaging, and never swap a letter for a similar-looking one — a single wrong character can turn the real product name into a different word. If part of the label is too small or blurry to read with certainty in the photo, render it as realistically soft/out-of-focus micro-text instead of guessing letters.`;
	// Un servicio, un software o una marca no adjuntan fotos de producto. Esta
	// regla se emitía igual, así que el prompt decía "no muestres ningún producto"
	// y a renglón seguido "conservá la silueta exacta del producto": mil doscientos
	// caracteres pidiendo lo contrario de la instrucción anterior.
	const orientationRule = !isPhysicalSubject || fotoEsLaEscena
		? ''
		: isCatalogSubject
		? `\nPRODUCT IDENTITY IN A STORE AD (CRITICAL) — Each supplied photo is a SEPARATE product, never a different view of the same one. Reproduce each one's own silhouette, proportions, construction, materials, finish, colour and texture from its own photo, and never average two of them, swap a detail between them or invent a colourway that was not supplied. Nothing may be ADDED to a surface either: no tooling, embossing, carving, print or pattern that is not visible in that product's own photo. A plain hide stays plain. If verified facts describe them, they are authoritative: ${verifiedProductFacts.length ? verifiedProductFacts.join(' | ') : 'use only what is clearly visible in the supplied product photos'}.`
		: `\nPRODUCT IDENTITY AND MULTI-VIEW CONSISTENCY (CRITICAL) — All supplied product photos are different views of ONE SAME SKU, not different variants to blend together. Use them jointly as the source of truth: preserve the exact silhouette, dimensions, proportions, construction, seams, materials, finish, colors, texture, packaging and distinctive details. Never average two views into a new hybrid product, change the product category, add a missing component or remove a real component.\nPRODUCT ORIENTATION AND GRAPHICS (CRITICAL) — Treat the supplied product photos as a multi-view reference, not as a texture to mirror. Preserve the product's real front/back/side orientation and keep every print, embroidery, patch, label and graphic on the exact physical side where it belongs. Never mirror the garment, turn it inside out, or move a back graphic onto the chest/front. If verified facts identify front and back details, they are authoritative: ${verifiedProductFacts.length ? verifiedProductFacts.join(' | ') : 'use only what is clearly visible in the supplied product photos'}.${input.analysis?.productOrientation ? ` Vision analysis also found: ${input.analysis.productOrientation}.` : ''} If the requested camera angle cannot show a detail from its correct side, hide it naturally rather than inventing or relocating it.`;
	const carouselRule = input.carousel && fotoEsLaEscena
		? `\nCAROUSEL CONSISTENCY (CRITICAL) — This is slide ${input.carousel.index} of ${input.carousel.total} of one carousel about ONE SAME ${claseNombre.toUpperCase()}. Each slide may use a different supplied photo of it, but every slide shows that same unit: same ${esVehiculo ? 'model, colour, wheels and condition' : 'rooms, finishes, openings and layout'}.`
		: input.carousel && !isPhysicalSubject
		? `\nCAROUSEL CONSISTENCY (CRITICAL) — This is slide ${input.carousel.index} of ${input.carousel.total} in one carousel. Keep the same visual world across every slide: the same palette, the same typography, the same graphic devices and the same treatment of people and scenes. Only the message and the layout of each slide change; nothing about the brand's look may drift from one page to the next.`
		: input.carousel
		? `\nCAROUSEL CONSISTENCY (CRITICAL) — This is slide ${input.carousel.index} of ${input.carousel.total} in one carousel. The supplied product photos are the identity master for this same product across every slide. Keep the exact same SKU, silhouette, proportions, construction, materials, finish, colors, texture, packaging, labels and front/back orientation from slide to slide. Only the scene, layout adaptation and presentation may change according to this slide's reference; never redesign, resize arbitrarily, recolor, mirror or substitute the product between slides.`
		: '';

	// Cada aparición del producto del template, enumerada. Reemplazar solo la
	// principal dejaba el resto en el anuncio: el ganador vendía corpiños y el
	// resultado mostraba el cuero abajo y la modelo en corpiño al lado.
	const instances = (input.analysis?.productInstances || []).filter((item) => item && (item.where || item.howShown));
	const instanceBlock = instances.length > 1
		? `
EVERY APPEARANCE OF THE TEMPLATE'S PRODUCT MUST BE REPLACED — the template shows its own product in ${instances.length} places, and leaving even one turns the ad into two different products at once:
${instances.map((item, index) => `   ${index + 1}. ${item.where || 'unspecified position'} — shown as: ${item.howShown || 'product shot'}${item.onBody ? ' (ON A BODY)' : ''}`).join('\n')}
After finishing, sweep the whole canvas: no garment, shoe, bottle, jar, pack or object belonging to the template's original product may remain anywhere, at any size, in any panel, including small repeats, grids and colour variants.`
		: '';

	// El producto del template se usa puesto en el cuerpo y el nuevo no puede.
	const onBodyRule = input.analysis?.productOnBody
		? `
WEARABILITY CONFLICT — In the template the product is worn on a body. Decide honestly whether ${productLabel} can be worn the same way. If it CANNOT (it is a material, a hide, a bottle, a tool, a food, a device, anything not a garment/shoe/jewellery), you must NOT leave the template's worn garment or footwear in the image and you must NOT dress the person in an invented version of the new product. Instead, re-stage that region: keep the human presence only if it makes sense (e.g. hands presenting, holding or working with the product) and otherwise replace that area with the product properly staged in a coherent scene, preserving the template's framing, background, lighting and the position/size of every text block. A model wearing the template's original garment next to the new product is a hard failure.`
		: '';

	// Cada área de imagen del ganador, con qué debe mostrar ahora. Esto es lo que
	// convierte el clon en "misma estructura, contenido propio" en vez de dejar las
	// fotos originales del template.
	const slots = (input.analysis?.imageSlots || []).filter((slot) => slot && slot.replaceWith);
	// Con un inmueble o un vehiculo el area no se vuelve a fotografiar: se elige
	// cual de las fotos reales entra y como se recorta. El bloque de abajo dice
	// literalmente "re-photograph each area", que es la orden que hacia aparecer
	// otro departamento.
	const imageSlotBlock = slots.length && fotoEsLaEscena
		? `
0. WHICH REAL PHOTO GOES IN EACH IMAGE AREA — The template's own photos belong to another advertiser and must not survive anywhere. Fill every area with the supplied photos of this ${claseNombre}, keeping the SAME frame, crop shape, proportion, position, tilt and stacking order the template gives that area:
${slots.map((slot, index) => `   ${index + 1}. [${slot.where || 'image area'}] now shows: ${slot.showsNow || 'unspecified'} → must show instead: ${slot.replaceWith}`).join('\n')}
These lines choose WHICH photo and HOW it is cropped, nothing else. They never authorise redrawing what a photo shows: if one of them reads like a scene to build, take from it only the choice of photo and the framing.`
		: slots.length
		? `
0. RE-SHOOT EVERY IMAGE AREA — This ad works because of its structure and its idea: the layout, the visual rhythm and where it sends the eye. You are keeping that skeleton and replacing what fills it. The template's own photos, models, scenes and subjects have NOTHING to do with ${productLabel} and must not survive anywhere in the output. Re-photograph each area as follows, keeping the SAME frame, crop, angle, tilt, scale, lighting mood and position as the template so the composition still reads the same:
${slots.map((slot, index) => `   ${index + 1}. [${slot.where || 'image area'}] now shows: ${slot.showsNow || 'unspecified'}${slot.idea ? ` — THE IDEA THIS AREA CARRIES, which must survive: ${slot.idea}. Keep the idea, change only what it is about; do not replace it with a product photo` : ''} → must show instead: ${slot.replaceWith}`).join('\n')}
Every scene you render must be ${mediumWord}, plausible and clearly about ${productLabel}, its maker, its user or its result. Do not leave a single frame showing the template's original subject, and do not blur or crop it away — replace it with real content.
On the SETTING these replacements have the last word: what stays is the palette, the layout and the graphic devices; what does not stay is the surface, the props and the environment the template's photos happened to use. If the template shot its product floating on water, the new product does NOT go on water unless that scene is named above. That is the only thing they override — they never authorise changing WHICH products appear, how many, or the kind of shot each area holds. Where a later rule fixes the contents or the uniformity of a grid, a row or a lineup, that rule wins over anything written here.`
		: '';

	// Escala física. El clon copiaba el tamaño del producto del template respecto
	// de la composición, y eso rompe cuando los tamaños reales no se parecen: una
	// pastilla entra entre dos dedos, un cuero entero no. El resultado era una
	// mano pellizcando un recorte diminuto de cuero.
	const scaleAlways = `
TRUE SIZE AND BELIEVABLE HANDLING (CRITICAL) — Render ${productLabel} at its real physical size relative to everything else in frame, judged from the product photo. Never shrink it to fit the pose the template used, and never enlarge it to fill a gap.

   HANDS: only show a hand touching the product if a real person could actually hold it that way. Ask yourself whether the grip would work in real life. A single hand cannot pinch, dangle or hold up a large flexible item — a full hide, a rug, a panel, a bolt of fabric, a blanket: the weight and the size make it fall. If the product is large, choose ONE of these instead, whichever fits the template's composition best:
     · show the product on its own, with no hand at all — often the cleanest and the safest choice;
     · rest it on a table, a workbench, a shelf or the floor;
     · hang or drape it over a rack, a rail, a chair or an edge;
     · roll it and stand it up, or fold it into a neat stack;
     · use TWO hands, or a forearm supporting the weight, with the product clearly continuing out of frame.
   A hand pinching a corner while an entire heavy hide hangs weightless is a hard failure: it reads as fake immediately and ruins the ad. When in doubt, remove the hand and show the product alone, well lit and well composed.`;

	// La regla de manos y escala esta escrita para un objeto que alguien sostiene.
	// Un departamento no se sostiene, y emitirla solo gasta atencion del modelo.
	const scaleRule = fotoEsLaEscena
		? ''
		: input.analysis?.stagingAdaptation
		&& !/same handling as the template/i.test(input.analysis.stagingAdaptation)
		? `
PHYSICAL SCALE (CRITICAL) — The template's product is ${input.analysis.templateProductScale || 'a different size'}, while ${productLabel} is ${input.analysis.targetProductScale || 'a different size'}. Rendering it at the template's size would be absurd. Keep the SAME shot type, crop, framing, body parts in frame and area of the canvas occupied, but change HOW the product is handled so the scene is physically believable: ${input.analysis.stagingAdaptation}. The product must read at its true real-world size next to any hand, body or object in frame — never shrink or enlarge it to fit the template's original pose.`
		: scaleAlways;

	// Dirección de arte del ganador. Sin esto el modelo conserva el layout pero
	// pierde el porqué: la luz, la profundidad y el tipo de fotografía son la
	// mitad de lo que hace que un anuncio se vea profesional.
	const c = input.analysis?.creative;
	/**
	 * Lo que hace ganar a este anuncio, dicho por el propio análisis.
	 *
	 * El analizador ya devolvía `adType`, `styleFamily` y `scoreReasons` —"por qué
	 * este creativo funciona": contraste, jerarquía, CTA, legibilidad— y nada de
	 * eso llegaba al prompt del render. Se pagaba el análisis y se tiraba
	 * justamente la parte que explica la fuerza del anuncio, que es lo único que
	 * hay que conservar al clonarlo.
	 *
	 * El tipo de anuncio va primero a propósito: saber que es un testimonial, una
	 * comparativa o un antes/después gobierna toda la composición, mucho más que
	 * cualquier detalle de iluminación.
	 */
	const creativeBlock = c && (c.photographyStyle || c.lighting || c.composition || c.adType)
		? `
ART DIRECTION TO PRESERVE — this ad works because of how it is shot and arranged, not only because of where the text sits. Reproduce all of it:${[
			c.adType && `
   · What kind of ad this is: ${c.adType}. The new ad must remain the SAME kind — do not turn a testimonial into a plain product shot, or a comparison into a single hero.`,
			c.styleFamily && `
   · Aesthetic family: ${c.styleFamily}. Someone should place the result in that same family at a glance.`,
			c.photographyStyle && `
   · Shot style: ${c.photographyStyle}`,
			c.lighting && `
   · Lighting: ${c.lighting}`,
			c.depth && `
   · Depth and focus: ${c.depth}`,
			c.composition && `
   · Composition: ${c.composition}`,
			c.colorPsychology && `
   · Palette intent: ${c.colorPsychology}`,
			c.emotion && `
   · Emotion it must trigger: ${c.emotion}`,
			c.designPattern && `
   · The reusable pattern: ${c.designPattern}`,
			Array.isArray(c.scoreReasons) && c.scoreReasons.length && `
   · WHY THIS AD PERFORMS — these are the specific strengths that made it a winner, and every one of them must survive in the new ad: ${c.scoreReasons.filter(Boolean).slice(0, 5).join('; ')}`,
		].filter(Boolean).join('')}
The new ad must be shot the same way. A flat, evenly lit product on a plain background is a failure if the template used directional light and shallow depth.`
		: '';

	/**
	 * El intercambio de producto cuando el sujeto es la tienda.
	 *
	 * Antes acá entraba el bloque de producto único, escrito palabra por palabra
	 * para UN objeto: pedía renderizar "ONE single coherent object" y no mostrar
	 * varios salvo que el template lo hiciera, mientras la regla de tienda pedía
	 * exactamente lo contrario. El modelo recibía las dos órdenes juntas y resolvía
	 * distinto en cada corrida: por eso la misma grilla salía a veces con toda la
	 * variedad y a veces con nueve celdas iguales.
	 */
	const catalogSwap = `1. PRODUCT SWAP — Completely remove the template's original product and every trace of it. In its place${placement} render the REAL PRODUCTS shown in the other input images${input.productNames.length ? `: ${input.productNames.join(', ')}` : ''}. They are ${input.productNames.length || 'several'} DIFFERENT products of the same store, not one product photographed several times: each keeps the exact silhouette, colour, material, texture and finish of its own photo, and none may be blended with another or turned into a variant of it. Arrange them the way the template arranges its own subject — a grid, a row, a stack, a lineup, a single hero area — and if the template's area holds only one item, choose the products that read best together and compose them as a group inside that area rather than picking one to stand alone. RE-STAGE them INTO the template's scene: same camera angle, perspective, lighting direction, colour temperature, reflections and shadow behaviour, with the same grounding and the same shadow style, never flat cut-outs pasted on top. Every product at its true real-world size relative to the others: a store that sells items of different sizes must show that difference, not normalise them all to the same footprint. LAYERING: match the template's stacking order exactly — any card, badge or text panel in front of the products stays fully in front and readable.${packagingRule}${labelFidelityRule}`;

	/**
	 * Lo que se vende ya esta fotografiado y no se puede volver a fotografiar.
	 *
	 * Un departamento no se re-fotografia en la escena del ganador porque no hay
	 * dos cosas: el departamento ES la escena. Cada retoque del ambiente —correr un
	 * sillon, agrandar una ventana, inventar la vista— publica una unidad distinta
	 * de la que se vende. Por eso aca lo unico que se permite es lo que hace un
	 * disenador con una foto ajena: elegirla, recortarla y encuadrarla.
	 */
	const listingSujeto = isCatalogSubject
		? `several real ${esVehiculo ? 'vehicles' : 'properties'}, one per supplied photo${input.productNames.length ? ` (${input.productNames.join(', ')})` : ''}`
		: `ONE specific ${claseNombre}${input.productNames.length ? `: ${input.productNames.join(' + ')}` : ''}`;
	const listingSwap = `1. THE SUPPLIED PHOTOS ARE BOTH THE SUBJECT AND THE SCENE — What is for sale is ${listingSujeto}, and the supplied photos ARE it. This is not a product that gets re-photographed inside the template's scene: ${esVehiculo ? 'the body, the wheels, the trim and the wear' : 'the rooms, the light through the windows, the furniture and the layout'} are not a setting chosen for the shot — they are the thing being sold. Place the supplied photos INTO the template's image areas and rebuild every graphic block around them exactly as measured: same position, same size, same frame, same stacking order.
   YOU MAY: choose which photo goes in which area, crop and re-frame it to that area's shape and proportions, scale and position it inside the frame, and give it the template's own edge treatment — corner radius, mask, border, and whatever block crosses over it.
   YOU MAY NOT: redraw, re-render, re-light, extend or "improve" what a photo shows. Do not move, add, remove or replace ${esVehiculo ? 'body panels, wheels, mirrors, badges, the plate, the paint colour or anything inside the cabin, and do not change the model, the year or the condition' : 'furniture, appliances, fittings, flooring, walls, doors, windows, balconies, the view through a window, the sky or the time of day, and do not alter the layout or the proportions of a room'}. Do not stage it in another environment, do not merge two photos into one and do not mirror them. Every one of those changes advertises a ${claseNombre} that does not exist. This holds even when the template is illustrated: these photos stay photographic, and only the graphics around them follow the template's medium.
   If an area calls for a shot the supplied photos do not contain, use the closest one cropped to that frame rather than inventing the missing view; if none fits, close the area with the template's own background treatment.`;

	const productSwap = referenceHasProduct && fotoEsLaEscena
		? listingSwap
		: referenceHasProduct && isCatalogSubject
		? catalogSwap
		: referenceHasProduct && isPhysicalSubject
		? `1. PRODUCT SWAP — Completely remove the template's original product. In its place${placement} render the real product shown in the other input image(s): ${productLabel}. The product stays the SAME PHYSICAL OBJECT TYPE as its photo — a hide stays a hide, a bottle a bottle; never morph it into the template's product form. Render it as ONE single coherent object (never split it into disconnected pieces, and never show multiples unless the template does). RE-STAGE the product INTO the template's scene — do NOT paste it: re-photograph it as if it were shot in that exact environment, matching the scene's camera angle, perspective, lighting direction, color temperature, reflections and shadow behavior (e.g. if the template's product leans against a tiled wall in daylight, the new product must sit in that same tiled-wall daylight scene with the same grounding). Give it real volume, adapt its pose to the composition, and ground it with the template's shadow style. POSITION: same position and size ratio as the template's product — if it sits on the right, yours sits on the right; never centre it unless the template does. Never leave hard cut-out edges: blend the product's edges with the scene lighting. LAYERING: match the template's stacking order exactly — any card, speech bubble or text panel that sits in front of the product in the template must stay fully in front, uncovered and readable; the product must never cut across, poke through or overlap a text card beyond what the template shows. Never show it as a flat cut-out pasted on top, and never replace it with a generic product. Match the product photo's exact shape, colors and texture — it must look premium, tactile and desirable. IDENTITY DETAILS (CRITICAL): whatever is printed, stitched, embossed, woven or engraved on the real product must survive — the brand mark on a garment's chest or sleeve, the tag, the logo on a shoe, the model name on a device, a pattern, a stripe, a stitching colour, a distinctive shape. Someone who owns this product has to recognise it as the same one. Do not clean it up, simplify it, remove a label or move a mark somewhere else. NOTHING MAY BE ADDED EITHER: no tooling, embossing, engraving, stamping, carving, print, pattern, stitching, weave or texture that is not visible in the supplied photo. A plain surface stays plain — decorating it invents a product the user does not sell, and someone who orders it will receive something else.${packagingRule}${labelFidelityRule}${scaleRule}${instanceBlock}${onBodyRule}`
		: `1. NO PRODUCT INSERTION — The template does NOT show a physical product, so the new ad must not show one either. This ad works through its visual composition and design, not through a product shot: that is exactly why it works. Keep its imagery style as it is (the typographic treatment, the colour field, the graphic devices, the scene) and adapt it naturally to the new context. Do NOT insert, paste, collage or hint at a product photo anywhere, at any size, not even small in a corner — not even if a product photo was supplied as input.`;

	const colorRule = input.colorMode !== 'winner' && input.brandColors?.length
		? `COLOR RESTYLE (REQUIRED) — This is a hard requirement: recolor the ad into the selected brand palette ${input.brandColors.join(', ')} (the FIRST color is the primary/dominant one, the next are secondary/accents). The dominant background, the main accents, the buttons/CTA and the badges MUST visibly use these exact brand colors instead of the template's original colors — the finished ad has to read as belonging to the selected brand at a glance. Keep the template's exact LAYOUT, contrast hierarchy and legibility (dark text on light areas and vice-versa); only the hues change. Do not keep the template's original brand colors.`
		: `Do not change the background color or palette — keep the template's exact colors.`;

	// Personas: reconstruir según lo que pidió el usuario, o mantener si no indicó nada.
	const semanticPaletteRule = input.colorMode !== 'winner' && input.brandPalette
		? `\nSEMANTIC BRAND PALETTE (REQUIRED) — Use BACKGROUND ${input.brandPalette.background || 'not provided'}, ACCENT ${input.brandPalette.accent || 'not provided'}, TEXT ${input.brandPalette.text || 'not provided'}${input.brandPalette.secondary ? `, SECONDARY ${input.brandPalette.secondary}` : ''}. Apply each color to its semantic role instead of using a generic approximation, and preserve readable contrast.`
		: '';
	/**
	 * Quien aparece en el anuncio.
	 *
	 * Cuando `personMode` no viene —analisis guardados antes de que existiera, o
	 * un caller que todavia no lo manda— se deduce de lo que si llego, que es
	 * exactamente como se comportaba antes: fotos de avatar significan "upload".
	 *
	 * La rama que faltaba es la de "sin persona". Antes se emitia "no inventes una
	 * cara recurrente", que no es lo mismo que "que no aparezca nadie": quien
	 * pedia un aviso sin gente sobre un ganador con gente recibia gente igual.
	 */
	const personMode = input.personMode || (input.hasAvatarReference ? 'upload' : 'ai');
	const personaEnPalabras = (input.avatarDescription || '').trim();
	const identityBlock = personMode === 'upload'
		? `\nVISUAL IDENTITY REFERENCE (CRITICAL — THIS DECIDES WHO APPEARS) — Reference photos of ${personaEnPalabras || 'one specific person'} were supplied. BUILD THAT PERSON from them and put THEM in the ad. Read every photo together and reconstruct the same human: face (bone structure, jaw, nose, mouth, eyes, skin tone), hair (length, colour, texture) and BODY — build, frame, shoulders, height and proportions. Someone who knows them must recognise them; a slim person may not come back athletic. THEIR IDENTITY OVERRIDES THE TEMPLATE AND THE ANALYSIS: if the winner shows a man and these photos are of a woman, the ad shows THIS woman — gender, age and look come from the photos, never from the template's model. What the photos do NOT decide is the clothing, the setting or the pose: those come from THIS ad. Never merge two people.`
		: personMode === 'described'
		? `\nVISUAL IDENTITY — The advertiser wrote who has to appear: ${personaEnPalabras}. Cast exactly that person wherever the template shows one, the same one throughout, and add nobody the template does not have.`
		: personMode === 'none'
		? `\nVISUAL IDENTITY — NOBODY APPEARS IN THIS AD. No person, face, hand, body part, silhouette, reflection, mascot or human character anywhere, at any size, not even blurred in the background. Where the template shows a person, close that area with the product, the setting or the template's own background treatment, keeping the same composition, framing and lighting.`
		: `\nVISUAL IDENTITY — No person reference was supplied: cast whoever this ad and this offer genuinely call for, following the template. Do not invent a recurring brand face or mascot. For a service/SaaS offer, prefer the logo, interface, result or an abstract brand-led visual unless the template clearly requires a contextual person.`;
	// Con "sin persona" el ganador puede seguir mostrando gente. Si el bloque se
	// emitiera igual, el prompt pediria conservarla dos renglones debajo de la
	// orden de que no aparezca nadie: dos instrucciones opuestas en el mismo texto.
	const people = personMode === 'none'
		? []
		: (input.analysis?.people || []).filter((p) => p && (p.description || p.directive || p.where));
	/**
	 * El default se escribe una vez, no una por persona: un aviso con cuatro caras
	 * repetia cuatro veces la misma frase de ciento treinta caracteres.
	 */
	/**
	 * A quien poner cuando el usuario no escribio nada para ESA persona.
	 *
	 * Con fotos cargadas NO puede ser "como en el template": esa frase decia
	 * textualmente "mismo genero aparente, edad y rol", asi que un ganador que
	 * muestra un hombre devolvia un hombre aunque el avatar cargado fuera una
	 * mujer. Las fotos son la respuesta a quien aparece, y le ganan al template y
	 * a la descripcion que el analisis leyo en el ganador.
	 */
	const castingPorDefecto = personMode === 'upload'
		? 'render the person from the supplied reference photos — their face and their build, not the one the template shows.'
		: personMode === 'described' && personaEnPalabras
		? 'render the person described under VISUAL IDENTITY above, coherent with the scene.'
		: 'keep them essentially as in the template (same apparent gender, age and role), only refreshed to look natural in the new ad.';
	const sinDireccion = people.filter((p) => !p.directive?.trim()).length;
	const peopleBlock = people.length
		? `\n5. PEOPLE — The ad shows ${people.length === 1 ? 'a person' : 'people'}. For each, follow the direction:\n${people.map((p, i) => `   - Person ${i + 1}${p.where ? ` (${p.where})` : ''}: ${p.directive?.trim() ? `render them as — ${p.directive.trim()}` : 'no direction given'}`).join('\n')}${sinDireccion ? `\nWith no direction: ${castingPorDefecto}` : ''}`
		: '';
	/**
	 * Una persona en un anuncio fotografico tiene que parecer una foto.
	 *
	 * Salian con acabado de plastico: piel sin poros, brillo parejo de muneca,
	 * cara perfectamente simetrica, ojos muertos, manos con los dedos mal. Es lo
	 * primero que delata que un anuncio lo hizo una IA.
	 *
	 * Va detras de `looksIllustrated` y no suelto: si el ganador es un dibujo,
	 * pedir piel con poros contradice la regla del medio, que es la instruccion
	 * que mas parecido aporta de todo el prompt.
	 */
	const hayAlguien = people.length > 0 || personMode === 'upload' || personMode === 'described';
	const realismoRule = hayAlguien && !looksIllustrated
		? `\nPHOTOGRAPHIC SKIN (CRITICAL) — Anyone who appears reads as a PHOTOGRAPH of a real person: pores and fine lines, a face never perfectly symmetrical, light with real falloff and a catchlight in the eye, five correct fingers at the right scale. Never the plastic AI finish: poreless airbrushed skin, waxy sheen, moulded hair, dead eyes.`
		: '';

	// Comparación: qué poner en los ítems que NO son el producto héroe.
	const comparisons = (input.analysis?.comparisonItems || []).filter((c) => c && (c.description || c.directive || c.where));
	const comparisonInfo = input.analysis?.comparison;
	const comparisonBlock = comparisons.length
		? `\n6. COMPARISON ITEMS — This is a comparison ad. The hero is ${productLabel}. For the OTHER compared items, follow the direction (and NEVER show a real competitor's brand name, logo or packaging unless explicitly told to):\n${comparisons.map((c, i) => `   - Item ${i + 1}${c.where ? ` (${c.where})` : ''}: ${c.directive?.trim() ? c.directive.trim() : `keep it as a neutral, unbranded stand-in in the same position and style as the template, clearly less appealing than the hero — but it MUST be the same KIND of thing as ${productLabel} (a plainer/duller alternative of the same category), never the template's original product category.`}`).join('\n')}`
		: '';
	const comparisonDescriptions = comparisons.map((c, i) => `Item ${i + 1}: ${c.description || c.role || c.where || 'alternative side'}`).join(' | ');
	const comparisonContext = comparisons.length || comparisonInfo?.detected
		? `\nCOMPARISON INTELLIGENCE — ${comparisonInfo?.summary || 'Preserve the contrast between the hero and the other side.'} ${comparisonDescriptions ? `The visual analysis identified these roles: ${comparisonDescriptions}.` : ''} ${comparisonInfo?.userGuidance?.trim() ? `The user clarified: ${comparisonInfo.userGuidance.trim()}.` : ''} ${comparisonInfo?.defaultStrategy?.trim() ? `If the user left the clarification empty, use this default: ${comparisonInfo.defaultStrategy.trim()}.` : 'If the user left it empty, infer a same-category, neutral, unbranded alternative from the analyzed role and description. Never invent an unrelated object or a real competitor brand.'}`
		: '';

	// No limitar la ayuda contextual a comparaciones: una persona, una escena o
	// un objeto secundario también puede necesitar una decisión del usuario.
	// `description` ya no se pide —era un párrafo de razonamiento que se mostraba
	// arriba de la pregunta y decía lo mismo— pero se sigue leyendo: los análisis
	// guardados antes de este cambio la traen.
	const creativeDecisions = (input.analysis?.creativeDecisions || [])
		// Con "sin persona" y con fotos cargadas, quien aparece YA esta decidido: la
		// estrategia por defecto de una decision de persona —"mostrar un modelo
		// masculino joven"— le gana a las fotos y devuelve a otra persona.
		.filter((decision) => !((personMode === 'none' || personMode === 'upload') && decision?.type === 'person'))
		.filter((decision) => decision && (decision.description || decision.question || decision.defaultStrategy || decision.directive));
	const creativeDecisionBlock = creativeDecisions.length
		? `\nCONTEXTUAL CREATIVE DECISIONS — The visual analysis identified details that may materially affect fidelity or believability. Preserve the template structure, but apply the user's direction when present. If a direction is empty, use the safe default and do not invent an unrelated subject, brand or claim:\n${creativeDecisions.map((decision, index) => `   - Decision ${index + 1} [${decision.type || 'other'}]${decision.title ? ` ${decision.title}` : ''}${decision.where ? ` (${decision.where})` : ''}: detected — ${decision.description || decision.question || 'contextual visual element'}. User direction: ${decision.directive?.trim() || 'none'}. Default: ${decision.defaultStrategy || 'make the most natural, same-category and production-ready choice.'}`).join('\n')}`
		: '';
	/**
	 * La tipografía que el análisis observó en el ganador.
	 *
	 * `styleNotes` describe la sensación tipográfica y los recursos gráficos del
	 * anuncio, y se venía extrayendo sin usarse. Sin ese dato, "copiá la
	 * tipografía del template" es una instrucción sin contenido: el modelo termina
	 * eligiendo una grotesca cualquiera y el clon se parece en todo menos en la
	 * letra, que es lo primero que se nota al comparar.
	 */
	const letra = input.analysis?.typography;
	const letraObservada = letra && (letra.headline || letra.body)
		? `\n   MEASURED IN THIS TEMPLATE — reproduce these attributes one by one:${letra.headline ? `\n     · Headline: ${letra.headline}` : ''}${letra.body ? `\n     · Body/secondary: ${letra.body}` : ''}${letra.pairing ? `\n     · How they relate: ${letra.pairing}` : ''}\n   A light extended face rendered as a heavy condensed one (or the reverse) is a hard failure even if every word is correct.`
		// Antes, sin `typography`, acá se pegaba `styleNotes`. Pero styleNotes
		// describe fondo, paleta y recursos gráficos —no la letra— y meterlo bajo
		// "TYPOGRAPHY" colaba la escena del ganador en el render: de ahí salió un
		// cuero flotando sobre agua, que era el fondo del anuncio original.
		: '';
	const typoRule = input.typoMode !== 'winner' && (input.brandTypography?.headings || input.brandTypography?.body)
		? `TYPOGRAPHY — Use the selected brand typography: headings in ${input.brandTypography?.headings || 'the brand font'}, body text in ${input.brandTypography?.body || 'the brand font'}, keeping the same sizes, weights and hierarchy as the template.`
		: `TYPOGRAPHY (CRITICAL) — Reproduce the template's typeface characteristics exactly: the same width (condensed, normal or extended), the same weight, the same case, the same letter-spacing and the same relationship between the heading and the body text. Look at the letterforms in the reference image and match them; do not substitute a generic sans-serif. If the template pairs a heavy condensed heading with a light italic annotation, the new ad must pair a heavy condensed heading with a light italic annotation.${letraObservada}`;

	/**
	 * Que el texto entre donde va, sin reflujo.
	 *
	 * La maqueta puede reproducirse perfecta y el anuncio verse mal igual: si un
	 * reemplazo es más largo que el original, pasa a dos líneas, empuja lo de
	 * abajo y rompe el ritmo de la columna. Es más importante que el texto encaje
	 * a que diga todo.
	 */
	const encajeRule = `\nTEXT FIT (CRITICAL) — Every replacement occupies the same space as the text it replaces: same lines, same size, same block height. Where a block carries a measurement, that measurement IS the block: exactly that cap-height, weight, case, colour, alignment and leading, never bigger, never looser, never re-aligned. Type set slightly bigger and looser "so it reads well" is the commonest way a faithful clone still looks like another ad. Do NOT reflow the layout for a longer text, do not shrink the type, do not let a line wrap where the original did not. If it does not fit, SHORTEN it — cut whole words. A shorter phrase that keeps the rhythm beats a complete one that breaks it.
MARGINS ARE PART OF THE DESIGN — Keep the same clear space between every text block and the edges as the template has. No letter may touch or cross an edge, and no word may be clipped or cut to make a line fit: "CON CAMELOT" never becomes "CON CAM". Remove a whole word and rewrite the line instead. Same inside a card, pill, badge or button: the text keeps its padding.`;
	const strategyBlock = input.analysis?.messageStrategy
		? `\nMESSAGE STRATEGY OF THE WINNING AD — preserve the same persuasion, adapted to ${productLabel}: ${input.analysis.messageStrategy}\n`
		: '';
	/**
	 * El ganador escribía la marca, no la dibujaba.
	 *
	 * Con "incluir logo" tildado se pegaba el archivo del cliente igual —un
	 * escudo, un sello— en un lugar pensado para una línea de texto. Queda un
	 * bloque gráfico pesado que la referencia no tenía y desarma la esquina
	 * entera. Si el ganador firma con tipografía, el clon también.
	 */
	const marcaComoTexto = input.analysis?.logoIsWordmark === true;
	// La deducción es para las generaciones viejas, que guardaron un sí/no y no
	// un modo. Da exactamente lo que esas generaciones hacían: con archivo
	// adjunto se pegaba el archivo, y sin archivo se escribía el nombre solo si
	// el analizador había marcado la marca del ganador como wordmark.
	const modoDeFirma: LogoMode = input.logoMode || (input.hasLogo ? 'imagen' : marcaComoTexto ? 'texto' : 'nada');
	const firmaEscrita = input.brandName
		? `SIGN IT WITH THE NAME SET IN TYPE — WRITE "${input.brandName}" in that same position, at the same relative size, weight, case, letter-spacing, colour and alignment the template gives its own mark${marcaComoTexto ? '' : ', sized so the words occupy the footprint its symbol occupied'}. Do NOT paste any logo image here, and do NOT add a shield, seal, badge, medallion, ribbon, laurel, crest or any container shape around it: the template has none, and adding one is instantly visible as wrong. Any supplied logo image is context for the brand's colours only — it must not be drawn into the ad.`
		: 'That slot is signed with the brand name set in type, but no brand name was supplied: leave the space clean rather than inventing one or pasting a mark the template does not have.';
	const logoDecision = input.analysis?.templateHasLogoSlot
		? `\nLOGO DECISION (CRITICAL) — The winning reference contains an ad-level brand mark${input.analysis.logoDescription ? ` (${input.analysis.logoDescription})` : ''}. Do not copy that original logo, wordmark, domain or watermark literally. ${modoDeFirma === 'imagen'
			? 'Replace it with the supplied selected-identity logo, in the same structural role, scale and visual balance, exactly once. Match the size the template gives its own mark: it is a small signature, not a hero element — do not enlarge it, do not centre it, do not let it compete with the headline, and keep the same clear space around it. The selected logo is the only advertiser logo allowed.'
			: modoDeFirma === 'texto'
				? firmaEscrita
				: 'Remove it cleanly and preserve the surrounding spacing and hierarchy. Do not invent a replacement name, icon or badge just to fill the gap.'} If the mark is printed on the TARGET PRODUCT itself (its packaging, label, garment, hardware or other physical surface), that is product identity and must remain faithful; this rule applies only to the winning ad\'s brand marks.`
		: `\nLOGO DECISION (CRITICAL) — The winning reference has no confirmed ad-level logo slot. ${modoDeFirma === 'imagen'
			? 'Only include the supplied selected-identity logo if the reference has a natural, clearly visible brand position; never create a new logo lockup, badge or footer.'
			: modoDeFirma === 'texto' && input.brandName
				? `Write "${input.brandName}" exactly once, small and quiet, in a margin the layout already leaves empty, in the ad's own typeface and in a colour already present in it. Do not build a lockup, badge, footer bar, container or symbol for it, and never let it compete with the headline.`
				: `Do not add a logo, wordmark, domain, watermark or brand badge.${isPhysicalSubject ? ' Preserve any genuine branding printed on the TARGET PRODUCT itself because it is part of the product, not an ad overlay.' : ''}`}`;
	const layoutFidelityRule = `\nLAYOUT FIDELITY OF TEXT BLOCKS (CRITICAL) — Every text block keeps the place it has in the template: same corner, same side, same distance from the edges, same width, and the same relationship with the photo — a block overlapping the image on the left overlaps on the left. Mirroring or moving one breaks the composition that made the original work. Reproduce too any highlight, marker, underline or boxed word applied to part of a text: those marks tell the reader where to look.`;

	const catalogRule = isCatalogSubject
		? `\nSUBJECT IS THE STORE, NOT ONE ITEM (CRITICAL) — This ad is about the business as a whole, not about a single product. The supplied photos are a SELECTION of what the store sells: show them together as a coherent group, collection or lineup, sharing the same lighting, scale logic and surface. Never present one of them as "the" hero product with the others as accessories, never invent a product that was not supplied, and never write a price or a claim that belongs to a single item. The message must work for the whole catalogue: what the store sells, for whom, and why choose it.
   THE RANGE HAS TO BE VISIBLE — Each supplied photo is a DIFFERENT product. Shared lighting means shared lighting, NOT shared appearance: every product keeps its own real colour, material, texture and shape, and none may be recoloured or reshaped to match another. A grid where all the items look identical sells one product and hides the store, which is the opposite of this ad.${input.productNames.length > 1 ? `
   FILLING A GRID OR A ROW — You were given ${input.productNames.length} products, in this order: ${input.productNames.map((nombre, indice) => `(${indice + 1}) ${nombre}`).join(', ')}. Walk the cells in reading order and place them in that same order, starting again from the first when you run out, so consecutive cells never repeat. A repeated product must be shot differently each time — another angle, another crop, rolled instead of flat — and must still be recognisably that same product. Never blend two of them into a new item, and never put anything in a cell that is not one of these ${input.productNames.length}.
   KEEP THE GRID UNIFORM — This rule overrides anything said earlier about re-shooting the image areas. If the template's cells are packshots on a plain background, EVERY cell stays a packshot on a plain background: same framing, same distance, same shadow, same margin. No cell may show hands, a person, a tool, a workbench, a step of the process or a lifestyle scene — a catalogue grid shows the PRODUCTS FOR SALE and nothing else — and the background may not vary between cells. The grid reads as a catalogue because it is regular; one different cell breaks it.` : ''}`
		: '';

	const qualityRule = `\nOUTPUT QUALITY (CRITICAL) — Do not downscale, blur or soften the final image. Keep edges, textures and shadows crisp and cleanly rendered in the template's own medium. The result must look production-ready and stay perfectly crisp when viewed at 100% zoom.`;

	return `The first input image is a WINNING AD TEMPLATE. Your job is to REMAKE THAT EXACT AD for a different advertiser — not to design a new ad inspired by it.

Build the same piece again: same medium, same geometry, same proportions, same layout, same background treatment, same colour palette, same graphic devices (badges, stars, speech bubbles, banners, buttons, dividers, arrows, leader lines), same position and same size for every visual block, same type scale and same visual hierarchy. Only the SUBJECT changes: the product, the scenes and the people all become ${productLabel}.

NOTHING THAT IS NOT IN THE TEMPLATE (READ THIS FIRST) — You may only reproduce elements that are VISIBLE in the winning ad. Before adding anything, look for it in the template; if it is not there, it does not go in. This applies especially to what tends to get added by reflex: a web address, a domain, a social handle or a QR code; a logo, a wordmark or a brand line; a badge, seal, medallion, ribbon, laurel, star rating or certification; a guarantee, a discount or a shipping promise; an extra caption or an extra icon. The advertiser's website and brand name are given to you as CONTEXT so you can write honest copy — they are not instructions to print them. An ad that shows one element more than the template is wrong even if that element looks good. Equally, do not leave large empty areas the template does not have: every band of the canvas carries what the template's equivalent band carries.

THIRD-PARTY MARKS ARE NEVER COPIED (CRITICAL) — If the template shows press logos, a row of media outlets ("As featured in", "As seen on"), partner logos, award seals, certification badges, app-store badges, rating marks or any other company's name or symbol, NONE of them may appear in the output. They belong to other companies and they state something about the ORIGINAL advertiser that is not true of this one: reproducing them claims a coverage, an award or an endorsement that this business does not have, which is a false statement and not merely a design detail. ${input.pressRowMode === 'texto' && input.pressRowItems?.length ? `The advertiser confirmed they have this coverage, so that row keeps its place and its heading, with THEIR names set as clean type in the ad's own typeface, same size and spacing as the winner's row: ${input.pressRowItems.join(', ')}. No logos, no seals, no invented extras — only these names.` : input.pressRowMode === 'logos' && input.pressRowItems?.length ? `The advertiser has declared this coverage as their own and asked for it shown the way the winner shows its: draw the actual mark of each of these — ${input.pressRowItems.join(', ')} — in that row, in the order given, at the same size, spacing, alignment and colour treatment the winner's row uses. ONLY these, exactly as many as are listed: no extra outlet, no invented seal, no filler shape, nothing carried over from the winner's row.` : `Remove the whole area, including the heading that introduces it and its divider: dropping only the logos leaves a label announcing a row that is no longer there. Do not replace it with invented logos, invented outlet names, made-up seals or grey placeholder shapes either.`} The only exception is a mark printed on the target's own product or contained in the advertiser's own supplied logo.

THE TEMPLATE'S PHOTOGRAPH DOES NOT SURVIVE (CRITICAL) — The people, the place and the scene in the template's photos belong to the ad that was already made; they have nothing to do with this business. Pasting the new product ON TOP of the template's original photo is the most common way this goes wrong and it is a hard failure: it leaves a scene that makes no sense — a hide floating in front of a couple on holiday — and it reads instantly as a collage. Re-photograph that area from scratch with the subject named for it, keeping the same frame, crop, angle, lighting mood and position so the composition still works. If the template's photo shows people and the target has no natural place for those people, the scene changes to one where the product genuinely lives: whoever makes it, whoever uses it, or the result it produces.

THE TEST THIS OUTPUT MUST PASS — put the template and your result side by side. Every block must land in the same place, at the same size, in the same style, and the two must look like the same ad in two languages about two different things. If someone would call them "similar ads" rather than "the same ad remade", you have drifted too far and the result is a failure. When any instruction below leaves room for interpretation, choose the option that stays closer to the template.
${mediumRule}${geometryRule}${splitComparisonRule}
${strategyBlock}${creativeBlock}${imageSlotBlock}
	${productSwap}${orientationRule}${carouselRule}

	2. TEXT SWAP — LANGUAGE IS ABSOLUTE: every word visible in the final image must be in ${language} — headline, subcopy, badges, pills, buttons, small print and stamps. Replace the template's visible wording with the exact copy below, keeping each text in the same position, size, style, line count and visual hierarchy:
	${textSwap || (input.analysis
		? `- THIS AD HAS NO TEXT OVERLAY. Do not add a headline, badge, feature list, price tag, comparison table, CTA or logo lockup that is not visibly present in the template.`
		: `- Adapt every template text block honestly to ${productLabel}, in ${language}, keeping the same message structure.`)}
	If a visible text block has no replacement listed, adapt its message honestly to ${productLabel}. Do not invent prices, percentages, reviews, certifications, guarantees or claims, and never write a number that is not literally present in the replacements listed above — not even one adapted from the template's own figure. Never carry over the template's guarantees, discounts, shipping promises, review counts, ratings, certifications, awards or deadlines unless they are verified for the target product. Keep the SAME NUMBER of text blocks as the template, no more. Render every replacement sharp, correctly spelled and fully inside its original card, bubble or badge. Never duplicate a line or let text overflow.${isPhysicalSubject ? ' Text physically printed on the supplied product or inside its official logo must remain faithful to those supplied assets.' : ''}

3. BRAND SWAP — ERASE every trace of the template's own brand. Its wordmark, logo, emblem, monogram and brand name must NOT appear anywhere in the output, in any size, not even faintly, partially, redrawn or stylised, and never merged with other text. Scan the whole canvas for it: corners, footer, badges, the product itself and any watermark. That brand belongs to a different company — leaving it in makes the ad unusable. ${'How the new ad signs itself is decided in LOGO DECISION below — follow it there and do not improvise a mark here.' + (isPhysicalSubject ? ' None of this removes the real label or branding physically printed on the supplied product packaging, which must remain faithful to the product photo.' : '')}

WEBSITE VISIBILITY — ${input.includeWebsite && input.displayWebsite ? `The user explicitly requested a visible website. Render exactly "${input.displayWebsite}" ONCE in an existing URL or footer slot.` : 'Do not render any URL, domain, web address, social handle or QR code. Remove any website from the winning template and leave that space clean.'}

4. STRICT FIDELITY — Copy the template's layout structure 1:1: same background treatment (no added waves, gradients or decorative shapes), same divider style, same badge/pill arrangement and count, same positions. Small icons may be adapted only when their meaning no longer applies to the new content, keeping the same visual style and weight. ${colorRule} ${typoRule} Do not add ANY element that is not in the template. Do not include watermarks or platform UI. The final image must look like the same ad campaign as the template${referenceHasProduct ? `, now selling ${productLabel}` : ''}.
${layoutFidelityRule}${encajeRule}${catalogRule}${qualityRule}${TEXT_RENDERING_RULE}${semanticPaletteRule}${identityBlock}
${logoDecision}
${peopleBlock}${realismoRule}${comparisonBlock}${comparisonContext}${creativeDecisionBlock}

USER DIRECTION
${input.brief || 'None.'}`;
}

// Pre-producción del producto: si hay template, re-fotografía el producto COMO SI
// estuviera en la escena del anuncio ganador (misma luz, ángulo, pose y sombra que
// el producto original del template) para que la composición final no parezca un
// recorte pegado. Sin template, cae a toma de estudio neutra.
export async function renderStudioProductShot(
	googleKey: string,
	image: { buffer: Buffer; type: string },
	options?: { template?: { buffer: Buffer; type: string }; placement?: string },
): Promise<{ buffer: Buffer; type: string } | null> {
	try {
		const prompt = options?.template
			? `The first image is a winning ad TEMPLATE. The second image is a REAL PRODUCT photo. Re-photograph ONLY the real product as if it were shot inside the template's scene, ready to replace the template's product: same environment and background treatment, same lighting direction and color temperature, same camera angle, and the same pose, tilt and framing as the template's product${options.placement ? ` (${options.placement})` : ''}. ONE single coherent object with soft, scene-consistent shadows — never a flat cut-out with hard edges. Preserve the real product's exact shape, proportions, colors, materials and texture with total fidelity. Output the staged product alone in its scene context, with NO text, logos, cards, badges or graphics.`
			: 'Re-photograph the EXACT product from this image as a professional studio product shot: ONE single coherent object, clean neutral light background, soft even studio lighting, gentle contact shadow, centered with generous margins. Preserve the product\'s exact shape, proportions, colors, materials and texture with total fidelity. Do not add any text, logos, props, packaging or extra items. Do not crop the product.';
		const parts: any[] = [{ text: prompt }];
		if (options?.template) parts.push({ inline_data: { mime_type: options.template.type, data: options.template.buffer.toString('base64') } });
		parts.push({ inline_data: { mime_type: image.type, data: image.buffer.toString('base64') } });
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${googleKey}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts }],
				generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
			}),
		});
		const data: any = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(`Gemini ${response.status}`);
		const part = data.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data || item.inline_data?.data);
		if (!part) return null;
		return { buffer: Buffer.from(part.inlineData?.data || part.inline_data?.data, 'base64'), type: 'image/png' };
	} catch (error) {
		console.error('Studio product shot failed (se usa la foto original):', error);
		return null;
	}
}
