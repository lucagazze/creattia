import type { APIRoute } from 'astro';
import OpenAI, { toFile } from 'openai';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 120;

const formatSizes: Record<string, string> = {
	square: '1080x1080',
	portrait: '1080x1350',
	story: '1080x1920',
	landscape: '1350x1080',
};
const imageTypes = new Set(['product', 'promotion', 'lifestyle', 'catalog']);
const formats = new Set(Object.keys(formatSizes));
const variationStrengths = new Set(['exact', 'light', 'strong']);

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
	productName: string;
	productDescription: string;
	imageType: string;
	brief: string;
	format: string;
	hasProduct: boolean;
	hasLogo: boolean;
	hasReference: boolean;
	hasSourceGeneration: boolean;
	variationStrength: string;
	replaceProduct: boolean;
}) {
	const revisionRules: Record<string, string> = {
		exact: 'Use the first input image as the master reference. Preserve its framing, layout, hierarchy, palette, lighting, typography zones and all untouched details as closely as possible. Apply only the requested change.',
		light: 'Use the first input image as the main reference. Keep the same creative angle, recognizable layout and visual hierarchy, while allowing restrained variations in styling, spacing and supporting details.',
		strong: 'Use the first input image as strategic reference. Preserve the same creative angle and core selling logic, but create a substantially different composition, art direction and visual treatment.',
	};
	const compositionRule = input.hasSourceGeneration
		? revisionRules[input.variationStrength] || revisionRules.exact
		: input.hasReference
		? 'Use the first input image only as the proven advertising composition reference. Preserve its information hierarchy, visual rhythm and conversion logic, but do not copy trademarks, people, product identity or exact wording.'
		: 'Create a proven direct-response static ad composition with a clear information hierarchy and one dominant message.';

	return `Create a production-ready static Meta Ads creative for a real ecommerce brand.

OBJECTIVE
- Creative angle: ${input.templateName}
- Why it works: ${input.purpose}
- Best moment to use it: ${input.usageHint}
- Variation mode: ${input.preset}
- Requested image type: ${input.imageType}
- Output placement: ${input.format}

BRAND
- Brand name: ${input.brandName || 'Use a discreet generic brand lockup'}
- Website context: ${input.website || 'Not provided'}
- Instagram context: ${input.instagram || 'Not provided'}
- Brand colors: ${input.colors || '#18181b and #ffffff'}
- Verified brand summary: ${input.brandSummary || 'Not available. Use only the facts supplied below.'}
- Brand voice: ${input.brandVoice || 'Clear and direct.'}
- Target audience: ${input.targetAudience || 'Not provided.'}

SELECTED PRODUCT
- Product name: ${input.productName || 'No specific product selected'}
- Verified product information: ${input.productDescription || 'No additional verified information'}

ART DIRECTION
${compositionRule}
${input.hasSourceGeneration && input.replaceProduct ? '- Replace the product visible in the source generation with the newly selected product input. Preserve the new product shape, packaging, logo and colors accurately; do not blend both products.' : ''}
${input.hasProduct ? '- The product is provided as an input image. Preserve its real shape, packaging, logo and colors with high fidelity. Make it the correct product for this ad.' : '- No product was selected. Build a brand-level offer creative without inventing a specific packaged product.'}
${input.imageType === 'lifestyle' ? '- Create a believable lifestyle scene in which the real product remains clearly recognizable and commercially prominent.' : ''}
${input.imageType === 'catalog' ? '- Use a clean ecommerce catalog treatment: controlled lighting, precise product edges, minimal environment and premium spacing.' : ''}
${input.imageType === 'promotion' ? '- Prioritize the verified offer and brand message. A product may support the composition, but do not invent a product-specific claim.' : ''}
${input.hasLogo ? '- The last input image is the brand logo. Preserve it accurately and place it once, with comfortable clear space.' : '- Render the brand name as a simple wordmark only if needed.'}
- Write all visible copy in natural Argentine Spanish.
- Keep copy minimal, accurate and easy to read on a phone.
- Do not invent prices, percentages, reviews, certifications, deadlines or legal claims.
- Do not include Meta UI, watermarks, mock browser chrome, or explanatory labels.
- Make the final image feel designed by a senior performance creative team, not like generic AI art.

USER DIRECTION
${input.brief || (input.hasSourceGeneration ? 'No specific edit was requested. Produce another version according to the selected variation strength while preserving the verified brand and product facts.' : 'No extra direction. Choose the strongest honest headline for the angle without fabricating facts.')}`;
}

async function fileToOpenAI(file: File, fallbackName: string) {
	const bytes = Buffer.from(await file.arrayBuffer());
	return toFile(bytes, file.name || fallbackName, { type: file.type || 'image/png' });
}

async function blobToOpenAI(blob: Blob, fallbackName: string) {
	return toFile(Buffer.from(await blob.arrayBuffer()), fallbackName, { type: blob.type || 'image/png' });
}

export const POST: APIRoute = async ({ request }) => {
	const openAIKey = import.meta.env.OPENAI_API_KEY;
	if (!openAIKey) {
		return json({
			error: 'Falta configurar OPENAI_API_KEY.',
			requiresConfiguration: true,
		}, 503);
	}

	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	let generationId: string | null = null;
	let creditReserved = false;

	try {
		const form = await request.formData();
		const templateId = Number(clean(form.get('templateId'), 4));
		const requestedTemplateName = clean(form.get('templateName'), 80);
		const preset = clean(form.get('preset'), 40) || 'Fiel al ganador';
		const brief = clean(form.get('brief'), 600);
		const requestedFormat = clean(form.get('format'), 20) || 'square';
		const format = formats.has(requestedFormat) ? requestedFormat : 'square';
		const requestedImageType = clean(form.get('imageType'), 30) || 'product';
		const imageType = imageTypes.has(requestedImageType) ? requestedImageType : 'product';
		const referenceId = clean(form.get('referenceId'), 60);
		const productId = clean(form.get('productId'), 60);
		const sourceGenerationId = clean(form.get('sourceGenerationId'), 60);
		const requestedVariationStrength = clean(form.get('variationStrength'), 20) || 'exact';
		const variationStrength = variationStrengths.has(requestedVariationStrength) ? requestedVariationStrength : 'exact';
		const product = form.get('product');
		const logo = form.get('logo');

		if (!Number.isInteger(templateId) || templateId < 1) {
			return json({ error: 'El creativo elegido no es válido.' }, 400);
		}
		if (product instanceof File && product.size > 15 * 1024 * 1024) {
			return json({ error: 'La imagen del producto supera los 15 MB.' }, 413);
		}
		if (logo instanceof File && logo.size > 10 * 1024 * 1024) {
			return json({ error: 'El logo supera los 10 MB.' }, 413);
		}

		const { data: template, error: templateError } = await admin.from('creative_templates')
			.select('id,name,purpose,usage_hint')
			.eq('id', templateId).eq('is_active', true).maybeSingle();
		if (templateError) throw templateError;
		if (!template) return json({ error: 'Esta idea ya no está disponible. Elegí otra de la biblioteca.' }, 400);
		const templateName = template.name || requestedTemplateName || 'Creativo';
		const purpose = template.purpose || '';
		const usageHint = template.usage_hint || '';

		const { data: profile, error: profileError } = await admin.from('creative_profiles')
			.select('brand_name,website_url,instagram_handle,brand_colors,logo_path,brand_summary,brand_voice,target_audience')
			.eq('user_id', auth.user.id).maybeSingle();
		if (profileError) throw profileError;
		let storedProduct: any = null;
		if (productId) {
			const { data, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,source_image_url,analysis')
				.eq('id', productId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
			if (error) throw error;
			if (!data) return json({ error: 'El producto elegido no existe o no pertenece a tu cuenta.' }, 400);
			storedProduct = data;
		}
		if (imageType !== 'promotion' && !storedProduct && !(product instanceof File && product.size > 0)) {
			return json({ error: 'Elegí un producto para este tipo de imagen.' }, 400);
		}
		let sourceGeneration: { id: string; output_path: string; product_id: string | null } | null = null;
		if (sourceGenerationId) {
			const { data, error } = await admin.from('creative_generations')
				.select('id,output_path,product_id')
				.eq('id', sourceGenerationId)
				.eq('user_id', auth.user.id)
				.eq('status', 'completed')
				.maybeSingle();
			if (error) throw error;
			if (!data?.output_path) return json({ error: 'La imagen de referencia no está disponible.' }, 400);
			sourceGeneration = data;
		}

		const { data: remaining, error: creditError } = await admin.rpc('reserve_creative_credit', {
			p_user_id: auth.user.id,
		});
		if (creditError) throw creditError;
		if (remaining === -1) return json({ error: 'No te quedan créditos. Activá tu plan para seguir creando.', code: 'NO_CREDITS' }, 402);
		creditReserved = true;

		const { data: generation, error: insertError } = await admin
			.from('creative_generations')
			.insert({
				user_id: auth.user.id,
				template_id: templateId,
				title: templateName,
				format,
				image_type: imageType,
				variant_key: preset,
				product_id: storedProduct?.id || null,
				user_brief: brief || null,
				settings_snapshot: { format, imageType, preset, productId: storedProduct?.id || null, productName: storedProduct?.name || null, sourceGenerationId: sourceGeneration?.id || null, variationStrength: sourceGeneration ? variationStrength : null },
				status: 'processing',
			})
			.select('id')
			.single();
		if (insertError) throw insertError;
		generationId = generation.id;

		const inputs: Awaited<ReturnType<typeof fileToOpenAI>>[] = [];
		let hasReference = false;
		let hasSourceGeneration = false;

		if (sourceGeneration?.output_path) {
			const { data: sourceBlob, error: sourceError } = await admin.storage.from('creative-assets').download(sourceGeneration.output_path);
			if (sourceError || !sourceBlob) throw sourceError || new Error('No se pudo recuperar la imagen de referencia.');
			inputs.push(await blobToOpenAI(sourceBlob, 'source-generation.png'));
			hasReference = true;
			hasSourceGeneration = true;
		}

		if (referenceId && !hasSourceGeneration) {
			const { data: reference } = await admin
				.from('creative_references')
				.select('id,image_path')
				.eq('id', referenceId)
				.eq('template_id', templateId)
				.eq('is_active', true)
				.maybeSingle();

			if (reference?.image_path) {
				const { data: referenceBlob } = await admin.storage
					.from('creative-references')
					.download(reference.image_path);
				if (referenceBlob) {
					inputs.push(await toFile(Buffer.from(await referenceBlob.arrayBuffer()), 'reference.png', {
						type: referenceBlob.type || 'image/png',
					}));
					hasReference = true;
					await admin.from('creative_generations').update({ reference_id: reference.id }).eq('id', generationId);
				}
			}
		}

		let hasProduct = false;
		if (storedProduct?.image_path) {
			const { data: productBlob } = await admin.storage.from('creative-assets').download(storedProduct.image_path);
			if (productBlob) { inputs.push(await blobToOpenAI(productBlob, 'product.png')); hasProduct = true; }
		} else if (product instanceof File && product.size > 0) {
			inputs.push(await fileToOpenAI(product, 'product.png')); hasProduct = true;
		}
		if (imageType !== 'promotion' && storedProduct && !hasProduct) {
			throw new Error('El producto seleccionado todavía no tiene una foto disponible.');
		}

		let hasLogo = false;
		if (logo instanceof File && logo.size > 0) {
			inputs.push(await fileToOpenAI(logo, 'logo.png')); hasLogo = true;
		} else if (profile?.logo_path) {
			const { data: logoBlob } = await admin.storage.from('creative-assets').download(profile.logo_path);
			if (logoBlob) { inputs.push(await blobToOpenAI(logoBlob, 'logo.png')); hasLogo = true; }
		}

		const prompt = buildPrompt({
			templateName,
			purpose,
			usageHint,
			preset,
			brandName: profile?.brand_name || clean(form.get('brandName'), 80),
			website: profile?.website_url || clean(form.get('website'), 300),
			instagram: profile?.instagram_handle || clean(form.get('instagram'), 300),
			colors: Array.isArray(profile?.brand_colors) ? profile.brand_colors.join(', ') : clean(form.get('colors'), 80),
			brandSummary: profile?.brand_summary || '',
			brandVoice: profile?.brand_voice || '',
			targetAudience: profile?.target_audience || '',
			productName: storedProduct?.name || '',
			productDescription: [storedProduct?.description, storedProduct?.price_text && `${storedProduct.price_text} ${storedProduct.currency || ''}`, storedProduct?.analysis?.category].filter(Boolean).join(' · '),
			imageType,
			brief,
			format,
			hasProduct,
			hasLogo,
			hasReference,
			hasSourceGeneration,
			variationStrength,
			replaceProduct: Boolean(hasSourceGeneration && sourceGeneration?.product_id !== (storedProduct?.id || null)),
		});

		await admin.from('creative_generations').update({ prompt }).eq('id', generationId);

		const openai = new OpenAI({ apiKey: openAIKey });
		const model = import.meta.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
		const size = formatSizes[format] || formatSizes.square;
		const result = inputs.length
			? await openai.images.edit({ model, image: inputs, prompt, size: size as '1024x1024', quality: 'high' })
			: await openai.images.generate({ model, prompt, size: size as '1024x1024', quality: 'high' });

		const base64 = result.data?.[0]?.b64_json;
		if (!base64) throw new Error('La API no devolvió una imagen.');

		const outputBytes = Buffer.from(base64, 'base64');
		const outputPath = `${auth.user.id}/generations/${generationId}.png`;
		const { error: uploadError } = await admin.storage
			.from('creative-assets')
			.upload(outputPath, outputBytes, { contentType: 'image/png', upsert: false });
		if (uploadError) throw uploadError;

		const { data: signed, error: signedError } = await admin.storage
			.from('creative-assets')
			.createSignedUrl(outputPath, 60 * 60);
		if (signedError) throw signedError;

		await admin.from('creative_generations').update({
			status: 'completed',
			output_path: outputPath,
			completed_at: new Date().toISOString(),
		}).eq('id', generationId);

		return json({
			id: generationId,
			imageUrl: signed.signedUrl,
			creditsRemaining: remaining,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo generar el creativo.';
		if (generationId && admin) {
			await admin.from('creative_generations').update({
				status: 'failed',
				error_code: message.slice(0, 160),
				completed_at: new Date().toISOString(),
			}).eq('id', generationId);
		}
		if (creditReserved && admin) await admin.rpc('refund_creative_credit', { p_user_id: auth.user.id });
		return json({ error: 'No pudimos terminar esta generación. Tu crédito fue devuelto.', detail: message }, 500);
	}
};
