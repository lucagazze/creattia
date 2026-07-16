import OpenAI from 'openai';

// ── Compartido entre /api/creativos/plan y /api/creativos/generate ──────────

export type LayoutAnalysis = {
	messageStrategy?: string;
	textZones?: Array<{ where?: string; onProduct?: boolean; original?: string; messageRole?: string; replacement?: string }>;
	productHasPackaging?: boolean;
	referenceHasProduct?: boolean;
	productPlacement?: string;
	language?: string;
	creativeOptions?: string[];
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
		? `Write ALL replacements and creativeOptions in ${LANGUAGE_NAMES[input.language]} (the user chose this language; set "language" to "${input.language}").`
		: 'Write replacements in the SAME language as the product facts and set "language" accordingly.';

	const systemPrompt = `You are a senior performance ad designer. You receive: (1) a winning static ad TEMPLATE image${input.productB64 ? ', (2) a real product photo' : ''}, and verified product facts.

Return STRICT JSON:
{
  "messageStrategy": "2-3 sentences decoding the template's persuasion: which emotion it triggers, which objection it kills, what promise it makes and through which mechanism (nostalgia, guilt-removal, social proof, price anchor, before/after, authority, scarcity...)",
  "textZones": [
    { "where": "short position description (e.g. 'main headline, top center, two lines')",
      "onProduct": true|false,
      "original": "exact original text in the template",
      "messageRole": "the persuasive job this text does (e.g. 'emotional hook: nostalgia + guilt removal', 'social proof: enthusiastic customer quote', 'spec badge: reassurance with a concrete number', 'CTA: low-friction action')",
      "replacement": "new text for the target product that performs the SAME persuasive job, similar length so it fits the same space, honest (no invented prices/claims beyond the provided facts)" }
  ],
  "referenceHasProduct": true|false,
  "productHasPackaging": true|false,
  "productPlacement": "precise description of where/how the template's product sits: position, scale relative to canvas, angle, cropping, lighting, shadow — or null if the template shows no product",
  "language": "es|en|fr|it|pt|de",
  "creativeOptions": ["3 to 5 SHORT optional creative directions specific to THIS template and THIS product (e.g. highlight the price as anchor, emphasize the guarantee, show texture close-up) — the user may pick some as extra instructions"],
  "styleNotes": "background color(s), palette, typography feel, graphic devices worth preserving"
}

Rules:
- FIRST decode the template's message strategy. THEN write every replacement so it performs the SAME persuasive job for the target product: same emotional angle, same rhetorical device (paradox, contrast, question, quote, number), same energy and tone. An emotional hook must stay an emotional hook adapted to the new product — never flatten it into a generic benefit statement.
- Enumerate EVERY visible text zone in the template (headline, subcopy, review, badges, pills, CTA, small print). None may be missed.
- "onProduct": true when the text is printed ON the product/packaging itself; false when it belongs to the ad layout (headline, cards, pills, buttons).
- "referenceHasProduct": true only if the TEMPLATE visibly features a physical product shot (box, bottle, object). Lifestyle/person-only or pure-text ads → false.
- "productHasPackaging": look ONLY at the REAL product photo — true ONLY if that photo clearly shows a printed box, wrapper or label belonging to the product. Raw materials (leather hides, fabrics, wood), unpackaged food, plants, garments or bare objects have NO packaging → false. The template's product is irrelevant for this field.
- TESTIMONIALS: if the template shows a person's photo next to a quote, the replacement quote and attribution must plausibly belong to that SAME visible person (never mismatch apparent gender or age; a neutral attribution like 'Cliente verificada' is fine).
- ${languageRule}
- If a zone shows a spec/number (e.g. "10G PROTEIN"), replace it with a REAL fact of the target product formatted the same way.
- Never use the template's brand name in replacements.${input.brandName ? ` The advertiser brand is "${input.brandName}".` : ''}`;
	const userText = `Target product: ${input.productName}. Verified facts: ${input.productFacts || 'Only the product photo is available.'}`;

	const validate = (raw: string | null | undefined): LayoutAnalysis | null => {
		try {
			const parsed = JSON.parse(raw || 'null');
			if (!parsed || !Array.isArray(parsed.textZones) || !parsed.textZones.length) return null;
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
					generationConfig: { responseMimeType: 'application/json' },
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
	const zones = (input.analysis?.textZones || []).filter((zone) =>
		input.analysis?.productHasPackaging ? true : !zone.onProduct);
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

	const productSwap = referenceHasProduct
		? `1. PRODUCT SWAP — Completely remove the template's original product. In its place${placement} render the real product shown in the other input image(s): ${productLabel}. The product must remain the SAME PHYSICAL OBJECT TYPE seen in its photo — if the photo shows a hide, render a hide; a bottle, a bottle; never morph it into the template's product form (e.g. never turn an unboxed product into a box). Render it as ONE single coherent object (never split it into disconnected pieces, and never show multiples unless the template does). RE-RENDER it as a professional studio hero shot fully integrated into the scene: give it real volume and dimension, adapt its angle, perspective and lighting to match the template's product treatment, and ground it with a soft contact shadow. LAYERING: match the template's stacking order exactly — any card, speech bubble or text panel that sits in front of the product in the template must stay fully in front, uncovered and readable; the product must never cut across, poke through or overlap a text card beyond what the template shows. Never show it as a flat cut-out pasted on top, and never replace it with a generic product. Match the product photo's exact shape, colors and texture — it must look premium, tactile and desirable.${packagingRule}`
		: `1. NO PRODUCT INSERTION — The template does NOT feature a physical product shot, so the new ad must not include one either. Keep the same imagery style (people, scene or graphic treatment) adapted naturally to the new brand context. Do NOT insert a product photo anywhere.`;

	const colorRule = input.colorMode === 'brand' && input.brandColors?.length
		? `COLOR RESTYLE — Keep the exact layout structure, but restyle the color palette using the brand colors: ${input.brandColors.join(', ')} (first is primary). Apply them tastefully to backgrounds, accents and buttons while keeping the same contrast hierarchy as the template.`
		: `Do not change the background color or palette — keep the template's exact colors.`;
	const typoRule = input.typoMode === 'brand' && (input.brandTypography?.headings || input.brandTypography?.body)
		? `TYPOGRAPHY — Use the brand's typography: headings in ${input.brandTypography?.headings || 'the brand font'}, body text in ${input.brandTypography?.body || 'the brand font'}, keeping the same sizes, weights and hierarchy as the template.`
		: `Match the template's typographic style, weight and case exactly (if the template headline is heavy condensed uppercase, keep it heavy condensed uppercase).`;

	const strategyBlock = input.analysis?.messageStrategy
		? `\nMESSAGE STRATEGY OF THE WINNING AD (the new copy must deliver the same persuasion, adapted to ${productLabel}): ${input.analysis.messageStrategy}\n`
		: '';

	return `The first input image is a WINNING AD TEMPLATE. Recreate this exact advertisement, keeping its layout, composition, background, color palette, graphic devices (badges, stars, speech bubbles, banners, buttons), text block positions and typographic hierarchy visually identical to the template. Apply ONLY these replacements:
${strategyBlock}
${productSwap}

2. TEXT SWAP — Replace the template's wording with this exact copy, written in ${language}, placing each text in the same position, size and style as the template text it replaces. Every zone listed MUST contain its text — never leave a badge, pill or button empty:
${textSwap || `- Adapt every template text block honestly to ${productLabel}, in ${language}, keeping the same message structure.`}
If a template text block has no replacement listed, adapt its message honestly to the new product. Do not invent prices, percentages, reviews, certifications or claims. Render all text sharp, correctly spelled, no gibberish or distorted words. If the template shows a person next to a testimonial, keep that exact person unchanged and make the attribution plausibly match them.

3. BRAND SWAP — Remove the template's original brand names and logos. ${input.hasLogo ? 'If the layout needs a brand mark, place the provided brand logo (last input image) EXACTLY as it is, once, small and discreet. Never redraw the logo, never invent badges, seals, flags or emblems.' : 'Do NOT add any logo, badge, seal or brand emblem. If the template displays a brand name area, leave it clean or use a simple text wordmark' + (input.brandName ? ` reading "${input.brandName}".` : '.')}

4. STRICT FIDELITY — Copy the template's layout structure 1:1: same background treatment (no added waves, gradients or decorative shapes), same divider style, same badge/pill arrangement and count, same positions. Small icons may be adapted only when their meaning no longer applies to the new content, keeping the same visual style and weight. ${colorRule} ${typoRule} Do not add ANY element that is not in the template. Do not include watermarks or platform UI. The final image must look like the same ad campaign as the template${referenceHasProduct ? `, now selling ${productLabel}` : ''}.

USER DIRECTION
${input.brief || 'None.'}`;
}

// Pre-producción del producto: re-renderiza la foto como toma de estudio limpia
// (objeto único, fondo neutro, luz pareja) para que se integre perfecto al anuncio.
export async function renderStudioProductShot(googleKey: string, image: { buffer: Buffer; type: string }): Promise<{ buffer: Buffer; type: string } | null> {
	try {
		const prompt = 'Re-photograph the EXACT product from this image as a professional studio product shot: ONE single coherent object, clean neutral light background, soft even studio lighting, gentle contact shadow, centered with generous margins. Preserve the product\'s exact shape, proportions, colors, materials and texture with total fidelity. Do not add any text, logos, props, packaging or extra items. Do not crop the product.';
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${googleKey}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [
					{ text: prompt },
					{ inline_data: { mime_type: image.type, data: image.buffer.toString('base64') } },
				] }],
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
