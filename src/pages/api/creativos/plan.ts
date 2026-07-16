import type { APIRoute } from 'astro';
import { analyzeReferenceLayout, normalizeImageInput, LANGUAGE_NAMES } from '../../../lib/creattia/ad-analysis';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 60;

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Paso previo a generar: analiza el anuncio ganador + el producto y devuelve
// la estrategia de mensaje y el copy propuesto POR ZONA para que el usuario
// lo revise/edite antes de aprobar la generación.
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.' }, 503);

	try {
		const form = await request.formData();
		const referencePath = clean(form.get('referencePath'), 300);
		const productId = clean(form.get('productId'), 60);
		const requestedLanguage = clean(form.get('language'), 5);
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : '';
		const product = form.get('product');

		if (!referencePath || !/^[0-9]+\/[a-f0-9]{8,}\.(png|jpe?g|webp|avif)$/i.test(referencePath)) {
			return json({ error: 'Elegí un anuncio ganador válido.' }, 400);
		}

		// Referencia
		const { data: referenceBlob, error: referenceError } = await admin.storage.from('creative-references').download(referencePath);
		if (referenceError || !referenceBlob) return json({ error: 'No se pudo cargar el anuncio de referencia.' }, 404);
		const normalizedReference = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
		if (!normalizedReference) return json({ error: 'La referencia no se pudo procesar.' }, 422);

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
		if (productId) {
			const { data: stored, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,analysis')
				.eq('id', productId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
			if (error) throw error;
			if (!stored) return json({ error: 'El producto elegido no existe.' }, 400);
			productName = stored.name;
			productFacts = [stored.description, stored.price_text && `${stored.price_text} ${stored.currency || ''}`, stored.analysis?.category].filter(Boolean).join(' · ');
			if (stored.image_path) {
				const { data: photoBlob } = await admin.storage.from('creative-assets').download(stored.image_path);
				const normalized = photoBlob ? await normalizeImageInput(Buffer.from(await photoBlob.arrayBuffer())) : null;
				if (normalized) {
					productB64 = normalized.buffer.toString('base64');
					productMime = normalized.type;
				}
			}
		} else if (product instanceof File && product.size > 0) {
			const normalized = await normalizeImageInput(Buffer.from(await product.arrayBuffer()));
			if (normalized) {
				productB64 = normalized.buffer.toString('base64');
				productMime = normalized.type;
				productName = clean(form.get('productName'), 120) || 'the product in the supplied photo';
				productFacts = clean(form.get('productFacts'), 1200);
			}
		} else {
			productName = clean(form.get('productName'), 120);
			productFacts = clean(form.get('productFacts'), 1200);
		}

		const { data: profile } = await admin.from('creative_profiles')
			.select('brand_name').eq('user_id', auth.user.id).maybeSingle();

		const analysis = await analyzeReferenceLayout({ openAIKey, googleKey }, {
			referenceB64: normalizedReference.buffer.toString('base64'),
			referenceMime: normalizedReference.type,
			productB64,
			productMime,
			productName: productName || 'no specific product yet',
			productFacts,
			brandName: profile?.brand_name || clean(form.get('brandName'), 80),
			language,
		});
		if (!analysis) return json({ error: 'No pudimos analizar el anuncio. Probá de nuevo.' }, 502);

		return json({ analysis, originalRatio });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo preparar el plan.' }, 500);
	}
};
