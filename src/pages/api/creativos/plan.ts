import type { APIRoute } from 'astro';
import { analyzeReferenceLayout, normalizeImageInput } from '../../../lib/creattia/ad-analysis';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { SUBJECT_MODES, usesRealProductPhotos, type SubjectMode } from '../../../lib/creattia/generation-pipeline';
import { trackEvent } from '../../../lib/creattia/events';

export const prerender = false;
export const maxDuration = 60;

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Paso previo a generar: analiza el anuncio ganador + el producto y devuelve
// la estructura visual y las áreas de imagen que se deben reconstruir antes
// de aprobar la generación.
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.' }, 503);

	// Analiza con visión aunque no gaste créditos (se cobran recién al generar):
	// sin tope se puede pedir sin límite y generar costo real.
	const withinLimit = await checkRateLimit(admin, auth.user.id, 'plan-analyze', 40, 3600);
	if (!withinLimit) return json({ error: 'Analizaste muchas referencias en poco tiempo. Esperá un rato y volvé a intentar.' }, 429);

	try {
		const form = await request.formData();
		const referencePath = clean(form.get('referencePath'), 300);
		let referencePaths: string[] = [referencePath];
		try {
			const rawReferencePaths = clean(form.get('referencePaths'), 5000);
			if (rawReferencePaths) {
				const parsedPaths = JSON.parse(rawReferencePaths);
				if (Array.isArray(parsedPaths)) referencePaths = [...new Set(parsedPaths.map((path) => String(path || '').trim()).filter(Boolean))].slice(0, 12);
			}
		} catch { /* use the individual reference */ }
		const productId = clean(form.get('productId'), 60);
		const requestedLanguage = clean(form.get('language'), 5);
		const supportedLanguages = new Set(['es', 'en', 'pt', 'it', 'fr', 'de']);
		const language = supportedLanguages.has(requestedLanguage) ? requestedLanguage : '';
		const brandSourceParam = clean(form.get('brandSource'), 10);
		const brandSource = ['url', 'mine', 'none'].includes(brandSourceParam) ? brandSourceParam : 'mine';
		const subjectModeParam = clean(form.get('subjectMode'), 12);
		const subjectMode = SUBJECT_MODES.includes(subjectModeParam as SubjectMode) ? subjectModeParam as SubjectMode : 'product';

		if (!referencePath || !referencePaths.length || !referencePaths.every((path) => /^[0-9]+\/[a-f0-9]{8,}\.(png|jpe?g|webp|avif)$/i.test(path))) {
			return json({ error: 'Elegí un anuncio ganador válido.' }, 400);
		}

		// Referencia individual o todas las páginas del carrusel.
		const normalizedReferences: Array<{ buffer: Buffer; type: string }> = [];
		for (const path of referencePaths) {
			const { data: referenceBlob, error: referenceError } = await admin.storage.from('creative-references').download(path);
			if (referenceError || !referenceBlob) return json({ error: 'No se pudo cargar una página del anuncio de referencia.' }, 404);
			const normalized = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
			if (!normalized) return json({ error: 'Una página de la referencia no se pudo procesar.' }, 422);
			normalizedReferences.push(normalized);
		}
		const normalizedReference = normalizedReferences[0];

		// Dimensiones reales para el formato "original"
		let originalRatio = '1:1';
		try {
			const sharp = (await import('sharp')).default;
			const metadata = await sharp(normalizedReference.buffer).metadata();
			if (metadata.width && metadata.height) {
				const ratio = metadata.width / metadata.height;
				originalRatio = ratio > 1.15 ? (ratio > 1.55 ? '16:9' : '4:3') : ratio < 0.87 ? (ratio < 0.64 ? '9:16' : '3:4') : '1:1';
			}
		} catch { /* sin metadata */ }

		// Producto: guardado o subido en el mismo form
		let productName = '';
		let productFacts = '';
		let productB64: string | undefined;
		let productMime: string | undefined;
		const productImages: Array<{ b64: string; mime: string }> = [];
		const productsUploaded = form.getAll('product').filter(p => p instanceof File && p.size > 0) as File[];
		let brandFromUrl: { name?: string; website?: string } | null = null;
		if (productId) {
			const { data: stored, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,analysis,metadata')
				.eq('id', productId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
			if (error) throw error;
			if (!stored) return json({ error: 'El producto elegido no existe.' }, 400);
			productName = stored.name;
			productFacts = [stored.description, stored.price_text && `${stored.price_text} ${stored.currency || ''}`, stored.analysis?.category].filter(Boolean).join(' · ');
			brandFromUrl = (stored.metadata as any)?.brandFromUrl || null;
			if (stored.image_path && usesRealProductPhotos(subjectMode)) {
				const { data: photoBlob } = await admin.storage.from('creative-assets').download(stored.image_path);
				const normalized = photoBlob ? await normalizeImageInput(Buffer.from(await photoBlob.arrayBuffer())) : null;
				if (normalized) {
					productB64 = normalized.buffer.toString('base64');
					productMime = normalized.type;
				}
			}
		} else if (productsUploaded.length > 0) {
			for (const uploaded of productsUploaded.slice(0, 5)) {
				const normalized = await normalizeImageInput(Buffer.from(await uploaded.arrayBuffer()));
				if (!normalized) continue;
				const photo = { b64: normalized.buffer.toString('base64'), mime: normalized.type };
				productImages.push(photo);
				if (!productB64) {
					productB64 = photo.b64;
					productMime = photo.mime;
				}
			}
			productName = clean(form.get('productName'), 120) || 'the product in the supplied photo';
			productFacts = clean(form.get('productFacts'), 1200);
		} else {
			productName = clean(form.get('productName'), 120);
			productFacts = clean(form.get('productFacts'), 1200);
		}
		if (!usesRealProductPhotos(subjectMode)) {
			const suppliedName = clean(form.get('productName'), 120);
			const suppliedFacts = clean(form.get('productFacts'), 1200);
			productName = suppliedName || brandFromUrl?.name || productName || 'el servicio o la marca';
			productFacts = suppliedFacts || (brandFromUrl as any)?.styleSummary || '';
		}

		const { data: profile } = await admin.from('creative_profiles')
			.select('brand_name,brand_colors,brand_style').eq('user_id', auth.user.id).maybeSingle();

		// Qué marca aparece en la imagen: la del sitio del producto, la guardada
		// en "Mi marca", o ninguna. Mismo criterio que la generación por lote.
		const effectiveBrandName = brandSource === 'mine'
			? (profile?.brand_name || '')
			: brandSource === 'url'
				? (brandFromUrl?.name || '')
				: '';
		const brandPalette = brandSource === 'url'
			? (brandFromUrl as any)?.palette || null
			: brandSource === 'mine'
				? (profile?.brand_style as any)?.palette || (Array.isArray(profile?.brand_colors) ? { accent: profile.brand_colors[0], secondary: profile.brand_colors[1], background: '#ffffff', text: '#19171d', source: 'brand' } : null)
				: null;
		const analysis = await analyzeReferenceLayout({ openAIKey, googleKey }, {
			referenceB64: normalizedReference.buffer.toString('base64'),
			referenceMime: normalizedReference.type,
			referenceSlides: normalizedReferences.map((reference) => ({ b64: reference.buffer.toString('base64'), mime: reference.type })),
			productB64,
			productMime,
			productImages,
			productName: productName || 'no specific product yet',
			productFacts,
			brandName: effectiveBrandName || clean(form.get('brandName'), 80),
			language,
			subjectMode,
			brandPalette,
		});
		if (!analysis) return json({ error: 'No pudimos analizar el anuncio. Probá de nuevo.' }, 502);

		void trackEvent(admin, 'referencia_analizada', auth.user.id, { sujeto: subjectMode, idioma: language || 'auto' });
		return json({ analysis: { ...analysis, subjectType: analysis.subjectType || subjectMode, brandPalette: analysis.brandPalette || brandPalette }, originalRatio });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo preparar el plan.' }, 500);
	}
};
