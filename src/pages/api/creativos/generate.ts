import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import OpenAI, { toFile } from 'openai';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 300;

// gpt-image-2 acepta cualquier tamaño divisible por 16 → ratios exactos.
// Las claves legacy (square/portrait/story/landscape) se mantienen como alias.
const formatSizes: Record<string, string> = {
	'1:1': '1024x1024',
	'3:4': '1152x1536',
	'9:16': '864x1536',
	'4:3': '1536x1152',
	'16:9': '1536x864',
	square: '1024x1024',
	portrait: '1152x1536',
	story: '864x1536',
	landscape: '1536x1152',
};

// gpt-image-1 solo acepta 1024x1024, 1024x1536 y 1536x1024
function snapSizeForGptImage1(size: string) {
	const [width, height] = size.split('x').map(Number);
	if (width === height) return '1024x1024';
	return height > width ? '1024x1536' : '1536x1024';
}
const imageTypes = new Set(['product', 'promotion', 'lifestyle', 'catalog']);
const formats = new Set(Object.keys(formatSizes));
const variationStrengths = new Set(['exact', 'light', 'strong']);
const acceptedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uniqueIds(values: string[]) {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildPrompt(input: {
	templateName: string;
	purpose: string;
	usageHint: string;
	preset: string;
	brandName: string;
	website: string;
	instagram: string;
	colors: string;
	brandSummary: string;
	brandVoice: string;
	targetAudience: string;
	typography: string;
	styleSummary: string;
	brandPersonality: string;
	products: Array<{ name: string; description: string }>;
	imageType: string;
	brief: string;
	format: string;
	hasLogo: boolean;
	hasReference: boolean;
	hasSourceGeneration: boolean;
	hasUploadedProduct: boolean;
	variationStrength: string;
	replaceProduct: boolean;
	inputImageMap: string[];
	adCopy?: {
		headline: string;
		subheadline: string;
		reviewText?: string;
		cta?: string;
		buttons?: string[];
		language?: string;
	};
}) {
	const revisionRules: Record<string, string> = {
		exact: 'Use the first input image as the master reference. Preserve its framing, layout, hierarchy, palette, lighting, typography zones and every untouched detail as closely as possible. Apply only the requested change.',
		light: 'Use the first input image as the main reference. Keep the creative angle, recognizable layout and visual hierarchy while allowing restrained variations in styling, spacing and supporting details.',
		strong: 'Use the first input image as strategic reference. Preserve the creative angle and selling logic, but create a substantially different composition and art direction.',
	};
	const compositionRule = input.hasSourceGeneration
		? revisionRules[input.variationStrength] || revisionRules.exact
		: input.hasReference
			? 'Use the first input image only as the advertising composition reference. Preserve its information hierarchy, visual rhythm and conversion logic, but do not copy trademarks, people, product identity or exact wording.'
			: 'Create a polished direct-response static ad with a clear information hierarchy and one dominant message.';
	const productFacts = input.products.length
		? input.products.map((product, index) => `${index + 1}. ${product.name}: ${product.description || 'No additional verified facts.'}`).join('\n')
		: 'No specific product selected.';

	let adCopyBlock = '';
	if (input.adCopy) {
		adCopyBlock = `
TEXT COPY TO WRITE EXACTLY ON THE IMAGE (WRITE THIS TEXT IN NATURAL SPANISH, DO NOT DISTORT OR MAKE UP GIBBERISH WORDS):
- Main Headline (Bold, high-contrast, render prominently): "${input.adCopy.headline}"
- Subheadline / Support text: "${input.adCopy.subheadline}"
${input.adCopy.reviewText ? `- Customer Review / Testimonial text: "${input.adCopy.reviewText}"` : ''}
${input.adCopy.cta ? `- Primary Call-to-Action text: "${input.adCopy.cta}"` : ''}
${input.adCopy.buttons && input.adCopy.buttons.length ? `- Secondary button labels: ${input.adCopy.buttons.join(', ')}` : ''}
`;
	}

	return `Create a production-ready static advertising image for a real ecommerce brand.

OBJECTIVE
- Creative angle: ${input.templateName}
- Why it works: ${input.purpose}
- Best moment to use it: ${input.usageHint}
- Visual variation: ${input.preset}
- Requested image type: ${input.imageType}
- Output placement: ${input.format}

VERIFIED BRAND CONTEXT
- Brand name: ${input.brandName || 'Use a discreet generic brand lockup'}
- Website: ${input.website || 'Not provided'}
- Instagram: ${input.instagram || 'Not provided'}
- Brand colors: ${input.colors || '#18181b and #ffffff'}
- Brand summary: ${input.brandSummary || 'Use only the supplied facts.'}
- Brand voice: ${input.brandVoice || 'Clear and direct.'}
- Target audience: ${input.targetAudience || 'Not provided.'}
- Brand typography: ${input.typography || 'Not provided — pick a clean modern sans-serif.'}
- Brand visual style: ${input.styleSummary || 'Not provided.'}
- Brand personality: ${input.brandPersonality || 'Not provided.'}

INPUT IMAGE MAP
${input.inputImageMap.length ? input.inputImageMap.map((label, index) => `- Image ${index + 1}: ${label}`).join('\n') : '- No input images. Build from verified text context only.'}

SELECTED PRODUCTS
${productFacts}

${adCopyBlock}

ART DIRECTION
${compositionRule}
${input.hasSourceGeneration && input.replaceProduct ? '- Replace the product or products visible in the source generation with the selected product inputs. Do not blend old and new products.' : ''}
${input.hasReference && !input.hasSourceGeneration && (input.products.length > 0 || input.hasUploadedProduct) ? `- The first image is the WINNING AD TEMPLATE (reference layout). The second image is the REAL PRODUCT to feature. Create a new professional advertisement by using the EXACT COMPOSITION, color scheme, background aesthetic, alignment, speech bubbles, and layout of the first image (winning ad template), but replacing its original product with the real product shown in the second image. Do not draw the template's original product/packaging.` : ''}
${input.products.length > 1 ? `- This is a multi-product creative with ${input.products.length} distinct products. Show every supplied product clearly in one intentional group shot or collection composition. Preserve the real shape, packaging, logo and colors of each one.` : ''}
${input.products.length === 1 || (!input.products.length && input.hasUploadedProduct) ? '- The selected product is supplied as an input image. Preserve its real shape, packaging, logo and colors with high fidelity.' : ''}
${input.products.length === 0 && !input.hasUploadedProduct ? '- Build a brand-level promotion without inventing a specific packaged product.' : ''}
${input.imageType === 'lifestyle' ? '- Create a believable lifestyle scene. Every real product must remain recognizable and commercially prominent.' : ''}
${input.imageType === 'catalog' ? '- Use a clean ecommerce catalog treatment: controlled lighting, precise product edges, minimal environment and premium spacing.' : ''}
${input.imageType === 'promotion' ? '- Prioritize the verified offer and brand message. Do not invent a product-specific claim.' : ''}
${input.hasLogo ? '- Use the image identified as the brand logo in the input map. Preserve it accurately and place it once with comfortable clear space.' : '- Render the brand name as a simple wordmark only if needed.'}
- Write all visible copy in natural, high-converting ${input.adCopy?.language === 'en' ? 'American English' : 'Argentine Spanish'}.
- Keep copy minimal, accurate and easy to read on a phone.
- Do not invent prices, percentages, reviews, certifications, deadlines, product features or legal claims.
- Do not include platform UI, watermarks, mock browser chrome or explanatory labels.
- Make the result feel designed by a senior performance creative team, not like generic AI art.

USER DIRECTION
${input.brief || (input.hasSourceGeneration ? 'No specific edit was requested. Produce another version using the selected variation strength.' : 'No extra direction. Choose the strongest honest headline for the angle without fabricating facts.')}`;
}

type LayoutAnalysis = {
	textZones?: Array<{ where?: string; onProduct?: boolean; original?: string; replacement?: string }>;
	productHasPackaging?: boolean;
	productPlacement?: string;
	language?: string;
};

// Analiza el anuncio ganador + la foto real del producto con un modelo de visión:
// enumera CADA zona de texto con su reemplazo y describe cómo presentar el producto.
async function analyzeReferenceLayout(openai: OpenAI, input: {
	referenceB64: string;
	referenceMime: string;
	productB64: string;
	productMime: string;
	productName: string;
	productFacts: string;
	brandName: string;
}): Promise<LayoutAnalysis | null> {
	const model = import.meta.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
	const response = await openai.chat.completions.create({
		model,
		response_format: { type: 'json_object' },
		messages: [
			{
				role: 'system',
				content: `You are a senior performance ad designer. You receive: (1) a winning static ad TEMPLATE image, (2) a real product photo, (3) verified product facts.

Return STRICT JSON:
{
  "textZones": [
    { "where": "short position description (e.g. 'main headline, top center, two lines')",
      "onProduct": true|false,
      "original": "exact original text in the template",
      "replacement": "new text for the target product, similar length so it fits the same space, honest (no invented prices/claims beyond the provided facts)" }
  ],
  "productHasPackaging": true|false,
  "productPlacement": "precise description of where/how the template's product sits: position, scale relative to canvas, angle, cropping, lighting, shadow",
  "language": "en|es — the language of the provided product facts",
  "styleNotes": "background color(s), palette, typography feel, graphic devices worth preserving"
}

Rules:
- Enumerate EVERY visible text zone in the template (headline, subcopy, review, badges, pills, CTA, small print). None may be missed.
- "onProduct": true when the text is printed ON the product/packaging itself; false when it belongs to the ad layout (headline, cards, pills, buttons).
- "productHasPackaging": look at the REAL product photo — true only if the real product has printed packaging/labels of its own.
- Replacements: write them in the SAME language as the product facts ("language" field), punchy direct-response copy, roughly the same character count as the original so the layout doesn't break. Spanish must be natural Argentine Spanish.
- If a zone shows a spec/number (e.g. "10G PROTEIN"), replace it with a REAL fact of the target product formatted the same way.
- Never use the template's brand name in replacements.${input.brandName ? ` The advertiser brand is "${input.brandName}".` : ''}`,
			},
			{
				role: 'user',
				content: [
					{ type: 'text', text: `Target product: ${input.productName}. Verified facts: ${input.productFacts || 'Only the product photo is available.'}` },
					{ type: 'text', text: 'TEMPLATE:' },
					{ type: 'image_url', image_url: { url: `data:${input.referenceMime};base64,${input.referenceB64}` } },
					{ type: 'text', text: 'REAL PRODUCT PHOTO:' },
					{ type: 'image_url', image_url: { url: `data:${input.productMime};base64,${input.productB64}` } },
				],
			},
		],
	});
	const parsed = JSON.parse(response.choices[0]?.message?.content || 'null');
	if (!parsed || !Array.isArray(parsed.textZones) || !parsed.textZones.length) return null;
	return parsed as LayoutAnalysis;
}

// Prompt corto y sin contradicciones para el modo "Fiel al ganador":
// el modelo edita la referencia reemplazando SOLO producto, textos y marca.
function buildReferenceClonePrompt(input: {
	productNames: string[];
	brandName: string;
	hasLogo: boolean;
	brief: string;
	analysis?: LayoutAnalysis | null;
	adCopy?: {
		headline?: string;
		subheadline?: string;
		reviewText?: string;
		cta?: string;
		language?: string;
	};
}) {
	const language = (input.analysis?.language || input.adCopy?.language) === 'en' ? 'American English' : 'Argentine Spanish';
	const productLabel = input.productNames.length ? input.productNames.join(' + ') : 'the real product supplied by the user';

	// Zonas de texto: del análisis de visión (ideal) o del copy plano de fallback.
	const zones = (input.analysis?.textZones || []).filter((zone) =>
		input.analysis?.productHasPackaging ? true : !zone.onProduct);
	const droppedOnProduct = (input.analysis?.textZones?.length || 0) - zones.length;
	let textSwap = '';
	if (zones.length) {
		textSwap = zones.map((zone, index) => `${index + 1}. [${zone.where}] Replace "${zone.original}" with "${zone.replacement}"`).join('\n');
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
	const packagingRule = input.analysis && !input.analysis.productHasPackaging
		? `\nCRITICAL: the real product has NO printed packaging. Its surface must stay completely clean — do NOT print any words, logos, badges, spec bubbles or graphics on the product itself.${droppedOnProduct > 0 ? " The template's on-package texts are intentionally omitted; do not recreate or relocate them." : ''} All copy lives only in the ad layout's text zones.`
		: '';

	return `The first input image is a WINNING AD TEMPLATE. Recreate this exact advertisement, keeping its layout, composition, background, color palette, graphic devices (badges, stars, speech bubbles, banners, buttons), text block positions and typographic hierarchy visually identical to the template. Apply ONLY these replacements:

1. PRODUCT SWAP — Completely remove the template's original product. In its place${placement} render the real product shown in the other input image(s): ${productLabel}. RE-RENDER the product as a professional studio hero shot fully integrated into the scene: give it real volume and dimension, adapt its angle, perspective and lighting to match the template's product treatment, ground it with a soft contact shadow, and let it overlap the surrounding elements exactly like the template's product does. Never show it as a flat cut-out pasted on top, and never replace it with a generic product. Match the product photo's exact shape, colors and texture — it must look premium, tactile and desirable.${packagingRule}

2. TEXT SWAP — Replace the template's wording with this exact copy, written in natural ${language}, placing each text in the same position, size and style as the template text it replaces. Every zone listed MUST contain its text — never leave a badge, pill or button empty:
${textSwap || `- Adapt every template text block honestly to ${productLabel}, in natural ${language}, keeping the same message structure.`}
If a template text block has no replacement listed, adapt its message honestly to the new product. Do not invent prices, percentages, reviews, certifications or claims. Render all text sharp, correctly spelled, no gibberish or distorted words.

3. BRAND SWAP — Remove the template's original brand names and logos. ${input.hasLogo ? 'Place the provided brand logo (last input image) once, where the template shows its brand.' : input.brandName ? `If the template displays a brand name, use "${input.brandName}" as a simple wordmark.` : 'Leave the brand area clean if there is no replacement.'}

Do not change the background color or palette. Do not add new elements. Do not include watermarks or platform UI. The final image must look like the same ad campaign as the template, now selling ${productLabel}.

USER DIRECTION
${input.brief || 'None.'}`;
}

async function fileToOpenAI(file: File, fallbackName: string) {
	const bytes = Buffer.from(await file.arrayBuffer());
	return toFile(bytes, file.name || fallbackName, { type: file.type || 'image/png' });
}

async function blobToOpenAI(blob: Blob, fallbackName: string) {
	return toFile(Buffer.from(await blob.arrayBuffer()), fallbackName, { type: blob.type || 'image/png' });
}

// La API de imágenes de OpenAI solo decodifica PNG/JPEG de forma confiable
// (p. ej. rechaza WebP VP8X con "Invalid image file or mode"). Todo input
// pasa por acá: PNG/JPEG siguen igual, el resto se recodifica a PNG.
async function normalizeImageInput(buffer: Buffer): Promise<{ buffer: Buffer; type: string } | null> {
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

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const openAIKey = import.meta.env.OPENAI_API_KEY;
	if (!openAIKey) return json({ error: 'Falta configurar OPENAI_API_KEY.', requiresConfiguration: true }, 503);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	let generationIds: string[] = [];
	const completedIds = new Set<string>();
	let reservedCount = 0;

	try {
		const form = await request.formData();
		const templateId = Number(clean(form.get('templateId'), 4));
		const requestedTemplateName = clean(form.get('templateName'), 80);
		const preset = clean(form.get('preset'), 40) || 'Fiel al ganador';
		const brief = clean(form.get('brief'), 600);
		const requestedFormat = clean(form.get('format'), 20) || 'square';
		const format = formats.has(requestedFormat) ? requestedFormat as keyof typeof formatSizes : 'square';
		const requestedImageType = clean(form.get('imageType'), 30) || 'product';
		const imageType = imageTypes.has(requestedImageType) ? requestedImageType : 'product';
		const referenceId = clean(form.get('referenceId'), 60);
		const referencePath = clean(form.get('referencePath'), 300);
		const templateNotes = clean(form.get('templateNotes'), 500);
		const sourceGenerationId = clean(form.get('sourceGenerationId'), 60);
		const requestedFidelity = Number(clean(form.get('fidelity'), 2) || 1);
		const fidelity = [1, 2, 3].includes(requestedFidelity) ? requestedFidelity : 1;
		const requestedVariationStrength = clean(form.get('variationStrength'), 20) || 'exact';
		const variationStrength = variationStrengths.has(requestedVariationStrength) ? requestedVariationStrength : 'exact';
		const productIds = uniqueIds([
			...form.getAll('productIds').filter((value): value is string => typeof value === 'string'),
			clean(form.get('productId'), 60),
		]);
		const requestedCount = Number(clean(form.get('count'), 1) || 1);
		const count = sourceGenerationId ? 1 : requestedCount;
		const product = form.get('product');
		const logo = form.get('logo');

		if (!Number.isInteger(templateId) || templateId < 1) return json({ error: 'El creativo elegido no es válido.' }, 400);
		// Relaxed validation: accept any path matching the known scraped format (numberPrefix/16hexchars.ext)
		if (referencePath && !/^[0-9]+\/[a-f0-9]{8,}\.(png|jpe?g|webp|avif)$/i.test(referencePath)) return json({ error: 'La ruta de referencia no es válida.' }, 400);
		if (!Number.isInteger(count) || count < 1 || count > 4) return json({ error: 'Elegí entre 1 y 4 imágenes.' }, 400);
		if (productIds.length > 5) return json({ error: 'Podés usar hasta 5 productos en una imagen.' }, 400);
		if (product instanceof File && product.size > 15 * 1024 * 1024) return json({ error: 'La imagen del producto supera los 15 MB.' }, 413);
		if (logo instanceof File && logo.size > 10 * 1024 * 1024) return json({ error: 'El logo supera los 10 MB.' }, 413);
		if (product instanceof File && product.size > 0 && !acceptedInputTypes.has(product.type)) return json({ error: 'La foto del producto debe ser PNG, JPG, WebP o AVIF.' }, 415);
		if (logo instanceof File && logo.size > 0 && !acceptedInputTypes.has(logo.type)) return json({ error: 'El logo debe ser PNG, JPG, WebP o AVIF.' }, 415);

		const { data: template, error: templateError } = await admin.from('creative_templates')
			.select('id,name,purpose,usage_hint').eq('id', templateId).eq('is_active', true).maybeSingle();
		if (templateError) throw templateError;
		// Fall back gracefully when template is from the winners library (not in Supabase catalog)
		const templateName = template?.name || requestedTemplateName || 'Anuncio Ganador';
		const templatePurpose = template?.purpose || 'Crear un anuncio de alto rendimiento inspirado en el diseño de referencia';
		const templateUsageHint = template?.usage_hint || 'Usar cuando se quiere replicar el estilo de un anuncio probado';

		const { data: profile, error: profileError } = await admin.from('creative_profiles')
			.select('brand_name,website_url,instagram_handle,brand_colors,logo_path,brand_summary,brand_voice,target_audience,brand_style')
			.eq('user_id', auth.user.id).maybeSingle();
		if (profileError) throw profileError;
		const brandStyle: any = profile?.brand_style || null;

		let storedProducts: any[] = [];
		const productImagesById = new Map<string, Array<{ storage_path: string; sort_order: number }>>();
		if (productIds.length) {
			const { data, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,source_image_url,analysis')
				.in('id', productIds).eq('user_id', auth.user.id).eq('is_active', true);
			if (error) throw error;
			if ((data || []).length !== productIds.length) return json({ error: 'Uno de los productos ya no existe o no pertenece a tu cuenta.' }, 400);
			const byId = new Map((data || []).map((item) => [item.id, item]));
			storedProducts = productIds.map((id) => byId.get(id));
			const { data: productImageRows, error: productImageError } = await admin.from('creative_product_images')
				.select('product_id,storage_path,sort_order').eq('user_id', auth.user.id).in('product_id', productIds).order('sort_order');
			if (productImageError) throw productImageError;
			for (const row of productImageRows || []) {
				const current = productImagesById.get(row.product_id) || [];
				current.push(row); productImagesById.set(row.product_id, current);
			}
		}
		// Allow generation without product when a reference image is provided (winner library mode)
		const hasReferenceOrSource = !!(referencePath || sourceGenerationId);
		if (imageType !== 'promotion' && !hasReferenceOrSource && !storedProducts.length && !(product instanceof File && product.size > 0)) {
			return json({ error: 'Elegí al menos un producto para este tipo de imagen, o seleccioná un anuncio de referencia.' }, 400);
		}

		let sourceGeneration: { id: string; output_path: string; product_id: string | null } | null = null;
		if (sourceGenerationId) {
			const { data, error } = await admin.from('creative_generations').select('id,output_path,product_id')
				.eq('id', sourceGenerationId).eq('user_id', auth.user.id).eq('status', 'completed').maybeSingle();
			if (error) throw error;
			if (!data?.output_path) return json({ error: 'La imagen de referencia no está disponible.' }, 400);
			sourceGeneration = data;
		}

		let storedReference: { id: string | null; image_path: string } | null = referencePath && !sourceGeneration ? { id: null, image_path: referencePath } : null;
		if (referenceId && !sourceGeneration) {
			const { data, error } = await admin.from('creative_references').select('id,image_path')
				.eq('id', referenceId).eq('template_id', templateId).eq('is_active', true)
				.in('rights_status', ['owned', 'licensed', 'public_domain']).maybeSingle();
			if (error) throw error;
			if (!data) return json({ error: 'La referencia no está disponible o todavía no tiene derechos verificados.' }, 400);
			storedReference = data;
		}

		const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze');
		let remaining = 99999;

		if (!isAdmin) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: auth.user.id,
				p_amount: count,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) return json({ error: `Necesitás ${count} ${count === 1 ? 'crédito' : 'créditos'} para esta generación.`, code: 'NO_CREDITS' }, 402);
			remaining = Number(reserveRes);
			reservedCount = count;
		}

		const batchId = crypto.randomUUID();
		const generationRows = Array.from({ length: count }, (_, index) => ({
			user_id: auth.user!.id,
			template_id: templateId,
			reference_id: storedReference?.id || null,
			title: templateName,
			format,
			image_type: imageType,
			variant_key: preset,
			product_id: storedProducts[0]?.id || null,
			user_brief: brief || null,
			batch_id: batchId,
			output_index: index + 1,
			requested_outputs: count,
			settings_snapshot: {
				format, imageType, preset, productIds, productNames: storedProducts.map((item) => item.name),
				sourceGenerationId: sourceGeneration?.id || null,
				variationStrength: sourceGeneration ? variationStrength : null,
			},
			status: 'processing',
		}));
		const { data: generations, error: insertError } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index');
		if (insertError) throw insertError;
		const orderedGenerations = (generations || []).sort((a, b) => a.output_index - b.output_index);
		generationIds = orderedGenerations.map((item) => item.id);
		if (generationIds.length !== count) throw new Error('No se pudo preparar el lote completo.');

		if (storedProducts.length) {
			const joinRows = generationIds.flatMap((generationId) => storedProducts.map((item, index) => ({
				generation_id: generationId,
				product_id: item.id,
				user_id: auth.user!.id,
				sort_order: index,
			})));
			const { error } = await admin.from('creative_generation_products').insert(joinRows);
			if (error) throw error;
		}

		// ── Pipeline asíncrono ──────────────────────────────────────────────
		// La respuesta vuelve al instante con el batchId; el trabajo pesado
		// (análisis, copy, generación, upload) sigue en background con waitUntil.
		// El frontend sigue el progreso leyendo creative_generations por batch_id.
		const runPipeline = async () => {
		const inputs: Awaited<ReturnType<typeof fileToOpenAI>>[] = [];
		const inputImageMap: string[] = [];
		let hasReference = false;
		let hasSourceGeneration = false;
		let referenceBuffer: Buffer | null = null;
		let referenceMime = 'image/png';
		if (sourceGeneration?.output_path) {
			const { data: sourceBlob, error } = await admin.storage.from('creative-assets').download(sourceGeneration.output_path);
			if (error || !sourceBlob) throw error || new Error('No se pudo recuperar la imagen de referencia.');
			inputs.push(await blobToOpenAI(sourceBlob, 'source-generation.png'));
			inputImageMap.push('the previously generated ad to revise; this is the master composition reference');
			hasReference = true;
			hasSourceGeneration = true;
		} else if (storedReference?.image_path) {
			const { data: referenceBlob, error } = await admin.storage.from('creative-references').download(storedReference.image_path);
			if (error || !referenceBlob) throw error || new Error('No se pudo recuperar la referencia.');
			const normalizedReference = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
			if (!normalizedReference) throw new Error('La imagen de referencia no se pudo procesar.');
			referenceBuffer = normalizedReference.buffer;
			referenceMime = normalizedReference.type;
			inputs.push(await toFile(referenceBuffer, 'reference.png', { type: referenceMime }));
			inputImageMap.push('the curated ad reference; use its selling structure and composition, never its original product identity');
			hasReference = true;
		}

		const productInputPlan: Array<{ product: any; path: string; photoIndex: number }> = [];
		for (const storedProduct of storedProducts) {
			const paths = [...new Set([
				storedProduct.image_path,
				...(productImagesById.get(storedProduct.id) || []).map((row) => row.storage_path),
			].filter(Boolean) as string[])];
			if (!paths.length) throw new Error(`${storedProduct.name} todavía no tiene una foto disponible.`);
			productInputPlan.push({ product: storedProduct, path: paths[0], photoIndex: 1 });
		}
		for (const storedProduct of storedProducts) {
			if (productInputPlan.length >= 8) break;
			const paths = [...new Set([
				storedProduct.image_path,
				...(productImagesById.get(storedProduct.id) || []).map((row) => row.storage_path),
			].filter(Boolean) as string[])];
			for (let index = 1; index < Math.min(paths.length, 3) && productInputPlan.length < 8; index += 1) {
				productInputPlan.push({ product: storedProduct, path: paths[index], photoIndex: index + 1 });
			}
		}
		let primaryProductBuffer: Buffer | null = null;
		let primaryProductMime = 'image/png';
		for (const item of productInputPlan) {
			const { data: productBlob, error } = await admin.storage.from('creative-assets').download(item.path);
			if (error || !productBlob) throw error || new Error(`No se pudo recuperar una foto de ${item.product.name}.`);
			const normalized = await normalizeImageInput(Buffer.from(await productBlob.arrayBuffer()));
			if (!normalized) continue; // foto ilegible: no puede tumbar la generación
			if (!primaryProductBuffer) {
				primaryProductBuffer = normalized.buffer;
				primaryProductMime = normalized.type;
			}
			inputs.push(await toFile(normalized.buffer, `product-${item.product.id}-${item.photoIndex}.png`, { type: normalized.type }));
			inputImageMap.push(`verified photo ${item.photoIndex} of the real product “${item.product.name}”; preserve packaging, label, shape and color`);
		}
		if (!storedProducts.length && product instanceof File && product.size > 0) {
			const normalized = await normalizeImageInput(Buffer.from(await product.arrayBuffer()));
			if (!normalized) throw new Error('La foto del producto no se pudo procesar. Probá con otra imagen.');
			primaryProductBuffer = normalized.buffer;
			primaryProductMime = normalized.type;
			inputs.push(await toFile(normalized.buffer, 'product.png', { type: normalized.type }));
			inputImageMap.push('the real product supplied by the user; preserve its packaging, label, shape and color');
		}

		let hasUploadedProduct = false;
		if (!storedProducts.length && product instanceof File && product.size > 0) hasUploadedProduct = true;

		let hasLogo = false;
		if (logo instanceof File && logo.size > 0) {
			const normalized = await normalizeImageInput(Buffer.from(await logo.arrayBuffer()));
			if (normalized) {
				inputs.push(await toFile(normalized.buffer, 'logo.png', { type: normalized.type }));
				inputImageMap.push('the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		} else if (profile?.logo_path) {
			const { data: logoBlob } = await admin.storage.from('creative-assets').download(profile.logo_path);
			const normalized = logoBlob ? await normalizeImageInput(Buffer.from(await logoBlob.arrayBuffer())) : null;
			// Un logo ilegible se omite: nunca puede tumbar la generación entera.
			if (normalized) {
				inputs.push(await toFile(normalized.buffer, 'logo.png', { type: normalized.type }));
				inputImageMap.push('the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		}

		const useClonePrompt = hasReference && !hasSourceGeneration && fidelity === 1
			&& (storedProducts.length > 0 || hasUploadedProduct);

		// Análisis de layout con visión: enumera cada zona de texto del ganador
		// con su reemplazo y cómo presentar el producto. Es la base del prompt clon.
		let layoutAnalysis: LayoutAnalysis | null = null;
		if (useClonePrompt && referenceBuffer && primaryProductBuffer) {
			try {
				const productFacts = storedProducts.length
					? [storedProducts[0].description, storedProducts[0].price_text && `${storedProducts[0].price_text} ${storedProducts[0].currency || ''}`, storedProducts[0].analysis?.category].filter(Boolean).join(' · ')
					: brief;
				layoutAnalysis = await analyzeReferenceLayout(new OpenAI({ apiKey: openAIKey }), {
					referenceB64: referenceBuffer.toString('base64'),
					referenceMime,
					productB64: primaryProductBuffer.toString('base64'),
					productMime: primaryProductMime,
					productName: storedProducts[0]?.name || 'the product in the supplied photo',
					productFacts,
					brandName: profile?.brand_name || clean(form.get('brandName'), 80),
				});
			} catch (analysisErr) {
				console.error('Layout analysis failed, falling back to flat ad copy:', analysisErr);
			}
		}

		let adCopy: any = undefined;
		const groqApiKey = process.env.GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
		if (!layoutAnalysis && groqApiKey && storedProducts.length > 0) {
			try {
				const groqClient = new OpenAI({
					apiKey: groqApiKey,
					baseURL: 'https://api.groq.com/openai/v1',
				});
				const response = await groqClient.chat.completions.create({
					model: 'llama-3.3-70b-versatile',
					messages: [
						{
							role: 'system',
							content: 'Sos un redactor publicitario experto (copywriter) para anuncios de performance en e-commerce. Tu tarea es generar copys cortos y persuasivos. Debes detectar el idioma del producto: si está en inglés, generá todo en inglés; si está en español, generá todo en español de Argentina.'
						},
						{
							role: 'user',
							content: `Generá los textos publicitarios para el producto "${storedProducts[0].name}".
                
Descripción del producto: ${storedProducts[0].description || ''}

Debes imitar el estilo del anuncio de referencia:
- Nombre de referencia: ${templateName}
- Notas del anuncio de referencia: ${templateNotes || 'Diseño limpio y moderno'}
- Propósito del anuncio: ${templatePurpose}

Respondé SOLO con un objeto JSON válido con esta estructura exacta:
{
  "headline": "título principal en el mismo idioma detectado (mayúsculas, máx 6 palabras)",
  "subheadline": "subtítulo o beneficio corto en el mismo idioma",
  "reviewText": "texto del testimonio de cliente en el mismo idioma (máx 15 palabras)",
  "cta": "texto de acción corto en el mismo idioma",
  "language": "código del idioma detectado ('en' o 'es')"
}`
						}
					],
					response_format: { type: 'json_object' },
					max_tokens: 300,
				});
				adCopy = JSON.parse(response.choices[0]?.message?.content || '{}');
			} catch (copyErr) {
				console.error('Error generating ad copy via Groq:', copyErr);
			}
		}

		const prompt = useClonePrompt ? buildReferenceClonePrompt({
			productNames: storedProducts.map((item) => item.name),
			brandName: profile?.brand_name || clean(form.get('brandName'), 80),
			hasLogo,
			brief,
			analysis: layoutAnalysis,
			adCopy,
		}) : buildPrompt({
			templateName,
			purpose: templatePurpose,
			usageHint: templateUsageHint,
			preset,
			brandName: profile?.brand_name || clean(form.get('brandName'), 80),
			website: profile?.website_url || clean(form.get('website'), 300),
			instagram: profile?.instagram_handle || clean(form.get('instagram'), 300),
			colors: Array.isArray(profile?.brand_colors) ? profile.brand_colors.join(', ') : clean(form.get('colors'), 80),
			brandSummary: profile?.brand_summary || '',
			brandVoice: profile?.brand_voice || '',
			targetAudience: profile?.target_audience || '',
			typography: brandStyle?.typography
				? [brandStyle.typography.headings && `Headings: ${brandStyle.typography.headings}`, brandStyle.typography.body && `Body: ${brandStyle.typography.body}`].filter(Boolean).join(' · ')
				: '',
			styleSummary: brandStyle?.styleSummary || '',
			brandPersonality: brandStyle?.brandPersonality || '',
			products: storedProducts.map((item) => ({
				name: item.name,
				description: [item.description, item.price_text && `${item.price_text} ${item.currency || ''}`, item.analysis?.category].filter(Boolean).join(' · '),
			})),
			imageType,
			brief,
			format,
			hasLogo,
			hasReference,
			hasSourceGeneration,
			hasUploadedProduct,
			variationStrength,
			replaceProduct: Boolean(hasSourceGeneration && sourceGeneration?.product_id !== (storedProducts[0]?.id || null)),
			inputImageMap,
			adCopy,
		});
		const { error: promptUpdateError } = await admin.from('creative_generations').update({ prompt }).in('id', generationIds);
		if (promptUpdateError) throw promptUpdateError;

		// ── Image generation ────────────────────────────────────────────────
		// Primary: OpenAI (modelo de OPENAI_IMAGE_MODEL, default gpt-image-1)
		// Fallback: Flux via Fal.ai
		const falKey: string | undefined = process.env.FAL_KEY || (typeof import.meta.env !== 'undefined' && import.meta.env.FAL_KEY);

		// Collect all output images as raw buffers
		const outputBuffers: Buffer[] = [];

		if (openAIKey) {
			// Cuando hay imágenes de input (referencia ganadora, fotos del producto, logo)
			// usamos images.edit para que el modelo VEA las imágenes reales.
			const openai = new OpenAI({ apiKey: openAIKey });
			const preferredModel = import.meta.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
			const requestedSize = formatSizes[format] || '1024x1024';
			// Si el modelo configurado falla (p. ej. la key no lo soporta), reintentar con gpt-image-1.
			const attemptModels = [...new Set([preferredModel, 'gpt-image-1'])];
			let openaiError: any = null;

			for (const model of attemptModels) {
				const size = model === 'gpt-image-1' ? snapSizeForGptImage1(requestedSize) : requestedSize;
				try {
					const useEdit = inputs.length > 0;
					const editParams: Record<string, unknown> = { model, image: inputs, prompt, size, quality: 'high', n: count };
					// input_fidelity solo existe en gpt-image-1; gpt-image-2 lo trae nativo.
					if (model === 'gpt-image-1') editParams.input_fidelity = 'high';
					const result = useEdit
						? await openai.images.edit(editParams as any)
						: await openai.images.generate({ model, prompt, size: size as any, quality: 'high', n: count });

					const outputs = (result.data || []).flatMap((item) => item.b64_json ? [item.b64_json] : []);
					if (!outputs.length) {
						const urls = (result.data || []).flatMap((item) => item.url ? [item.url] : []);
						if (!urls.length) throw new Error('La API de OpenAI no devolvió ninguna imagen.');
						for (const url of urls) {
							const imgRes = await fetch(url);
							if (!imgRes.ok) throw new Error('No se pudo descargar la imagen de OpenAI.');
							outputBuffers.push(Buffer.from(await imgRes.arrayBuffer()));
						}
					} else {
						for (const b64 of outputs) {
							outputBuffers.push(Buffer.from(b64, 'base64'));
						}
					}
					openaiError = null;
					break;
				} catch (openaiErr: any) {
					openaiError = openaiErr;
					console.error(`OpenAI generation failed with ${model}:`, openaiErr);
				}
			}

			// Si OpenAI falló, NO caer a Flux: con anuncios cargados de texto genera
			// resultados ilegibles. Mejor error claro + créditos devueltos.
			if (openaiError) throw openaiError;
		} else if (falKey) {
			await runFalFallback();
		} else {
			throw new Error('No hay ninguna API de generación de imágenes configurada (FAL_KEY o OPENAI_API_KEY).');
		}

		async function runFalFallback() {
			// Build image_url for Fal (base64 data URL of the reference template image, if any)
			let falImageUrl: string | undefined;
			let falImageStrength = 0.85;

			if (inputs.length > 0) {
				// inputs[0] is the reference template image
				const buf = Buffer.from(await (inputs[0] as any).arrayBuffer());
				falImageUrl = `data:image/png;base64,${buf.toString('base64')}`;
				falImageStrength = 0.65;
			}

			const [falWidth, falHeight] = (formatSizes[format] || '1024x1024').split('x').map(Number);
			const falModel = falImageUrl
				? 'fal-ai/flux/dev/image-to-image'
				: 'fal-ai/flux/schnell';

			const falBody: Record<string, unknown> = {
				prompt,
				num_images: count,
				output_format: 'png',
				width: falWidth,
				height: falHeight,
			};
			if (falImageUrl) {
				falBody.image_url = falImageUrl;
				falBody.strength = falImageStrength;
			}

			const falRes = await fetch(`https://fal.run/${falModel}`, {
				method: 'POST',
				headers: {
					'Authorization': `Key ${falKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(falBody),
			});

			if (!falRes.ok) {
				const errText = await falRes.text().catch(() => '');
				if (falRes.status === 403 && errText.includes('Exhausted balance')) {
					throw new Error('Tu saldo de Fal.ai se agotó. Recargá en fal.ai/dashboard/billing.');
				}
				throw new Error(`Error al generar la imagen (${falRes.status}).`);
			}

			const falData: any = await falRes.json();
			const falImages: Array<{ url: string }> = falData.images || [];
			if (!falImages.length) throw new Error('Fal.ai no devolvió ninguna imagen.');

			for (const img of falImages.slice(0, count)) {
				const imgRes = await fetch(img.url);
				if (!imgRes.ok) throw new Error('No se pudo descargar la imagen generada.');
				outputBuffers.push(Buffer.from(await imgRes.arrayBuffer()));
			}
		}

		if (!outputBuffers.length) throw new Error('No se generaron imágenes.');

		const responseGenerations: Array<{ id: string; imageUrl: string; outputIndex: number; batchId: string }> = [];
		for (let index = 0; index < Math.min(outputBuffers.length, generationIds.length); index += 1) {
			const generationId = generationIds[index];
			const outputPath = `${auth.user!.id}/generations/${batchId}/${index + 1}.png`;
			const { error: uploadError } = await admin.storage.from('creative-assets').upload(
				outputPath,
				outputBuffers[index],
				{ contentType: 'image/png', upsert: false },
			);
			if (uploadError) throw uploadError;
			const { data: signed, error: signedError } = await admin.storage.from('creative-assets').createSignedUrl(outputPath, 60 * 60);
			if (signedError || !signed?.signedUrl) {
				await admin.storage.from('creative-assets').remove([outputPath]);
				throw signedError || new Error('No se pudo firmar la imagen generada.');
			}
			const { error: completionError } = await admin.from('creative_generations').update({
				status: 'completed',
				output_path: outputPath,
				completed_at: new Date().toISOString(),
			}).eq('id', generationId);
			if (completionError) {
				await admin.storage.from('creative-assets').remove([outputPath]);
				throw completionError;
			}
			completedIds.add(generationId);
			responseGenerations.push({ id: generationId, imageUrl: signed.signedUrl, outputIndex: index + 1, batchId });
		}

		const missingCount = count - responseGenerations.length;
		if (missingCount > 0) {
			const missingIds = generationIds.filter((id) => !completedIds.has(id));
			const { error: missingUpdateError } = await admin.from('creative_generations').update({
				status: 'failed',
				error_code: 'La API devolvió menos imágenes de las solicitadas.',
				completed_at: new Date().toISOString(),
			}).in('id', missingIds);
			if (missingUpdateError) throw missingUpdateError;
			if (reservedCount > 0) {
				const { error: missingRefundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user!.id, p_amount: missingCount });
				if (missingRefundError) throw missingRefundError;
				reservedCount -= missingCount;
			}
		}
		};

		const pipelinePromise = runPipeline().catch(async (error) => {
			const message = error instanceof Error ? error.message : 'No se pudo generar el creativo.';
			console.error('Generation pipeline failed:', error);
			const failedIds = generationIds.filter((id) => !completedIds.has(id));
			if (failedIds.length) {
				await admin.from('creative_generations').update({
					status: 'failed',
					error_code: message.slice(0, 160),
					completed_at: new Date().toISOString(),
				}).in('id', failedIds);
			}
			const refundAmount = Math.max(0, reservedCount - completedIds.size);
			if (refundAmount > 0) {
				const { error: refundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user!.id, p_amount: refundAmount });
				if (refundError) console.error('Credit refund also failed:', refundError);
			}
		});
		try { waitUntil(pipelinePromise); } catch { /* dev local: el server queda vivo y la promesa continúa */ }

		return json({
			async: true,
			batchId,
			generations: orderedGenerations.map((item) => ({ id: item.id, outputIndex: item.output_index, batchId })),
			creditsRemaining: isAdmin ? 99999 : remaining,
		}, 202);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo generar el creativo.';
		const failedIds = generationIds.filter((id) => !completedIds.has(id));
		if (failedIds.length) {
			await admin.from('creative_generations').update({
				status: 'failed',
				error_code: message.slice(0, 160),
				completed_at: new Date().toISOString(),
			}).in('id', failedIds);
		}
		const refundAmount = Math.max(0, reservedCount - completedIds.size);
		const { error: refundError } = refundAmount > 0
			? await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: refundAmount })
			: { error: null };
		return json({
			error: refundError
				? 'No pudimos terminar la generación ni devolver los créditos automáticamente. Contactá a soporte con el detalle.'
				: 'No pudimos terminar esta generación. Los créditos no usados fueron devueltos.',
			detail: refundError?.message || message,
		}, 500);
	}
};
