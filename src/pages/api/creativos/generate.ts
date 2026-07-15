import type { APIRoute } from 'astro';
import OpenAI, { toFile } from 'openai';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 300;

const formatSizes = {
	square: '1024x1024',
	portrait: '1024x1280',
	story: '1008x1792',
	landscape: '1280x1024',
} as const;
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
	products: Array<{ name: string; description: string }>;
	imageType: string;
	brief: string;
	format: string;
	hasLogo: boolean;
	hasReference: boolean;
	hasSourceGeneration: boolean;
	variationStrength: string;
	replaceProduct: boolean;
	inputImageMap: string[];
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

INPUT IMAGE MAP
${input.inputImageMap.length ? input.inputImageMap.map((label, index) => `- Image ${index + 1}: ${label}`).join('\n') : '- No input images. Build from verified text context only.'}

SELECTED PRODUCTS
${productFacts}

ART DIRECTION
${compositionRule}
${input.hasSourceGeneration && input.replaceProduct ? '- Replace the product or products visible in the source generation with the selected product inputs. Do not blend old and new products.' : ''}
${input.products.length > 1 ? `- This is a multi-product creative with ${input.products.length} distinct products. Show every supplied product clearly in one intentional group shot or collection composition. Preserve the real shape, packaging, logo and colors of each one.` : ''}
${input.products.length === 1 ? '- The selected product is supplied as an input image. Preserve its real shape, packaging, logo and colors with high fidelity.' : ''}
${input.products.length === 0 ? '- Build a brand-level promotion without inventing a specific packaged product.' : ''}
${input.imageType === 'lifestyle' ? '- Create a believable lifestyle scene. Every real product must remain recognizable and commercially prominent.' : ''}
${input.imageType === 'catalog' ? '- Use a clean ecommerce catalog treatment: controlled lighting, precise product edges, minimal environment and premium spacing.' : ''}
${input.imageType === 'promotion' ? '- Prioritize the verified offer and brand message. Do not invent a product-specific claim.' : ''}
${input.hasLogo ? '- Use the image identified as the brand logo in the input map. Preserve it accurately and place it once with comfortable clear space.' : '- Render the brand name as a simple wordmark only if needed.'}
- Write all visible copy in natural Argentine Spanish.
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
		const sourceGenerationId = clean(form.get('sourceGenerationId'), 60);
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
			.select('brand_name,website_url,instagram_handle,brand_colors,logo_path,brand_summary,brand_voice,target_audience')
			.eq('user_id', auth.user.id).maybeSingle();
		if (profileError) throw profileError;

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

		const { data: remaining, error: creditError } = await admin.rpc('reserve_creative_credits', {
			p_user_id: auth.user.id,
			p_amount: count,
		});
		if (creditError) throw creditError;
		if (remaining === -1) return json({ error: `Necesitás ${count} ${count === 1 ? 'crédito' : 'créditos'} para esta generación.`, code: 'NO_CREDITS' }, 402);
		reservedCount = count;

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

		const inputs: Awaited<ReturnType<typeof fileToOpenAI>>[] = [];
		const inputImageMap: string[] = [];
		let hasReference = false;
		let hasSourceGeneration = false;
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
			inputs.push(await blobToOpenAI(referenceBlob, 'reference.png'));
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
		for (const item of productInputPlan) {
			const { data: productBlob, error } = await admin.storage.from('creative-assets').download(item.path);
			if (error || !productBlob) throw error || new Error(`No se pudo recuperar una foto de ${item.product.name}.`);
			inputs.push(await blobToOpenAI(productBlob, `product-${item.product.id}-${item.photoIndex}.png`));
			inputImageMap.push(`verified photo ${item.photoIndex} of the real product “${item.product.name}”; preserve packaging, label, shape and color`);
		}
		if (!storedProducts.length && product instanceof File && product.size > 0) {
			inputs.push(await fileToOpenAI(product, 'product.png'));
			inputImageMap.push('the real product supplied by the user; preserve its packaging, label, shape and color');
		}

		let hasLogo = false;
		if (logo instanceof File && logo.size > 0) {
			inputs.push(await fileToOpenAI(logo, 'logo.png'));
			inputImageMap.push('the official brand logo; reproduce it accurately once');
			hasLogo = true;
		} else if (profile?.logo_path) {
			const { data: logoBlob } = await admin.storage.from('creative-assets').download(profile.logo_path);
			if (logoBlob) {
				inputs.push(await blobToOpenAI(logoBlob, 'logo.png'));
				inputImageMap.push('the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		}

		const prompt = buildPrompt({
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
			variationStrength,
			replaceProduct: Boolean(hasSourceGeneration && sourceGeneration?.product_id !== (storedProducts[0]?.id || null)),
			inputImageMap,
		});
		const { error: promptUpdateError } = await admin.from('creative_generations').update({ prompt }).in('id', generationIds);
		if (promptUpdateError) throw promptUpdateError;

		// ── Image generation ────────────────────────────────────────────────
		// Primary: Flux via Fal.ai (cheapest + highest quality)
		// Fallback: OpenAI gpt-image-2
		const falKey: string | undefined = process.env.FAL_KEY || (typeof import.meta.env !== 'undefined' && import.meta.env.FAL_KEY);
		const falFormatSizes: Record<string, { width: number; height: number }> = {
			square:    { width: 1024, height: 1024 },
			portrait:  { width: 1024, height: 1280 },
			story:     { width: 1008, height: 1792 },
			landscape: { width: 1280, height: 1024 },
		};

		// Collect all output images as raw buffers
		const outputBuffers: Buffer[] = [];

		if (falKey) {
			// Build image_url for Fal (base64 data URL of the first input image, if any)
			let falImageUrl: string | undefined;
			if (inputs.length) {
				// inputs[0] is a FileLike with arrayBuffer()
				const buf = Buffer.from(await (inputs[0] as any).arrayBuffer());
				falImageUrl = `data:image/png;base64,${buf.toString('base64')}`;
			}

			const falSize = falFormatSizes[format] || falFormatSizes.square;
			const falModel = falImageUrl
				? 'fal-ai/flux/schnell/image-to-image'
				: 'fal-ai/flux/schnell';

			const falBody: Record<string, unknown> = {
				prompt,
				num_images: count,
				output_format: 'png',
				...falSize,
			};
			if (falImageUrl) {
				falBody.image_url = falImageUrl;
				falBody.strength = 0.85;
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
				// Detect out-of-balance error and show a clear user-facing message
				if (falRes.status === 403 && errText.includes('Exhausted balance')) {
					throw new Error('Tu saldo de Fal.ai se agotó. Recargá en fal.ai/dashboard/billing para continuar generando imágenes.');
				}
				throw new Error(`Error al generar la imagen (${falRes.status}). Revisá tu saldo en fal.ai/dashboard/billing.`);
			}

			const falData: any = await falRes.json();
			const falImages: Array<{ url: string }> = falData.images || [];
			if (!falImages.length) throw new Error('Fal.ai no devolvió ninguna imagen.');

			for (const img of falImages.slice(0, count)) {
				const imgRes = await fetch(img.url);
				if (!imgRes.ok) throw new Error('No se pudo descargar la imagen generada.');
				outputBuffers.push(Buffer.from(await imgRes.arrayBuffer()));
			}
		} else {
			// Fallback: OpenAI
			const openai = new OpenAI({ apiKey: openAIKey });
			const model = import.meta.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
			const size = formatSizes[format];
			const result = inputs.length
				? await openai.images.edit({ model, image: inputs, prompt, size, quality: 'high', n: count })
				: await openai.images.generate({ model, prompt, size, quality: 'high', n: count });
			const outputs = (result.data || []).flatMap((item) => item.b64_json ? [item.b64_json] : []);
			if (!outputs.length) throw new Error('La API no devolvió ninguna imagen.');
			for (const b64 of outputs) outputBuffers.push(Buffer.from(b64, 'base64'));
		}

		if (!outputBuffers.length) throw new Error('No se generaron imágenes.');

		const responseGenerations: Array<{ id: string; imageUrl: string; outputIndex: number; batchId: string }> = [];
		for (let index = 0; index < Math.min(outputBuffers.length, generationIds.length); index += 1) {
			const generationId = generationIds[index];
			const outputPath = `${auth.user.id}/generations/${batchId}/${index + 1}.png`;
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
			const { error: missingRefundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: missingCount });
			if (missingRefundError) throw missingRefundError;
			reservedCount -= missingCount;
		}

		return json({
			id: responseGenerations[0]?.id,
			imageUrl: responseGenerations[0]?.imageUrl,
			generations: responseGenerations,
			creditsRemaining: Number(remaining) + missingCount,
		});
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
