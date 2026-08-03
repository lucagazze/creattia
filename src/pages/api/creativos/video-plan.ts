import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { analyzeVideoReference, createVideoPlan } from '../../../lib/creattia/video-engines';
import { normalizeImageInput } from '../../../lib/creattia/ad-analysis';

export const prerender = false;

const ASSETS = 'creative-assets';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const VIDEO_REFERENCE_HOST = 'czocbnyoenjbpxmcqobn.supabase.co';

async function downloadPoster(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.hostname !== VIDEO_REFERENCE_HOST) throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	const response = await fetch(url);
	if (!response.ok) throw new Error('No se pudo leer el fotograma del video ganador.');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length > MAX_IMAGE_BYTES) throw new Error('El fotograma de referencia es demasiado grande.');
	return normalizeImageInput(buffer);
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const apiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!apiKey) return json({ error: 'Falta configurar OPENAI_API_KEY para planificar videos.', requiresConfiguration: true }, 503);

	try {
		const form = await request.formData();
		const posterUrl = String(form.get('referencePosterUrl') || '').trim();
		const referenceNotes = String(form.get('referenceScript') || '').trim().slice(0, 8000);
		const productId = String(form.get('productId') || '').trim() || null;
		let productName = String(form.get('productName') || '').trim().slice(0, 180);
		const productFactsInput = String(form.get('productFacts') || '').trim().slice(0, 3000);
		const brandName = String(form.get('brandName') || '').trim().slice(0, 120);
		const objective = String(form.get('objective') || 'Conversión').trim().slice(0, 180);
		const audience = String(form.get('audience') || '').trim().slice(0, 500);
		const benefit = String(form.get('benefit') || '').trim().slice(0, 500);
		const proof = String(form.get('proof') || '').trim().slice(0, 500);
		const offer = String(form.get('offer') || '').trim().slice(0, 300);
		const cta = String(form.get('cta') || '').trim().slice(0, 180);
		const tone = String(form.get('tone') || 'UGC premium').trim().slice(0, 180);
		const language = String(form.get('language') || 'Español rioplatense').trim().slice(0, 80);
		const duration = String(form.get('duration') || '8');
		const size = String(form.get('size') || '720x1280');
		const audioDirection = String(form.get('audioDirection') || '').trim().slice(0, 300);
		const voiceover = String(form.get('voiceover') || '').trim().slice(0, 300);
		const captions = String(form.get('captions') || '').trim().slice(0, 300);
		const peopleDirection = String(form.get('peopleDirection') || '').trim().slice(0, 400);
		if (!posterUrl || !productName && !productId) return json({ error: 'Completá la referencia y el producto.' }, 400);

		const poster = await downloadPoster(posterUrl);
		let productFacts = productFactsInput;
		let productImage: { buffer: Buffer; type: string } | undefined;
		if (productId) {
			const { data: product, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,image_path,analysis').eq('id', productId).eq('user_id', auth.user.id).maybeSingle();
			if (error) throw error;
			if (!product) return json({ error: 'El producto elegido no existe.' }, 404);
			productName = product.name || productName;
			productFacts = [product.description, product.price_text && `Precio exacto: ${product.price_text}`, product.analysis?.category].filter(Boolean).join(' · ');
			if (product.image_path) {
				const { data: blob, error: imageError } = await admin.storage.from(ASSETS).download(product.image_path);
				if (imageError) throw imageError;
				if (blob) productImage = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
			}
		} else {
			const uploaded = form.get('productImage');
			if (uploaded instanceof File && uploaded.size > 0) {
				if (uploaded.size > MAX_IMAGE_BYTES) return json({ error: 'La foto del producto no puede superar 10 MB.' }, 400);
				productImage = await normalizeImageInput(Buffer.from(await uploaded.arrayBuffer()));
			}
		}
		if (!productImage) return json({ error: 'Elegí un producto guardado o subí una foto real del producto.' }, 400);

		const analysis = await analyzeVideoReference({ apiKey, poster, referenceNotes, productName, brandName });
		const plan = await createVideoPlan({ apiKey, poster, productImage, referenceNotes, productName, productFacts, brandName, objective, audience, benefit, proof, offer, cta, tone, language, duration, size, audioDirection, voiceover, captions, peopleDirection });
		return json({ ok: true, analysis, plan });
	} catch (error) {
		console.error('[video-plan]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo crear el plan del video.' }, 500);
	}
};
