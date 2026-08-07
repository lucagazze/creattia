import React, { useEffect, useMemo, useState } from 'react';
import UrlInput from './UrlInput';
import type { SavedAvatar } from './AvatarManager';
import { prepareReferenceImages } from '../../lib/creattia/client-image';
import { videoCreditCost, type VideoDialogueLine } from '../../lib/creattia/video-pipeline';
import { fallbackVideoSetupSuggestions, normalizeVideoDuration, type VideoAudienceSuggestion, type VideoSetupSuggestions } from '../../lib/creattia/video-suggestions';
import { isAdminEmail } from '../../lib/creattia/admin';
import { normalizeVideoProductName } from '../../lib/creattia/video-copy';
import { normalizeDisplayWebsite, type AdaptedAdCopy } from '../../lib/creattia/ad-copy';

type VideoReference = {
	name: string;
	imagePath: string;
	promptNotes?: string | null;
	metadata?: { videoPath?: string; durationSec?: number };
};

type VideoPlan = {
	adCopy?: AdaptedAdCopy;
	hook?: string;
	objective?: string;
	audience?: string;
	coreMessage?: string;
	visualStyle?: string;
	voiceover?: string;
	captions?: string;
	audio?: string;
	cta?: string;
	scenes?: string[];
	speechMode?: 'adapt' | 'new' | 'none';
	hasSpokenDialogue?: boolean;
	dialogueLines?: VideoDialogueLine[];
};

type VideoReferenceAnalysis = {
	hook?: string;
	pacing?: string;
	camera?: string;
	visualStyle?: string;
	transitions?: string;
	audio?: string;
	hasSpeakingPerson?: boolean;
	dialoguePurpose?: string;
	speechStyle?: string;
	referenceDialogueSummary?: string;
	scenePlan?: string[];
	creativeSuggestions?: VideoSetupSuggestions;
};

type ProductSuggestionContext = { productId?: string; productName: string; productFacts?: string };

type Props = {
	reference: VideoReference;
	session: any;
	profile?: any;
	savedProducts: any[];
	onBack: () => void;
	onToast?: (message: string) => void;
};

type ProductMode = 'url' | 'saved' | 'manual';
type CastingMode = 'woman' | 'man' | 'custom' | 'saved' | 'upload' | 'none';
type FormatMode = 'reference' | 'vertical' | 'horizontal';
type MusicMode = 'music' | 'ambient' | 'none';
type VoiceoverMode = 'none' | 'ai';
type CaptionMode = 'dynamic' | 'minimal' | 'none';
type DurationMode = 'ai' | 'reference' | 'custom';

const QUICK_DURATIONS = [4, 8, 10, 15, 20, 30] as const;

const OBJECTIVES = [
	['Conversión', 'Vender o llevar a una acción concreta'],
	['Reconocimiento', 'Hacer que recuerden tu marca y producto'],
	['UGC / Testimonial', 'Sentirse como una recomendación real'],
	['Demostración', 'Mostrar cómo funciona y qué resuelve'],
] as const;

const TONES = ['UGC natural', 'Premium', 'Directo y vendedor', 'Educativo', 'Emocional', 'Divertido'];

const REFERENCE_MODES = [
	['Idea + guion adaptado', 'Conserva el hook, la estructura y la función del guion; reescribe todo para tu producto.'],
	['Idea visual', 'Conserva el ritmo, los planos y la progresión; crea un mensaje completamente nuevo.'],
	['Guion adaptado', 'Conserva la lógica persuasiva y los tiempos del mensaje; cambia la puesta visual.'],
	['Inspiración libre', 'Toma el concepto ganador y propone una ejecución más original.'],
] as const;

const CASTING_MODES = [
	['woman', 'Mujer UGC', 'Una creadora original, realista y distinta de la referencia'],
	['man', 'Hombre UGC', 'Un creador original, realista y distinto de la referencia'],
	['custom', 'Definir persona', 'Elegí edad, apariencia, energía y estilo'],
	['saved', 'Mi avatar', 'Usá una identidad guardada en Mi marca'],
	['upload', 'Cargar avatar', 'Subí varias fotos para este video'],
	['none', 'Sin personas', 'Producto, ambientes o manos anónimas'],
] as const;

const SPEECH_MODES = [
	['adapt', 'Adaptar el diálogo ganador', 'Mantiene su intención y sus tiempos, con palabras nuevas para tu marca.'],
	['new', 'Crear un guion nuevo', 'Escribe un diálogo original según producto, objetivo y audiencia.'],
	['none', 'Nadie habla', 'El mensaje se cuenta con imagen, audio y textos.'],
] as const;

const LANGUAGE_OPTIONS = [
	['Español rioplatense', '🇦🇷', 'Español rioplatense'],
	['Español neutro', '🌎', 'Español neutro'],
	['Inglés', '🇺🇸', 'Inglés'],
	['Portugués de Brasil', '🇧🇷', 'Portugués de Brasil'],
] as const;

export default function VideoCreationFlow({ reference, session, profile, savedProducts, onBack, onToast }: Props) {
	const token = session?.access_token || '';
	const initialReferenceDuration = Number(reference.metadata?.durationSec) || 8;
	const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting' | 'completed' | 'failed'>('setup');
	const [productMode, setProductMode] = useState<ProductMode>('url');
	const [productUrl, setProductUrl] = useState('');
	const [scanningProduct, setScanningProduct] = useState(false);
	const [suggestingSetup, setSuggestingSetup] = useState(false);
	const [suggestionsReady, setSuggestionsReady] = useState(false);
	const [suggestionSource, setSuggestionSource] = useState<'ai' | 'fallback'>('ai');
	const [suggestionConcept, setSuggestionConcept] = useState('');
	const [suggestedDuration, setSuggestedDuration] = useState(normalizeVideoDuration(initialReferenceDuration));
	const [suggestedDurationReason, setSuggestedDurationReason] = useState('La IA conservará el ritmo del anuncio ganador.');
	const [suggestionFingerprint, setSuggestionFingerprint] = useState('');
	const [productId, setProductId] = useState('');
	const [importedProductName, setImportedProductName] = useState('');
	const [productName, setProductName] = useState('');
	const [productFacts, setProductFacts] = useState('');
	const [brandName, setBrandName] = useState(profile?.brandName || profile?.brand_name || '');
	const [includeLogo, setIncludeLogo] = useState(false);
	const [includeWebsite, setIncludeWebsite] = useState(false);
	const [objective, setObjective] = useState('Conversión');
	const [audience, setAudience] = useState('');
	const [audienceReason, setAudienceReason] = useState('');
	const [audienceAlternatives, setAudienceAlternatives] = useState<VideoAudienceSuggestion[]>([]);
	const [objections, setObjections] = useState('');
	const [hookIdea, setHookIdea] = useState('');
	const [performanceDirection, setPerformanceDirection] = useState('');
	const [realismDirection, setRealismDirection] = useState('');
	const [benefit, setBenefit] = useState('');
	const [proof, setProof] = useState('');
	const [offer, setOffer] = useState('');
	const [cta, setCta] = useState('Descubrilo ahora');
	const [tone, setTone] = useState('UGC natural');
	const [castingMode, setCastingMode] = useState<CastingMode>('woman');
	const [creatorAge, setCreatorAge] = useState('25 a 35 años');
	const [creatorStyle, setCreatorStyle] = useState('Natural, auténtico y cercano; apariencia cotidiana, piel y movimientos realistas.');
	const [peopleDirection, setPeopleDirection] = useState('');
	const [savedAvatars, setSavedAvatars] = useState<SavedAvatar[]>([]);
	const [avatarId, setAvatarId] = useState('');
	const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
	const [preparingAvatar, setPreparingAvatar] = useState(false);
	const [avatarDescription, setAvatarDescription] = useState('');
	const [avatarConsent, setAvatarConsent] = useState(false);
	const [referenceMode, setReferenceMode] = useState('Idea + guion adaptado');
	const [preserveDirection, setPreserveDirection] = useState('El hook, el ritmo, la progresión de escenas, el tipo de demostración y la función persuasiva de cada parte.');
	const [changeDirection, setChangeDirection] = useState('Producto, marca, palabras, locación, personas, composición exacta y todos los claims.');
	const [productUsage, setProductUsage] = useState('');
	const [mustAvoid, setMustAvoid] = useState('');
	const [language, setLanguage] = useState('Español rioplatense');
	const [referenceDuration, setReferenceDuration] = useState(initialReferenceDuration);
	const [duration, setDuration] = useState(String(normalizeVideoDuration(initialReferenceDuration)));
	const [durationMode, setDurationMode] = useState<DurationMode>('reference');
	const [referenceSize, setReferenceSize] = useState<'720x1280' | '1280x720'>('720x1280');
	const [formatMode, setFormatMode] = useState<FormatMode>('reference');
	const [model] = useState('gemini-omni-flash-preview');
	const [musicMode, setMusicMode] = useState<MusicMode>('music');
	const [audioDirection, setAudioDirection] = useState('Música comercial moderna que acompañe los cortes, con efectos sutiles y sonido ambiente realista.');
	const [voiceoverMode, setVoiceoverMode] = useState<VoiceoverMode>('none');
	const [voiceover, setVoiceover] = useState('Voz natural, cálida y creíble; español rioplatense, sin tono de locutor tradicional.');
	const [speechMode, setSpeechMode] = useState<'adapt' | 'new' | 'none'>('adapt');
	const [dialogueInstructions, setDialogueInstructions] = useState('');
	const [captionMode, setCaptionMode] = useState<CaptionMode>('dynamic');
	const [captions, setCaptions] = useState('Textos grandes, breves y sincronizados con el mensaje; beneficio, prueba y CTA.');
	const [brief, setBrief] = useState('');
	const [productFiles, setProductFiles] = useState<File[]>([]);
	const [plan, setPlan] = useState<VideoPlan | null>(null);
	const [analysis, setAnalysis] = useState<VideoReferenceAnalysis | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [videoUrl, setVideoUrl] = useState('');
	const [error, setError] = useState('');
	const [creditCost, setCreditCost] = useState(videoCreditCost(String(normalizeVideoDuration(initialReferenceDuration))));

	const referenceVideoUrl = reference.metadata?.videoPath || '';
	const referencePosterUrl = reference.imagePath;
	const selectedProduct = savedProducts.find((product) => String(product.id) === productId);
	const selectedAvatar = savedAvatars.find((avatar) => avatar.id === avatarId);
	const outputSize = formatMode === 'reference' ? referenceSize : formatMode === 'vertical' ? '720x1280' : '1280x720';
	const avatarMode = castingMode === 'saved' ? 'saved' : castingMode === 'upload' ? 'upload' : castingMode === 'none' ? 'none' : 'original';
	const productPreviewUrls = useMemo(() => productFiles.map((file) => URL.createObjectURL(file)), [productFiles]);
	const avatarPreviewUrls = useMemo(() => avatarFiles.map((file) => URL.createObjectURL(file)), [avatarFiles]);
	const currentProductName = normalizeVideoProductName(selectedProduct?.name || importedProductName || productName.trim(), 'Tu producto');
	const displayWebsite = normalizeDisplayWebsite(profile?.website || (productMode === 'url' ? productUrl : ''));
	const isAdmin = isAdminEmail(session?.user?.email);
	useEffect(() => setCreditCost(videoCreditCost(duration)), [duration]);
	useEffect(() => {
		window.scrollTo(0, 0);
		return () => productPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
	}, [productPreviewUrls]);
	useEffect(() => () => avatarPreviewUrls.forEach((url) => URL.revokeObjectURL(url)), [avatarPreviewUrls]);
	useEffect(() => {
		let active = true;
		void fetch('/api/creativos/avatars', { headers: { authorization: `Bearer ${token}` } })
			.then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
			.then(({ response, payload }) => { if (active && response.ok) setSavedAvatars(payload.avatars || []); })
			.catch(() => undefined);
		return () => { active = false; };
	}, [token]);

	useEffect(() => {
		if (!jobId || !token) return;
		let cancelled = false;
		let timer: number | undefined;
		const poll = async () => {
			try {
				const response = await fetch(`/api/creativos/video-status?id=${encodeURIComponent(jobId)}`, { headers: { authorization: `Bearer ${token}` } });
				const payload = await response.json().catch(() => ({}));
				if (cancelled) return;
				if (!response.ok) throw new Error(payload.error || 'No se pudo consultar el video.');
				setProgress(Number(payload.progress || 0));
				if (payload.videoUrl) {
					if (payload.adCopy) setPlan((current) => ({ ...(current || {}), adCopy: payload.adCopy }));
					setVideoUrl(payload.videoUrl); setPhase('completed'); onToast?.('¡Video listo para descargar!'); return;
				}
				if (payload.status === 'failed') { setError(payload.error || 'El video no pudo generarse.'); setPhase('failed'); return; }
				timer = window.setTimeout(poll, 5000);
			} catch (cause) {
				if (!cancelled) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el video.'); timer = window.setTimeout(poll, 7000); }
			}
		};
		void poll();
		return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
	}, [jobId, onToast, token]);

	const selectAvatarFiles = async (selected: FileList | null) => {
		if (!selected?.length) { setAvatarFiles([]); return; }
		setPreparingAvatar(true); setError('');
		try { setAvatarFiles(await prepareReferenceImages(selected)); }
		finally { setPreparingAvatar(false); }
	};

	const personDirection = [
		castingMode === 'woman' && `Mujer creadora UGC de ${creatorAge}`,
		castingMode === 'man' && `Hombre creador UGC de ${creatorAge}`,
		castingMode === 'custom' && `Persona original de ${creatorAge}`,
		avatarMode === 'original' && creatorStyle,
		peopleDirection,
	].filter(Boolean).join('. ');
	const finalVoiceover = voiceoverMode === 'ai' ? voiceover : 'Sin voz en off.';
	const finalAudio = musicMode === 'none' ? 'Sin música. Solo sonido ambiente y efectos naturales necesarios.' : musicMode === 'ambient' ? `Sin canción. Sonido ambiente y efectos realistas. ${audioDirection}` : audioDirection;
	const finalCaptions = captionMode === 'none' ? 'Sin textos en pantalla, salvo marca o CTA final si es imprescindible.' : captionMode === 'minimal' ? `Textos mínimos: solo hook y CTA. ${captions}` : captions;

	const avatarValidationError = castingMode === 'saved' && !avatarId
		? 'Elegí uno de tus avatares guardados.'
		: castingMode === 'upload' && avatarFiles.length < 4
			? 'Subí al menos 4 fotos claras de la persona. Recomendamos entre 6 y 12.'
			: castingMode === 'upload' && !avatarConsent
				? 'Confirmá que tenés permiso para usar las imágenes del avatar.'
				: '';

	function updatePlan<K extends keyof VideoPlan>(key: K, value: VideoPlan[K]) {
		setPlan((current) => ({ ...(current || {}), [key]: value }));
	}
	const updateDialogue = (index: number, patch: Partial<VideoDialogueLine>) => setPlan((current) => ({
		...(current || {}),
		dialogueLines: (current?.dialogueLines || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
	}));

	function applySetupSuggestions(suggestions: VideoSetupSuggestions) {
		setSuggestionConcept(suggestions.concept);
		setReferenceMode(suggestions.referenceMode);
		setObjective(suggestions.objective);
		setAudience(suggestions.audience);
		setAudienceReason(suggestions.audienceReason);
		setAudienceAlternatives(suggestions.audienceAlternatives);
		setObjections(suggestions.objections);
		setHookIdea(suggestions.hookIdea);
		setPerformanceDirection(suggestions.performanceDirection);
		setRealismDirection(suggestions.realismDirection);
		setBenefit(suggestions.benefit);
		setProof(suggestions.proof);
		setOffer(suggestions.offer);
		setCta(suggestions.cta);
		setTone(suggestions.tone);
		setPreserveDirection(suggestions.preserveDirection);
		setChangeDirection(suggestions.changeDirection);
		setCastingMode(suggestions.castingMode);
		setCreatorAge(suggestions.creatorAge);
		setCreatorStyle(suggestions.creatorStyle);
		setPeopleDirection(suggestions.peopleDirection);
		setProductUsage(suggestions.productUsage);
		setMustAvoid(suggestions.mustAvoid);
		setLanguage(suggestions.language);
		setSpeechMode(suggestions.speechMode);
		setDialogueInstructions(suggestions.dialogueInstructions);
		setVoiceoverMode(suggestions.voiceoverMode);
		setVoiceover(suggestions.voiceover);
		setMusicMode(suggestions.musicMode);
		setAudioDirection(suggestions.audioDirection);
		setCaptionMode(suggestions.captionMode);
		setCaptions(suggestions.captions);
		setFormatMode(suggestions.formatMode);
		setSuggestedDuration(suggestions.durationSeconds);
		setSuggestedDurationReason(suggestions.durationReason);
		setDuration(String(suggestions.durationSeconds));
		setDurationMode('ai');
	}

	async function scanProductUrl(): Promise<ProductSuggestionContext | null> {
		if (!productUrl.trim()) { setError('Pegá la URL de la página de tu producto o servicio.'); return null; }
		setScanningProduct(true); setError('');
		try {
			const response = await fetch('/api/creativos/products', {
				method: 'POST',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ url: productUrl.trim() }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.importedIds?.length) throw new Error(payload.errors?.[0]?.error || payload.error || 'No pudimos analizar esa URL.');
			const importedId = String(payload.importedIds[0]);
			const imported = (payload.products || []).find((item: any) => String(item.id) === importedId);
			const cleanImportedName = normalizeVideoProductName(imported?.name, 'Producto analizado');
			setProductId(importedId);
			setImportedProductName(cleanImportedName);
			if (imported?.name) setProductName(cleanImportedName);
			if (imported?.description) setProductFacts(imported.description);
			onToast?.('Analizamos la página y cargamos los datos del producto.');
			return { productId: importedId, productName: cleanImportedName, productFacts: imported?.description || '' };
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No pudimos analizar esa URL.');
			return null;
		} finally { setScanningProduct(false); }
	}

	async function requestSetupSuggestions(context?: ProductSuggestionContext, force = false) {
		const suggestionContext = context || {
			productId: productMode === 'manual' ? '' : productId,
			productName: currentProductName,
			productFacts,
		};
		const fingerprint = [referenceVideoUrl, Math.round(referenceDuration), suggestionContext.productId, suggestionContext.productName, suggestionContext.productFacts, brandName.trim()].join('|');
		if (!force && suggestionsReady && suggestionFingerprint === fingerprint) return;
		setSuggestingSetup(true); setSuggestionsReady(false); setError('');
		try {
			const form = new FormData();
			form.set('referenceVideoUrl', referenceVideoUrl);
			form.set('referenceScript', reference.promptNotes || '');
			form.set('referenceDuration', String(referenceDuration || ''));
			form.set('productId', suggestionContext.productId || '');
			form.set('productName', suggestionContext.productName);
			form.set('productFacts', suggestionContext.productFacts || '');
			form.set('brandName', brandName.trim());
			const response = await fetch('/api/creativos/video-suggestions', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.suggestions) throw new Error(payload.error || 'No pudimos preparar las sugerencias.');
			applySetupSuggestions(payload.suggestions as VideoSetupSuggestions);
			setAnalysis(payload.analysis || null);
			setSuggestionSource(payload.source === 'fallback' ? 'fallback' : 'ai');
			setSuggestionFingerprint(fingerprint);
			setSuggestionsReady(true);
		} catch (cause) {
			const fallback = fallbackVideoSetupSuggestions({
				productName: suggestionContext.productName,
				brandName,
				productFacts: suggestionContext.productFacts,
				hasSpeakingPerson: true,
				referenceDuration,
			});
			applySetupSuggestions(fallback);
			setSuggestionSource('fallback');
			setSuggestionFingerprint(fingerprint);
			setSuggestionsReady(true);
			onToast?.(cause instanceof Error ? `${cause.message} Dejamos una propuesta base editable.` : 'Dejamos una propuesta base editable.');
		} finally {
			setSuggestingSetup(false);
		}
	}

	async function continueFromProduct() {
		setError('');
		let suggestionContext: ProductSuggestionContext;
		if (productMode === 'url') {
			const scanned = productId && importedProductName
				? { productId, productName: importedProductName, productFacts }
				: await scanProductUrl();
			if (!scanned) return;
			suggestionContext = scanned;
		} else if (productMode === 'saved') {
			if (!productId) { setError('Elegí uno de tus productos guardados.'); return; }
			suggestionContext = { productId, productName: selectedProduct?.name || 'Producto guardado', productFacts: selectedProduct?.description || '' };
		} else if (!productName.trim() || !productFiles.length) {
			setError('Escribí el nombre y subí al menos una foto real del producto.'); return;
		} else {
			suggestionContext = { productName: productName.trim(), productFacts: productFacts.trim() };
		}
		setStep(2);
		await requestSetupSuggestions(suggestionContext);
	}

	function appendBrief(form: FormData) {
		form.set('productId', productMode === 'manual' ? '' : productId);
		form.set('productName', productMode === 'manual' ? productName.trim() : currentProductName);
		form.set('productFacts', productFacts.trim());
		form.set('brandName', brandName.trim());
		form.set('includeLogo', includeLogo ? '1' : '0');
		form.set('includeWebsite', includeWebsite ? '1' : '0');
		form.set('displayWebsite', includeWebsite ? displayWebsite : '');
		form.set('objective', objective); form.set('audience', audience.trim()); form.set('benefit', benefit.trim());
		form.set('proof', proof.trim()); form.set('offer', offer.trim()); form.set('cta', cta.trim()); form.set('tone', tone);
		form.set('audienceReason', audienceReason.trim()); form.set('audienceAlternatives', JSON.stringify(audienceAlternatives)); form.set('objections', objections.trim()); form.set('hookIdea', hookIdea.trim());
		form.set('performanceDirection', performanceDirection.trim()); form.set('realismDirection', realismDirection.trim());
		form.set('language', language); form.set('duration', duration); form.set('size', outputSize); form.set('audioDirection', finalAudio);
		form.set('voiceover', finalVoiceover); form.set('captions', finalCaptions); form.set('peopleDirection', personDirection);
		form.set('speechMode', speechMode); form.set('dialogueInstructions', dialogueInstructions.trim());
		form.set('avatarMode', avatarMode); form.set('avatarId', avatarId); form.set('avatarDescription', avatarDescription.trim()); form.set('avatarConsent', String(avatarConsent));
		avatarFiles.forEach((file) => form.append('avatarImages', file));
		form.set('referenceMode', referenceMode); form.set('preserveDirection', preserveDirection.trim()); form.set('changeDirection', changeDirection.trim());
		form.set('productUsage', productUsage.trim()); form.set('mustAvoid', mustAvoid.trim());
		productFiles.forEach((file) => form.append('productImages', file));
	}

	const requestPlan = async () => {
		if (avatarValidationError) { setError(avatarValidationError); setStep(3); return; }
		setPhase('planning'); setStep(5); setError('');
		try {
			const form = new FormData();
			form.set('referencePosterUrl', referencePosterUrl);
			form.set('referenceVideoUrl', referenceVideoUrl);
			form.set('referenceScript', reference.promptNotes || '');
			form.set('referenceDuration', String(referenceDuration || ''));
			if (analysis) form.set('referenceAnalysis', JSON.stringify(analysis));
			appendBrief(form);
			const response = await fetch('/api/creativos/video-plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo crear el plan del video.');
			setAnalysis(payload.analysis || null); setPlan(payload.plan || {}); setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo crear el plan del video.'); setPhase('setup'); setStep(4);
		}
	};

	const start = async () => {
		if (!plan) return;
		setPhase('starting'); setError('');
		try {
			const form = new FormData();
			form.set('referenceVideoUrl', referenceVideoUrl); form.set('referencePosterUrl', referencePosterUrl); form.set('referenceScript', reference.promptNotes || ''); form.set('referenceDuration', String(referenceDuration || duration));
			form.set('videoPlan', JSON.stringify(plan)); appendBrief(form); form.set('brief', brief.trim()); form.set('model', model);
			const response = await fetch('/api/creativos/video-start', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar el video.');
			setCreditCost(Number(payload.creditCost ?? creditCost)); setJobId(payload.job?.id || null); setProgress(Number(payload.job?.progress || 0));
		} catch (cause) { setPhase('review'); setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el video.'); }
	};

	const stepLabels = ['Tu producto', 'La idea', 'Persona', 'Producción', 'Revisar guion'];
	const goBack = () => {
		if (phase === 'review' || phase === 'failed') { setPhase('setup'); setStep(4); setError(''); return; }
		if (step === 1) { onBack(); return; }
		setStep((step - 1) as 1 | 2 | 3 | 4 | 5);
	};

	return (
		<div className="video-guided-flow">
			<button type="button" className="video-creation-back" onClick={onBack}>← Volver a la biblioteca</button>
			<div className="creation-flow-layout video-creation-grid">
				<aside className="creation-flow-aside video-reference-aside">
					<div className="video-reference-frame">
						<video
							src={referenceVideoUrl}
							poster={referencePosterUrl}
							controls
							playsInline
							className="video-reference-player"
							onLoadedMetadata={(event) => {
								const video = event.currentTarget;
								const detectedDuration = Number(reference.metadata?.durationSec) || video.duration || 8;
								setReferenceDuration(detectedDuration);
								setReferenceSize(video.videoWidth >= video.videoHeight ? '1280x720' : '720x1280');
								if (durationMode === 'reference') setDuration(String(normalizeVideoDuration(detectedDuration)));
							}}
						/>
						<div className="video-reference-badges"><span>▶ Video ganador</span><span>≈ {Math.round(referenceDuration)} s</span></div>
					</div>

				</aside>

				<section className="video-creation-form-panel video-image-flow-panel">
					<header className="video-flow-title">
						<div><span className="studio-kicker">CREAR CON ESTE VIDEO</span><h1>Adaptá la idea ganadora a tu negocio</h1><p>Te guiamos, analizamos el video y preparamos el guion antes de generar.</p></div>
						<span className={`video-creation-cost ${isAdmin ? 'admin' : ''}`}>{phase === 'review' ? 'Plan listo' : isAdmin ? 'Admin · generación sin créditos' : `${creditCost} créditos al generar`}</span>
					</header>

					<ol className="wiz-progress video-five-step-progress" aria-label="Progreso del video">
						{stepLabels.map((label, index) => <li key={label} className={`wiz-progress-item ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'done' : ''}`}><span className="wiz-progress-dot">{step > index + 1 ? '✓' : index + 1}</span><span className="wiz-progress-label">{label}</span></li>)}
					</ol>

					{phase === 'setup' && step === 1 && <div className="wiz-step video-wizard-step"><div className="wiz-body">
						<label className="picker-label">¿Qué vas a promocionar?</label>
						<p className="batch-detail-help">Elegí la forma más fácil de contarnos qué producto o servicio debe aparecer.</p>
						<div className="wiz-tabs video-product-tabs">
							{([['url', '🔗', 'Con URL', 'Analizamos tu página'], ['saved', '📦', 'Ya guardado', 'Elegí de Mi marca'], ['manual', '✍️', 'Cargar a mano', 'Fotos y datos']] as const).map(([value, icon, label, hint]) => <button type="button" key={value} className={`wiz-tab ${productMode === value ? 'active' : ''}`} onClick={() => { setProductMode(value); setProductId(''); setImportedProductName(''); setSuggestionsReady(false); setError(''); }}><span className="wiz-tab-icon">{icon}</span><span className="wiz-tab-label">{label}</span><small>{hint}</small></button>)}
						</div>
						{productMode === 'url' && <div className="video-url-intake"><label htmlFor="video-product-url">URL del producto o servicio</label><UrlInput id="video-product-url" value={productUrl} onChange={(next) => { setProductUrl(next); setProductId(''); setImportedProductName(''); }} placeholder="Ej.: https://mitienda.com/producto" ariaLabel="URL del producto o servicio" /><small>Leemos nombre, descripción, precio, imágenes y datos reales de la página.</small>{productId && importedProductName && <div className="video-product-ready"><span>✓</span><p><strong>{importedProductName}</strong><small>Producto analizado y listo para adaptar</small></p></div>}</div>}
						{productMode === 'saved' && <div className="video-saved-product-grid">{savedProducts.length ? savedProducts.map((product) => <button type="button" key={product.id} className={productId === String(product.id) ? 'active' : ''} onClick={() => setProductId(String(product.id))}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>📦</span>}<div><strong>{product.name}</strong><small>{product.description || 'Producto guardado'}</small></div>{productId === String(product.id) && <b>✓</b>}</button>) : <p className="video-empty-choice">Todavía no hay productos guardados. Usá una URL o cargalo a mano.</p>}</div>}
						{productMode === 'manual' && <div className="video-manual-product"><label className="video-file-picker"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductFiles(Array.from(event.target.files || []).slice(0, 5))} /><span>{productFiles.length ? `✓ ${productFiles.length} foto${productFiles.length === 1 ? '' : 's'} cargada${productFiles.length === 1 ? '' : 's'}` : '📸 Elegir entre 1 y 5 fotos reales'}</span><small>Frente, lateral, packaging, etiqueta y producto en uso</small></label>{productPreviewUrls.length > 0 && <div className="video-product-reference-grid">{productPreviewUrls.map((url, index) => <img key={url} src={url} alt={`Referencia ${index + 1} del producto`} className="video-product-preview" />)}</div>}<div className="video-wizard-fields"><label>Nombre del producto</label><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ej.: Sérum hidratante Hydra 10" /><label>¿Qué deberíamos saber?</label><textarea value={productFacts} onChange={(event) => setProductFacts(event.target.value)} placeholder="Ej.: hidrata 24 h, apto para piel sensible, cuesta $29.900 y tiene envío gratis" rows={3} /></div></div>}
						{productMode !== 'manual' && <label className="video-file-picker compact"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductFiles(Array.from(event.target.files || []).slice(0, 4))} /><span>{productFiles.length ? `✓ ${productFiles.length} vista${productFiles.length === 1 ? '' : 's'} adicional${productFiles.length === 1 ? '' : 'es'}` : '＋ Sumar fotos del producto (opcional)'}</span><small>Más ángulos ayudan a mantener el producto real</small></label>}
						<div className="video-wizard-fields"><label>Nombre de la marca</label><input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Ej.: MiMarca" /></div>
					</div></div>}

					{phase === 'setup' && step === 2 && <div className="wiz-step video-wizard-step"><div className="wiz-body">
						{suggestingSetup ? <div className="video-ai-analysis-state" role="status" aria-live="polite">
							<div className="video-ai-orbit"><span>✦</span><i /><i /><i /></div>
							<span className="studio-kicker">DIRECCIÓN CREATIVA CON IA</span>
							<h2>Estamos armando tu mejor versión</h2>
							<p>Combinamos lo que funciona del video ganador con los datos reales de tu producto.</p>
							<div><span>✓ Analizando hook, escenas y diálogo</span><span>✓ Detectando público, beneficio y prueba</span><span>✓ Eligiendo tono, persona, audio y textos</span></div>
						</div> : <>
						{suggestionsReady && <div className="video-ai-suggestion-card">
							<div className="video-ai-suggestion-heading"><span>✦ Propuesta de la IA</span><small>{suggestionSource === 'ai' ? `${productMode === 'url' ? 'Página' : 'Producto'} + video analizados` : 'Propuesta base automática'}</small></div>
							<p>{suggestionConcept}</p>
							<div className="video-ai-suggestion-actions"><span>✓ Estrategia, público, persona, formato, duración, diálogo y audio listos</span><div><button type="button" onClick={() => void requestSetupSuggestions(undefined, true)}>Volver a analizar</button><button type="button" className="primary" onClick={() => void requestPlan()}>Crear guion con esta propuesta →</button></div></div>
						</div>}
						<label className="picker-label">¿Qué querés tomar del anuncio ganador?</label><p className="batch-detail-help">La IA siempre crea una ejecución nueva. Elegí qué parte de la estrategia querés conservar.</p>
						<div className="video-option-grid video-reference-mode-grid">{REFERENCE_MODES.map(([value, hint]) => <button type="button" key={value} className={referenceMode === value ? 'active' : ''} onClick={() => setReferenceMode(value)}><strong>{value}</strong><small>{hint}</small>{referenceMode === value && <b>✓</b>}</button>)}</div>
						<details className="video-advanced-details"><summary>Ajustar qué conservar y qué cambiar</summary><div className="video-wizard-fields"><label>Conservar de la idea</label><textarea value={preserveDirection} onChange={(event) => setPreserveDirection(event.target.value)} rows={3} /><label>Cambiar para mi versión</label><textarea value={changeDirection} onChange={(event) => setChangeDirection(event.target.value)} rows={3} /></div></details>
						<label className="picker-label">¿Qué tiene que lograr?</label><div className="video-option-grid">{OBJECTIVES.map(([value, hint]) => <button type="button" key={value} className={objective === value ? 'active' : ''} onClick={() => setObjective(value)}><strong>{value}</strong><small>{hint}</small></button>)}</div>
						<div className="video-wizard-fields video-brief-fields"><label>¿A quién le hablamos?</label><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ej.: mujeres de 25 a 40 con piel sensible" /><label>¿Cuál es el beneficio principal?</label><input value={benefit} onChange={(event) => setBenefit(event.target.value)} placeholder="Ej.: hidrata sin dejar sensación grasa" /><label>¿Qué prueba podemos mostrar?</label><input value={proof} onChange={(event) => setProof(event.target.value)} placeholder="Ej.: textura real, ingrediente, reseña o resultado verificable" /><div className="video-form-row"><div><label>Oferta, si existe</label><input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Ej.: 20% off o envío gratis" /></div><div><label>Acción final</label><input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Ej.: Compralo hoy" /></div></div></div>
						{suggestionsReady && <section className="video-ai-strategy-board">
							<header><span>✦</span><div><strong>La IA ya eligió el enfoque más fuerte</strong><small>Basado en la página, el producto y la mecánica del video ganador.</small></div></header>
							<div className="video-ai-strategy-grid"><article><small>PÚBLICO RECOMENDADO</small><strong>{audience}</strong><p>{audienceReason}</p></article><article><small>HOOK ADAPTADO</small><strong>{hookIdea}</strong><p>La IA lo convertirá en apertura visual y verbal.</p></article></div>
							<details><summary>Ver públicos alternativos y dirección completa</summary><div className="video-audience-alternatives">{audienceAlternatives.map((item) => <button type="button" key={`${item.name}-${item.ageRange}`} onClick={() => { setAudience(`${item.name}, ${item.ageRange}: ${item.insight}`); setAudienceReason(item.angle); }}><span>{item.ageRange}</span><strong>{item.name}</strong><small>{item.insight}</small><em>{item.angle}</em></button>)}</div><div className="video-wizard-fields"><label>Objeciones que debe resolver</label><textarea value={objections} onChange={(event) => setObjections(event.target.value)} rows={2} /><label>Dirección de actuación natural</label><textarea value={performanceDirection} onChange={(event) => setPerformanceDirection(event.target.value)} rows={2} /><label>Reglas de realismo</label><textarea value={realismDirection} onChange={(event) => setRealismDirection(event.target.value)} rows={3} /></div></details>
						</section>}
						<label className="picker-label">Tono del anuncio</label><div className="video-chip-row">{TONES.map((item) => <button type="button" key={item} className={tone === item ? 'active' : ''} onClick={() => setTone(item)}>{item}</button>)}</div>
						</>}
					</div></div>}

					{phase === 'setup' && step === 3 && <div className="wiz-step video-wizard-step"><div className="wiz-body">
						<label className="picker-label">¿Quién aparece en el video?</label><p className="batch-detail-help">La persona del ganador nunca se copia. Podés crear otra persona o usar una identidad autorizada.</p>
						<div className="video-option-grid video-casting-grid">{CASTING_MODES.map(([value, label, hint]) => <button type="button" key={value} className={castingMode === value ? 'active' : ''} onClick={() => { setCastingMode(value); setError(''); }}><strong>{label}</strong><small>{hint}</small>{castingMode === value && <b>✓</b>}</button>)}</div>
						{(['woman', 'man', 'custom'] as CastingMode[]).includes(castingMode) && <div className="video-casting-direction"><div className="video-form-row"><div className="video-wizard-fields"><label>Edad aproximada</label><input value={creatorAge} onChange={(event) => setCreatorAge(event.target.value)} placeholder="Ej.: 30 a 40 años" /></div><div className="video-wizard-fields"><label>Contexto o profesión</label><input value={peopleDirection} onChange={(event) => setPeopleDirection(event.target.value)} placeholder="Ej.: dermatóloga, madre, entrenador" /></div></div><div className="video-wizard-fields"><label>Estilo y energía</label><textarea value={creatorStyle} onChange={(event) => setCreatorStyle(event.target.value)} rows={3} placeholder="Ej.: natural, simpática, ropa cotidiana, luz de ventana y gestos realistas" /></div><div className="video-realism-note"><span>◎</span><p><strong>Identidad original y realista</strong><small>La IA usa el rol y la actuación del ganador, pero crea una persona claramente diferente.</small></p></div></div>}
						{castingMode === 'saved' && <div className="video-avatar-picker">{savedAvatars.length ? savedAvatars.map((avatar) => <button type="button" key={avatar.id} className={avatarId === avatar.id ? 'active' : ''} onClick={() => setAvatarId(avatar.id)}>{avatar.coverUrl ? <img src={avatar.coverUrl} alt="" /> : <span>{avatar.name.slice(0, 1)}</span>}<div><strong>{avatar.name}</strong><small>{avatar.imageCount} fotos de referencia</small></div></button>) : <p>No guardaste avatares todavía. Podés elegir “Cargar avatar” o crearlo después en Mi marca.</p>}</div>}
						{castingMode === 'upload' && <div className="video-avatar-upload"><div className="video-avatar-guide"><strong>Subí entre 6 y 12 fotos para máxima precisión</strong><span>✓ frente · ✓ perfiles · ✓ expresiones · ✓ cuerpo medio · ✓ luz clara</span><small>Evitá filtros, anteojos oscuros, fotos borrosas y grupos. Mínimo: 4 fotos.</small></div><label className="video-file-picker avatar"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectAvatarFiles(event.target.files)} disabled={preparingAvatar} /><span>{preparingAvatar ? 'Optimizando fotos…' : avatarFiles.length ? `✓ ${avatarFiles.length} fotos del avatar` : '👤 Elegir fotos de la persona'}</span></label>{avatarPreviewUrls.length > 0 && <div className="video-avatar-preview-grid">{avatarPreviewUrls.map((url, index) => <img key={url} src={url} alt={`Referencia ${index + 1} del avatar`} />)}</div>}<label className="video-avatar-consent"><input type="checkbox" checked={avatarConsent} onChange={(event) => setAvatarConsent(event.target.checked)} /><span>Confirmo que soy esta persona o tengo autorización para usar su imagen.</span></label></div>}
						{(castingMode === 'saved' || castingMode === 'upload') && <div className="video-wizard-fields"><label>Detalles que deben mantenerse</label><textarea value={avatarDescription} onChange={(event) => setAvatarDescription(event.target.value)} rows={3} placeholder={selectedAvatar?.description || 'Ej.: pelo suelto, sonrisa suave, estilo natural y vestuario neutro'} /></div>}
						<div className="video-wizard-fields"><label>¿Cómo se muestra o usa el producto?</label><textarea value={productUsage} onChange={(event) => setProductUsage(event.target.value)} placeholder="Ej.: abre el envase, aplica dos gotas y muestra la textura de cerca" rows={3} /><label>¿Qué no debe aparecer ni afirmarse?</label><textarea value={mustAvoid} onChange={(event) => setMustAvoid(event.target.value)} placeholder="Ej.: no prometer resultados médicos, no cambiar el envase, no mostrar logos ajenos" rows={3} /></div>
					</div></div>}

					{phase === 'setup' && step === 4 && <div className="wiz-step video-wizard-step"><div className="wiz-body">
						<label className="picker-label">Formato del video</label><p className="batch-detail-help">Podés respetar la orientación del ganador o adaptarlo a otro canal.</p>
						<div className="batch-format-grid video-format-grid">{([['reference', 'original', 'Igual al ganador', referenceSize === '720x1280' ? 'Vertical 9:16' : 'Horizontal 16:9'], ['vertical', 'story', 'Vertical 9:16', 'Reels, Stories y TikTok'], ['horizontal', 'landscape', 'Horizontal 16:9', 'YouTube y sitios web']] as const).map(([value, shape, label, hint]) => <button key={value} type="button" className={`batch-format-card ${formatMode === value ? 'active' : ''}`} onClick={() => setFormatMode(value)}><span className={`batch-format-shape shape-${shape === 'original' ? (referenceSize === '720x1280' ? 'story' : 'landscape') : shape}`} aria-hidden="true"><i /></span><span className="batch-format-copy"><strong>{label}</strong><small>{hint}</small></span>{formatMode === value && <b>✓</b>}</button>)}</div>
						<label className="picker-label">Duración final</label><p className="batch-detail-help">La IA ya eligió una duración según el hook, el diálogo y la prueba. Podés dejarla, igualar al ganador o escribir cualquier tiempo.</p>
						<div className="video-option-grid video-duration-grid">
							<button type="button" className={durationMode === 'ai' ? 'active' : ''} onClick={() => { setDuration(String(suggestedDuration)); setDurationMode('ai'); }}><strong>Recomendada por IA · {suggestedDuration} s</strong><small>{suggestedDurationReason}</small>{durationMode === 'ai' && <b>✓</b>}</button>
							<button type="button" className={durationMode === 'reference' ? 'active' : ''} onClick={() => { setDuration(String(normalizeVideoDuration(referenceDuration))); setDurationMode('reference'); }}><strong>Igual al ganador · {normalizeVideoDuration(referenceDuration)} s</strong><small>Conserva exactamente la duración y el ritmo de referencia.</small>{durationMode === 'reference' && <b>✓</b>}</button>
							<div className={`video-custom-duration-card ${durationMode === 'custom' ? 'active' : ''}`}><button type="button" onClick={() => setDurationMode('custom')}><strong>Elegir duración</strong><small>Cualquier valor entre 4 y 30 segundos.</small></button><label><input aria-label="Duración personalizada" type="number" min="4" max="30" step="1" value={duration} onFocus={() => setDurationMode('custom')} onChange={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 4 && next <= 30) { setDuration(String(next)); setDurationMode('custom'); } }} /><span>segundos</span></label>{durationMode === 'custom' && <b>✓</b>}</div>
						</div>
						<div className="video-duration-custom"><span>Atajos:</span><div className="video-chip-row">{QUICK_DURATIONS.map((item) => <button type="button" key={item} className={durationMode === 'custom' && duration === String(item) ? 'active' : ''} onClick={() => { setDuration(String(item)); setDurationMode('custom'); }}>{item} s</button>)}</div><b>{creditCost} créditos</b></div>
						<div className="video-wizard-fields"><label>Idioma del anuncio</label><select value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGE_OPTIONS.map(([value, flag, label]) => <option key={value} value={value}>{flag} {label}</option>)}</select></div>
						<div className="video-branding-grid">
							<fieldset><legend>Logo dentro del video</legend><div className="batch-style-options"><button type="button" className={!includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(false)}>Sin logo</button><button type="button" className={includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(true)}>Incluir logo</button></div><small>Usa únicamente el logo oficial guardado en Mi marca. Por defecto no se agrega.</small></fieldset>
							<fieldset><legend>URL dentro del video</legend><div className="batch-style-options"><button type="button" className={!includeWebsite ? 'active' : ''} onClick={() => setIncludeWebsite(false)}>No mostrar</button><button type="button" className={includeWebsite ? 'active' : ''} onClick={() => setIncludeWebsite(true)}>Mostrar URL</button></div><small>{includeWebsite ? (displayWebsite ? `Se mostrará sólo ${displayWebsite}.` : 'Usaremos el dominio guardado con el producto o en Mi marca.') : 'La URL sirve para analizar el producto, pero no aparecerá en el video.'}</small></fieldset>
						</div>
						<label className="picker-label">Si aparece alguien hablando</label><div className="video-option-grid">{SPEECH_MODES.map(([value, label, hint]) => <button type="button" key={value} className={speechMode === value ? 'active' : ''} onClick={() => setSpeechMode(value)}><strong>{label}</strong><small>{hint}</small></button>)}</div>
						{speechMode !== 'none' && <div className="video-wizard-fields"><label>¿Qué debe decir sí o sí?</label><textarea value={dialogueInstructions} onChange={(event) => setDialogueInstructions(event.target.value)} rows={3} placeholder={`Ej.: nombrar a ${brandName || 'MiMarca'}, explicar el beneficio de ${currentProductName} y cerrar con “${cta}”`} /></div>}
						<div className="video-audio-grid"><fieldset><legend>Voz en off</legend><div className="batch-style-options"><button type="button" className={voiceoverMode === 'none' ? 'active' : ''} onClick={() => setVoiceoverMode('none')}>Sin voz en off</button><button type="button" className={voiceoverMode === 'ai' ? 'active' : ''} onClick={() => setVoiceoverMode('ai')}>Con voz en off</button></div>{voiceoverMode === 'ai' && <textarea value={voiceover} onChange={(event) => setVoiceover(event.target.value)} rows={3} placeholder="Ej.: voz femenina cálida, natural y rioplatense" />}</fieldset><fieldset><legend>Música y sonido</legend><div className="batch-style-options"><button type="button" className={musicMode === 'music' ? 'active' : ''} onClick={() => setMusicMode('music')}>Con música</button><button type="button" className={musicMode === 'ambient' ? 'active' : ''} onClick={() => setMusicMode('ambient')}>Solo ambiente</button><button type="button" className={musicMode === 'none' ? 'active' : ''} onClick={() => setMusicMode('none')}>Sin música</button></div>{musicMode !== 'none' && <textarea value={audioDirection} onChange={(event) => setAudioDirection(event.target.value)} rows={3} placeholder="Ej.: beat moderno suave y efectos sincronizados" />}</fieldset></div>
						<fieldset className="video-caption-fieldset"><legend>Textos en pantalla</legend><div className="batch-style-options"><button type="button" className={captionMode === 'dynamic' ? 'active' : ''} onClick={() => setCaptionMode('dynamic')}>Dinámicos</button><button type="button" className={captionMode === 'minimal' ? 'active' : ''} onClick={() => setCaptionMode('minimal')}>Mínimos</button><button type="button" className={captionMode === 'none' ? 'active' : ''} onClick={() => setCaptionMode('none')}>Sin textos</button></div>{captionMode !== 'none' && <textarea value={captions} onChange={(event) => setCaptions(event.target.value)} rows={2} />}</fieldset>
					</div></div>}

					{phase === 'planning' && <div className="video-analysis-progress"><span className="studio-spinner" aria-hidden="true" /><h2>Estamos analizando el video completo</h2><p>Leemos escenas, hook, ritmo, guion, personas, audio y cierre. Después vas a poder revisar todo antes de generar.</p><div className="video-progress-track"><span style={{ width: '58%' }} /></div><ul><li>Referencia ganadora</li><li>Producto y marca</li><li>Guion adaptado</li><li>Plan de escenas</li></ul></div>}

					{phase === 'review' && plan && <div className="video-wizard-step video-plan-review">
						<div className="video-plan-header"><div><span className="picker-label">PLAN Y GUION CREADOS PARA {currentProductName.toUpperCase()}</span><p>Revisá y corregí todo. Todavía no gastaste créditos.</p></div><button type="button" className="video-secondary-button" onClick={() => void requestPlan()}>✨ Rehacer plan</button></div>
						{analysis && <div className="video-analysis-summary"><article><span>01</span><div><strong>Hook detectado</strong><p>{analysis.hook}</p></div></article><article><span>02</span><div><strong>Idea que conservamos</strong><p>{referenceMode}: {analysis.pacing}</p></div></article><article><span>03</span><div><strong>Diálogo de referencia</strong><p>{analysis.hasSpeakingPerson ? analysis.dialoguePurpose || analysis.referenceDialogueSummary : 'No depende de una persona hablando.'}</p></div></article><article><span>04</span><div><strong>Nuestra adaptación</strong><p>{currentProductName} · {objective} · {duration} s · {language} · {includeLogo ? 'con logo' : 'sin logo'} · {includeWebsite ? `con URL${displayWebsite ? ` ${displayWebsite}` : ''}` : 'sin URL'}</p></div></article></div>}
						<div className="video-review-section"><header><span>⚡</span><div><strong>Hook y mensaje</strong><small>Lo que captura la atención y presenta la promesa.</small></div></header><div className="video-wizard-fields"><label>Primeros segundos</label><textarea value={plan.hook || ''} onChange={(event) => updatePlan('hook', event.target.value)} rows={2} /><label>Mensaje central</label><textarea value={plan.coreMessage || ''} onChange={(event) => updatePlan('coreMessage', event.target.value)} rows={2} /><label>Estilo visual</label><textarea value={plan.visualStyle || ''} onChange={(event) => updatePlan('visualStyle', event.target.value)} rows={2} /></div></div>
						<div className="video-review-section"><header><span>🎬</span><div><strong>Escenas y tiempos</strong><small>Acción, cámara, producto, texto y audio de cada momento.</small></div><button type="button" onClick={() => updatePlan('scenes', [...(plan.scenes || []), 'Nueva escena: tiempo, acción, cámara, producto, texto y audio.'])}>＋ Agregar</button></header><div className="video-scenes-list">{(plan.scenes || []).map((scene, index) => <div className="video-scene-editor" key={`${index}-${scene.slice(0, 12)}`}><span>{String(index + 1).padStart(2, '0')}</span><textarea value={scene} onChange={(event) => updatePlan('scenes', (plan.scenes || []).map((item, itemIndex) => itemIndex === index ? event.target.value : item))} rows={3} /><button type="button" onClick={() => updatePlan('scenes', (plan.scenes || []).filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar escena">×</button></div>)}</div></div>
						{speechMode !== 'none' && <div className="video-review-section video-script-review"><header><span>💬</span><div><strong>Guion hablado</strong><small>Estas son las palabras exactas para tu marca y producto.</small></div><button type="button" onClick={() => setPlan((current) => ({ ...(current || {}), hasSpokenDialogue: true, dialogueLines: [...(current?.dialogueLines || []), { start: 0, end: 3, speaker: castingMode === 'man' ? 'Creador' : 'Creadora', line: '', delivery: 'Natural y mirando a cámara' }] }))}>＋ Frase</button></header><div className="video-dialogue-list">{(plan.dialogueLines || []).map((dialogue, index) => <article key={`dialogue-${index}`}><div className="video-dialogue-time"><input type="number" min="0" max={duration} step="0.5" value={dialogue.start} onChange={(event) => updateDialogue(index, { start: Number(event.target.value) })} aria-label={`Inicio diálogo ${index + 1}`} /><span>—</span><input type="number" min="0" max={duration} step="0.5" value={dialogue.end} onChange={(event) => updateDialogue(index, { end: Number(event.target.value) })} aria-label={`Fin diálogo ${index + 1}`} /><b>s</b></div><div className="video-dialogue-copy"><input value={dialogue.speaker} onChange={(event) => updateDialogue(index, { speaker: event.target.value })} aria-label={`Persona diálogo ${index + 1}`} /><textarea value={dialogue.line} onChange={(event) => updateDialogue(index, { line: event.target.value })} rows={2} aria-label={`Diálogo ${index + 1}`} /><input value={dialogue.delivery} onChange={(event) => updateDialogue(index, { delivery: event.target.value })} placeholder="Cómo debe decirlo" aria-label={`Actuación diálogo ${index + 1}`} /></div><button type="button" onClick={() => setPlan((current) => ({ ...(current || {}), dialogueLines: (current?.dialogueLines || []).filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Eliminar diálogo">×</button></article>)}</div><div className="video-script-check">✓ Revisá que marca, beneficio, oferta y CTA sean correctos. La persona moverá los labios siguiendo este texto.</div></div>}
						<div className="video-review-section"><header><span>🔊</span><div><strong>Audio, textos y cierre</strong><small>La capa final que acompaña las escenas.</small></div></header><div className="video-form-row"><div className="video-wizard-fields"><label>Voz en off final</label><textarea value={plan.voiceover || ''} onChange={(event) => updatePlan('voiceover', event.target.value)} rows={3} /></div><div className="video-wizard-fields"><label>Música y sonido</label><textarea value={plan.audio || ''} onChange={(event) => updatePlan('audio', event.target.value)} rows={3} /></div></div><div className="video-form-row"><div className="video-wizard-fields"><label>Textos en pantalla</label><textarea value={plan.captions || ''} onChange={(event) => updatePlan('captions', event.target.value)} rows={3} /></div><div className="video-wizard-fields"><label>CTA final</label><input value={plan.cta || ''} onChange={(event) => updatePlan('cta', event.target.value)} /></div></div></div>
						<div className="video-wizard-fields"><label>Última indicación para la IA (opcional)</label><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} placeholder="Ej.: que el producto se vea igual a las fotos y que el tono sea cotidiano, no publicitario" /></div>
					</div>}

					{phase === 'starting' && <div className="video-job-progress"><div><strong>Generando tu video…</strong><span>{progress}%</span></div><div className="video-progress-track"><span style={{ width: `${Math.max(5, progress)}%` }} /></div><small>La generación puede tardar varios minutos. Podés dejar esta pestaña abierta.</small></div>}
					{error && <p className="video-form-error">{error}</p>}

					{phase === 'setup' && <div className="wiz-actions video-wizard-actions"><button type="button" className="wiz-back" onClick={goBack} disabled={suggestingSetup}>← Atrás</button>{step === 1 ? <button type="button" className="url-batch-submit-btn" onClick={() => void continueFromProduct()} disabled={scanningProduct}>{scanningProduct ? <><span className="studio-spinner small" /> Analizando URL…</> : 'Continuar'}</button> : step < 4 ? <button type="button" className="url-batch-submit-btn" disabled={suggestingSetup} onClick={() => { if (step === 3 && avatarValidationError) { setError(avatarValidationError); return; } setError(''); setStep((step + 1) as 1 | 2 | 3 | 4); }}>Continuar</button> : <div className="batch-continue-wrap"><button type="button" className="url-batch-submit-btn" onClick={() => void requestPlan()}>Analizar y crear guion</button><span className="batch-credit-note">Todavía no gastás créditos</span></div>}</div>}
					{phase === 'review' && <div className="wiz-actions video-review-actions"><button type="button" className="wiz-back" onClick={goBack}>← Ajustes</button><button type="button" className="url-batch-submit-btn" onClick={() => void start()}><span>{isAdmin ? 'Aprobar y generar ✓ · Admin' : `Aprobar y generar ✓ · ${creditCost} créditos`}</span></button></div>}
					{phase === 'failed' && <button type="button" className="video-secondary-button" onClick={() => { setPhase('review'); setError(''); }}>Volver al plan</button>}
				</section>
			</div>

			{videoUrl && <section className="video-result-panel"><span className="studio-kicker">VIDEO LISTO</span><h2>Tu versión está lista para publicar.</h2><p>Se generó usando el plan, el producto y la identidad que revisaste.</p><video src={videoUrl} controls playsInline className="video-result-player" /><a className="video-download-button" href={videoUrl} download>Descargar MP4 ↓</a></section>}
		</div>
	);
}
