import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { analyzeVideoReference, buildVideoPrompt, startGeminiOmniVideo, VIDEO_MODELS, VIDEO_SIZES, type VideoCreativePlan } from '../../../lib/creattia/video-engines';
import { normalizeImageInput } from '../../../lib/creattia/ad-analysis';
import { resolveAvatarReferences, type AvatarMode } from '../../../lib/creattia/avatar-assets';
import { splitVideoBuffer } from '../../../lib/creattia/video-media';
import { dialogueForSegment, isVideoOutputDuration, referenceSegmentForOutput, scenesForSegment, videoCreditCost, videoCreditCostForAccount, videoSegmentsForDuration } from '../../../lib/creattia/video-pipeline';
import { naturalFallbackDialogue, normalizeVideoProductName, sanitizeDialogueLine, stripVideoUrls } from '../../../lib/creattia/video-copy';
import { isAdminEmail } from '../../../lib/creattia/admin';
import { canAccessVideoFeature } from '../../../lib/creattia/video-access';
import { normalizeDisplayWebsite, stripWebReferences } from '../../../lib/creattia/ad-copy';

export const prerender = false;

const ASSETS = 'creative-assets';
const MAX_PRODUCT_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_VIDEO_BYTES = 100 * 1024 * 1024;
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

async function downloadReferenceVideo(value: string) {
	const trustedUrl = validateReferenceVideoUrl(value);
	const response = await fetch(trustedUrl);
	if (!response.ok) throw new Error('No se pudo descargar el video de referencia.');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!buffer.length || buffer.length > MAX_REFERENCE_VIDEO_BYTES) throw new Error('El video de referencia supera el límite de 100 MB.');
	return { url: trustedUrl, buffer, type: response.headers.get('content-type')?.split(';')[0] || 'video/mp4' };
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	if (!canAccessVideoFeature(auth.user.email)) return json({ error: 'La creación de videos todavía no está disponible.' }, 403);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const isAdmin = isAdminEmail(auth.user.email);

	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!openAIKey) return json({ error: 'Falta configurar OPENAI_API_KEY para generar videos.', requiresConfiguration: true }, 503);
	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	if (!googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY para generar videos con Gemini.', requiresConfiguration: true }, 503);

	try {
		const form = await request.formData();
		const referenceVideoUrl = String(form.get('referenceVideoUrl') || '').trim();
		const referencePosterUrl = String(form.get('referencePosterUrl') || '').trim();
		const referenceScript = String(form.get('referenceScript') || '').trim().slice(0, 8000);
		const referenceDuration = Number(form.get('referenceDuration') || 0);
		const creativePlan = (() => {
			try { return JSON.parse(String(form.get('videoPlan') || '{}')) as Partial<VideoCreativePlan>; } catch { return {}; }
		})();
		const productId = String(form.get('productId') || '').trim() || null;
		const productNameInput = String(form.get('productName') || '').trim().slice(0, 180);
		const productFactsInput = String(form.get('productFacts') || '').trim().slice(0, 3000);
		const brandName = String(form.get('brandName') || '').trim().slice(0, 120);
		const includeLogo = String(form.get('includeLogo') || '') === '1';
		const includeWebsite = String(form.get('includeWebsite') || '') === '1';
		const requestedDisplayWebsite = normalizeDisplayWebsite(form.get('displayWebsite'));
		let brief = String(form.get('brief') || '').trim().slice(0, 1500);
		if (!includeWebsite) brief = stripWebReferences(brief);
		const duration = String(form.get('duration') || '8');
		const size = String(form.get('size') || '720x1280');
		const model = String(form.get('model') || 'gemini-omni-flash-preview');
		const objective = String(form.get('objective') || '').trim().slice(0, 180);
		const audience = String(form.get('audience') || '').trim().slice(0, 500);
		const audienceReason = String(form.get('audienceReason') || '').trim().slice(0, 500);
		const audienceAlternatives = String(form.get('audienceAlternatives') || '').trim().slice(0, 1800);
		const objections = String(form.get('objections') || '').trim().slice(0, 600);
		const hookIdea = String(form.get('hookIdea') || '').trim().slice(0, 500);
		const performanceDirection = String(form.get('performanceDirection') || '').trim().slice(0, 600);
		const realismDirection = String(form.get('realismDirection') || '').trim().slice(0, 700);
		const benefit = String(form.get('benefit') || '').trim().slice(0, 500);
		const proof = String(form.get('proof') || '').trim().slice(0, 500);
		const offer = String(form.get('offer') || '').trim().slice(0, 300);
		const tone = String(form.get('tone') || '').trim().slice(0, 180);
		const language = String(form.get('language') || '').trim().slice(0, 80);
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
		const avatarDescriptionInput = String(form.get('avatarDescription') || '').trim().slice(0, 800);
		const avatarConsent = String(form.get('avatarConsent') || '') === 'true';
		const rawSpeechMode = String(form.get('speechMode') || creativePlan.speechMode || 'adapt');
		const speechMode = ['adapt', 'new', 'none'].includes(rawSpeechMode) ? rawSpeechMode as 'adapt' | 'new' | 'none' : 'adapt';
		const dialogueInstructions = String(form.get('dialogueInstructions') || '').trim().slice(0, 1200);

		if (!referenceVideoUrl || !referencePosterUrl) return json({ error: 'Falta la referencia de video.' }, 400);
		const referenceVideo = await downloadReferenceVideo(referenceVideoUrl);
		if (!isVideoOutputDuration(duration)) return json({ error: 'La duración debe estar entre 4 y 30 segundos.' }, 400);
		if (!VIDEO_SIZES.includes(size as typeof VIDEO_SIZES[number])) return json({ error: 'Formato inválido.' }, 400);
		if (!VIDEO_MODELS.includes(model as typeof VIDEO_MODELS[number])) return json({ error: 'Modelo de video inválido.' }, 400);

		const poster = await downloadReferencePoster(referencePosterUrl);
		if (!poster) return json({ error: 'No se pudo procesar el fotograma de referencia.' }, 400);

		let productName = productNameInput;
		let productFacts = productFactsInput;
		const productReferences: Array<{ buffer: Buffer; type: string }> = [];
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
				if (blob) {
					const normalized = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
					if (normalized) productReferences.push(normalized);
				}
			}
		}
		for (const uploaded of form.getAll('productImages').slice(0, Math.max(0, 5 - productReferences.length))) {
			if (!(uploaded instanceof File) || uploaded.size <= 0) continue;
			if (uploaded.size > MAX_PRODUCT_BYTES) return json({ error: 'Cada foto del producto puede pesar hasta 10 MB.' }, 400);
			const normalized = await normalizeImageInput(Buffer.from(await uploaded.arrayBuffer()));
			if (normalized) productReferences.push(normalized);
		}
		productName = normalizeVideoProductName(productName);

		if (!productName) return json({ error: 'Escribí el nombre del producto.' }, 400);
		if (!productReferences.length) return json({ error: 'Elegí un producto guardado o subí al menos una foto real del producto.' }, 400);
		const { data: brandProfile } = await admin.from('creative_profiles')
			.select('website_url,logo_path').eq('user_id', auth.user.id).maybeSingle();
		const productWebsite = (productRecord?.metadata as any)?.brandFromUrl?.website || '';
		const displayWebsite = includeWebsite
			? normalizeDisplayWebsite(requestedDisplayWebsite || productWebsite || brandProfile?.website_url)
			: '';
		let logoReference: { buffer: Buffer; type: string } | null = null;
		if (includeLogo) {
			if (!brandProfile?.logo_path) return json({ error: 'Elegiste incluir el logo, pero todavía no hay uno guardado en Mi marca.' }, 400);
			const { data: logoBlob, error: logoError } = await admin.storage.from(ASSETS).download(brandProfile.logo_path);
			if (logoError || !logoBlob) return json({ error: 'No pudimos cargar el logo guardado en Mi marca.' }, 400);
			logoReference = await normalizeImageInput(Buffer.from(await logoBlob.arrayBuffer()));
			if (!logoReference) return json({ error: 'El logo guardado no se pudo procesar. Subilo nuevamente en Mi marca.' }, 400);
		}
		const avatar = await resolveAvatarReferences({
			admin,
			userId: auth.user.id,
			mode: avatarMode,
			avatarId,
			directImages: form.getAll('avatarImages'),
			directConsent: avatarConsent,
		});
		const identityDirection = avatarMode === 'saved' || avatarMode === 'upload'
			? `Use ${avatar.name || 'the supplied avatar'} as the only person identity. Preserve facial identity and distinctive features from the avatar images throughout the video. Never copy the person from the winning reference. ${avatar.description || ''} ${avatarDescriptionInput}`
			: avatarMode === 'none'
				? 'Do not show an identifiable person. Use product shots, anonymous hands or environments only.'
				: `Create a new original person who is clearly different from the person in the winning reference video. The reference person only informs performance, framing and blocking. ${peopleDirection}`;
		const visualReferences = avatar.images.length
			? [...productReferences.slice(0, 2), ...avatar.images.slice(0, 3)]
			: productReferences.slice(0, 5);
		const referenceLabels = [
			...productReferences.slice(0, avatar.images.length ? 2 : 5).map((_, index) => `ProductReference${index + 1}`),
			...avatar.images.slice(0, avatar.images.length ? 3 : 0).map((_, index) => `AvatarReference${index + 1}`),
		];
		if (logoReference) {
			visualReferences.push(logoReference);
			referenceLabels.push('OfficialBrandLogo');
		}

		productFacts = productRecord ? [
			productRecord?.description,
			productRecord?.price_text && `Precio exacto: ${productRecord.price_text}`,
			productRecord?.analysis?.category,
		].filter(Boolean).join(' · ') : productFactsInput;

		const analysis = await analyzeVideoReference({
			apiKey: openAIKey,
			poster,
			referenceNotes: referenceScript,
			productName,
			brandName,
		});
		const safeDialogueFallback = naturalFallbackDialogue({ productName, benefit, cta: creativePlan.cta || '', duration });
		const safeDialogueLines = (creativePlan.dialogueLines || []).map((line) => ({
			...line,
			line: sanitizeDialogueLine(line.line, safeDialogueFallback),
		}));
		const approvedPlan: Partial<VideoCreativePlan> = {
			...creativePlan,
			speechMode,
			hasSpokenDialogue: speechMode !== 'none' && Boolean(creativePlan.hasSpokenDialogue ?? safeDialogueLines.length),
			dialogueLines: speechMode === 'none' ? [] : safeDialogueLines,
		};
		const creativeBrief = [brief, objective && `Objetivo: ${objective}`, audience && `Audiencia: ${audience}`, audienceReason && `Por qué esta audiencia: ${audienceReason}`, audienceAlternatives && `Otros públicos considerados: ${audienceAlternatives}`, objections && `Objeciones: ${objections}`, hookIdea && `Hook elegido: ${hookIdea}`, benefit && `Beneficio principal: ${benefit}`, proof && `Prueba: ${proof}`, offer && `Oferta: ${offer}`, tone && `Tono: ${tone}`, language && `Idioma: ${language}`, includeLogo ? 'Logo: incluir una vez el logo oficial suministrado.' : 'Logo: no mostrar ningún logo.', includeWebsite && displayWebsite ? `URL visible: mostrar sólo ${displayWebsite} una vez.` : 'URL visible: no mostrar ninguna URL, dominio, web, usuario social ni QR.', `Fidelidad a la referencia: ${referenceMode}`, preserveDirection && `Conservar: ${preserveDirection}`, changeDirection && `Cambiar: ${changeDirection}`, productUsage && `Uso del producto: ${productUsage}`, mustAvoid && `Evitar: ${mustAvoid}`, audioDirection && `Audio: ${audioDirection}`, voiceover && `Voz en off: ${voiceover}`, captions && `Textos: ${captions}`, peopleDirection && `Personas/creador: ${peopleDirection}`, performanceDirection && `Actuación: ${performanceDirection}`, realismDirection && `Realismo obligatorio: ${realismDirection}`].filter(Boolean).join('\n');
		const prompt = buildVideoPrompt({
			analysis,
			referenceNotes: referenceScript,
			productName,
			productFacts,
			brandName,
			includeLogo,
			includeWebsite,
			displayWebsite,
			identityDirection,
			brief: creativeBrief,
			duration,
			size,
			creativePlan: approvedPlan,
		});
		const outputSegments = videoSegmentsForDuration(duration);
		const referenceSegments = outputSegments.map((segment) => referenceSegmentForOutput(segment, referenceDuration));
		const referenceBuffers = await splitVideoBuffer(referenceVideo.buffer, referenceSegments, size as '720x1280' | '1280x720');
		const nominalCreditCost = videoCreditCost(duration);
		const chargedCredits = videoCreditCostForAccount(duration, isAdmin);
		let remaining = isAdmin ? 99999 : 0;
		if (chargedCredits > 0) {
			const { data, error: reserveError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: auth.user.id,
				p_amount: chargedCredits,
			});
			if (reserveError) throw reserveError;
			if (data === -1) return json({ error: `Necesitás ${nominalCreditCost} créditos para generar un video.`, code: 'INSUFFICIENT_CREDITS' }, 402);
			remaining = Number(data || 0);
		}

		const providerJobs: Array<{ id: string; index: number; start: number; duration: number; status: string; progress: number }> = [];
		try {
			for (const segment of outputSegments) {
				const segmentPlan: Partial<VideoCreativePlan> = {
					...approvedPlan,
					scenes: scenesForSegment(approvedPlan.scenes, segment),
					dialogueLines: dialogueForSegment(approvedPlan.dialogueLines, segment),
				};
				segmentPlan.hasSpokenDialogue = Boolean(segmentPlan.dialogueLines?.length);
				const segmentPrompt = buildVideoPrompt({
					analysis,
					referenceNotes: referenceScript,
					productName,
					productFacts,
					brandName,
					includeLogo,
					includeWebsite,
					displayWebsite,
					identityDirection,
					brief: `${creativeBrief}\nThis is segment ${segment.index + 1} of ${outputSegments.length}, covering ${segment.start}-${segment.end}s of the approved full video. ${dialogueInstructions ? `Mandatory dialogue direction (never recite as an instruction and never speak a URL): ${stripVideoUrls(dialogueInstructions)}` : ''}`,
					duration: String(segment.duration),
					size,
					creativePlan: segmentPlan,
				});
				const providerJob = await startGeminiOmniVideo({
					apiKey: googleKey,
					prompt: segmentPrompt,
					size,
					referenceVideo: { buffer: referenceBuffers[segment.index], type: 'video/mp4' },
					visualReferences,
					referenceLabels,
				});
				providerJobs.push({ id: providerJob.id, index: segment.index, start: segment.start, duration: segment.duration, status: providerJob.status, progress: providerJob.progress || 0 });
			}
		} catch (providerError) {
			if (chargedCredits > 0) await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: chargedCredits });
			throw providerError;
		}
		const allCompleted = providerJobs.every((job) => job.status === 'completed');
		const anyStarted = providerJobs.some((job) => job.status === 'in_progress');
		const averageProgress = Math.round(providerJobs.reduce((total, job) => total + job.progress, 0) / Math.max(1, providerJobs.length));

		const { data: job, error: insertError } = await admin.from('creative_video_generations').insert({
			user_id: auth.user.id,
			provider: 'gemini',
			provider_job_id: providerJobs[0]?.id,
			status: allCompleted ? 'in_progress' : anyStarted ? 'in_progress' : 'queued',
			progress: averageProgress,
			title: `${productName} · video de referencia`,
			reference_video_url: referenceVideo.url,
			reference_poster_url: referencePosterUrl,
			reference_script: referenceScript,
			product_id: productId,
			prompt,
			model,
			duration_seconds: Number(duration),
			size,
			settings_snapshot: { brandName, includeLogo, includeWebsite, displayWebsite, brief, objective, audience, audienceReason, audienceAlternatives, objections, hookIdea, benefit, proof, offer, tone, language, referenceMode, preserveDirection, changeDirection, productUsage, mustAvoid, audioDirection, voiceover, captions, peopleDirection, performanceDirection, realismDirection, speechMode, dialogueInstructions, avatarMode, avatarId: avatarId || null, avatarName: avatar.name || null, avatarSourceImageCount: avatar.sourceImageCount, referenceCount: visualReferences.length, referenceDuration, creditCost: chargedCredits, nominalCreditCost, adminBypass: isAdmin, adCopy: approvedPlan.adCopy, analysis, creativePlan: approvedPlan, segmentJobs: providerJobs },
		}).select('id,status,progress,title').single();
		if (insertError || !job) {
			if (chargedCredits > 0) await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: chargedCredits });
			throw insertError || new Error('No se pudo guardar el trabajo de video.');
		}

		return json({ ok: true, job, creditsRemaining: remaining, creditCost: nominalCreditCost, chargedCredits, adminBypass: isAdmin });
	} catch (error) {
		console.error('[video-start]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo iniciar el video.' }, 500);
	}
};
