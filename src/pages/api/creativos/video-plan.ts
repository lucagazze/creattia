import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { analyzeVideoReference, createVideoPlan } from '../../../lib/creattia/video-engines';
import { normalizeImageInput } from '../../../lib/creattia/ad-analysis';
import { resolveAvatarReferences, type AvatarMode } from '../../../lib/creattia/avatar-assets';
import { analyzeFullVideoReference } from '../../../lib/creattia/video-reference';

export const prerender = false;

const ASSETS = 'creative-assets';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
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

async function downloadReferenceVideo(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.hostname !== VIDEO_REFERENCE_HOST) throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	const response = await fetch(url);
	if (!response.ok) throw new Error('No se pudo leer el video ganador.');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error('El video de referencia supera el límite de 80 MB.');
	return { buffer, type: response.headers.get('content-type')?.split(';')[0] || 'video/mp4' };
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const apiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!apiKey) return json({ error: 'Falta configurar OPENAI_API_KEY para planificar videos.', requiresConfiguration: true }, 503);
	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	if (!googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY para analizar videos.', requiresConfiguration: true }, 503);

	try {
		const form = await request.formData();
		const posterUrl = String(form.get('referencePosterUrl') || '').trim();
		const referenceVideoUrl = String(form.get('referenceVideoUrl') || '').trim();
		const referenceNotes = String(form.get('referenceScript') || '').trim().slice(0, 8000);
		const referenceDuration = String(form.get('referenceDuration') || '').trim().slice(0, 20);
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
		const referenceMode = String(form.get('referenceMode') || 'Equilibrado').trim().slice(0, 80);
		const preserveDirection = String(form.get('preserveDirection') || '').trim().slice(0, 800);
		const changeDirection = String(form.get('changeDirection') || '').trim().slice(0, 800);
		const productUsage = String(form.get('productUsage') || '').trim().slice(0, 800);
		const mustAvoid = String(form.get('mustAvoid') || '').trim().slice(0, 800);
		const rawAvatarMode = String(form.get('avatarMode') || 'original');
		const avatarMode: AvatarMode = ['original', 'saved', 'upload', 'none'].includes(rawAvatarMode) ? rawAvatarMode as AvatarMode : 'original';
		const avatarId = String(form.get('avatarId') || '').trim().slice(0, 80);
		const avatarDescription = String(form.get('avatarDescription') || '').trim().slice(0, 800);
		const avatarConsent = String(form.get('avatarConsent') || '') === 'true';
		const rawSpeechMode = String(form.get('speechMode') || 'adapt');
		const speechMode = ['adapt', 'new', 'none'].includes(rawSpeechMode) ? rawSpeechMode as 'adapt' | 'new' | 'none' : 'adapt';
		const dialogueInstructions = String(form.get('dialogueInstructions') || '').trim().slice(0, 1200);
		if (!posterUrl || !referenceVideoUrl || !productName && !productId) return json({ error: 'Completá la referencia y el producto.' }, 400);

		const poster = await downloadPoster(posterUrl);
		if (!poster) throw new Error('No se pudo procesar el fotograma de referencia.');
		let productFacts = productFactsInput;
		const productImages: Array<{ buffer: Buffer; type: string }> = [];
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
				if (blob) {
					const normalized = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
					if (normalized) productImages.push(normalized);
				}
			}
		}
		for (const uploaded of form.getAll('productImages').slice(0, Math.max(0, 5 - productImages.length))) {
			if (!(uploaded instanceof File) || uploaded.size <= 0) continue;
			if (uploaded.size > MAX_IMAGE_BYTES) return json({ error: 'Cada foto del producto puede pesar hasta 10 MB.' }, 400);
			const normalized = await normalizeImageInput(Buffer.from(await uploaded.arrayBuffer()));
			if (normalized) productImages.push(normalized);
		}
		if (!productImages.length) return json({ error: 'Elegí un producto guardado o subí al menos una foto real del producto.' }, 400);
		const avatar = await resolveAvatarReferences({
			admin,
			userId: auth.user.id,
			mode: avatarMode,
			avatarId,
			directImages: form.getAll('avatarImages'),
			directConsent: avatarConsent,
		});

		const referenceVideo = await downloadReferenceVideo(referenceVideoUrl);
		let analysis = await analyzeVideoReference({ apiKey, poster, referenceNotes, productName, brandName });
		try {
			analysis = { ...analysis, ...await analyzeFullVideoReference({ apiKey: googleKey, video: referenceVideo, referenceNotes, productName, brandName }) };
		} catch (analysisError) {
			console.warn('[video-plan] Gemini no pudo analizar el video completo; se conserva el análisis visual base:', analysisError);
		}
		const plan = await createVideoPlan({ apiKey, poster, productImages, avatarImages: avatar.images, avatarMode, avatarName: avatar.name, avatarDescription: [avatar.description, avatarDescription].filter(Boolean).join(' · '), referenceNotes, referenceDuration, productName, productFacts, brandName, objective, audience, benefit, proof, offer, cta, tone, language, duration, size, audioDirection, voiceover, captions, peopleDirection, referenceMode, preserveDirection, changeDirection, productUsage, mustAvoid, speechMode, dialogueInstructions, referenceAnalysis: analysis });
		return json({ ok: true, analysis, plan });
	} catch (error) {
		console.error('[video-plan]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo crear el plan del video.' }, 500);
	}
};
