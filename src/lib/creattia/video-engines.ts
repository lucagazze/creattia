import OpenAI from 'openai';

export type VideoReferenceAnalysis = {
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
};

export type VideoCreativePlan = {
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
};

export const VIDEO_CREDIT_COST = 4;
export const VIDEO_MODELS = ['sora-2', 'sora-2-pro'] as const;
export const VIDEO_DURATIONS = ['4', '8', '12'] as const;
export const VIDEO_SIZES = ['720x1280', '1280x720', '1024x1792', '1792x1024'] as const;

function imageDataUrl(image: { buffer: Buffer; type: string }) {
	return `data:${image.type};base64,${image.buffer.toString('base64')}`;
}

function fallbackVideoPlan(input: {
	productName: string;
	brandName: string;
	objective: string;
	audience: string;
	benefit: string;
	cta: string;
	duration: string;
	language: string;
	audioDirection: string;
	voiceover: string;
	captions: string;
}): VideoCreativePlan {
	const isShort = Number(input.duration) <= 4;
	return {
		hook: `Mostrar ${input.productName} en el primer segundo con una promesa clara para ${input.audience || 'la audiencia objetivo'}.`,
		objective: input.objective || 'Conversión',
		audience: input.audience || 'Personas que necesitan una solución simple y confiable.',
		coreMessage: input.benefit || `${input.productName} resuelve una necesidad concreta de forma fácil.`,
		visualStyle: 'UGC premium, natural, cercano y centrado en el producto.',
		voiceover: input.voiceover || 'Sin voz en off; usar textos breves y demostración visual.',
		captions: input.captions || `Textos cortos en ${input.language || 'español'}, grandes y fáciles de leer.`,
		audio: input.audioDirection || 'Música comercial moderna, con sonido ambiente suave y cortes al ritmo.',
		cta: input.cta || 'Descubrilo ahora',
		scenes: isShort
			? ['0–1s: Gancho visual con el producto y el beneficio principal.', '1–3s: Demostración rápida del uso o resultado.', '3–4s: Producto, marca y CTA claro.']
			: ['0–2s: Gancho visual con el producto y el beneficio principal.', '2–4s: Situación o problema que vive la audiencia.', '4–6s: Demostración del producto en uso.', '6–7s: Resultado o prueba visual del beneficio.', '7–8s: Cierre con producto, marca y CTA claro.'],
	};
}

export async function createVideoPlan(input: {
	apiKey: string;
	poster?: { buffer: Buffer; type: string };
	productImage?: { buffer: Buffer; type: string };
	referenceNotes?: string;
	productName: string;
	productFacts?: string;
	brandName: string;
	objective: string;
	audience: string;
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
}): Promise<VideoCreativePlan> {
	const fallback = fallbackVideoPlan(input);
	if (!input.apiKey) return fallback;

	try {
		const openai = new OpenAI({ apiKey: input.apiKey });
		const model = process.env.OPENAI_ANALYSIS_MODEL || import.meta.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
		const content: any[] = [{
			type: 'text',
			text: `Create a precise pre-production plan for an original ${input.duration}-second ${input.size} marketing video. The reference video is only a creative reference: preserve reusable hook, rhythm and storytelling grammar, but never copy its brand, logo, watermark, person identity, exact frames or unsupported claims.

New brand: ${input.brandName || 'Not provided'}
Product: ${input.productName}
Product facts: ${input.productFacts || 'Only use what can be verified from the product image.'}
Objective: ${input.objective}
Audience: ${input.audience}
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
Reference notes/script: ${input.referenceNotes || 'Not available'}

Return strict JSON with exactly these keys: hook, objective, audience, coreMessage, visualStyle, voiceover, captions, audio, cta, scenes. scenes must be an array of 3 to 8 strings, each starting with a time range and describing action, camera, product visibility, text and audio beat. Keep claims factual, make the product the visual source of truth, and make every scene feasible for a generative video model.`,
		}];
		if (input.poster) content.push({ type: 'image_url', image_url: { url: imageDataUrl(input.poster) } });
		if (input.productImage) content.push({ type: 'image_url', image_url: { url: imageDataUrl(input.productImage) } });
		const response = await openai.chat.completions.create({
			model,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: 'You are a senior direct-response video director and pre-production strategist. Return only valid JSON.' },
				{ role: 'user', content },
			],
		});
		const parsed = parseJson<Partial<VideoCreativePlan>>(response.choices[0]?.message?.content, {});
		return {
			...fallback,
			...parsed,
			scenes: Array.isArray(parsed.scenes) && parsed.scenes.length ? parsed.scenes.slice(0, 8).map(String) : fallback.scenes,
		};
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
					content: `You are a senior performance-video creative director. Analyze one representative poster frame plus the reference notes of an ad video. Return strict JSON with these keys: hook, visualStyle, pacing, camera, scenePlan (array of 4 to 8 short scenes), transitions, audio, productRole. Explain the reusable creative grammar, not the original brand. The new advertiser brand is "${input.brandName || 'the advertiser'}" and the new product is "${input.productName}". Never preserve another brand's logo, name, claims, or watermark. Keep claims factual and avoid inventing offers.`,
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
	brief?: string;
	duration: string;
	size: string;
	creativePlan?: Partial<VideoCreativePlan>;
}) {
	const scenes = (input.analysis.scenePlan || []).map((scene, index) => `${index + 1}. ${scene}`).join('\n');
	const plan = input.creativePlan || {};
	const plannedScenes = Array.isArray(plan.scenes) && plan.scenes.length ? plan.scenes.map((scene, index) => `${index + 1}. ${scene}`).join('\n') : scenes;
	return [
		`Create a polished ${input.duration}-second marketing video in ${input.size} for ${input.brandName || 'the advertiser'} and its product ${input.productName}.`,
		'Use the attached product image as the source of truth for the product identity, shape, color, label and packaging. Do not redesign, invent or morph the product.',
		'Recreate the reference video\'s creative grammar — hook, pacing, camera language, scene rhythm and emotional payoff — but make an original execution for the new brand and product. Do not copy the original brand, logo, watermark, person identity, exact frames or unverified claims.',
		`Reference hook: ${input.analysis.hook || 'a clear product-led hook'}`,
		`Visual style: ${input.analysis.visualStyle || 'premium direct-response advertising'}`,
		`Pacing: ${input.analysis.pacing || 'fast but legible'}`,
		`Camera: ${input.analysis.camera || 'close product shots and natural movement'}`,
		`Transitions: ${input.analysis.transitions || 'clean, motivated cuts'}`,
		`Audio direction: ${input.analysis.audio || 'commercial music and natural sound'}`,
		`Approved creative hook: ${plan.hook || input.analysis.hook || 'a clear product-led hook'}`,
		`Objective: ${plan.objective || 'conversion'}`,
		`Audience: ${plan.audience || 'the target audience'}`,
		`Core message: ${plan.coreMessage || 'Show a clear product benefit.'}`,
		`Visual style: ${plan.visualStyle || input.analysis.visualStyle || 'premium direct-response advertising'}`,
		`Voice-over: ${plan.voiceover || 'No voice-over unless clearly requested.'}`,
		`Captions/on-screen text: ${plan.captions || 'Minimal, readable captions only.'}`,
		`Audio: ${plan.audio || input.analysis.audio || 'commercial music and natural sound'}`,
		`CTA: ${plan.cta || 'Discover more'}`,
		`Approved scene plan:\n${plannedScenes}`,
		`Verified product facts: ${input.productFacts || 'Only show what is visibly supported by the product image.'}`,
		`Existing reference notes for creative intent: ${input.referenceNotes || 'None.'}`,
		`Additional direction from the advertiser: ${input.brief || 'Keep it clear, premium and conversion-focused.'}`,
		'Use readable, minimal on-screen text only when it is necessary. Prefer showing the product in use over dense captions. End with a clean brand/product shot and a generic action such as Discover more or Shop now, without inventing a discount, guarantee or deadline.',
	].join('\n\n');
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
