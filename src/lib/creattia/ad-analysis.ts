import OpenAI from 'openai';
import { normalizeAdCopy, type AdaptedAdCopy } from './ad-copy';

// ── Compartido entre /api/creativos/plan y /api/creativos/generate ──────────

export type LayoutAnalysis = {
	messageStrategy?: string;
	adCopy?: AdaptedAdCopy;
	textZones?: Array<{ where?: string; onProduct?: boolean; original?: string; messageRole?: string; replacement?: string }>;
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
	language?: string;
	creativeOptions?: string[];
	// Personas visibles en el anuncio (el usuario puede indicar cómo se reconstruyen).
	people?: Array<{ where?: string; description?: string; role?: string; directive?: string }>;
	// Elementos de comparación que NO son el producto héroe (ej: barritas de la competencia).
	comparisonItems?: Array<{ where?: string; description?: string; role?: string; directive?: string }>;
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
// decodifica la estrategia de mensaje y enumera CADA zona de texto con su
// reemplazo propuesto (que el usuario puede editar antes de generar).
// Intenta Gemini primero (barato y rápido) y cae a OpenAI si falla.
export async function analyzeReferenceLayout(keys: { openAIKey?: string; googleKey?: string }, input: {
	referenceB64: string;
	referenceMime: string;
	productB64?: string;
	productMime?: string;
	productName: string;
	productFacts: string;
	brandName: string;
	language?: string;
}): Promise<LayoutAnalysis | null> {
	const languageRule = input.language && LANGUAGE_NAMES[input.language]
		? `Write ALL replacements in ${LANGUAGE_NAMES[input.language]} (the user chose this language; set "language" to "${input.language}"). creativeOptions stay in Argentine Spanish regardless.`
		: 'Write replacements in the SAME language as the product facts and set "language" accordingly. creativeOptions stay in Argentine Spanish regardless.';

	const systemPrompt = `You are a senior performance ad designer. You receive: (1) a winning static ad TEMPLATE image${input.productB64 ? ', (2) a real product photo' : ''}, and verified product facts.

Return STRICT JSON:
{
  "messageStrategy": "2-3 sentences decoding the template's persuasion: which emotion it triggers, which objection it kills, what promise it makes and through which mechanism (nostalgia, guilt-removal, social proof, price anchor, before/after, authority, scarcity...)",
  "adCopy": {
    "primaryText": "ready-to-publish Meta/Instagram primary text. Open with a strong first-line hook, then the verified benefit or proof, then a clear action. Natural language, short paragraphs, maximum 700 characters",
    "headline": "benefit-led headline, maximum 60 characters",
    "description": "supporting detail that does not repeat the headline, maximum 90 characters",
    "cta": "short action label, maximum 30 characters"
  },
  "textZones": [
    { "where": "short position description (e.g. 'main headline, top center, two lines')",
      "onProduct": true|false,
      "original": "exact original text in the template",
      "messageRole": "the persuasive job this text does (e.g. 'emotional hook: nostalgia + guilt removal', 'social proof: enthusiastic customer quote', 'spec badge: reassurance with a concrete number', 'CTA: low-friction action')",
      "replacement": "new text for the target product that performs the SAME persuasive job, similar length so it fits the same space, honest (no invented prices/claims beyond the provided facts)" }
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
  "stagingAdaptation": "if copying the template's handling would look physically impossible, describe how to re-stage the target product so the scene is believable, keeping the SAME shot type, crop, framing and composition. Be specific about hands: if the template holds a small object in one hand and the target product is large and floppy (a hide, a rug, a panel, a textile), a single hand cannot hold it — say so and propose the alternative, preferring to REMOVE the hand and show the product alone, resting on a surface, hanging, rolled or held with both hands. If the sizes are comparable, say 'same handling as the template'.",
  "imageSlots": [
    { "where": "position and shape of THIS image area (e.g. 'three tilted photo cards stacked on the right third', 'full-bleed background photo', 'small circular avatar top-left', 'left half of a 50/50 split')",
      "showsNow": "what that area currently depicts in the template",
      "replaceWith": "what that SAME area must depict for the target product — a concrete, photographable scene tied to the product, its user, its making, its use or its result. Keep the same shot type, crop, angle and mood as the original so the composition still works. Never keep the template's original subject." }
  ],
  "people": [
    { "where": "where the person appears (e.g. 'right half, holding the product')",
      "role": "their job in the ad (e.g. 'testimonial author', 'lifestyle model', 'before/after subject')",
      "description": "what they look like now in Argentine Spanish (apparent gender, age range, hair, expression, setting) so the user can decide how to reconstruct them" }
  ],
  "comparisonItems": [
    { "where": "position of a NON-hero item that the ad compares AGAINST the product (e.g. 'left and right columns/products in a 3-way comparison')",
      "role": "what it represents (e.g. 'competitor bar', 'the old way', 'other brand')",
      "description": "short Argentine-Spanish description of that comparison item so the user can decide what to put there" }
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
  "language": "es|en|fr|it|pt|de",
  "creativeOptions": ["3 to 5 SHORT optional creative directions specific to THIS template and THIS product (e.g. highlight the price as anchor, emphasize the guarantee, show texture close-up) — ALWAYS written in Argentine Spanish (the app's UI language), even when the ad copy is in another language"],
  "styleNotes": "background color(s), palette, typography feel, graphic devices worth preserving"
}

Rules:
- "adCopy" is the publication copy that appears outside the image. Adapt the winning message strategy to the target product, front-load the hook, use only verified facts, avoid unsupported urgency or claims, and complement rather than repeat the words rendered inside the creative. Write it in the requested ad language.
- COPY THAT STOPS THE SCROLL: the winning ad earns attention with its wording, not only its layout. Every replacement has to hit as hard as the original — same punch, same rhythm, same length, same device (a paradox, a question, a number, a blunt claim, a quote). Never soften a bold line into a polite description. If the original testimonial says "Thanks Billie for this smooth shave!", the replacement must name the ADVERTISER, not the product's manufacturer${input.brandName ? ` — the advertiser is "${input.brandName}"` : ', and if no advertiser brand is given, rewrite it so it thanks nobody and speaks about the experience instead'}. A first line that reads like a spec sheet is a failure.
- FIRST decode the template's message strategy. THEN write every replacement so it performs the SAME persuasive job for the target product: same emotional angle, same rhetorical device (paradox, contrast, question, quote, number), same energy and tone. An emotional hook must stay an emotional hook adapted to the new product — never flatten it into a generic benefit statement.
- Enumerate EVERY visible text zone in the template (headline, subcopy, review, badges, pills, CTA, small print). None may be missed.
- ONLY REAL ZONES: list a zone only if that text is ACTUALLY VISIBLE in the template image. Never invent a headline, a badge, a feature row, an icon list or a CTA that the ad does not have, and never add one because "an ad usually has it". If the template is a photograph with little or no type on it, return few zones — or an empty textZones array if it truly has none. Its restraint is part of why it works, and filling it with copy would destroy the reference.
- "onProduct": true when the text is printed ON the product/packaging itself; false when it belongs to the ad layout (headline, cards, pills, buttons).
- "referenceHasProduct": true only if the TEMPLATE visibly features a physical product shot (box, bottle, object). Lifestyle/person-only or pure-text ads → false.
- "productInstances" (CRITICAL): list EVERY separate place where the TEMPLATE'S OWN product is visible — not just the hero shot. Count the product worn by a model, on someone's feet, held in a hand, repeated as colour variants, shown again small in a corner, or duplicated across a grid. If the same product appears 6 times in a circle, that is 6 instances (or one instance describing the whole arrangement, but say so explicitly). Missing one means it survives into the final ad and the ad ends up selling two different products at once.
- "productOnBody": true if ANY instance is worn on / used on a human body (garment, underwear, shoes, jewellery, a patch on skin). This decides whether the layout can host a product that cannot be worn.
- "creative": read the ad the way a senior art director would. This is not decoration: "designPattern" and "styleFamily" have to be precise enough that another designer could rebuild the ad from them, and "score" has to be honest — a weak ad gets a low number even if it is in the library.
- PHYSICAL SCALE (CRITICAL): judge the REAL size of both products. A pill pinched between two fingertips and a full leather hide are not interchangeable: rendering the hide at pill size gives an absurd ad. Fill "templateProductScale", "targetProductScale" and "stagingAdaptation" so the new product appears at its true size. The rule is to keep the SHOT (same crop, same framing, same part of the body in frame, same area of the canvas occupied) and change only HOW the product is handled so it is physically possible.
- "imageSlots" (CRITICAL): a winning ad wins because of its STRUCTURE and its IDEA — the layout, the rhythm, the way attention is directed — not because of the specific photos it happens to contain. List EVERY visual area of the template: the hero shot, each photo in a collage or grid, the background image, avatars, before/after panels, lifestyle scenes, and decorative photo strips. For each one, propose what that area should depict for the TARGET product instead. Think like an art director briefing a photographer: if the template shows three photos of people hugging dogs and the target product is wholesale leather, the replacement is three photos of artisans cutting, stitching and finishing leather at a workbench — same tilt, same crop, same lighting mood, same energy. Never propose keeping the template's original subject, and never propose an empty or generic "product photo" when the slot is clearly a lifestyle or context shot. If the template has a single product shot and nothing else, one entry is enough.
- "productHasPackaging": look ONLY at the REAL product photo — true ONLY if that photo clearly shows a printed box, wrapper or label belonging to the product. Raw materials (leather hides, fabrics, wood), unpackaged food, plants, garments or bare objects have NO packaging → false. The template's product is irrelevant for this field.
- TESTIMONIALS: if the template shows a person's photo next to a quote, the replacement quote and attribution must plausibly belong to that SAME visible person (never mismatch apparent gender or age; a neutral attribution like 'Cliente verificada' is fine).
- PEOPLE: list in "people" EVERY human clearly visible in the ad (models, testimonial faces, before/after subjects). Empty array if none. The user may later specify how they want each person to look.
- COMPARISON: if the ad is a comparison/versus layout (e.g. three products side by side, "us vs them", before/after columns), the HERO is the advertiser's product; list every OTHER item being compared against it in "comparisonItems" so the user can decide what to place there (they may want generic unbranded stand-ins). Empty array if the ad is not a comparison. Never treat the hero product itself as a comparison item.
- ${languageRule}
- If a zone shows a spec/number (e.g. "10G PROTEIN"), replace it with a REAL fact of the target product formatted the same way.
- UNVERIFIABLE PROMISES (CRITICAL): a zone stating a guarantee ("90-day money-back", "risk-free"), a shipping promise ("free shipping", "delivered in 24h"), a discount or price ("15% OFF", "$29"), a review count or rating ("4.8 from 12,000 reviews"), a certification, an award or a deadline is a COMMERCIAL COMMITMENT. Translating it is NOT allowed — it would put a promise the advertiser never made on a live ad. Unless that exact promise appears in the verified facts above, replace that zone with a REAL, verifiable benefit or product attribute that fills the same space and does the same reassurance job (e.g. a money-back badge becomes "Formulado para piel sensible", a "15% OFF" pill becomes "Hidratación 24 h"). NEVER keep the template's number, percentage, timeframe or guarantee wording. Same for the CTA: a generic action ("Shop Now", "Comprar") is fine, but never one that implies an offer that was not provided.
- Never use the template's brand name in replacements.${input.brandName ? ` The advertiser brand is "${input.brandName}".` : ''}`;
	const userText = `Target product: ${input.productName}. Verified facts: ${input.productFacts || 'Only the product photo is available.'}`;

	const validate = (raw: string | null | undefined): LayoutAnalysis | null => {
		try {
			const parsed = JSON.parse(raw || 'null');
			if (!parsed || !Array.isArray(parsed.textZones)) return null;
			parsed.adCopy = normalizeAdCopy(parsed.adCopy, {
				productName: input.productName,
				productFacts: input.productFacts,
				brandName: input.brandName,
			});
			return parsed as LayoutAnalysis;
		} catch { return null; }
	};

	if (keys.googleKey) {
		try {
			const model = (typeof import.meta.env !== 'undefined' && import.meta.env.GEMINI_ANALYSIS_MODEL) || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
			const parts: any[] = [
				{ text: `${systemPrompt}\n\n${userText}\n\nThe first image is the TEMPLATE${input.productB64 ? ', the second is the REAL PRODUCT PHOTO' : ''}.` },
				{ inline_data: { mime_type: input.referenceMime, data: input.referenceB64 } },
			];
			if (input.productB64) parts.push({ inline_data: { mime_type: input.productMime || 'image/jpeg', data: input.productB64 } });
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
			const content: any[] = [
				{ type: 'text', text: userText },
				{ type: 'text', text: 'TEMPLATE:' },
				{ type: 'image_url', image_url: { url: `data:${input.referenceMime};base64,${input.referenceB64}` } },
			];
			if (input.productB64) {
				content.push({ type: 'text', text: 'REAL PRODUCT PHOTO:' });
				content.push({ type: 'image_url', image_url: { url: `data:${input.productMime || 'image/jpeg'};base64,${input.productB64}` } });
			}
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

// Prompt corto y sin contradicciones para el modo "Fiel al ganador":
// el modelo edita la referencia reemplazando SOLO producto, textos y marca.
export function buildReferenceClonePrompt(input: {
	productNames: string[];
	brandName: string;
	hasLogo: boolean;
	brief: string;
	analysis?: LayoutAnalysis | null;
	languageCode?: string;
	colorMode?: 'winner' | 'brand';
	typoMode?: 'winner' | 'brand';
	brandColors?: string[];
	brandTypography?: { headings?: string; body?: string };
	adCopy?: {
		headline?: string;
		subheadline?: string;
		reviewText?: string;
		cta?: string;
		language?: string;
	};
}) {
	const languageCode = input.languageCode || input.analysis?.language || input.adCopy?.language || 'es';
	const language = LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.es;
	const productLabel = input.productNames.length ? input.productNames.join(' + ') : 'the real product supplied by the user';
	const referenceHasProduct = input.analysis?.referenceHasProduct !== false;

	// Zonas de texto: del análisis de visión (ideal) o del copy plano de fallback.
	// Se descartan las zonas cuyo reemplazo vino vacío o con un literal basura: el
	// análisis llegó a devolver la cadena "null" para el sello de marca de un
	// ganador cuando el perfil no tenía nombre de marca, y el modelo escribió
	// "null" dentro del sello en el anuncio final.
	const isJunkReplacement = (value?: string) => {
		const text = (value || '').trim();
		if (!text) return true;
		return /^(null|undefined|none|n\/a|nan|-|—)$/i.test(text);
	};
	const zones = (input.analysis?.textZones || [])
		.filter((zone) => (input.analysis?.productHasPackaging ? true : !zone.onProduct))
		.filter((zone) => !isJunkReplacement(zone.replacement));
	const droppedOnProduct = (input.analysis?.textZones?.length || 0) - zones.length;
	let textSwap = '';
	if (zones.length) {
		textSwap = zones.map((zone, index) => `${index + 1}. [${zone.where}${zone.messageRole ? ` — persuasive job: ${zone.messageRole}` : ''}] Replace "${zone.original}" with "${zone.replacement}"`).join('\n');
	} else if (input.adCopy) {
		textSwap = [
			input.adCopy.headline ? `- Headline: "${input.adCopy.headline}"` : '',
			input.adCopy.subheadline ? `- Subheadline: "${input.adCopy.subheadline}"` : '',
			input.adCopy.reviewText ? `- Customer review: "${input.adCopy.reviewText}"` : '',
			input.adCopy.cta ? `- Call-to-action button: "${input.adCopy.cta}"` : '',
		].filter(Boolean).join('\n');
	}

	const placement = input.analysis?.productPlacement
		? ` — same position, generous scale, dynamic angle and prominence described here: ${input.analysis.productPlacement}`
		: ', in its exact position, with the same scale and prominence,';
	// Regla incondicional: respetar la forma física real del producto aunque
	// el análisis se equivoque con productHasPackaging.
	const packagingRule = input.analysis && !input.analysis.productHasPackaging
		? `\nCRITICAL: the real product has NO printed packaging. Its surface must stay completely clean — do NOT print any words, logos, badges, spec bubbles or graphics on the product itself.${droppedOnProduct > 0 ? " The template's on-package texts are intentionally omitted; do not recreate or relocate them." : ''} All copy lives only in the ad layout's text zones.`
		: `\nNEVER invent a box, wrapper or label that is not visible in the product photo.`;

	// El texto impreso en el envase se copia carácter por carácter. Inventar una
	// letra puede convertir el nombre real del producto en otra palabra
	// (p. ej. "PDRN" leído como "PORN") y arruinar el anuncio.
	const labelFidelityRule = `\nLABEL TEXT FIDELITY (CRITICAL) — Any text printed on the product's own packaging must be reproduced CHARACTER BY CHARACTER exactly as it appears in the product photo${input.productNames.length ? `; the product name is literally "${input.productNames.join(' + ')}" and must be spelled exactly that way on the label` : ''}. Never re-spell, auto-correct, translate or "improve" a word on the packaging, and never swap a letter for a similar-looking one — a single wrong character can turn the real product name into a different word. If part of the label is too small or blurry to read with certainty in the photo, render it as realistically soft/out-of-focus micro-text instead of guessing letters.`;

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

	const productSwap = referenceHasProduct
		? `1. PRODUCT SWAP — Completely remove the template's original product. In its place${placement} render the real product shown in the other input image(s): ${productLabel}. The product must remain the SAME PHYSICAL OBJECT TYPE seen in its photo — if the photo shows a hide, render a hide; a bottle, a bottle; never morph it into the template's product form (e.g. never turn an unboxed product into a box). Render it as ONE single coherent object (never split it into disconnected pieces, and never show multiples unless the template does). RE-STAGE the product INTO the template's scene — do NOT paste it: re-photograph it as if it were shot in that exact environment, matching the scene's camera angle, perspective, lighting direction, color temperature, reflections and shadow behavior (e.g. if the template's product leans against a tiled wall in daylight, the new product must sit in that same tiled-wall daylight scene with the same grounding). Give it real volume and dimension, adapt its pose and orientation to fit the composition naturally, and ground it with the same shadow style the template uses. POSITION: place it at the SAME position and size ratio as the template's product — if the template's product occupies the right side, yours must occupy the right side; never center it unless the template does. Never leave hard cut-out edges or a floating pasted look: blend the product's edges with the scene lighting. LAYERING: match the template's stacking order exactly — any card, speech bubble or text panel that sits in front of the product in the template must stay fully in front, uncovered and readable; the product must never cut across, poke through or overlap a text card beyond what the template shows. Never show it as a flat cut-out pasted on top, and never replace it with a generic product. Match the product photo's exact shape, colors and texture — it must look premium, tactile and desirable. IDENTITY DETAILS (CRITICAL): whatever is printed, stitched, embossed, woven or engraved on the real product must survive — the brand mark on a garment's chest or sleeve, the tag, the logo on a shoe, the model name on a device, a pattern, a stripe, a stitching colour, a distinctive shape. Someone who owns this product has to recognise it as the same one. Do not clean it up, simplify it, remove a label or move a mark somewhere else.${packagingRule}${labelFidelityRule}${scaleRule}${instanceBlock}${onBodyRule}`
		: `1. NO PRODUCT INSERTION — The template does NOT show a physical product, so the new ad must not show one either. This ad sells through its words and its design, not through a product shot: that is exactly why it works. Keep its imagery style as it is (the typographic treatment, the colour field, the graphic devices, the scene) and adapt it naturally to the new context. Do NOT insert, paste, collage or hint at a product photo anywhere, at any size, not even small in a corner — not even if a product photo was supplied as input. Everything about ${productLabel} must come through the copy.`;

	const colorRule = input.colorMode === 'brand' && input.brandColors?.length
		? `COLOR RESTYLE (REQUIRED) — This is a hard requirement: recolor the ad into the brand palette ${input.brandColors.join(', ')} (the FIRST color is the primary/dominant one, the next are secondary/accents). The dominant background, the main accents, the buttons/CTA and the badges MUST visibly use these exact brand colors instead of the template's original colors — the finished ad has to read as belonging to this brand at a glance. Keep the template's exact LAYOUT, contrast hierarchy and legibility (dark text on light areas and vice-versa); only the hues change. Do not keep the template's original brand colors.`
		: `Do not change the background color or palette — keep the template's exact colors.`;

	// Personas: reconstruir según lo que pidió el usuario, o mantener si no indicó nada.
	const people = (input.analysis?.people || []).filter((p) => p && (p.description || p.directive || p.where));
	const peopleBlock = people.length
		? `\n5. PEOPLE — The ad shows ${people.length === 1 ? 'a person' : 'people'}. For each, follow the direction:\n${people.map((p, i) => `   - Person ${i + 1}${p.where ? ` (${p.where})` : ''}: ${p.directive?.trim() ? `render them as — ${p.directive.trim()}. Make it photorealistic and coherent with the scene.` : 'keep them essentially as in the template (same apparent gender, age and role), only refreshed to look natural in the new ad.'}`).join('\n')}\nKeep any person photorealistic, well-integrated into the scene lighting, never distorted.`
		: '';

	// Comparación: qué poner en los ítems que NO son el producto héroe.
	const comparisons = (input.analysis?.comparisonItems || []).filter((c) => c && (c.description || c.directive || c.where));
	const comparisonBlock = comparisons.length
		? `\n6. COMPARISON ITEMS — This is a comparison ad. The hero is ${productLabel}. For the OTHER compared items, follow the direction (and NEVER show a real competitor's brand name, logo or packaging unless explicitly told to):\n${comparisons.map((c, i) => `   - Item ${i + 1}${c.where ? ` (${c.where})` : ''}: ${c.directive?.trim() ? c.directive.trim() : `keep it as a neutral, unbranded stand-in in the same position and style as the template, clearly less appealing than the hero — but it MUST be the same KIND of thing as ${productLabel} (a plainer/duller alternative of the same category), never the template's original product category.`}`).join('\n')}`
		: '';
	const typoRule = input.typoMode === 'brand' && (input.brandTypography?.headings || input.brandTypography?.body)
		? `TYPOGRAPHY — Use the brand's typography: headings in ${input.brandTypography?.headings || 'the brand font'}, body text in ${input.brandTypography?.body || 'the brand font'}, keeping the same sizes, weights and hierarchy as the template.`
		: `Match the template's typographic style, weight and case exactly (if the template headline is heavy condensed uppercase, keep it heavy condensed uppercase).`;

	const strategyBlock = input.analysis?.messageStrategy
		? `\nMESSAGE STRATEGY OF THE WINNING AD (the new copy must deliver the same persuasion, adapted to ${productLabel}): ${input.analysis.messageStrategy}\n`
		: '';

	return `The first input image is a WINNING AD TEMPLATE. It is a STRUCTURAL reference, not artwork to copy: what you must preserve is its skeleton — the layout, the composition, the proportions, the background treatment, the colour palette, the graphic devices (badges, stars, speech bubbles, banners, buttons, dividers), the position of every text block and the typographic hierarchy. What must change is everything it is ABOUT: the product, the scenes, the people and the words all become ${productLabel}. Someone who saw both ads should recognise the same design system and never suspect they show the same subject.
${strategyBlock}${creativeBlock}${imageSlotBlock}
${productSwap}

2. TEXT SWAP — LANGUAGE IS ABSOLUTE: every single word visible in the final image must be in ${language} — headline, subcopy, badges, pills, buttons, small print, star labels, stamps and any word inside a graphic. Not one word may stay in the template's original language, and none may drift into another language. If a replacement below is written in a different language, translate it to ${language} before rendering it. Replace the template's wording with this exact copy, written in ${language}, placing each text in the same position, size and style as the template text it replaces. Every zone listed MUST contain its text — never leave a badge, pill or button empty:
${textSwap || (input.analysis
		? `- THIS AD HAS NO TEXT OVERLAY. The template sells with the image alone, and that restraint is exactly why it works. Do NOT add a headline, a subheadline, a badge, a pill, a price tag, a feature list, a comparison table, a CTA button or a logo lockup. Adding copy here would turn a clean, confident ad into a cluttered one and destroy the reference. Leave the composition free of type.`
		: `- Adapt every template text block honestly to ${productLabel}, in ${language}, keeping the same message structure.`)}
If a template text block has no replacement listed, adapt its message honestly to the new product${input.brandName ? '' : ". If that block was the advertiser's brand name or stamp, leave it visually clean and empty instead of writing a placeholder — never write words like \"null\", \"undefined\", \"marca\" or \"your brand\" inside the ad"}. Do not invent prices, percentages, reviews, certifications or claims. NEVER translate or carry over the template's guarantees, discounts, shipping promises, review counts, ratings, certifications, awards or deadlines — those are commitments of the template's brand, not of this advertiser. If such a badge or pill has no verified replacement, fill it with a real product benefit at the same size and in the same shape instead; leaving the template's promise there (even translated) is a hard error. NO EXTRA COPY: the finished ad must contain the SAME NUMBER of text blocks as the template, no more. Never add a headline, badge, feature box, bullet list, comparison row, seal or CTA that the template does not have — an ad with more text than its reference stops looking like the reference. Render all text sharp, correctly spelled, no gibberish or distorted words. NO DUPLICATION: each text appears exactly ONCE — never repeat a word, a line or the tail of a sentence on the next line (a heading ending in "...resultados visibles?" must not be followed by a stray "visibles?"), and never render the same block twice. FIT: every text MUST fit fully inside its card, bubble or badge with the same padding as the template — if a replacement is long, reduce its font size slightly or tighten line spacing; text must NEVER overflow, collide with other elements or spill outside its container. If the template shows a person next to a testimonial, keep that exact person unchanged and make the attribution plausibly match them.

3. BRAND SWAP — ERASE every trace of the template's own brand. Its wordmark, logo, emblem, monogram and brand name must NOT appear anywhere in the output, in any size, not even faintly, partially, redrawn or stylised, and never merged with other text. Scan the whole canvas for it: corners, footer, badges, the product itself and any watermark. That brand belongs to a different company — leaving it in makes the ad unusable. ${input.hasLogo ? 'If the layout needs a brand mark, place the provided brand logo (last input image) in that same spot, ONCE, small and discreet. Reproduce that logo image EXACTLY as supplied and complete: it may itself contain more than one element (a shield plus a seal, a symbol plus a wordmark, several marks side by side) — keep every element it contains, in the same arrangement and proportions, and render any text inside it letter for letter. Never redraw, recolour, restyle, split or simplify it. Do NOT add any badge, seal, medallion, ribbon, star rating, laurel or certification stamp that is not part of that logo image.' : 'NO INVENTED MARKS — You have NOT been given a brand logo, so you must not draw one. Do not create shields, crests, badges, seals, medallions, ribbons, laurels, stars, monograms, initials, coats of arms or certification stamps anywhere in the image, not even small ones in a corner, and never text inside such a shape (it always comes out as gibberish). Where the template showed its brand mark, ' + (input.brandName ? `render ONLY a plain text wordmark reading exactly "${input.brandName}", in the same typeface family as the ad, with no surrounding shape or emblem.` : 'leave that area completely empty and clean — no invented name, no placeholder, no emblem.')}

4. STRICT FIDELITY — Copy the template's layout structure 1:1: same background treatment (no added waves, gradients or decorative shapes), same divider style, same badge/pill arrangement and count, same positions. Small icons may be adapted only when their meaning no longer applies to the new content, keeping the same visual style and weight. ${colorRule} ${typoRule} Do not add ANY element that is not in the template. Do not include watermarks or platform UI. The final image must look like the same ad campaign as the template${referenceHasProduct ? `, now selling ${productLabel}` : ''}.
${peopleBlock}${comparisonBlock}

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
