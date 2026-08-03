import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { analyzeVideoReference, buildVideoPrompt, startSoraVideo, VIDEO_CREDIT_COST, VIDEO_DURATIONS, VIDEO_MODELS, VIDEO_SIZES } from '../../../lib/creattia/video-engines';
import { normalizeImageInput } from '../../../lib/creattia/ad-analysis';

export const prerender = false;

const ASSETS = 'creative-assets';
const MAX_PRODUCT_BYTES = 10 * 1024 * 1024;
const VIDEO_REFERENCE_HOST = 'czocbnyoenjbpxmcqobn.supabase.co';

async function downloadReferencePoster(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.hostname !== VIDEO_REFERENCE_HOST) {
		throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	}
	const response = await fetch(url);
	if (!response.ok) throw new Error('No se pudo descargar el fotograma de referencia.');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length > MAX_PRODUCT_BYTES) throw new Error('El fotograma de referencia es demasiado grande.');
	return normalizeImageInput(buffer);
}

function validateReferenceVideoUrl(value: string) {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.hostname !== VIDEO_REFERENCE_HOST) {
		throw new Error('La referencia debe venir de la Biblioteca de ganadores.');
	}
	return url.toString();
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!openAIKey) return json({ error: 'Falta configurar OPENAI_API_KEY para generar videos.', requiresConfiguration: true }, 503);

	try {
		const form = await request.formData();
		const referenceVideoUrl = String(form.get('referenceVideoUrl') || '').trim();
		const referencePosterUrl = String(form.get('referencePosterUrl') || '').trim();
		const referenceScript = String(form.get('referenceScript') || '').trim().slice(0, 8000);
		const productId = String(form.get('productId') || '').trim() || null;
		const productNameInput = String(form.get('productName') || '').trim().slice(0, 180);
		const brandName = String(form.get('brandName') || '').trim().slice(0, 120);
		const brief = String(form.get('brief') || '').trim().slice(0, 1500);
		const duration = String(form.get('duration') || '8');
		const size = String(form.get('size') || '720x1280');
		const model = String(form.get('model') || process.env.OPENAI_VIDEO_MODEL || import.meta.env.OPENAI_VIDEO_MODEL || 'sora-2');

		if (!referenceVideoUrl || !referencePosterUrl) return json({ error: 'Falta la referencia de video.' }, 400);
		const trustedReferenceVideoUrl = validateReferenceVideoUrl(referenceVideoUrl);
		if (!VIDEO_DURATIONS.includes(duration as typeof VIDEO_DURATIONS[number])) return json({ error: 'Duración inválida.' }, 400);
		if (!VIDEO_SIZES.includes(size as typeof VIDEO_SIZES[number])) return json({ error: 'Formato inválido.' }, 400);
		if (!VIDEO_MODELS.includes(model as typeof VIDEO_MODELS[number])) return json({ error: 'Modelo de video inválido.' }, 400);

		const poster = await downloadReferencePoster(referencePosterUrl);
		if (!poster) return json({ error: 'No se pudo procesar el fotograma de referencia.' }, 400);

		let productName = productNameInput;
		let productFacts = '';
		let productImage: { buffer: Buffer; type: string } | null = null;
		let productRecord: any = null;

		if (productId) {
			const { data: product, error: productError } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,analysis,metadata')
				.eq('id', productId).eq('user_id', auth.user.id).maybeSingle();
			if (productError) throw productError;
			if (!product) return json({ error: 'El producto elegido no existe.' }, 404);
			productRecord = product;
			productName = product.name || productName;
			if (product.image_path) {
				const { data: blob, error: imageError } = await admin.storage.from(ASSETS).download(product.image_path);
				if (imageError) throw imageError;
				if (blob) productImage = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
			}
		} else {
			const uploaded = form.get('productImage');
			if (uploaded instanceof File && uploaded.size > 0) {
				if (uploaded.size > MAX_PRODUCT_BYTES) return json({ error: 'La foto del producto no puede superar 10 MB.' }, 400);
				productImage = await normalizeImageInput(Buffer.from(await uploaded.arrayBuffer()));
			}
		}

		if (!productName) return json({ error: 'Escribí el nombre del producto.' }, 400);
		if (!productImage) return json({ error: 'Elegí un producto guardado o subí una foto real del producto.' }, 400);

		productFacts = [
			productRecord?.description,
			productRecord?.price_text && `Precio exacto: ${productRecord.price_text}`,
			productRecord?.analysis?.category,
		].filter(Boolean).join(' · ');

		const analysis = await analyzeVideoReference({
			apiKey: openAIKey,
			poster,
			referenceNotes: referenceScript,
			productName,
			brandName,
		});
		const prompt = buildVideoPrompt({
			analysis,
			referenceNotes: referenceScript,
			productName,
			productFacts,
			brandName,
			brief,
			duration,
			size,
		});

		const { data: remaining, error: reserveError } = await admin.rpc('reserve_creative_credits', {
			p_user_id: auth.user.id,
			p_amount: VIDEO_CREDIT_COST,
		});
		if (reserveError) throw reserveError;
		if (remaining === -1) return json({ error: `Necesitás ${VIDEO_CREDIT_COST} créditos para generar un video.`, code: 'INSUFFICIENT_CREDITS' }, 402);

		let providerJob;
		try {
			providerJob = await startSoraVideo({
				apiKey: openAIKey,
				model,
				prompt,
				seconds: duration,
				size,
				product: productImage,
			});
		} catch (providerError) {
			await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: VIDEO_CREDIT_COST });
			throw providerError;
		}

		const { data: job, error: insertError } = await admin.from('creative_video_generations').insert({
			user_id: auth.user.id,
			provider: 'openai',
			provider_job_id: providerJob.id,
			status: providerJob.status === 'completed' ? 'completed' : providerJob.status === 'in_progress' ? 'in_progress' : 'queued',
			progress: providerJob.progress || 0,
			title: `${productName} · video de referencia`,
			reference_video_url: trustedReferenceVideoUrl,
			reference_poster_url: referencePosterUrl,
			reference_script: referenceScript,
			product_id: productId,
			prompt,
			model,
			duration_seconds: Number(duration),
			size,
			settings_snapshot: { brandName, brief, creditCost: VIDEO_CREDIT_COST, analysis },
		}).select('id,status,progress,title').single();
		if (insertError || !job) {
			await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: VIDEO_CREDIT_COST });
			throw insertError || new Error('No se pudo guardar el trabajo de video.');
		}

		return json({ ok: true, job, creditsRemaining: remaining, creditCost: VIDEO_CREDIT_COST });
	} catch (error) {
		console.error('[video-start]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo iniciar el video.' }, 500);
	}
};
