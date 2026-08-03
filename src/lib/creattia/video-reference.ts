import { createPartFromUri, FileState, GoogleGenAI } from '@google/genai';
import { normalizeVideoSetupSuggestions, type VideoSetupSuggestions } from './video-suggestions';

export type FullVideoReferenceAnalysis = {
	hook?: string;
	visualStyle?: string;
	pacing?: string;
	camera?: string;
	scenePlan?: string[];
	transitions?: string;
	audio?: string;
	productRole?: string;
	hasSpeakingPerson?: boolean;
	speakers?: Array<{ label: string; role: string; performance: string }>;
	dialoguePurpose?: string;
	speechStyle?: string;
	referenceDialogueSummary?: string;
	dialogueBeats?: Array<{ start: number; end: number; purpose: string; delivery: string }>;
	creativeSuggestions?: VideoSetupSuggestions;
};

function parseJson<T>(value: string | undefined, fallback: T): T {
	try {
		const cleaned = String(value || '').replace(/^```json\s*/i, '').replace(/\s*```$/, '');
		return cleaned ? JSON.parse(cleaned) as T : fallback;
	} catch {
		return fallback;
	}
}

async function waitForFile(ai: GoogleGenAI, uploaded: { name?: string; state?: FileState; uri?: string; mimeType?: string; error?: { message?: string } }) {
	let file = uploaded;
	for (let attempt = 0; attempt < 60 && file.state === FileState.PROCESSING; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		if (!file.name) break;
		file = await ai.files.get({ name: file.name });
	}
	if (file.state === FileState.FAILED) throw new Error(file.error?.message || 'Gemini no pudo procesar el video de referencia.');
	if (!file.uri || !file.mimeType) throw new Error('Gemini no devolvió una referencia de video utilizable.');
	return file;
}

export async function analyzeFullVideoReference(input: {
	apiKey: string;
	video: { buffer: Buffer; type: string };
	referenceNotes?: string;
	productName: string;
	brandName: string;
	productFacts?: string;
	referenceDuration?: number;
}): Promise<FullVideoReferenceAnalysis> {
	const ai = new GoogleGenAI({ apiKey: input.apiKey });
	const bytes = new Uint8Array(input.video.buffer);
	const uploaded = await ai.files.upload({
		file: new Blob([bytes], { type: input.video.type || 'video/mp4' }),
		config: { mimeType: input.video.type || 'video/mp4', displayName: `creattia-reference-${Date.now()}.mp4` },
	});
	const file = await waitForFile(ai, uploaded);
	try {
		const response = await ai.models.generateContent({
			model: process.env.GEMINI_VIDEO_ANALYSIS_MODEL || 'gemini-2.5-flash',
			contents: [{
				role: 'user',
				parts: [
					createPartFromUri(file.uri!, file.mimeType!),
					{ text: `Analyze this winning ad as a senior direct-response video director. The new advertiser is "${input.brandName || 'the advertiser'}" and the new product is "${input.productName}". Extract reusable creative strategy, not copyrighted execution. Do not preserve the original person identity, brand, logo, wording, frames, watermark, testimony or unsupported claims.

Pay special attention to every moment where a visible person speaks. Identify the purpose, timing and delivery of each speech beat, but summarize the original wording instead of quoting it. The replacement script must later be written specifically for the new brand and product.

Available notes: ${input.referenceNotes || 'None'}
Verified product/page facts: ${input.productFacts || 'No additional facts were provided. Never invent claims, prices, testimonials or offers.'}
Reference duration: ${Number(input.referenceDuration) > 0 ? `${Math.round(Number(input.referenceDuration))} seconds` : 'Infer it from the uploaded video'}.

Also act as a conversion-focused creative strategist. Propose the strongest editable setup for the NEW product by combining verified page facts with the reusable strategy of the reference. Fill every creativeSuggestions field, including production, audio and timing. Recommend an integer duration from 4 to 30 seconds that gives the hook, proof, dialogue and CTA enough natural time. Prefer the exact reference duration when it already fits; change it only when the new product needs a clearly better pace. If the page has no verified offer, explicitly write "Sin oferta específica: enfocar el beneficio principal". Use only these exact enum values:
- referenceMode: Idea + guion adaptado | Idea visual | Guion adaptado | Inspiración libre
- objective: Conversión | Reconocimiento | UGC / Testimonial | Demostración
- tone: UGC natural | Premium | Directo y vendedor | Educativo | Emocional | Divertido
- castingMode: woman | man | custom | none
- language: Español rioplatense | Español neutro | Inglés | Portugués de Brasil
- speechMode: adapt | new | none
- voiceoverMode: none | ai
- musicMode: music | ambient | none
- captionMode: dynamic | minimal | none
- formatMode: reference | vertical | horizontal

Return JSON only with: hook, visualStyle, pacing, camera, scenePlan (4-10 timed strings), transitions, audio, productRole, hasSpeakingPerson (boolean), speakers (array of label/role/performance), dialoguePurpose, speechStyle, referenceDialogueSummary, dialogueBeats (array of start/end/purpose/delivery), creativeSuggestions. creativeSuggestions must contain: concept, referenceMode, objective, audience, benefit, proof, offer, cta, tone, preserveDirection, changeDirection, castingMode, creatorAge, creatorStyle, peopleDirection, productUsage, mustAvoid, language, speechMode, dialogueInstructions, voiceoverMode, voiceover, musicMode, audioDirection, captionMode, captions, formatMode, durationSeconds, durationReason.` },
				],
			}],
			config: { responseMimeType: 'application/json', temperature: 0.2 },
		});
		const parsed = parseJson<FullVideoReferenceAnalysis>(response.text, {});
		return {
			...parsed,
			creativeSuggestions: normalizeVideoSetupSuggestions(parsed.creativeSuggestions, {
				productName: input.productName,
				brandName: input.brandName,
				productFacts: input.productFacts,
				hasSpeakingPerson: parsed.hasSpeakingPerson,
				hook: parsed.hook,
				referenceDuration: input.referenceDuration,
			}),
		};
	} finally {
		if (file.name) await ai.files.delete({ name: file.name }).catch(() => undefined);
	}
}
