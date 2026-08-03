export const VIDEO_REFERENCE_MODES = ['Idea + guion adaptado', 'Idea visual', 'Guion adaptado', 'Inspiración libre'] as const;
export const VIDEO_OBJECTIVES = ['Conversión', 'Reconocimiento', 'UGC / Testimonial', 'Demostración'] as const;
export const VIDEO_TONES = ['UGC natural', 'Premium', 'Directo y vendedor', 'Educativo', 'Emocional', 'Divertido'] as const;
export const VIDEO_CASTING_MODES = ['woman', 'man', 'custom', 'none'] as const;
export const VIDEO_LANGUAGES = ['Español rioplatense', 'Español neutro', 'Inglés', 'Portugués de Brasil'] as const;
export const VIDEO_SPEECH_MODES = ['adapt', 'new', 'none'] as const;
export const VIDEO_MUSIC_MODES = ['music', 'ambient', 'none'] as const;
export const VIDEO_VOICEOVER_MODES = ['none', 'ai'] as const;
export const VIDEO_CAPTION_MODES = ['dynamic', 'minimal', 'none'] as const;
export const VIDEO_FORMAT_MODES = ['reference', 'vertical', 'horizontal'] as const;

export const VIDEO_MIN_DURATION_SECONDS = 4;
export const VIDEO_MAX_DURATION_SECONDS = 30;

export type VideoSetupSuggestions = {
	concept: string;
	referenceMode: typeof VIDEO_REFERENCE_MODES[number];
	objective: typeof VIDEO_OBJECTIVES[number];
	audience: string;
	benefit: string;
	proof: string;
	offer: string;
	cta: string;
	tone: typeof VIDEO_TONES[number];
	preserveDirection: string;
	changeDirection: string;
	castingMode: typeof VIDEO_CASTING_MODES[number];
	creatorAge: string;
	creatorStyle: string;
	peopleDirection: string;
	productUsage: string;
	mustAvoid: string;
	language: typeof VIDEO_LANGUAGES[number];
	speechMode: typeof VIDEO_SPEECH_MODES[number];
	dialogueInstructions: string;
	voiceoverMode: typeof VIDEO_VOICEOVER_MODES[number];
	voiceover: string;
	musicMode: typeof VIDEO_MUSIC_MODES[number];
	audioDirection: string;
	captionMode: typeof VIDEO_CAPTION_MODES[number];
	captions: string;
	formatMode: typeof VIDEO_FORMAT_MODES[number];
	durationSeconds: number;
	durationReason: string;
};

type SuggestionContext = {
	productName: string;
	brandName?: string;
	productFacts?: string;
	hasSpeakingPerson?: boolean;
	hook?: string;
	referenceDuration?: number;
};

function text(value: unknown, fallback: string, max = 900) {
	const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
	return (cleaned || fallback).slice(0, max);
}

function choice<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
	const candidate = String(value || '').trim();
	return (options as readonly string[]).includes(candidate) ? candidate as T[number] : fallback;
}

export function normalizeVideoDuration(value: unknown, fallback = 8) {
	const parsed = Math.round(Number(value));
	const safeFallback = Math.min(VIDEO_MAX_DURATION_SECONDS, Math.max(VIDEO_MIN_DURATION_SECONDS, Math.round(Number(fallback) || 8)));
	return Number.isFinite(parsed)
		? Math.min(VIDEO_MAX_DURATION_SECONDS, Math.max(VIDEO_MIN_DURATION_SECONDS, parsed))
		: safeFallback;
}

export function fallbackVideoSetupSuggestions(context: SuggestionContext): VideoSetupSuggestions {
	const productName = text(context.productName, 'el producto', 180);
	const brandName = text(context.brandName, 'la marca', 120);
	const facts = text(context.productFacts, `Datos verificables y uso real de ${productName}`, 500);
	const benefit = facts.split(/[.!?·]/)[0]?.trim() || `Resolver el problema principal con ${productName}`;
	const hasSpeakingPerson = context.hasSpeakingPerson !== false;
	const durationSeconds = normalizeVideoDuration(context.referenceDuration, 8);
	return {
		concept: `Abrir con el problema que resuelve ${productName}, demostrarlo en uso y cerrar con una razón clara para elegir ${brandName}.`,
		referenceMode: hasSpeakingPerson ? 'Idea + guion adaptado' : 'Idea visual',
		objective: hasSpeakingPerson ? 'UGC / Testimonial' : 'Demostración',
		audience: `Personas que buscan una solución como ${productName}`,
		benefit,
		proof: `Mostrar ${productName} en uso y respaldar el mensaje únicamente con datos verificables de la página.`,
		offer: 'Sin oferta específica: enfocar el beneficio principal.',
		cta: `Conocé ${productName}`,
		tone: hasSpeakingPerson ? 'UGC natural' : 'Directo y vendedor',
		preserveDirection: `Conservar el hook, el ritmo, la progresión y la función persuasiva del anuncio ganador.`,
		changeDirection: `Crear escenas, persona, locación, texto y acciones originales para ${brandName} y ${productName}.`,
		castingMode: hasSpeakingPerson ? 'custom' : 'none',
		creatorAge: '25 a 40 años',
		creatorStyle: 'Natural, auténtico y cercano; apariencia cotidiana, movimientos realistas y luz creíble.',
		peopleDirection: hasSpeakingPerson ? 'Cliente real del público objetivo, hablando con seguridad y cercanía.' : 'Sin persona identificable; usar producto, ambiente y manos.',
		productUsage: `Mostrar ${productName} claramente, en uso real y fiel a sus fotos de referencia.`,
		mustAvoid: 'No copiar personas, marcas, logos, escenas exactas ni afirmaciones que no estén verificadas en la página.',
		language: 'Español rioplatense',
		speechMode: hasSpeakingPerson ? 'adapt' : 'none',
		dialogueInstructions: hasSpeakingPerson ? `Adaptar la intención del diálogo ganador para explicar el beneficio real de ${productName} y cerrar con “Conocé ${productName}”.` : 'Sin diálogo hablado; contar la idea con acciones y textos breves.',
		voiceoverMode: 'none',
		voiceover: 'Voz natural, cálida y creíble; sin tono de locutor tradicional.',
		musicMode: 'music',
		audioDirection: 'Música comercial moderna que acompañe los cortes, con efectos sutiles y sonido ambiente realista.',
		captionMode: 'dynamic',
		captions: 'Textos grandes y breves para el hook, el beneficio verificable y la acción final.',
		formatMode: 'reference',
		durationSeconds,
		durationReason: `Mantener ${durationSeconds} segundos conserva el ritmo probado del anuncio ganador sin alargar el mensaje.`,
	};
}

export function normalizeVideoSetupSuggestions(value: unknown, context: SuggestionContext): VideoSetupSuggestions {
	const fallback = fallbackVideoSetupSuggestions(context);
	const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return {
		concept: text(raw.concept, fallback.concept, 700),
		referenceMode: choice(raw.referenceMode, VIDEO_REFERENCE_MODES, fallback.referenceMode),
		objective: choice(raw.objective, VIDEO_OBJECTIVES, fallback.objective),
		audience: text(raw.audience, fallback.audience, 500),
		benefit: text(raw.benefit, fallback.benefit, 500),
		proof: text(raw.proof, fallback.proof, 500),
		offer: text(raw.offer, fallback.offer, 300),
		cta: text(raw.cta, fallback.cta, 180),
		tone: choice(raw.tone, VIDEO_TONES, fallback.tone),
		preserveDirection: text(raw.preserveDirection, fallback.preserveDirection, 800),
		changeDirection: text(raw.changeDirection, fallback.changeDirection, 800),
		castingMode: choice(raw.castingMode, VIDEO_CASTING_MODES, fallback.castingMode),
		creatorAge: text(raw.creatorAge, fallback.creatorAge, 120),
		creatorStyle: text(raw.creatorStyle, fallback.creatorStyle, 500),
		peopleDirection: text(raw.peopleDirection, fallback.peopleDirection, 400),
		productUsage: text(raw.productUsage, fallback.productUsage, 800),
		mustAvoid: text(raw.mustAvoid, fallback.mustAvoid, 800),
		language: choice(raw.language, VIDEO_LANGUAGES, fallback.language),
		speechMode: choice(raw.speechMode, VIDEO_SPEECH_MODES, fallback.speechMode),
		dialogueInstructions: text(raw.dialogueInstructions, fallback.dialogueInstructions, 1200),
		voiceoverMode: choice(raw.voiceoverMode, VIDEO_VOICEOVER_MODES, fallback.voiceoverMode),
		voiceover: text(raw.voiceover, fallback.voiceover, 300),
		musicMode: choice(raw.musicMode, VIDEO_MUSIC_MODES, fallback.musicMode),
		audioDirection: text(raw.audioDirection, fallback.audioDirection, 300),
		captionMode: choice(raw.captionMode, VIDEO_CAPTION_MODES, fallback.captionMode),
		captions: text(raw.captions, fallback.captions, 300),
		formatMode: choice(raw.formatMode, VIDEO_FORMAT_MODES, fallback.formatMode),
		durationSeconds: normalizeVideoDuration(raw.durationSeconds, fallback.durationSeconds),
		durationReason: text(raw.durationReason, fallback.durationReason, 300),
	};
}
