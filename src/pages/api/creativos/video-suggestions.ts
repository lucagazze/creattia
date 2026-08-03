import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { analyzeFullVideoReference, type FullVideoReferenceAnalysis } from '../../../lib/creattia/video-reference';
import { normalizeVideoSetupSuggestions } from '../../../lib/creattia/video-suggestions';

export const prerender = false;

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const VIDEO_REFERENCE_HOST = 'czocbnyoenjbpxmcqobn.supabase.co';

async function downloadReferenceVideo(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.hostname !== VIDEO_REFERENCE_HOST) throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	const response = await fetch(url);
	if (!response.ok) throw new Error('No se pudo leer el video ganador.');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error('El video de referencia supera el límite de 80 MB.');
	return { buffer, type: response.headers.get('content-type')?.split(';')[0] || 'video/mp4' };
}

function clean(value: unknown, max: number) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const withinLimit = await checkRateLimit(admin, auth.user.id, 'video-setup-suggestions', 20, 3600);
		if (!withinLimit) return json({ error: 'Analizaste muchos videos en poco tiempo. Esperá un rato y volvé a intentar.' }, 429);

		const form = await request.formData();
		const referenceVideoUrl = clean(form.get('referenceVideoUrl'), 1000);
		const referenceNotes = clean(form.get('referenceScript'), 8000);
		const productId = clean(form.get('productId'), 80);
		let productName = clean(form.get('productName'), 180);
		let productFacts = clean(form.get('productFacts'), 4000);
		let brandName = clean(form.get('brandName'), 120);
		if (!referenceVideoUrl) return json({ error: 'Falta el video ganador de referencia.' }, 400);

		if (productId) {
			const { data: product, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,product_url,analysis,metadata')
				.eq('id', productId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
			if (error) throw error;
			if (!product) return json({ error: 'El producto elegido no existe.' }, 404);
			productName = clean(product.name || productName, 180);
			brandName = brandName || clean(product.metadata?.brandFromUrl?.name, 120);
			productFacts = [
				product.description,
				product.price_text && `Precio publicado: ${product.price_text}${product.currency ? ` ${product.currency}` : ''}`,
				product.analysis?.category && `Categoría: ${product.analysis.category}`,
				product.metadata?.brandFromUrl?.styleSummary && `Estilo de marca: ${product.metadata.brandFromUrl.styleSummary}`,
				productFacts,
			].map((part) => clean(part, 1600)).filter(Boolean).join(' · ').slice(0, 4000);
		}

		if (!productName) return json({ error: 'Completá el producto antes de pedir sugerencias.' }, 400);
		const context = { productName, brandName, productFacts };
		const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
		let analysis: FullVideoReferenceAnalysis = {};
		let source: 'ai' | 'fallback' = 'fallback';

		if (googleKey) {
			try {
				const video = await downloadReferenceVideo(referenceVideoUrl);
				analysis = await analyzeFullVideoReference({ apiKey: googleKey, video, referenceNotes, productName, brandName, productFacts });
				source = 'ai';
			} catch (analysisError) {
				console.warn('[video-suggestions] no se pudo completar el análisis inteligente:', analysisError);
			}
		}

		const suggestions = normalizeVideoSetupSuggestions(analysis.creativeSuggestions, {
			...context,
			hasSpeakingPerson: analysis.hasSpeakingPerson,
			hook: analysis.hook,
		});
		analysis = { ...analysis, creativeSuggestions: suggestions };
		return json({ ok: true, source, analysis, suggestions });
	} catch (error) {
		console.error('[video-suggestions]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudieron preparar las sugerencias.' }, 500);
	}
};
