import OpenAI from 'openai';
import { normalizeAdCopy, stripWebReferences, type AdaptedAdCopy } from './ad-copy';

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

export type LayoutAnalysis = {
	/** What the target represents: a physical item, a service, or a SaaS/brand. */
	subjectType?: 'physical-product' | 'service' | 'saas' | 'brand-led' | 'unknown';
	/** Semantic palette selected for the generation and shown in review. */
	brandPalette?: { background?: string; text?: string; accent?: string; secondary?: string; source?: string };
	/** Analysis used to adapt the winning message and render it in the generated image. */
	messageStrategy?: string;
	adCopy?: AdaptedAdCopy;
	textZones?: Array<{ slide?: number; where?: string; onProduct?: boolean; original?: string; messageRole?: string; replacement?: string }>;
	productHasPackaging?: boolean;
	referenceHasProduct?: boolean;
	templateHasLogoSlot?: boolean;
	logoDescription?: string;
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
	imageSlots?: Array<{ where?: string; showsNow?: string; replaceWith?: string }>;
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
			? 'The target is a STORE, not a single item. The supplied photos are a selection of what it sells: treat them as a group of equals. Preserve the real geometry of each one, never promote one to hero with the others as props, and never invent a product that was not supplied.'
			: 'The target is a service, SaaS or brand-led offer. Do not invent a physical package or generic product. Build the visual around the interface, logo/avatar, people, result, workflow, environment or abstract brand world that best communicates the offer.';
	// 'brand' es "en general" cuando no hay nada que fotografiar: un servicio, un
	// software, una consultora. Habla del negocio entero igual que un catálogo,
	// pero sin objetos que mostrar.
	const copyDirective = subjectMode === 'catalog' || subjectMode === 'brand'
		? `COPY SUBJECT (CRITICAL) — Every string you write (primaryText, headline, description, cta and every textZone replacement) must talk about THE BUSINESS AS A WHOLE${input.brandName ? ` (${input.brandName})` : ''}: its range, what it sells, who it is for, and why buy there. Never name a single product as the protagonist, never write a price, a spec, a size or a stock claim that belongs to one item, and never write a CTA that leads to one product page ("Comprá el modelo X"). Write what would still be true if the selection of products changed tomorrow.`
		: subjectMode === 'product'
			? `COPY SUBJECT (CRITICAL) — Every string you write (primaryText, headline, description, cta and every textZone replacement) must talk about THIS SPECIFIC PRODUCT: ${input.productName || 'the supplied product'}. Use its real name, its verified facts and its actual benefit. Do not fall back to generic store or brand messaging ("nuestra tienda", "envíos a todo el país", "las mejores marcas") when the ad is about one product: that wastes the space the winning ad used to sell.`
			: `COPY SUBJECT (CRITICAL) — Every string you write must talk about the offer as a whole: the outcome it delivers and the problem it removes. Do not describe a physical object that does not exist.`;
	const languageRule = input.language && LANGUAGE_NAMES[input.language]
		? `TARGET LANGUAGE IS ${LANGUAGE_NAMES[input.language].toUpperCase()} AND IT IS NOT NEGOTIABLE. Every replacement string you produce — headline, description, CTA, every text zone — must be written in ${LANGUAGE_NAMES[input.language]}, even when the template you are analysing is written in a different language. Do NOT copy or keep the template's original language. Translate and adapt the message instead. Set "language" to "${input.language}".`
		: 'Detect the language used by the winning ad, set "language" to "es", "en", "fr", "it", "pt" or "de", and write replacement suggestions in that language.';
	const systemPrompt = `You are a senior performance ad designer. You receive: (1) ${isCarouselReference ? 'multiple pages of one winning carousel, in order' : 'one winning static ad TEMPLATE image'}${hasProductImages ? ', (2) one or more photos of the SAME real product/SKU from different views' : ''}${hasAvatarImages ? ', (3) several reference photos of the same person/avatar' : ''}, and verified context.

TARGET SUBJECT MODE: ${subjectMode}. ${subjectDirective}
${copyDirective}
${input.brandPalette ? `VERIFIED URL/BRAND PALETTE: background ${input.brandPalette.background || 'unknown'}, accent ${input.brandPalette.accent || 'unknown'}, text ${input.brandPalette.text || 'unknown'}${input.brandPalette.secondary ? `, secondary ${input.brandPalette.secondary}` : ''}.` : ''}
${hasAvatarImages ? `AVATAR REFERENCE: ${input.avatarDescription || 'Use these photos only to preserve the chosen person/avatar identity; do not treat them as a product.'}` : ''}

Return STRICT JSON:
{
  "messageStrategy": "2-3 sentences decoding the winning ad's persuasion: the emotion it triggers, the objection it removes, the promise it makes and the mechanism it uses (social proof, price anchor, before/after, authority, scarcity, contrast, curiosity, etc.).",
  "subjectType": "physical-product|service|saas|brand-led|unknown",
  "adCopy": {
    "primaryText": "adapted publication copy for the target product, using only verified facts",
    "headline": "adapted headline, maximum 60 characters",
    "description": "adapted supporting detail, maximum 90 characters",
    "cta": "short adapted action, maximum 30 characters"
  },
  "textZones": [
    { "slide": 1, "where": "PRECISE position: which corner or edge, and whether the block sits over the photo or outside it (e.g. 'white box overlapping the bottom-LEFT of the photo', 'red breadcrumb line above the headline')", "onProduct": true|false, "original": "exact text visibly present in the winning image", "messageRole": "the persuasive job this text performs", "replacement": "honest equivalent for the target product, similar length", "emphasis": "null, or the visual emphasis applied to PART of this text and WHICH words carry it: highlighter/marker background (say the colour), underline, heavier weight, a different colour, or a boxed word. Example: 'marker highlight in soft yellow over \"62 and have $1.3 million saved up\"'" }
  ],
  "referenceHasProduct": true|false,
  "templateHasLogoSlot": true|false — does the template visibly display a brand logo or brand wordmark (a natural spot where the advertiser brand belongs)?,
  "logoDescription": "if templateHasLogoSlot is true, briefly describe the logo/wordmark and WHERE it sits (e.g. 'small wordmark bottom-right'); else null",
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
      "replaceWith": "what that SAME area must depict for the target product — a concrete, photographable scene tied to the product, its user, its making, its use or its result. Keep the same shot type, crop, angle and mood as the original so the composition still works. Never keep the template's original subject." }
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
  "creative": {
    "emotion": "la emoción dominante que dispara el anuncio (deseo, alivio, urgencia, pertenencia, culpa, orgullo, curiosidad, seguridad...)",
    "adType": "qué tipo de anuncio es (hero de producto, testimonial, comparativa, oferta, educativo, UGC, autoridad, antes y después, listado...)",
    "photographyStyle": "estilo de la imagen (packshot de estudio, lifestyle, UGC de celular, flat lay, macro de textura, render 3D, gráfico plano, collage...)",
    "lighting": "la luz (suave difusa, dura direccional, contraluz, luz natural de ventana, neón, clave alta, clave baja...)",
    "depth": "profundidad y foco (fondo desenfocado, todo nítido, capas superpuestas, plano comprimido...)",
    "composition": "cómo se ordena (centrado simétrico, regla de tercios, división 50/50, grilla, diagonal, apilado vertical...)",
    "colorPsychology": "qué comunica la paleta y por qué ayuda a vender esta categoría",
    "designPattern": "el patrón reutilizable en una frase, como se lo explicarías a un diseñador para que lo replique",
    "styleFamily": "una familia estética reconocible: Apple, Nike, Temu, Amazon, Lujo, Minimal, Editorial, Skincare, Suplementos, Retro, Brutalista, Corporativo",
    "score": 0-100 — qué tan fuerte es este anuncio como creativo de performance,
    "scoreReasons": ["3 a 5 razones cortas en español que expliquen el puntaje, cada una empezando con el aspecto: contraste, jerarquía, CTA, oferta, legibilidad, foco del producto"]
  },
  "creativeOptions": ["3 to 5 SHORT optional visual directions specific to THIS template and THIS product"],
  "styleNotes": "background color(s), palette, typography feel, graphic devices worth preserving"
}

Rules:
- Analyze the winner's wording before analyzing the visual layout. Enumerate EVERY text zone that is actually visible, including headline, subcopy, review, badges, pills, CTA, small print and text printed on packaging. Do not invent zones that are not visible. If the image has no publication text, return an empty textZones array.
- "messageStrategy" must explain why the original copy works, not merely describe what it says. Keep the same emotional mechanism and rhetorical device in the internal replacements.
- "adCopy" is the adapted publication copy and "textZones" are the exact visible text areas used by the generator. The text-zone replacements MUST be rendered inside the final image in the same positions and hierarchy; do not remove the winner's visible message. Text physically printed on the supplied product or inside its official logo must remain faithful to those supplied assets.
- ${languageRule}
- ${isCarouselReference ? 'CAROUSEL ANALYSIS: Analyze EVERY supplied page, not only the first. Read all publication copy and visible text zones page by page, preserve each page\'s persuasion and composition, and include the page number in every text zone, person, comparison item and contextual decision. Return one coherent aggregate analysis: comparison/people/objects may reference the relevant page in "where". Do not treat pages from the same carousel as unrelated ads.' : 'For a static reference, analyze the complete supplied image.'}
- "referenceHasProduct": true only if the TEMPLATE visibly features a physical product shot (box, bottle, object). Lifestyle/person-only or pure-text ads → false.
- "productInstances" (CRITICAL): list EVERY separate place where the TEMPLATE'S OWN product is visible — not just the hero shot. Count the product worn by a model, on someone's feet, held in a hand, repeated as colour variants, shown again small in a corner, or duplicated across a grid. If the same product appears 6 times in a circle, that is 6 instances (or one instance describing the whole arrangement, but say so explicitly). Missing one means it survives into the final ad and the ad ends up selling two different products at once.
- "productOnBody": true if ANY instance is worn on / used on a human body (garment, underwear, shoes, jewellery, a patch on skin). This decides whether the layout can host a product that cannot be worn.
- "creative": read the ad the way a senior art director would. This is not decoration: "designPattern" and "styleFamily" have to be precise enough that another designer could rebuild the ad from them, and "score" has to be honest — a weak ad gets a low number even if it is in the library.
  - PHYSICAL SCALE (CRITICAL): judge the REAL size of both products. A pill pinched between two fingertips and a full leather hide are not interchangeable: rendering the hide at pill size gives an absurd ad. Fill "templateProductScale", "targetProductScale" and "stagingAdaptation" so the new product appears at its true size. The rule is to keep the SHOT (same crop, same framing, same part of the body in frame, same area of the canvas occupied) and change only HOW the product is handled so it is physically possible.
  - ORIENTATION AND SURFACE DETAILS (CRITICAL): for garments and any product with a front, back, side or inside, inspect EVERY supplied product photo as a multi-view set and the verified page facts. Treat all photos as the SAME real product/SKU, not different variants to blend. Fill "productOrientation" with the exact placement of each print, embroidery, patch, label or other distinctive detail. Never mirror, flip, turn inside out or move a detail to another physical side. A graphic specified as BACK must never appear on the FRONT; when a front-facing view is requested, show only front details, and when a back-facing view is requested, show only back details. If a side is not visible and not verified, do not invent its artwork.
- "imageSlots" (CRITICAL): a winning ad wins because of its STRUCTURE and its IDEA — the layout, the rhythm, the way attention is directed — not because of the specific photos it happens to contain. List EVERY visual area of the template: the hero shot, each photo in a collage or grid, the background image, avatars, before/after panels, lifestyle scenes, and decorative photo strips. For each one, propose what that area should depict for the TARGET product instead. Think like an art director briefing a photographer: if the template shows three photos of people hugging dogs and the target product is wholesale leather, the replacement is three photos of artisans cutting, stitching and finishing leather at a workbench — same tilt, same crop, same lighting mood, same energy. Never propose keeping the template's original subject, and never propose an empty or generic "product photo" when the slot is clearly a lifestyle or context shot. If the template has a single product shot and nothing else, one entry is enough.
- "productHasPackaging": look ONLY at the REAL product photo — true ONLY if that photo clearly shows a printed box, wrapper or label belonging to the product. Raw materials (leather hides, fabrics, wood), unpackaged food, plants, garments or bare objects have NO packaging → false. The template's product is irrelevant for this field.
- TESTIMONIALS: if the template shows a person's photo next to a quote, the replacement quote and attribution must plausibly belong to that SAME visible person (never mismatch apparent gender or age; a neutral attribution like 'Cliente verificada' is fine).
- PEOPLE: list in "people" EVERY human clearly visible in the ad (models, testimonial faces, before/after subjects). Empty array if none. The user may later specify how they want each person to look.
- COMPARISON: first decide whether the ad genuinely compares two or more sides. Do not confuse a product collage, multiple views of one SKU, or decorative repetition with a comparison. If it is a real comparison (including "us vs them", old vs new, before/after, competitor vs hero or a comparison grid), set "comparison.detected" to true, identify its type and confidence, summarize the contrast, and list every OTHER item being compared against the HERO in "comparisonItems". If the exact alternative is unclear, set confidence to "low" and ask one concrete question in "comparison.question". If it is not a comparison, set detected to false, use an empty question, and return an empty comparisonItems array. Never treat the hero product itself as a comparison item. Always provide a practical "defaultStrategy" so the generator can make a coherent, neutral, unbranded choice when the user leaves the clarification empty.
- CONTEXTUAL CREATIVE DECISIONS: this is broader than comparison detection. Return up to 5 decisions only when a visual element could materially change the fidelity, meaning or believability of the generated ad and a user preference would help. Consider people (appearance, age range, pose, role or testimonial identity), scenes (home, studio, workplace, outdoors), styling (clothes, makeup, mood), secondary objects, pets, product handling/scale/orientation, before-after or comparison alternatives, and ambiguous text or claims. For each decision, describe what you detected, ask one useful concrete question when appropriate, and give a safe default. Do not ask about trivial details, do not ask the user to repeat information already visible or verified, and do not create a decision merely because the ad contains multiple photos of the same product. If a person is clearly visible, include a person decision when the appearance or role affects the adaptation. If there are no material ambiguities, return an empty array.
- Never use the template's brand name in replacements.${input.brandName ? ` The advertiser brand is "${input.brandName}".` : ''}`;
	const userText = `Target offer: ${input.productName}. Verified facts/context: ${input.productFacts || 'No physical product was supplied; infer a coherent service or brand-led visual treatment.'}`;

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
			if (parsed) return parsed;
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
			if (parsed) return parsed;
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
	avatarDescription?: string;
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
			return `${index + 1}. [${zone.where || 'text zone'}${zone.messageRole ? ` — persuasive job: ${zone.messageRole}` : ''}] Replace "${zone.original || ''}" with "${zone.replacement}"${emphasis}`;
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
	const labelFidelityRule = `\nLABEL TEXT FIDELITY (CRITICAL) — Any text printed on the product's own packaging must be reproduced CHARACTER BY CHARACTER exactly as it appears in the product photo${input.productNames.length ? `; the product name is literally "${input.productNames.join(' + ')}" and must be spelled exactly that way on the label` : ''}. Never re-spell, auto-correct, translate or "improve" a word on the packaging, and never swap a letter for a similar-looking one — a single wrong character can turn the real product name into a different word. If part of the label is too small or blurry to read with certainty in the photo, render it as realistically soft/out-of-focus micro-text instead of guessing letters.`;
	const orientationRule = `\nPRODUCT IDENTITY AND MULTI-VIEW CONSISTENCY (CRITICAL) — All supplied product photos are different views of ONE SAME SKU, not different variants to blend together. Use them jointly as the source of truth: preserve the exact silhouette, dimensions, proportions, construction, seams, materials, finish, colors, texture, packaging and distinctive details. Never average two views into a new hybrid product, change the product category, add a missing component or remove a real component.\nPRODUCT ORIENTATION AND GRAPHICS (CRITICAL) — Treat the supplied product photos as a multi-view reference, not as a texture to mirror. Preserve the product's real front/back/side orientation and keep every print, embroidery, patch, label and graphic on the exact physical side where it belongs. Never mirror the garment, turn it inside out, or move a back graphic onto the chest/front. If verified facts identify front and back details, they are authoritative: ${verifiedProductFacts.length ? verifiedProductFacts.join(' | ') : 'use only what is clearly visible in the supplied product photos'}.${input.analysis?.productOrientation ? ` Vision analysis also found: ${input.analysis.productOrientation}.` : ''} If the requested camera angle cannot show a detail from its correct side, hide it naturally rather than inventing or relocating it.`;
	const carouselRule = input.carousel
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
	const imageSlotBlock = slots.length
		? `
0. RE-SHOOT EVERY IMAGE AREA — This ad works because of its structure and its idea: the layout, the visual rhythm and where it sends the eye. You are keeping that skeleton and replacing what fills it. The template's own photos, models, scenes and subjects have NOTHING to do with ${productLabel} and must not survive anywhere in the output. Re-photograph each area as follows, keeping the SAME frame, crop, angle, tilt, scale, lighting mood and position as the template so the composition still reads the same:
${slots.map((slot, index) => `   ${index + 1}. [${slot.where || 'image area'}] now shows: ${slot.showsNow || 'unspecified'} → must show instead: ${slot.replaceWith}`).join('\n')}
Every scene you render must be photorealistic, plausible and clearly about ${productLabel}, its maker, its user or its result. Do not leave a single frame showing the template's original subject, and do not blur or crop it away — replace it with real content.`
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

	const scaleRule = input.analysis?.stagingAdaptation
		&& !/same handling as the template/i.test(input.analysis.stagingAdaptation)
		? `
PHYSICAL SCALE (CRITICAL) — The template's product is ${input.analysis.templateProductScale || 'a different size'}, while ${productLabel} is ${input.analysis.targetProductScale || 'a different size'}. Rendering it at the template's size would be absurd. Keep the SAME shot type, crop, framing, body parts in frame and area of the canvas occupied, but change HOW the product is handled so the scene is physically believable: ${input.analysis.stagingAdaptation}. The product must read at its true real-world size next to any hand, body or object in frame — never shrink or enlarge it to fit the template's original pose.`
		: scaleAlways;

	// Dirección de arte del ganador. Sin esto el modelo conserva el layout pero
	// pierde el porqué: la luz, la profundidad y el tipo de fotografía son la
	// mitad de lo que hace que un anuncio se vea profesional.
	const c = input.analysis?.creative;
	const creativeBlock = c && (c.photographyStyle || c.lighting || c.composition)
		? `
ART DIRECTION TO PRESERVE — this ad works because of how it is shot and arranged, not only because of where the text sits. Reproduce all of it:${[
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
		].filter(Boolean).join('')}
The new ad must be shot the same way. A flat, evenly lit product on a plain background is a failure if the template used directional light and shallow depth.`
		: '';

	const productSwap = referenceHasProduct && isPhysicalSubject
		? `1. PRODUCT SWAP — Completely remove the template's original product. In its place${placement} render the real product shown in the other input image(s): ${productLabel}. The product must remain the SAME PHYSICAL OBJECT TYPE seen in its photo — if the photo shows a hide, render a hide; a bottle, a bottle; never morph it into the template's product form (e.g. never turn an unboxed product into a box). Render it as ONE single coherent object (never split it into disconnected pieces, and never show multiples unless the template does). RE-STAGE the product INTO the template's scene — do NOT paste it: re-photograph it as if it were shot in that exact environment, matching the scene's camera angle, perspective, lighting direction, color temperature, reflections and shadow behavior (e.g. if the template's product leans against a tiled wall in daylight, the new product must sit in that same tiled-wall daylight scene with the same grounding). Give it real volume and dimension, adapt its pose and orientation to fit the composition naturally, and ground it with the same shadow style the template uses. POSITION: place it at the SAME position and size ratio as the template's product — if the template's product occupies the right side, yours must occupy the right side; never center it unless the template does. Never leave hard cut-out edges or a floating pasted look: blend the product's edges with the scene lighting. LAYERING: match the template's stacking order exactly — any card, speech bubble or text panel that sits in front of the product in the template must stay fully in front, uncovered and readable; the product must never cut across, poke through or overlap a text card beyond what the template shows. Never show it as a flat cut-out pasted on top, and never replace it with a generic product. Match the product photo's exact shape, colors and texture — it must look premium, tactile and desirable. IDENTITY DETAILS (CRITICAL): whatever is printed, stitched, embossed, woven or engraved on the real product must survive — the brand mark on a garment's chest or sleeve, the tag, the logo on a shoe, the model name on a device, a pattern, a stripe, a stitching colour, a distinctive shape. Someone who owns this product has to recognise it as the same one. Do not clean it up, simplify it, remove a label or move a mark somewhere else.${packagingRule}${labelFidelityRule}${scaleRule}${instanceBlock}${onBodyRule}`
		: `1. NO PRODUCT INSERTION — The template does NOT show a physical product, so the new ad must not show one either. This ad works through its visual composition and design, not through a product shot: that is exactly why it works. Keep its imagery style as it is (the typographic treatment, the colour field, the graphic devices, the scene) and adapt it naturally to the new context. Do NOT insert, paste, collage or hint at a product photo anywhere, at any size, not even small in a corner — not even if a product photo was supplied as input.`;

	const colorRule = input.colorMode !== 'winner' && input.brandColors?.length
		? `COLOR RESTYLE (REQUIRED) — This is a hard requirement: recolor the ad into the selected brand palette ${input.brandColors.join(', ')} (the FIRST color is the primary/dominant one, the next are secondary/accents). The dominant background, the main accents, the buttons/CTA and the badges MUST visibly use these exact brand colors instead of the template's original colors — the finished ad has to read as belonging to the selected brand at a glance. Keep the template's exact LAYOUT, contrast hierarchy and legibility (dark text on light areas and vice-versa); only the hues change. Do not keep the template's original brand colors.`
		: `Do not change the background color or palette — keep the template's exact colors.`;

	// Personas: reconstruir según lo que pidió el usuario, o mantener si no indicó nada.
	const semanticPaletteRule = input.colorMode !== 'winner' && input.brandPalette
		? `\nSEMANTIC BRAND PALETTE (REQUIRED) — Use BACKGROUND ${input.brandPalette.background || 'not provided'}, ACCENT ${input.brandPalette.accent || 'not provided'}, TEXT ${input.brandPalette.text || 'not provided'}${input.brandPalette.secondary ? `, SECONDARY ${input.brandPalette.secondary}` : ''}. Apply each color to its semantic role instead of using a generic approximation, and preserve readable contrast.`
		: '';
	const identityBlock = input.hasAvatarReference
		? `\nVISUAL IDENTITY REFERENCE — The user supplied multiple reference images for ${input.avatarDescription || 'a person/avatar'}. Use them only to keep that identity consistent: face, hairstyle, proportions, distinctive features and overall look. Do not merge different people, invent a new face or turn the avatar into a product.`
		: `\nVISUAL IDENTITY — No person/avatar reference was selected. Do not invent a recurring human face or mascot. For a service/SaaS offer, prefer the logo, interface, result or an abstract brand-led visual unless the template clearly requires a generic contextual person.`;
	const people = (input.analysis?.people || []).filter((p) => p && (p.description || p.directive || p.where));
	const peopleBlock = people.length
		? `\n5. PEOPLE — The ad shows ${people.length === 1 ? 'a person' : 'people'}. For each, follow the direction:\n${people.map((p, i) => `   - Person ${i + 1}${p.where ? ` (${p.where})` : ''}: ${p.directive?.trim() ? `render them as — ${p.directive.trim()}. Make it photorealistic and coherent with the scene.` : 'keep them essentially as in the template (same apparent gender, age and role), only refreshed to look natural in the new ad.'}`).join('\n')}\nKeep any person photorealistic, well-integrated into the scene lighting, never distorted.`
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
	const creativeDecisions = (input.analysis?.creativeDecisions || []).filter((decision) => decision && (decision.description || decision.question || decision.defaultStrategy || decision.directive));
	const creativeDecisionBlock = creativeDecisions.length
		? `\nCONTEXTUAL CREATIVE DECISIONS — The visual analysis identified details that may materially affect fidelity or believability. Preserve the template structure, but apply the user's direction when present. If a direction is empty, use the safe default and do not invent an unrelated subject, brand or claim:\n${creativeDecisions.map((decision, index) => `   - Decision ${index + 1} [${decision.type || 'other'}]${decision.title ? ` ${decision.title}` : ''}${decision.where ? ` (${decision.where})` : ''}: detected — ${decision.description || decision.question || 'contextual visual element'}. User direction: ${decision.directive?.trim() || 'none'}. Default: ${decision.defaultStrategy || 'make the most natural, same-category and production-ready choice.'}`).join('\n')}`
		: '';
	const typoRule = input.typoMode !== 'winner' && (input.brandTypography?.headings || input.brandTypography?.body)
		? `TYPOGRAPHY — Use the selected brand typography: headings in ${input.brandTypography?.headings || 'the brand font'}, body text in ${input.brandTypography?.body || 'the brand font'}, keeping the same sizes, weights and hierarchy as the template.`
		: `Match the template's typographic style, weight and case exactly (if the template headline is heavy condensed uppercase, keep it heavy condensed uppercase).`;
	const strategyBlock = input.analysis?.messageStrategy
		? `\nMESSAGE STRATEGY OF THE WINNING AD — preserve the same persuasion, adapted to ${productLabel}: ${input.analysis.messageStrategy}\n`
		: '';
	const logoDecision = input.analysis?.templateHasLogoSlot
		? `\nLOGO DECISION (CRITICAL) — The winning reference contains an ad-level brand mark${input.analysis.logoDescription ? ` (${input.analysis.logoDescription})` : ''}. Do not copy that original logo, wordmark, domain or watermark literally. ${input.hasLogo
			? 'Replace it with the supplied selected-identity logo, in the same structural role, scale and visual balance, exactly once. The selected logo is the only advertiser logo allowed.'
			: 'Remove it cleanly and preserve the surrounding spacing and hierarchy. Do not invent a replacement name, icon or badge just to fill the gap.'} If the mark is printed on the TARGET PRODUCT itself (its packaging, label, garment, hardware or other physical surface), that is product identity and must remain faithful; this rule applies only to the winning ad\'s brand marks.`
		: `\nLOGO DECISION (CRITICAL) — The winning reference has no confirmed ad-level logo slot. ${input.hasLogo
			? 'Only include the supplied selected-identity logo if the reference has a natural, clearly visible brand position; never create a new logo lockup, badge or footer.'
			: 'Do not add a logo, wordmark, domain, watermark or brand badge. Preserve any genuine branding printed on the TARGET PRODUCT itself because it is part of the product, not an ad overlay.'}`;
	const layoutFidelityRule = `\nLAYOUT FIDELITY OF TEXT BLOCKS (CRITICAL) — Every text block must stay in the SAME place as in the template: same corner, same side, same distance from the edges, same width, and the same relationship with the photo (if a block overlaps the image on the left, it must overlap on the left, not on the right). Mirroring a block to the other side, recentring it or resizing it changes the composition that made the original work. Reproduce as well any highlight, marker, underline, colour accent or boxed word that the template applies to part of a text: those marks tell the reader where to look, and dropping them flattens the ad.`;

	const catalogRule = isCatalogSubject
		? `\nSUBJECT IS THE STORE, NOT ONE ITEM (CRITICAL) — This ad is about the business as a whole, not about a single product. The supplied photos are a SELECTION of what the store sells: show them together as a coherent group, collection or lineup, all sharing the same lighting, scale logic and surface. Never present one of them as "the" hero product with the others as accessories, never invent a product that was not supplied, and never write a price or a claim that belongs to a single item. The message must work for the whole catalogue: what the store sells, for whom, and why choose it.`
		: '';

	const qualityRule = `\nOUTPUT QUALITY (CRITICAL) — Render at the highest native resolution and quality available for this image engine; do not downscale, blur or soften the final image. Keep edges, product textures and shadows crisp and photorealistic. Render every replacement text character sharply and legibly, with correct spelling, stable letterforms, consistent kerning and no gibberish, melted letters, duplicated words or accidental symbols. Prefer clean, sufficiently large text inside its original zones over tiny unreadable text. The result must look production-ready at full resolution, suitable for a high-quality 4K export when the selected engine supports it.`;

	return `The first input image is a WINNING AD TEMPLATE. It is a STRUCTURAL reference, not artwork to copy: what you must preserve is its skeleton — the layout, the composition, the proportions, the background treatment, the colour palette, the graphic devices (badges, stars, speech bubbles, banners, buttons, dividers), the position of every visual block and the visual hierarchy. What must change is everything it is ABOUT: the product, the scenes and the people all become ${productLabel}. Someone who saw both ads should recognise the same design system and never suspect they show the same subject.
${strategyBlock}${creativeBlock}${imageSlotBlock}
	${productSwap}${orientationRule}${carouselRule}

	2. TEXT SWAP — LANGUAGE IS ABSOLUTE: every word visible in the final image must be in ${language} — headline, subcopy, badges, pills, buttons, small print and stamps. Replace the template's visible wording with the exact copy below, keeping each text in the same position, size, style, line count and visual hierarchy:
	${textSwap || (input.analysis
		? `- THIS AD HAS NO TEXT OVERLAY. Do not add a headline, badge, feature list, price tag, comparison table, CTA or logo lockup that is not visibly present in the template.`
		: `- Adapt every template text block honestly to ${productLabel}, in ${language}, keeping the same message structure.`)}
	If a visible text block has no replacement listed, adapt its message honestly to ${productLabel}. Do not invent prices, percentages, reviews, certifications or claims. Never carry over the template's guarantees, discounts, shipping promises, review counts, ratings, certifications, awards or deadlines unless they are verified for the target product. Keep the SAME NUMBER of text blocks as the template, no more. Render every replacement sharp, correctly spelled and fully inside its original card, bubble or badge. Never duplicate a line or let text overflow. Text physically printed on the supplied product or inside its official logo must remain faithful to those supplied assets.

3. BRAND SWAP — ERASE every trace of the template's own brand. Its wordmark, logo, emblem, monogram and brand name must NOT appear anywhere in the output, in any size, not even faintly, partially, redrawn or stylised, and never merged with other text. Scan the whole canvas for it: corners, footer, badges, the product itself and any watermark. That brand belongs to a different company — leaving it in makes the ad unusable. ${input.hasLogo ? 'The user explicitly selected INCLUDE LOGO. If the layout needs a brand mark, place the provided brand logo (last input image) in that same spot, ONCE, small and discreet. Reproduce that logo image EXACTLY as supplied and complete: it may itself contain more than one element (a shield plus a seal, a symbol plus a wordmark, several marks side by side) — keep every element it contains, in the same arrangement and proportions, and render any text inside it letter for letter. Never redraw, recolour, restyle, split or simplify it. Do NOT add any badge, seal, medallion, ribbon, star rating, laurel or certification stamp that is not part of that logo image.' : (input.brandName ? `The user selected NO LOGO IMAGE, but the ad still has to carry the brand. Do NOT draw a logo, emblem, monogram, shield, crest, badge, seal, medallion, ribbon, laurel or coat of arms. Instead, WRITE the brand name "${input.brandName}" as plain, clean typography in the exact spot where the template placed its brand mark — same position, same relative size, same alignment — using a simple weight of the ad's own typeface, with no icon, no container shape and no decoration around it. A finished ad that shows no brand at all looks unfinished, so the name must be there and be legible.` : 'The user explicitly selected NO ADDED LOGO and no brand name is available. Do not add a separate logo, wordmark, emblem, monogram, initials, shield, crest, badge, seal, medallion, ribbon, laurel, star mark, coat of arms or certification stamp, and do not invent a brand name. Leave that area clean.') + ' This does not remove the real label or branding physically printed on the supplied product packaging, which must remain faithful to the product photo.'}

WEBSITE VISIBILITY — ${input.includeWebsite && input.displayWebsite ? `The user explicitly requested a visible website. Render exactly "${input.displayWebsite}" ONCE in an existing URL or footer slot.` : 'Do not render any URL, domain, web address, social handle or QR code. Remove any website from the winning template and leave that space clean.'}

4. STRICT FIDELITY — Copy the template's layout structure 1:1: same background treatment (no added waves, gradients or decorative shapes), same divider style, same badge/pill arrangement and count, same positions. Small icons may be adapted only when their meaning no longer applies to the new content, keeping the same visual style and weight. ${colorRule} ${typoRule} Do not add ANY element that is not in the template. Do not include watermarks or platform UI. The final image must look like the same ad campaign as the template${referenceHasProduct ? `, now selling ${productLabel}` : ''}.
${layoutFidelityRule}${catalogRule}${qualityRule}${TEXT_RENDERING_RULE}${semanticPaletteRule}${identityBlock}
${logoDecision}
${peopleBlock}${comparisonBlock}${comparisonContext}${creativeDecisionBlock}

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
