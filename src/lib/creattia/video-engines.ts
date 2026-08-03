import OpenAI from 'openai';
import RunwayML, { toFile } from '@runwayml/sdk';
import { GoogleGenAI } from '@google/genai';
import { fallbackScenesForDuration, VIDEO_CREDITS_PER_SEGMENT, type VideoDialogueLine } from './video-pipeline';
import type { FullVideoReferenceAnalysis } from './video-reference';
import { naturalFallbackDialogue, normalizeVideoProductName, sanitizeDialogueLine, sanitizeSpokenVideoText, stripVideoUrls } from './video-copy';
import { fallbackAdCopy, normalizeAdCopy, type AdaptedAdCopy } from './ad-copy';

export type VideoReferenceAnalysis = FullVideoReferenceAnalysis & {
	hook?: string;
	visualStyle?: string;
	pacing?: string;
	camera?: string;
	scenePlan?: string[];
	transitions?: string;
	audio?: string;
	productRole?: string;
};

export type VideoJobStatus = {
	id: string;
	status: string;
	progress?: number;
	error?: string;
	outputUrl?: string;
	outputData?: string;
};

export type VideoCreativePlan = {
	adCopy: AdaptedAdCopy;
	hook: string;
	objective: string;
	audience: string;
	coreMessage: string;
	visualStyle: string;
	voiceover: string;
	captions: string;
	audio: string;
	cta: string;
	scenes: string[];
	speechMode: 'adapt' | 'new' | 'none';
	hasSpokenDialogue: boolean;
	dialogueLines: VideoDialogueLine[];
};

export const VIDEO_CREDIT_COST = VIDEO_CREDITS_PER_SEGMENT;
export const VIDEO_MODELS = ['gemini-omni-flash-preview'] as const;
export const VIDEO_SIZES = ['720x1280', '1280x720'] as const;

function imageDataUrl(image: { buffer: Buffer; type: string }) {
	return `data:${image.type};base64,${image.buffer.toString('base64')}`;
}

function fallbackVideoPlan(input: {
	productName: string;
	brandName: string;
	objective: string;
	audience: string;
	audienceReason?: string;
	audienceAlternatives?: string;
	objections?: string;
	hookIdea?: string;
	performanceDirection?: string;
	realismDirection?: string;
	benefit: string;
	productFacts?: string;
	cta: string;
	duration: string;
	language: string;
	audioDirection: string;
	voiceover: string;
	captions: string;
	speechMode?: 'adapt' | 'new' | 'none';
	dialogueInstructions?: string;
}): VideoCreativePlan {
	const productName = normalizeVideoProductName(input.productName);
	const dialogue = naturalFallbackDialogue({ productName, benefit: input.benefit, cta: input.cta, duration: input.duration });
	return {
		adCopy: fallbackAdCopy({ productName, productFacts: input.productFacts, brandName: input.brandName, benefit: input.benefit, cta: input.cta }),
		hook: `Mostrar ${productName} en el primer segundo con una situación concreta que la audiencia reconozca.`,
		objective: input.objective || 'Conversión',
		audience: input.audience || 'Personas que necesitan una solución simple y confiable.',
		coreMessage: sanitizeSpokenVideoText(input.benefit) || `${productName} resuelve una necesidad concreta de forma fácil.`,
		visualStyle: 'UGC premium y fotorealista: piel con textura natural, gestos pequeños, parpadeo, respiración, peso corporal y contacto físico creíbles; producto estable y fiel a las referencias.',
		voiceover: input.voiceover || 'Sin voz en off; usar textos breves y demostración visual.',
		captions: input.captions || `Textos cortos en ${input.language || 'español'}, grandes y fáciles de leer.`,
		audio: input.audioDirection || 'Música comercial moderna, con sonido ambiente suave y cortes al ritmo.',
		cta: input.cta || 'Descubrilo ahora',
		speechMode: input.speechMode || 'adapt',
		hasSpokenDialogue: input.speechMode !== 'none',
		dialogueLines: input.speechMode === 'none' ? [] : [{
			start: 0.5,
			end: Math.max(2.5, Number(input.duration) - 0.5),
			speaker: 'Creadora',
			line: dialogue,
			delivery: 'Conversacional y espontánea; respiraciones, pausas y mirada naturales, sin tono de locución ni gestos exagerados.',
		}],
		scenes: fallbackScenesForDuration(input.duration, productName),
	};
}

export async function createVideoPlan(input: {
	apiKey: string;
	poster?: { buffer: Buffer; type: string };
	productImages?: Array<{ buffer: Buffer; type: string }>;
	avatarImages?: Array<{ buffer: Buffer; type: string }>;
	avatarMode: 'original' | 'saved' | 'upload' | 'none';
	avatarName: string;
	avatarDescription: string;
	referenceNotes?: string;
	referenceDuration?: string;
	productName: string;
	productFacts?: string;
	brandName: string;
	includeLogo: boolean;
	includeWebsite: boolean;
	displayWebsite?: string;
	objective: string;
	audience: string;
	audienceReason?: string;
	audienceAlternatives?: string;
	objections?: string;
	hookIdea?: string;
	performanceDirection?: string;
	realismDirection?: string;
	benefit: string;
	proof: string;
	offer: string;
	cta: string;
	tone: string;
	language: string;
	duration: string;
	size: string;
	audioDirection: string;
	voiceover: string;
	captions: string;
	peopleDirection: string;
	referenceMode: string;
	preserveDirection: string;
	changeDirection: string;
	productUsage: string;
	mustAvoid: string;
	speechMode?: 'adapt' | 'new' | 'none';
	dialogueInstructions?: string;
	referenceAnalysis?: VideoReferenceAnalysis;
}): Promise<VideoCreativePlan> {
	const productName = normalizeVideoProductName(input.productName);
	const fallback = fallbackVideoPlan({ ...input, productName });
	if (!input.apiKey) return fallback;

	try {
		const openai = new OpenAI({ apiKey: input.apiKey });
		const model = process.env.OPENAI_ANALYSIS_MODEL || import.meta.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
		const content: any[] = [{
			type: 'text',
			text: `Create a precise pre-production plan for an original ${input.duration}-second ${input.size} marketing video. The reference video is only a creative reference: preserve reusable hook, rhythm and storytelling grammar, but never copy its brand, logo, watermark, person identity, exact frames or unsupported claims.

New brand: ${input.brandName || 'Not provided'}
Logo permission: ${input.includeLogo ? 'YES. Use the official logo reference once, small and undistorted, in a natural brand or closing frame.' : 'NO ADDED LOGO. Do not add, invent or infer any separate logo, emblem, watermark or branded seal. Preserve only branding physically printed on the real product packaging.'}
Website permission: ${input.includeWebsite && input.displayWebsite ? `YES. Show exactly "${input.displayWebsite}" once in a discreet closing text slot.` : 'NO. Do not show any URL, domain, website, social handle or QR code, even if one appears in the source product data or reference.'}
Product: ${productName}
Product facts: ${input.productFacts || 'Only use what can be verified from the product image.'}
Objective: ${input.objective}
Audience: ${input.audience}
Why this audience: ${input.audienceReason || 'Infer from the verified product facts.'}
Alternative audiences: ${input.audienceAlternatives || 'None selected.'}
Likely objections to resolve: ${input.objections || 'Infer the main purchase objection without inventing facts.'}
Preferred adapted hook: ${input.hookIdea || 'Create the strongest truthful hook.'}
Main benefit: ${input.benefit}
Proof/social proof: ${input.proof}
Offer: ${input.offer}
CTA: ${input.cta}
Tone: ${input.tone}
Language: ${input.language}
Audio direction: ${input.audioDirection}
Voice-over preference: ${input.voiceover}
Caption preference: ${input.captions}
People/creator direction: ${input.peopleDirection}
Natural performance direction: ${input.performanceDirection || 'Conversational, subtle and believable.'}
Physical realism direction: ${input.realismDirection || 'Natural anatomy, motion, contact, inertia and identity consistency.'}
Person identity mode: ${input.avatarMode}
Selected avatar: ${input.avatarName || 'None'}
Avatar identity and direction: ${input.avatarDescription || 'None'}
Identity rule: ${input.avatarMode === 'saved' || input.avatarMode === 'upload' ? 'Use the supplied avatar images as the only identity reference. Preserve that person consistently, but do not copy the person from the winning reference video.' : input.avatarMode === 'none' ? 'Do not show an identifiable person. Use product shots, environments or anonymous hands only.' : 'Create a new original person who is clearly different from the person in the winning reference video. The reference person is only a performance and blocking example, never an identity reference.'}
Reference notes/script: ${input.referenceNotes || 'Not available'}
Reference duration: ${input.referenceDuration || 'Not available'} seconds
Reference fidelity requested: ${input.referenceMode}
Elements to preserve: ${input.preserveDirection || 'The reusable hook, pacing and storytelling structure.'}
Elements to change: ${input.changeDirection || 'Product, brand, copy, people, setting and claims.'}
Required product interaction: ${input.productUsage || 'Show the product naturally and keep its identity consistent.'}
Forbidden elements or claims: ${input.mustAvoid || 'No additional restrictions provided.'}
Full reference analysis: ${JSON.stringify(input.referenceAnalysis || {})}
Speech mode: ${input.speechMode || 'adapt'}
Mandatory dialogue ideas (instructions only; never recite these words literally and never speak a URL): ${stripVideoUrls(input.dialogueInstructions) || 'No additional mandatory phrase.'}

Return strict JSON with exactly these keys: adCopy, hook, objective, audience, coreMessage, visualStyle, voiceover, captions, audio, cta, scenes, speechMode, hasSpokenDialogue, dialogueLines. adCopy must be {primaryText, headline, description, cta}: publication copy for Meta/Instagram adapted to the new product and winning angle, with a strong first-line hook, only verified claims, headline <= 60 characters, description <= 90 and CTA <= 30. It complements the video and must not transcribe the spoken script. scenes must be an array of 3 to 12 strings, each starting with a time range and describing one feasible action, camera, product visibility, text and audio beat. dialogueLines must be an array of {start, end, speaker, line, delivery}. If speechMode is "none", return no dialogue. Otherwise write completely new, natural spoken lines for the NEW brand and product in the requested language; use the reference only for timing, persuasive purpose and delivery. Never put a URL, instruction, field label or raw product-page text inside spoken dialogue. Every spoken claim, price, testimonial and offer must be supported by Product facts, Proof or Offer. Keep the words short enough for a relaxed natural delivery with pauses and breaths.

REALISM IS MANDATORY: direct subtle human acting with natural blinking, breathing, eye focus, weight shifts, hand-object contact, inertia and facial micro-expressions. Preserve face, hands, wardrobe and product geometry across frames. Avoid plastic skin, beauty-filter faces, frozen smiles, exaggerated gestures, body warping, extra fingers, floating objects, sliding feet, teleporting props, identity drift, impossible camera motion and unreadable generated text. Use simple physical actions and believable camera movement. Make the supplied product images the visual source of truth.`,
		}];
		if (input.poster) content.push({ type: 'image_url', image_url: { url: imageDataUrl(input.poster) } });
		for (const productImage of (input.productImages || []).slice(0, 5)) {
			content.push({ type: 'image_url', image_url: { url: imageDataUrl(productImage) } });
		}
		for (const avatarImage of (input.avatarImages || []).slice(0, 5)) {
			content.push({ type: 'image_url', image_url: { url: imageDataUrl(avatarImage) } });
		}
		const response = await openai.chat.completions.create({
			model,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: 'You are a senior direct-response video director, natural-dialogue writer and photorealistic performance supervisor. Return only valid JSON.' },
				{ role: 'user', content },
			],
		});
		const parsed = parseJson<Partial<VideoCreativePlan>>(response.choices[0]?.message?.content, {});
		const fallbackLine = fallback.dialogueLines[0]?.line || naturalFallbackDialogue({ productName, benefit: input.benefit, cta: input.cta, duration: input.duration });
		const plan = {
			...fallback,
			...parsed,
			adCopy: normalizeAdCopy(parsed.adCopy, { productName, productFacts: input.productFacts, brandName: input.brandName, benefit: input.benefit, cta: input.cta }),
			hook: sanitizeSpokenVideoText(parsed.hook, 500) || fallback.hook,
			coreMessage: sanitizeSpokenVideoText(parsed.coreMessage, 700) || fallback.coreMessage,
			visualStyle: sanitizeSpokenVideoText(parsed.visualStyle, 900) || fallback.visualStyle,
			voiceover: stripVideoUrls(parsed.voiceover || fallback.voiceover),
			captions: stripVideoUrls(parsed.captions || fallback.captions),
			audio: stripVideoUrls(parsed.audio || fallback.audio),
			cta: sanitizeSpokenVideoText(parsed.cta, 120) || fallback.cta,
			speechMode: input.speechMode || parsed.speechMode || fallback.speechMode,
			hasSpokenDialogue: input.speechMode === 'none' ? false : Boolean(parsed.hasSpokenDialogue ?? fallback.hasSpokenDialogue),
			dialogueLines: input.speechMode === 'none' ? [] : Array.isArray(parsed.dialogueLines)
				? parsed.dialogueLines.slice(0, 12).map((line) => ({
					start: Math.max(0, Number(line.start) || 0),
					end: Math.min(Number(input.duration), Math.max(Number(line.start) || 0, Number(line.end) || 0)),
					speaker: String(line.speaker || 'Creadora'),
					line: sanitizeDialogueLine(line.line, fallbackLine),
					delivery: sanitizeSpokenVideoText(line.delivery, 240) || fallback.dialogueLines[0]?.delivery || 'Natural y conversacional.',
				})).filter((line) => line.line && line.end > line.start)
				: fallback.dialogueLines,
			scenes: Array.isArray(parsed.scenes) && parsed.scenes.length ? parsed.scenes.slice(0, 12).map((scene) => stripVideoUrls(scene)).filter(Boolean) : fallback.scenes,
		};
		if (plan.speechMode !== 'none' && !plan.dialogueLines.length) plan.dialogueLines = fallback.dialogueLines;
		return plan;
	} catch (error) {
		console.warn('[video-engines] no se pudo crear el plan de video; se usa el plan base:', error);
		return fallback;
	}
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	try {
		return value ? JSON.parse(value) as T : fallback;
	} catch {
		return fallback;
	}
}

/**
 * Lee el fotograma de referencia y las notas disponibles del video para
 * convertirlos en una guía de dirección. El video original no se re-publica
 * ni se copia cuadro a cuadro: se conserva su gramática creativa y se cambia
 * producto, marca y ejecución.
 */
export async function analyzeVideoReference(input: {
	apiKey?: string;
	poster?: { buffer: Buffer; type: string };
	referenceNotes?: string;
	productName: string;
	brandName: string;
	includeLogo?: boolean;
	includeWebsite?: boolean;
	displayWebsite?: string;
}): Promise<VideoReferenceAnalysis> {
	const fallback: VideoReferenceAnalysis = {
		hook: input.referenceNotes || 'Abrir con el beneficio principal del producto y una demostración clara.',
		visualStyle: 'Video publicitario vertical, limpio y centrado en el producto.',
		pacing: 'Ritmo ágil, cortes cada pocos segundos y cierre con una acción clara.',
		camera: 'Planos cercanos del producto combinados con planos de uso.',
		scenePlan: ['Gancho inicial', 'Demostración del producto', 'Beneficio principal', 'Cierre con marca y acción'],
		transitions: 'Cortes limpios y transiciones breves al ritmo de la acción.',
		audio: 'Música comercial sutil y sonido ambiente coherente con la escena.',
		productRole: `El producto ${input.productName} es el protagonista y debe verse con claridad.`,
	};

	if (!input.apiKey || !input.poster) return fallback;

	try {
		const openai = new OpenAI({ apiKey: input.apiKey });
		const model = process.env.OPENAI_ANALYSIS_MODEL || import.meta.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
		const response = await openai.chat.completions.create({
			model,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content: `You are a senior performance-video creative director. Analyze one representative poster frame plus the reference notes of an ad video. Return strict JSON with these keys: hook, visualStyle, pacing, camera, scenePlan (array of 4 to 8 short scenes), transitions, audio, productRole. Explain reusable creative grammar, never a shot-by-shot reconstruction. The new advertiser brand is "${input.brandName || 'the advertiser'}" and the new product is "${input.productName}". A visible person in the winner is not an identity reference. Never preserve another person's identity, brand logo, name, claims, watermark or exact frame sequence. Keep claims factual and avoid inventing offers.`,
				},
				{
					role: 'user',
					content: [
						{ type: 'text', text: `Reference notes/script:\n${input.referenceNotes || 'No transcript or notes available.'}` },
						{ type: 'image_url', image_url: { url: imageDataUrl(input.poster) } },
					],
				},
			],
		});
		return { ...fallback, ...parseJson<VideoReferenceAnalysis>(response.choices[0]?.message?.content, {}) };
	} catch (error) {
		console.warn('[video-engines] no se pudo analizar la referencia; se usa la guía base:', error);
		return fallback;
	}
}

export function buildVideoPrompt(input: {
	analysis: VideoReferenceAnalysis;
	referenceNotes?: string;
	productName: string;
	productFacts?: string;
	brandName: string;
	includeLogo?: boolean;
	includeWebsite?: boolean;
	displayWebsite?: string;
	brief?: string;
	identityDirection?: string;
	duration: string;
	size: string;
	creativePlan?: Partial<VideoCreativePlan>;
}) {
	const scenes = (input.analysis.scenePlan || []).map((scene, index) => `${index + 1}. ${scene}`).join('\n');
	const plan = input.creativePlan || {};
	const plannedScenes = Array.isArray(plan.scenes) && plan.scenes.length ? plan.scenes.map((scene, index) => `${index + 1}. ${scene}`).join('\n') : scenes;
	const dialogue = Array.isArray(plan.dialogueLines) && plan.dialogueLines.length
		? plan.dialogueLines.map((line) => `${line.start}-${line.end}s · ${line.speaker}: “${line.line}” (${line.delivery || 'natural'})`).join('\n')
		: 'No spoken dialogue.';
	const visibleSpeakerAllowed = !/do not show an identifiable person/i.test(input.identityDirection || '');
	return [
		`Create an original marketing video for ${input.brandName || 'the advertiser'} and ${input.productName}. Use the supplied winner only as high-level inspiration for hook logic, pacing and storytelling grammar. Do not recreate it shot-by-shot: vary composition, actions, setting, transitions and performance while preserving the strategic idea.`,
		`PERSON IDENTITY: ${input.identityDirection || 'The person in the winning reference is not an identity reference. Create a clearly different original person.'}`,
		`PRODUCT TRUTH: preserve the supplied product references exactly: shape, color, label and packaging. Verified facts: ${input.productFacts || 'only what is visible in the product references'}.`,
		input.includeLogo
			? 'LOGO PERMISSION: show the supplied official logo image exactly once, small, undistorted and with clear space. Never invent or redraw it.'
			: 'LOGO PERMISSION: the user selected NO ADDED LOGO. Do not show, invent or infer any separate logo, emblem, watermark, seal or brand icon. Preserve only branding physically printed on the supplied real product packaging.',
		input.includeWebsite && input.displayWebsite
			? `WEBSITE PERMISSION: show exactly "${input.displayWebsite}" once, discreetly, in the closing frame. Do not add a protocol, path, other domain, social handle or QR code.`
			: 'WEBSITE PERMISSION: the user selected NO WEBSITE. Do not show any URL, domain, web address, social handle or QR code anywhere, even if visible in the product page or reference.',
		`APPROVED HOOK: ${plan.hook || input.analysis.hook || 'Show the product and its benefit immediately.'}`,
		`APPROVED SCENES:\n${plannedScenes}`,
		`MESSAGE: ${plan.coreMessage || 'Show one clear product benefit.'}. CTA: ${plan.cta || 'Discover more'}.`,
		`STYLE: ${plan.visualStyle || input.analysis.visualStyle || 'premium direct-response advertising'}. Pacing: ${input.analysis.pacing || 'fast but legible'}. Camera: ${input.analysis.camera || 'product-led close shots and natural motion'}.`,
		`AUDIO/TEXT: ${plan.audio || input.analysis.audio || 'coherent commercial audio'}. ${plan.voiceover || ''} ${plan.captions || ''}`,
		`APPROVED SPOKEN DIALOGUE:\n${dialogue}`,
		plan.hasSpokenDialogue
			? visibleSpeakerAllowed
				? 'DIALOGUE PERFORMANCE: the visible speaker must say the approved words naturally, with synchronized mouth movement, matching emotion and enough time for every line. Never say the reference brand or reuse its wording.'
				: 'DIALOGUE PERFORMANCE: use the approved words as an off-camera voice-over because no identifiable person may appear. Never say the reference brand or reuse its wording.'
			: 'DIALOGUE PERFORMANCE: nobody speaks on camera. Do not generate intelligible speech.',
		'PHYSICAL REALISM: produce documentary-believable human motion with correct anatomy, natural skin texture, blinking, breathing, eye focus, weight transfer, inertia and precise hand-object contact. Keep face, hands, wardrobe, product packaging and scale consistent across every frame. Use subtle expressions and simple actions. Reject plastic skin, frozen smiles, extra fingers, warped limbs, sliding feet, floating or melting objects, identity drift, impossible camera motion, abrupt pose changes and generated gibberish text.',
		`USER RULES: ${input.brief || 'Keep the result clear, premium and conversion-focused.'}`,
		'Do not copy the original sequence, exact frames, logo, watermark, brand, person identity, claims or readable text. Do not invent offers or product properties. Keep on-screen text minimal because final typography will be added separately.',
	].join('\n');
}

export async function startGeminiOmniVideo(input: {
	apiKey: string;
	prompt: string;
	size: string;
	referenceVideo: { buffer: Buffer; type: string };
	visualReferences: Array<{ buffer: Buffer; type: string }>;
	referenceLabels?: string[];
}): Promise<VideoJobStatus> {
	const ai = new GoogleGenAI({ apiKey: input.apiKey });
	const references = input.visualReferences.slice(0, 6);
	const tags = references.map((_, index) => `<IMAGE_REF_${index}>`).join(' ');
	const prompt = references.length
		? `[# References ${references.map((_, index) => `<IMAGE_REF_${index}>@${input.referenceLabels?.[index] || `Image${index + 1}`}`).join(' ')}]\n${input.prompt}\nUse ${tags} only for the labeled identity purpose. Do not use them as literal first frames.`
		: input.prompt;
	const interaction = await ai.interactions.create({
		model: 'gemini-omni-flash-preview',
		input: [
			{ type: 'video' as const, data: input.referenceVideo.buffer.toString('base64'), mime_type: input.referenceVideo.type || 'video/mp4' },
			...references.map((reference) => ({ type: 'image' as const, data: reference.buffer.toString('base64'), mime_type: reference.type })),
			{ type: 'text' as const, text: prompt },
		],
		background: true,
		store: true,
		response_format: {
			type: 'video',
			delivery: 'uri',
		},
		generation_config: { video_config: { task: 'edit' } },
	});
	return {
		id: interaction.id,
		status: interaction.status === 'completed' ? 'completed' : interaction.status === 'in_progress' ? 'in_progress' : 'queued',
		progress: interaction.status === 'completed' ? 100 : 0,
		outputUrl: interaction.output_video?.uri,
		outputData: interaction.output_video?.data,
	};
}

export async function retrieveGeminiOmniVideo(apiKey: string, id: string): Promise<VideoJobStatus> {
	const ai = new GoogleGenAI({ apiKey });
	const interaction = await ai.interactions.get(id);
	if (interaction.status === 'completed') return { id, status: 'completed', progress: 100, outputUrl: interaction.output_video?.uri, outputData: interaction.output_video?.data };
	if (['failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(interaction.status)) {
		return { id, status: 'failed', progress: 0, error: interaction.output_text || `Gemini finalizó con estado ${interaction.status}.` };
	}
	return { id, status: interaction.status === 'in_progress' ? 'in_progress' : 'queued', progress: interaction.status === 'in_progress' ? 45 : 0 };
}

export async function downloadGeminiOmniVideo(apiKey: string, result: VideoJobStatus): Promise<Buffer> {
	if (result.outputData) return Buffer.from(result.outputData, 'base64');
	if (!result.outputUrl) throw new Error('Gemini no devolvió el archivo de video.');
	const response = await fetch(result.outputUrl, { headers: { 'x-goog-api-key': apiKey } });
	if (!response.ok) throw new Error(`No se pudo descargar el resultado de Gemini (${response.status}).`);
	return Buffer.from(await response.arrayBuffer());
}

export async function startRunwayVideo(input: {
	apiKey: string;
	prompt: string;
	referenceVideoUrl: string;
	visualReferences: Array<{ buffer: Buffer; type: string }>;
}): Promise<VideoJobStatus> {
	const client = new RunwayML({ apiKey: input.apiKey });
	const references = [];
	for (const [index, reference] of input.visualReferences.slice(0, 5).entries()) {
		const extension = reference.type.includes('png') ? 'png' : reference.type.includes('webp') ? 'webp' : 'jpg';
		const upload = await client.uploads.createEphemeral({
			file: await toFile(reference.buffer, `product-reference-${index + 1}.${extension}`, { type: reference.type }),
		});
		references.push({ uri: upload.uri });
	}
	const task = await client.videoToVideo.create({
		model: 'gemini_omni_flash',
		videoUri: input.referenceVideoUrl,
		promptText: input.prompt.slice(0, 1000),
		references,
	});
	return { id: task.id, status: 'queued', progress: 0 };
}

export async function retrieveRunwayVideo(apiKey: string, id: string): Promise<VideoJobStatus> {
	const client = new RunwayML({ apiKey });
	const task = await client.tasks.retrieve(id);
	if (task.status === 'SUCCEEDED') return { id, status: 'completed', progress: 100, outputUrl: task.output[0] };
	if (task.status === 'FAILED') return { id, status: 'failed', progress: 0, error: task.failure };
	if (task.status === 'CANCELLED') return { id, status: 'failed', progress: 0, error: 'La generación fue cancelada por Runway.' };
	if (task.status === 'RUNNING') return { id, status: 'in_progress', progress: Math.round(Math.max(0, Math.min(1, task.progress)) * 100) };
	return { id, status: 'queued', progress: 0 };
}

export async function downloadRunwayVideo(outputUrl: string): Promise<Buffer> {
	const response = await fetch(outputUrl);
	if (!response.ok) throw new Error(`No se pudo descargar el resultado de Runway (${response.status}).`);
	return Buffer.from(await response.arrayBuffer());
}

export async function startSoraVideo(input: {
	apiKey: string;
	model: string;
	prompt: string;
	seconds: string;
	size: string;
	product: { buffer: Buffer; type: string };
}): Promise<VideoJobStatus> {
	const form = new FormData();
	form.append('model', input.model);
	form.append('prompt', input.prompt);
	form.append('seconds', input.seconds);
	form.append('size', input.size);
	const productBytes = new Uint8Array(input.product.buffer.length);
	productBytes.set(input.product.buffer);
	form.append('input_reference', new Blob([productBytes.buffer], { type: input.product.type }), 'product-reference.png');

	const response = await fetch('https://api.openai.com/v1/videos', {
		method: 'POST',
		headers: { authorization: `Bearer ${input.apiKey}` },
		body: form,
	});
	const payload: any = await response.json().catch(() => ({}));
	if (!response.ok || !payload.id) {
		throw new Error(payload.error?.message || `Sora no pudo iniciar el video (${response.status}).`);
	}
	return { id: String(payload.id), status: String(payload.status || 'queued'), progress: Number(payload.progress || 0) };
}

export async function retrieveSoraVideo(apiKey: string, id: string): Promise<VideoJobStatus> {
	const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}`, {
		headers: { authorization: `Bearer ${apiKey}` },
	});
	const payload: any = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(payload.error?.message || `No se pudo consultar el video (${response.status}).`);
	return {
		id,
		status: String(payload.status || 'queued'),
		progress: Number(payload.progress || 0),
		error: payload.error?.message || payload.failure_reason || undefined,
	};
}

export async function downloadSoraVideo(apiKey: string, id: string): Promise<Buffer> {
	const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}/content`, {
		headers: { authorization: `Bearer ${apiKey}` },
	});
	if (!response.ok) {
		const payload: any = await response.json().catch(() => ({}));
		throw new Error(payload.error?.message || `No se pudo descargar el video (${response.status}).`);
	}
	return Buffer.from(await response.arrayBuffer());
}
