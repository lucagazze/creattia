import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import OpenAI, { toFile } from 'openai';
import { analyzeReferenceLayout, buildReferenceClonePrompt, normalizeImageInput, renderStudioProductShot, LANGUAGE_NAMES, type LayoutAnalysis } from '../../../lib/creattia/ad-analysis';
import { generateAdImage } from '../../../lib/creattia/image-engines';
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
const geminiAspectRatios: Record<string, string> = {
	'1:1': '1:1', '3:4': '3:4', '9:16': '9:16', '4:3': '4:3', '16:9': '16:9',
	square: '1:1', portrait: '3:4', story: '9:16', landscape: '4:3',
};

// Motor primario: Gemini image (nano-banana). ~6x más barato y ~10x más rápido
// que gpt-image en calidad alta, con excelente fidelidad de producto y texto.
const imageTypes = new Set(['product', 'promotion', 'lifestyle', 'catalog']);
// 'original' = usar la proporción del anuncio ganador de referencia
const formats = new Set([...Object.keys(formatSizes), 'original']);

// Dado un ratio ancho/alto, elegir el formato soportado más cercano.
function closestFormat(ratio: number) {
	const candidates: Array<[string, number]> = [['1:1', 1], ['3:4', 3 / 4], ['9:16', 9 / 16], ['4:3', 4 / 3], ['16:9', 16 / 9]];
	let best = '1:1';
	let bestDistance = Infinity;
	for (const [key, value] of candidates) {
		const distance = Math.abs(Math.log(ratio / value));
		if (distance < bestDistance) { bestDistance = distance; best = key; }
	}
	return best;
}
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
- PRODUCT INTEGRATION & REALISM (CRITICAL): Do NOT simply place the product image as a rigid, flat cutout with hard artificial edges. Seamlessly integrate the product into the scene with matching lighting, exposure, contrast, color temperature, and realistic shadows. If a hand is holding a product in the reference layout, the fingers must grip and wrap around the new product naturally, with realistic occlusion and contact shadows. Place the product on any surfaces with realistic contact shadows and oclusions.
${input.products.length === 0 && !input.hasUploadedProduct ? '- Build a brand-level promotion without inventing a specific packaged product.' : ''}
${input.imageType === 'lifestyle' ? '- Create a believable lifestyle scene. Every real product must remain commercially prominent.' : ''}
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



async function fileToOpenAI(file: File, fallbackName: string) {
	const bytes = Buffer.from(await file.arrayBuffer());
	return toFile(bytes, file.name || fallbackName, { type: file.type || 'image/png' });
}

async function blobToOpenAI(blob: Blob, fallbackName: string) {
	return toFile(Buffer.from(await blob.arrayBuffer()), fallbackName, { type: blob.type || 'image/png' });
}



export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.', requiresConfiguration: true }, 503);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	let generationIds: string[] = [];
	const completedIds = new Set<string>();
	let reservedCount = 0;
	let creditsPerImage = 1;

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
		// Copy aprobado por el usuario (viene del paso de plan/edición de textos):
		// si llega, se usa tal cual y se saltea el análisis.
		let approvedPlan: LayoutAnalysis | null = null;
		try {
			const rawPlan = clean(form.get('plan'), 30000);
			if (rawPlan) {
				const parsed = JSON.parse(rawPlan);
				if (parsed && Array.isArray(parsed.textZones) && parsed.textZones.length) approvedPlan = parsed;
			}
		} catch { /* plan inválido: se analiza normalmente */ }
		const requestedLanguage = clean(form.get('language'), 5);
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : '';
		const colorMode = clean(form.get('colorMode'), 10) === 'brand' ? 'brand' as const : 'winner' as const;
		const typoMode = clean(form.get('typoMode'), 10) === 'brand' ? 'brand' as const : 'winner' as const;
		const includeLogo = clean(form.get('includeLogo'), 2) !== '0';
		const brandSourceParam = clean(form.get('brandSource'), 10);
		// 'url'  → la marca del sitio de donde salió el producto
		// 'mine' → la que el usuario tiene guardada en Mi marca
		// 'none' → ninguna: el anuncio habla solo del producto
		const brandSource = ['url', 'mine', 'none'].includes(brandSourceParam) ? brandSourceParam : 'mine';
		const requestedVariationStrength = clean(form.get('variationStrength'), 20) || 'exact';
		const variationStrength = variationStrengths.has(requestedVariationStrength) ? requestedVariationStrength : 'exact';
		const productIds = uniqueIds([
			...form.getAll('productIds').filter((value): value is string => typeof value === 'string'),
			clean(form.get('productId'), 60),
		]);
		const requestedCount = Number(clean(form.get('count'), 1) || 1);
		const count = sourceGenerationId ? 1 : requestedCount;
		// Calidad: 'pro' usa el modelo Pro (mejor pero más caro) → 3 créditos por imagen; 'flash' (default) → 1.
		const quality = clean(form.get('quality'), 6) === 'pro' ? 'pro' as const : 'flash' as const;
		creditsPerImage = quality === 'pro' ? 3 : 1;
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
				.select('id,name,description,price_text,currency,image_path,source_image_url,analysis,metadata')
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

		const manualProductName = clean(form.get('productName'), 120);
		const manualProductFacts = clean(form.get('productFacts'), 1200);

		if (!storedProducts.length && manualProductName) {
			storedProducts = [{
				id: 'manual',
				name: manualProductName,
				description: manualProductFacts,
				price_text: '',
				currency: '',
				image_path: null,
				source_image_url: null,
				analysis: { category: '' }
			}];
		}
		// ── De quién es el anuncio: la marca del sitio del producto, la guardada
		// en "Mi marca", o ninguna. Se resuelve acá para no repetir profile?.x
		// en cada uso del prompt más abajo.
		const urlBrand = (storedProducts[0] as any)?.metadata?.brandFromUrl || null;
		const effectiveBrandName = brandSource === 'mine' ? (profile?.brand_name || '') : brandSource === 'url' ? (urlBrand?.name || '') : '';
		const effectiveBrandColors = brandSource === 'mine'
			? (Array.isArray(profile?.brand_colors) ? profile.brand_colors : [])
			: brandSource === 'url' ? (Array.isArray(urlBrand?.colors) ? urlBrand.colors : []) : [];
		const effectiveBrandTypography = brandSource === 'mine' ? brandStyle?.typography : brandSource === 'url' ? (urlBrand?.typography || undefined) : undefined;
		const effectiveWebsite = brandSource === 'mine' ? (profile?.website_url || '') : brandSource === 'url' ? (urlBrand?.website || '') : '';
		const effectiveInstagram = brandSource === 'mine' ? (profile?.instagram_handle || '') : '';
		const effectiveBrandSummary = brandSource === 'mine' ? (profile?.brand_summary || '') : brandSource === 'url' ? (urlBrand?.styleSummary || '') : '';
		const effectiveBrandVoice = brandSource === 'mine' ? (profile?.brand_voice || '') : '';
		const effectiveStyleSummary = brandSource === 'mine' ? (brandStyle?.styleSummary || '') : brandSource === 'url' ? (urlBrand?.styleSummary || '') : '';
		const effectiveBrandPersonality = brandSource === 'mine' ? (brandStyle?.brandPersonality || '') : '';
		const urlLogoUrl = brandSource === 'url' ? (urlBrand?.logoUrl || '') : '';

		// Allow generation without product when a reference image is provided (winner library mode)
		const hasReferenceOrSource = !!(referencePath || sourceGenerationId);
		if (imageType !== 'promotion' && !hasReferenceOrSource && !storedProducts.length && !(product instanceof File && product.size > 0)) {
			return json({ error: 'Elegí al menos un producto para este tipo de imagen, o seleccioná un anuncio de referencia.' }, 400);
		}

		let sourceGeneration: { id: string; output_path: string; product_id: string | null } | null = null;
		if (sourceGenerationId) {
			const { data, error } = await admin.from('creative_generations').select('id,output_path,product_id,settings_snapshot')
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

		const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze') || String(auth.user.email || '').toLowerCase().includes('algoritmiadesarrollos');
		let remaining = 99999;

		const creditsNeeded = count * creditsPerImage;
		if (!isAdmin) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: auth.user.id,
				p_amount: creditsNeeded,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) return json({ error: `Necesitás ${creditsNeeded} ${creditsNeeded === 1 ? 'crédito' : 'créditos'} para esta generación.`, code: 'NO_CREDITS' }, 402);
			remaining = Number(reserveRes);
			reservedCount = creditsNeeded;
		}

		const batchId = crypto.randomUUID();
		// Título visible en el historial: el nombre del producto manda; si no hay,
		// el nombre del anuncio ganador elegido; recién después el de la plantilla.
		const generationTitle = storedProducts.length
			? storedProducts.map((item) => item.name).join(' + ')
			: (requestedTemplateName || templateName);
		const generationRows = Array.from({ length: count }, (_, index) => ({
			user_id: auth.user!.id,
			template_id: templateId,
			reference_id: storedReference?.id || null,
			title: generationTitle,
			format,
			image_type: imageType,
			variant_key: preset,
			product_id: storedProducts[0]?.id && storedProducts[0].id !== 'manual' ? storedProducts[0].id : null,
			user_brief: brief || null,
			batch_id: batchId,
			output_index: index + 1,
			requested_outputs: count,
			settings_snapshot: {
				format, imageType, preset, quality, productIds, productNames: storedProducts.map((item) => item.name),
				// Las revisiones heredan el anuncio ganador de la imagen original.
				referencePath: storedReference?.image_path || (sourceGeneration as any)?.settings_snapshot?.referencePath || null,
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

		const dbProducts = storedProducts.filter(p => p.id !== 'manual');
		if (dbProducts.length) {
			const joinRows = generationIds.flatMap((generationId) => dbProducts.map((item, index) => ({
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
		const pipelineStart = Date.now();
		const stamp = (label: string) => console.log(`[gen ${batchId}] ${label} +${Date.now() - pipelineStart}ms`);
		// inputBuffers alimenta a Gemini (inline_data); inputs a OpenAI (toFile).
		const inputBuffers: Array<{ buffer: Buffer; type: string }> = [];
		const inputs: Awaited<ReturnType<typeof fileToOpenAI>>[] = [];
		const inputImageMap: string[] = [];
		const pushInput = async (buffer: Buffer, type: string, name: string, label: string) => {
			inputBuffers.push({ buffer, type });
			inputs.push(await toFile(buffer, name, { type }));
			inputImageMap.push(label);
		};
		let hasReference = false;
		let hasSourceGeneration = false;
		let referenceBuffer: Buffer | null = null;
		let referenceMime = 'image/png';
		if (sourceGeneration?.output_path) {
			const { data: sourceBlob, error } = await admin.storage.from('creative-assets').download(sourceGeneration.output_path);
			if (error || !sourceBlob) throw error || new Error('No se pudo recuperar la imagen de referencia.');
			const sourceBuf = Buffer.from(await sourceBlob.arrayBuffer());
			await pushInput(sourceBuf, sourceBlob.type || 'image/png', 'source-generation.png', 'the previously generated ad to revise; this is the master composition reference');
			referenceBuffer = sourceBuf;
			referenceMime = sourceBlob.type || 'image/png';
			hasReference = true;
			hasSourceGeneration = true;
		} else if (storedReference?.image_path) {
			const { data: referenceBlob, error } = await admin.storage.from('creative-references').download(storedReference.image_path);
			if (error || !referenceBlob) throw error || new Error('No se pudo recuperar la referencia.');
			const normalizedReference = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
			if (!normalizedReference) throw new Error('La imagen de referencia no se pudo procesar.');
			referenceBuffer = normalizedReference.buffer;
			referenceMime = normalizedReference.type;
			await pushInput(referenceBuffer, referenceMime, 'reference.png', 'the curated ad reference; use its selling structure and composition, never its original product identity');
			hasReference = true;
		}

		const productInputPlan: Array<{ product: any; path: string; photoIndex: number }> = [];
		for (const storedProduct of storedProducts) {
			if (storedProduct.id === 'manual') continue;
			const paths = [...new Set([
				storedProduct.image_path,
				...(productImagesById.get(storedProduct.id) || []).map((row) => row.storage_path),
			].filter(Boolean) as string[])];
			if (!paths.length) throw new Error(`${storedProduct.name} todavía no tiene una foto disponible.`);
			productInputPlan.push({ product: storedProduct, path: paths[0], photoIndex: 1 });
		}
		for (const storedProduct of storedProducts) {
			if (storedProduct.id === 'manual') continue;
			if (productInputPlan.length >= 8) break;
			const paths = [...new Set([
				storedProduct.image_path,
				...(productImagesById.get(storedProduct.id) || []).map((row) => row.storage_path),
			].filter(Boolean) as string[])];
			for (let index = 1; index < Math.min(paths.length, 3) && productInputPlan.length < 8; index += 1) {
				productInputPlan.push({ product: storedProduct, path: paths[index], photoIndex: index + 1 });
			}
		}
		// Revisión sutil: el usuario pidió un cambio puntual sobre una imagen ya
		// generada. Solo se manda la imagen original + el pedido; re-adjuntar
		// producto/logo/contexto hace que el modelo rediseñe todo.
		const productsUploaded = form.getAll('product').filter(p => p instanceof File && p.size > 0) as File[];
		const hasNewProductInput = productIds.length > 0 || productsUploaded.length > 0 || Boolean(manualProductName);
		const isExactRevision = hasSourceGeneration && variationStrength === 'exact' && Boolean(brief) && !hasNewProductInput;

		let primaryProductBuffer: Buffer | null = null;
		let primaryProductMime = 'image/png';
		if (!isExactRevision) for (const item of productInputPlan) {
			const { data: productBlob, error } = await admin.storage.from('creative-assets').download(item.path);
			if (error || !productBlob) throw error || new Error(`No se pudo recuperar una foto de ${item.product.name}.`);
			const normalized = await normalizeImageInput(Buffer.from(await productBlob.arrayBuffer()));
			if (!normalized) continue; // foto ilegible: no puede tumbar la generación
			if (!primaryProductBuffer) {
				primaryProductBuffer = normalized.buffer;
				primaryProductMime = normalized.type;
			}
			await pushInput(normalized.buffer, normalized.type, `product-${item.product.id}-${item.photoIndex}.png`, `verified photo ${item.photoIndex} of the real product “${item.product.name}”; preserve packaging, label, shape and color`);
		}
		if (!isExactRevision && !storedProducts.length && productsUploaded.length > 0) {
			for (let idx = 0; idx < productsUploaded.length; idx++) {
				const fileObj = productsUploaded[idx];
				const normalized = await normalizeImageInput(Buffer.from(await fileObj.arrayBuffer()));
				if (!normalized) throw new Error('La foto del producto no se pudo procesar. Probá con otra imagen.');
				if (!primaryProductBuffer) {
					primaryProductBuffer = normalized.buffer;
					primaryProductMime = normalized.type;
				}
				await pushInput(normalized.buffer, normalized.type, `product-${idx}.png`, `verified photo ${idx + 1} of the real product supplied by the user; preserve its packaging, label, shape and color`);
			}
		}

		let hasUploadedProduct = false;
		if (!storedProducts.length && productsUploaded.length > 0) hasUploadedProduct = true;

		let hasLogo = false;
		if (!includeLogo || isExactRevision || brandSource === 'none') {
			// El usuario pidió sin logo o sin marca: no se adjunta ninguno.
		} else if (logo instanceof File && logo.size > 0) {
			const normalized = await normalizeImageInput(Buffer.from(await logo.arrayBuffer()));
			if (normalized) {
				await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		} else if (brandSource === 'url' && urlLogoUrl) {
			// El logo del sitio viene como URL: se baja y se normaliza. Si sale
			// sucio o no se puede leer, se sigue sin logo antes que arruinar el aviso.
			try {
				const logoResponse = await fetch(urlLogoUrl);
				if (logoResponse.ok) {
					const raw = Buffer.from(await logoResponse.arrayBuffer());
					if (raw.length > 500 && raw.length < 4_000_000) {
						const normalized = await normalizeImageInput(raw);
						if (normalized) {
							await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
							hasLogo = true;
						}
					}
				}
			} catch (logoError) {
				console.warn('No se pudo bajar el logo del sitio:', logoError);
			}
		} else if (brandSource === 'mine' && profile?.logo_path) {
			const { data: logoBlob } = await admin.storage.from('creative-assets').download(profile.logo_path);
			const normalized = logoBlob ? await normalizeImageInput(Buffer.from(await logoBlob.arrayBuffer())) : null;
			// Un logo ilegible se omite: nunca puede tumbar la generación entera.
			if (normalized) {
				await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		}

		stamp(`inputs listos (${inputBuffers.length} imágenes)`);

		// Formato 'original': tomar la proporción real del anuncio de referencia.
		let effectiveFormat = format;
		if (format === 'original') {
			effectiveFormat = '1:1';
			if (referenceBuffer) {
				try {
					const sharp = (await import('sharp')).default;
					const metadata = await sharp(referenceBuffer).metadata();
					if (metadata.width && metadata.height) effectiveFormat = closestFormat(metadata.width / metadata.height);
				} catch { /* sin metadata: cuadrado */ }
			}
		}

		const useClonePrompt = hasReference && (!hasSourceGeneration || hasNewProductInput) && fidelity === 1
			&& (storedProducts.length > 0 || hasUploadedProduct || approvedPlan?.referenceHasProduct === false);

		// Análisis de layout con visión: enumera cada zona de texto del ganador
		// con su reemplazo y cómo presentar el producto. Es la base del prompt clon.
		// Si el usuario ya aprobó/editó los textos (plan), se usa eso directo.
		let layoutAnalysis: LayoutAnalysis | null = approvedPlan;
		if (!layoutAnalysis && useClonePrompt && referenceBuffer && primaryProductBuffer) {
			try {
				const productFacts = storedProducts.length
					? [storedProducts[0].description, storedProducts[0].price_text && `${storedProducts[0].price_text} ${storedProducts[0].currency || ''}`, storedProducts[0].analysis?.category].filter(Boolean).join(' · ')
					: brief;
				layoutAnalysis = await analyzeReferenceLayout({ openAIKey, googleKey }, {
					referenceB64: referenceBuffer.toString('base64'),
					referenceMime,
					productB64: primaryProductBuffer.toString('base64'),
					productMime: primaryProductMime,
					productName: storedProducts[0]?.name || 'the product in the supplied photo',
					productFacts,
					brandName: effectiveBrandName || clean(form.get('brandName'), 80),
					language,
				});
			} catch (analysisErr) {
				console.error('Layout analysis failed, falling back to flat ad copy:', analysisErr);
			}
		}
		stamp(`análisis de layout ${approvedPlan ? 'aprobado por el usuario' : layoutAnalysis ? 'ok' : 'sin resultado'} (${layoutAnalysis?.textZones?.length || 0} zonas)`);

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

		const revisionPrompt = `The input image is a FINISHED advertisement. Reproduce it EXACTLY — same layout, same texts, same colors, same product, same typography, same background, every single detail identical — applying ONLY this modification:

${brief}

Rules:
- Change ONLY what the modification asks. Everything else must remain pixel-faithful to the input image.
- Do not redesign, do not rewrite or move any other text, do not change the palette, the product or the composition.
- Render all text sharp and correctly spelled.
The result must look like the same image with only that one adjustment applied.`;

		const prompt = isExactRevision ? revisionPrompt : useClonePrompt ? buildReferenceClonePrompt({
			productNames: storedProducts.map((item) => item.name),
			brandName: effectiveBrandName || clean(form.get('brandName'), 80),
			hasLogo,
			brief,
			analysis: layoutAnalysis,
			languageCode: language || undefined,
			colorMode,
			typoMode,
			brandColors: effectiveBrandColors,
			brandTypography: effectiveBrandTypography,
			adCopy,
		}) : buildPrompt({
			templateName,
			purpose: templatePurpose,
			usageHint: templateUsageHint,
			preset,
			brandName: effectiveBrandName || clean(form.get('brandName'), 80),
			website: effectiveWebsite || clean(form.get('website'), 300),
			instagram: effectiveInstagram || clean(form.get('instagram'), 300),
			colors: effectiveBrandColors.length ? effectiveBrandColors.join(', ') : clean(form.get('colors'), 80),
			brandSummary: effectiveBrandSummary,
			brandVoice: effectiveBrandVoice,
			targetAudience: profile?.target_audience || '',
			typography: effectiveBrandTypography
				? [effectiveBrandTypography.headings && `Headings: ${effectiveBrandTypography.headings}`, effectiveBrandTypography.body && `Body: ${effectiveBrandTypography.body}`].filter(Boolean).join(' · ')
				: '',
			styleSummary: effectiveStyleSummary,
			brandPersonality: effectiveBrandPersonality,
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
		stamp('prompt construido y guardado');

		// ── Generación ──────────────────────────────────────────────────────
		// Mismo motor que el generador por lote: gpt-image-2 medium, con Gemini de
		// respaldo. Antes el Studio tenía su propia cadena — Gemini primero y
		// gpt-image-1 después — así que la misma referencia daba peor texto acá que
		// en el lote. Ahora las dos pantallas generan igual.
		const outputBuffers: Buffer[] = [];
		for (let index = 0; index < count; index += 1) {
			const { buffer, engine } = await generateAdImage({
				googleKey,
				openAIKey,
				prompt,
				images: inputBuffers,
				format: effectiveFormat,
				tier: quality === 'pro' ? 'high' : 'medium',
			});
			outputBuffers.push(buffer);
			stamp(`imagen ${index + 1}/${count} generada con ${engine}`);
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
		stamp(`completado: ${responseGenerations.length}/${count} imágenes subidas`);

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
				const missingRefund = missingCount * creditsPerImage;
				const { error: missingRefundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user!.id, p_amount: missingRefund });
				if (missingRefundError) throw missingRefundError;
				reservedCount -= missingRefund;
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
			const refundAmount = Math.max(0, reservedCount - completedIds.size * creditsPerImage);
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
		const refundAmount = Math.max(0, reservedCount - completedIds.size * creditsPerImage);
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
