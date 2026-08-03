import React, { useEffect, useMemo, useState } from 'react';
import type { SavedAvatar } from './AvatarManager';
import { prepareReferenceImages } from '../../lib/creattia/client-image';
import { videoCreditCost, type VideoDialogueLine } from '../../lib/creattia/video-pipeline';

type VideoReference = {
	name: string;
	imagePath: string;
	promptNotes?: string | null;
	metadata?: { videoPath?: string; durationSec?: number };
};

type VideoPlan = {
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
};

type Props = {
	reference: VideoReference;
	session: any;
	profile?: any;
	savedProducts: any[];
	onBack: () => void;
	onToast?: (message: string) => void;
};

const OBJECTIVES = [
	['Conversión', 'Vender o llevar a una acción concreta'],
	['Reconocimiento', 'Que recuerden tu marca y producto'],
	['UGC / Testimonial', 'Que parezca una recomendación real'],
	['Demostración', 'Mostrar cómo funciona y qué resuelve'],
] as const;

const TONES = ['UGC natural', 'Premium', 'Directo y vendedor', 'Educativo', 'Emocional', 'Divertido'];

const REFERENCE_MODES = [
	['Fiel a la idea', 'Conservar la lógica del hook y el ritmo, sin repetir planos cuadro por cuadro'],
	['Equilibrado', 'Mantener la estrategia ganadora y adaptar la ejecución a tu marca'],
	['Inspiración', 'Tomar solo la idea central y crear una ejecución más libre'],
] as const;

const PERSON_MODES = [
	['original', 'Persona nueva', 'Crear alguien original, diferente de la persona del anuncio ganador'],
	['saved', 'Mi avatar', 'Usar una identidad que ya guardaste en Mi marca'],
	['upload', 'Cargar ahora', 'Subir varias fotos para usar solo en este video'],
	['none', 'Sin personas', 'Resolver el anuncio únicamente con producto, manos o escenas'],
] as const;

const SPEECH_MODES = [
	['adapt', 'Adaptar el diálogo', 'Mantiene la función y el ritmo, pero escribe palabras nuevas para tu marca.'],
	['new', 'Crear un diálogo nuevo', 'Crea un guion original según el producto, objetivo y público.'],
	['none', 'Sin diálogo', 'Nadie habla; el mensaje se resuelve con imagen, música y textos.'],
] as const;

export default function VideoCreationFlow({ reference, session, profile, savedProducts, onBack, onToast }: Props) {
	const token = session?.access_token || '';
	const [step, setStep] = useState(1);
	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting' | 'completed' | 'failed'>('setup');
	const [productId, setProductId] = useState('');
	const [productName, setProductName] = useState('');
	const [productFacts, setProductFacts] = useState('');
	const [brandName, setBrandName] = useState(profile?.brandName || profile?.brand_name || '');
	const [objective, setObjective] = useState('Conversión');
	const [audience, setAudience] = useState('');
	const [benefit, setBenefit] = useState('');
	const [proof, setProof] = useState('');
	const [offer, setOffer] = useState('');
	const [cta, setCta] = useState('Descubrilo ahora');
	const [tone, setTone] = useState('UGC natural');
	const [peopleDirection, setPeopleDirection] = useState('');
	const [avatarMode, setAvatarMode] = useState<'original' | 'saved' | 'upload' | 'none'>('original');
	const [savedAvatars, setSavedAvatars] = useState<SavedAvatar[]>([]);
	const [avatarId, setAvatarId] = useState('');
	const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
	const [preparingAvatar, setPreparingAvatar] = useState(false);
	const [avatarDescription, setAvatarDescription] = useState('');
	const [avatarConsent, setAvatarConsent] = useState(false);
	const [referenceMode, setReferenceMode] = useState('Equilibrado');
	const [preserveDirection, setPreserveDirection] = useState('El hook, el ritmo, la progresión de escenas y el tipo de demostración.');
	const [changeDirection, setChangeDirection] = useState('Producto, marca, textos, locación, personas y todos los claims.');
	const [productUsage, setProductUsage] = useState('');
	const [mustAvoid, setMustAvoid] = useState('');
	const [language, setLanguage] = useState('Español rioplatense');
	const [duration, setDuration] = useState('8');
	const [size, setSize] = useState('720x1280');
	const [model] = useState('gemini-omni-flash-preview');
	const [audioDirection, setAudioDirection] = useState('Música comercial moderna, con sonido ambiente suave.');
	const [voiceover, setVoiceover] = useState('Sin voz en off; usar textos breves y demostración visual.');
	const [speechMode, setSpeechMode] = useState<'adapt' | 'new' | 'none'>('adapt');
	const [dialogueInstructions, setDialogueInstructions] = useState('');
	const [captions, setCaptions] = useState('Textos grandes, breves y fáciles de leer.');
	const [brief, setBrief] = useState('');
	const [productFiles, setProductFiles] = useState<File[]>([]);
	const [plan, setPlan] = useState<VideoPlan | null>(null);
	const [analysis, setAnalysis] = useState<VideoReferenceAnalysis | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [videoUrl, setVideoUrl] = useState('');
	const [error, setError] = useState('');
	const [creditCost, setCreditCost] = useState(4);
	useEffect(() => setCreditCost(videoCreditCost(duration)), [duration]);

	const referenceVideoUrl = reference.metadata?.videoPath || '';
	const referencePosterUrl = reference.imagePath;
	const productPreviewUrls = useMemo(() => productFiles.map((file) => URL.createObjectURL(file)), [productFiles]);
	const avatarPreviewUrls = useMemo(() => avatarFiles.map((file) => URL.createObjectURL(file)), [avatarFiles]);
	const selectAvatarFiles = async (selected: FileList | null) => {
		if (!selected?.length) { setAvatarFiles([]); return; }
		setPreparingAvatar(true); setError('');
		try { setAvatarFiles(await prepareReferenceImages(selected)); }
		finally { setPreparingAvatar(false); }
	};

	useEffect(() => {
		window.scrollTo(0, 0);
		return () => { productPreviewUrls.forEach((url) => URL.revokeObjectURL(url)); };
		// La URL se revoca cuando cambia la imagen o se desmonta el flujo.
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

	const selectedProduct = savedProducts.find((product) => String(product.id) === productId);
	const selectedAvatar = savedAvatars.find((avatar) => avatar.id === avatarId);
	const canContinueProduct = Boolean(productId || (productName.trim() && productFiles.length));
	const avatarValidationError = avatarMode === 'saved' && !avatarId
		? 'Elegí uno de tus avatares guardados.'
		: avatarMode === 'upload' && avatarFiles.length < 4
			? 'Subí al menos 4 fotos de la persona para usarla como avatar.'
			: avatarMode === 'upload' && !avatarConsent
				? 'Confirmá que tenés permiso para usar las imágenes del avatar.'
				: '';

	const updatePlan = (key: keyof VideoPlan, value: string | string[]) => setPlan((current) => ({ ...(current || {}), [key]: value }));

	const requestPlan = async () => {
		if (!canContinueProduct) { setError('Elegí un producto guardado o subí una foto real y escribí su nombre.'); setStep(1); return; }
		if (avatarValidationError) { setError(avatarValidationError); setStep(2); return; }
		setPhase('planning'); setError('');
		try {
			const form = new FormData();
			form.set('referencePosterUrl', referencePosterUrl);
			form.set('referenceVideoUrl', referenceVideoUrl);
			form.set('referenceScript', reference.promptNotes || '');
			form.set('referenceDuration', String(reference.metadata?.durationSec || ''));
			form.set('productId', productId);
			form.set('productName', productId ? (selectedProduct?.name || '') : productName.trim());
			form.set('productFacts', productFacts.trim());
			form.set('brandName', brandName.trim());
			form.set('objective', objective); form.set('audience', audience.trim()); form.set('benefit', benefit.trim());
			form.set('proof', proof.trim()); form.set('offer', offer.trim()); form.set('cta', cta.trim()); form.set('tone', tone);
			form.set('language', language); form.set('duration', duration); form.set('size', size); form.set('audioDirection', audioDirection.trim());
			form.set('voiceover', voiceover.trim()); form.set('captions', captions.trim()); form.set('peopleDirection', peopleDirection.trim());
			form.set('speechMode', speechMode); form.set('dialogueInstructions', dialogueInstructions.trim());
			form.set('avatarMode', avatarMode); form.set('avatarId', avatarId); form.set('avatarDescription', avatarDescription.trim()); form.set('avatarConsent', String(avatarConsent));
			avatarFiles.forEach((file) => form.append('avatarImages', file));
			form.set('referenceMode', referenceMode); form.set('preserveDirection', preserveDirection.trim()); form.set('changeDirection', changeDirection.trim());
			form.set('productUsage', productUsage.trim()); form.set('mustAvoid', mustAvoid.trim());
			productFiles.forEach((file) => form.append('productImages', file));
			const response = await fetch('/api/creativos/video-plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo crear el plan del video.');
			setAnalysis(payload.analysis || null); setPlan(payload.plan || {}); setStep(4); setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo crear el plan del video.'); setPhase('setup');
		}
	};

	const start = async () => {
		if (!plan) return;
		setPhase('starting'); setError('');
		try {
			const form = new FormData();
			form.set('referenceVideoUrl', referenceVideoUrl); form.set('referencePosterUrl', referencePosterUrl); form.set('referenceScript', reference.promptNotes || ''); form.set('referenceDuration', String(reference.metadata?.durationSec || duration));
			form.set('videoPlan', JSON.stringify(plan)); form.set('productId', productId); form.set('productName', productId ? (selectedProduct?.name || '') : productName.trim()); form.set('productFacts', productFacts.trim());
			form.set('brandName', brandName.trim()); form.set('brief', brief.trim()); form.set('objective', objective); form.set('audience', audience.trim()); form.set('benefit', benefit.trim()); form.set('proof', proof.trim()); form.set('offer', offer.trim()); form.set('tone', tone); form.set('language', language);
			form.set('duration', duration); form.set('size', size); form.set('model', model); form.set('audioDirection', audioDirection.trim()); form.set('voiceover', voiceover.trim()); form.set('captions', captions.trim()); form.set('peopleDirection', peopleDirection.trim());
			form.set('speechMode', speechMode); form.set('dialogueInstructions', dialogueInstructions.trim());
			form.set('avatarMode', avatarMode); form.set('avatarId', avatarId); form.set('avatarDescription', avatarDescription.trim()); form.set('avatarConsent', String(avatarConsent));
			avatarFiles.forEach((file) => form.append('avatarImages', file));
			form.set('referenceMode', referenceMode); form.set('preserveDirection', preserveDirection.trim()); form.set('changeDirection', changeDirection.trim()); form.set('productUsage', productUsage.trim()); form.set('mustAvoid', mustAvoid.trim());
			productFiles.forEach((file) => form.append('productImages', file));
			const response = await fetch('/api/creativos/video-start', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar el video.');
			setCreditCost(Number(payload.creditCost || 4)); setJobId(payload.job?.id || null); setProgress(Number(payload.job?.progress || 0));
		} catch (cause) { setPhase('review'); setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el video.'); }
	};

	const stepLabels = ['Producto', 'Referencia', 'Producción', 'Revisar'];
	return (
		<div className="video-creation-shell video-wizard-shell">
			<button type="button" className="video-creation-back" onClick={onBack}>← Volver a la biblioteca</button>
			<div className="video-creation-heading"><div><span className="studio-kicker">CREAR VIDEO CON IA</span><h1>Construí el video antes de generarlo.</h1><p>La IA primero entiende la referencia, arma una propuesta y te deja corregirla. Recién después usamos los créditos.</p></div><span className="video-creation-cost">{phase === 'review' ? 'Plan listo' : `${creditCost} créditos al generar`}</span></div>

			<div className="video-creation-grid">
				<section className="video-reference-panel">
					<div className="video-panel-label">VIDEO DE REFERENCIA</div>
					<video src={referenceVideoUrl} poster={referencePosterUrl} controls playsInline className="video-reference-player" />
					<h2>{reference.name}</h2>
					{reference.promptNotes && <p>{reference.promptNotes}</p>}
					<div className="video-reference-note">La referencia guía el hook, el ritmo y la estructura. La ejecución final cambia composición, acciones, contexto y personas: no copia el anuncio cuadro por cuadro ni reutiliza marcas, identidades o claims ajenos.</div>
					<div className="video-analysis-card">
						<span>{analysis ? 'LECTURA DE LA IA' : 'QUÉ VAMOS A ANALIZAR'}</span>
						{analysis ? (
							<dl>
								<div><dt>Hook</dt><dd>{analysis.hook}</dd></div>
								<div><dt>Ritmo</dt><dd>{analysis.pacing}</dd></div>
								<div><dt>Cámara</dt><dd>{analysis.camera}</dd></div>
							</dl>
						) : (
							<ul><li>Hook y promesa inicial</li><li>Orden y función de las escenas</li><li>Ritmo, cámara y transiciones</li><li>Audio, textos y cierre</li></ul>
						)}
					</div>
				</section>

				<section className="video-creation-form-panel video-wizard-card">
					<ol className="wiz-progress" aria-label="Progreso del video">
						{stepLabels.map((label, index) => <li key={label} className={`wiz-progress-item ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'done' : ''}`}><span className="wiz-progress-dot">{step > index + 1 ? '✓' : index + 1}</span><span className="wiz-progress-label">{label}</span></li>)}
					</ol>

					{phase === 'setup' && step === 1 && <div className="video-wizard-step"><span className="picker-label">¿Qué producto querés mostrar?</span><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Subir otro producto…</option>{savedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{productId ? <p className="video-form-hint">Usaremos la foto y los datos reales guardados de {selectedProduct?.name || 'este producto'}. Podés sumar hasta cuatro vistas adicionales.</p> : <div className="video-wizard-fields"><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Nombre del producto" /><textarea value={productFacts} onChange={(event) => setProductFacts(event.target.value)} placeholder="Características, beneficios, precio o datos que sí podemos afirmar…" rows={3} /></div>}<label className="video-file-picker"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductFiles(Array.from(event.target.files || []).slice(0, productId ? 4 : 5))} /><span>{productFiles.length ? `✓ ${productFiles.length} referencia${productFiles.length === 1 ? '' : 's'} cargada${productFiles.length === 1 ? '' : 's'}` : productId ? 'Agregar vistas del producto' : 'Elegir entre 1 y 5 fotos reales'}</span></label>{productPreviewUrls.length > 0 && <div className="video-product-reference-grid">{productPreviewUrls.map((url, index) => <img key={url} src={url} alt={`Referencia ${index + 1} del producto`} className="video-product-preview" />)}</div>}<p className="video-form-hint">Mejor resultado: frente, lateral, packaging, detalle de etiqueta y producto en uso.</p><div className="video-wizard-fields"><label>Nombre de la marca</label><input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Ej: Creattia" /></div></div>}

					{phase === 'setup' && step === 2 && <div className="video-wizard-step"><span className="picker-label">¿Cuánto querés conservar de la referencia?</span><div className="video-option-grid video-reference-mode-grid">{REFERENCE_MODES.map(([value, hint]) => <button type="button" key={value} className={referenceMode === value ? 'active' : ''} onClick={() => setReferenceMode(value)}><strong>{value}</strong><small>{hint}</small></button>)}</div><div className="video-wizard-fields"><label>Qué debería conservar</label><textarea value={preserveDirection} onChange={(event) => setPreserveDirection(event.target.value)} placeholder="Hook, ritmo, cámara, orden de escenas, tipo de demostración…" rows={2} /><label>Qué tiene que cambiar</label><textarea value={changeDirection} onChange={(event) => setChangeDirection(event.target.value)} placeholder="Producto, marca, personas, locación, textos…" rows={2} /></div><span className="picker-label">¿Qué tiene que lograr este video?</span><div className="video-option-grid">{OBJECTIVES.map(([value, hint]) => <button type="button" key={value} className={objective === value ? 'active' : ''} onClick={() => setObjective(value)}><strong>{value}</strong><small>{hint}</small></button>)}</div><div className="video-wizard-fields"><label>¿A quién le hablamos?</label><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ej: mujeres de 25 a 40 con piel sensible" /><label>Beneficio principal</label><input value={benefit} onChange={(event) => setBenefit(event.target.value)} placeholder="Qué cambia para el cliente después de usarlo" /><label>Prueba o evidencia</label><input value={proof} onChange={(event) => setProof(event.target.value)} placeholder="Testimonio, ingrediente, resultado o dato verificable" /><label>Oferta, si existe</label><input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Ej: 20% off, envío gratis o dejar vacío" /><label>CTA deseado</label><input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Ej: Compralo hoy" /></div><span className="picker-label">Tono</span><div className="video-chip-row">{TONES.map((item) => <button type="button" key={item} className={tone === item ? 'active' : ''} onClick={() => setTone(item)}>{item}</button>)}</div><span className="picker-label">¿Quién aparece?</span><div className="video-option-grid video-person-mode-grid">{PERSON_MODES.map(([value, label, hint]) => <button type="button" key={value} className={avatarMode === value ? 'active' : ''} onClick={() => { setAvatarMode(value); setError(''); }}><strong>{label}</strong><small>{hint}</small></button>)}</div>{avatarMode === 'saved' && <div className="video-avatar-picker">{savedAvatars.length ? savedAvatars.map((avatar) => <button type="button" key={avatar.id} className={avatarId === avatar.id ? 'active' : ''} onClick={() => setAvatarId(avatar.id)}>{avatar.coverUrl ? <img src={avatar.coverUrl} alt="" /> : <span>{avatar.name.slice(0, 1)}</span>}<div><strong>{avatar.name}</strong><small>{avatar.imageCount} fotos</small></div></button>) : <p>Todavía no guardaste avatares. Podés volver a Mi marca o elegir “Cargar ahora”.</p>}</div>}{avatarMode === 'upload' && <div className="video-avatar-upload"><label className="video-file-picker"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectAvatarFiles(event.target.files)} disabled={preparingAvatar} /><span>{preparingAvatar ? 'Optimizando fotos…' : avatarFiles.length ? `✓ ${avatarFiles.length} fotos del avatar` : 'Elegir entre 4 y 12 fotos de la persona'}</span></label>{avatarPreviewUrls.length > 0 && <div className="video-avatar-preview-grid">{avatarPreviewUrls.map((url, index) => <img key={url} src={url} alt={`Referencia ${index + 1} del avatar`} />)}</div>}<label className="video-avatar-consent"><input type="checkbox" checked={avatarConsent} onChange={(event) => setAvatarConsent(event.target.checked)} /><span>Confirmo que tengo autorización para usar la imagen de esta persona.</span></label></div>}<div className="video-wizard-fields">{avatarMode !== 'none' && <><label>{avatarMode === 'original' ? 'Cómo debería ser la nueva persona' : 'Dirección adicional para el avatar'}</label><input value={peopleDirection} onChange={(event) => setPeopleDirection(event.target.value)} placeholder={avatarMode === 'original' ? 'Ej: creadora argentina de 30 años, natural y claramente distinta de la referencia' : 'Vestuario, energía, expresión y contexto para esta pieza'} /><label>Rasgos o detalles que deben respetarse</label><textarea value={avatarDescription} onChange={(event) => setAvatarDescription(event.target.value)} rows={2} placeholder={selectedAvatar?.description || 'Ej: pelo suelto, estilo natural, vestuario neutro…'} /></>}<label>Cómo debe usarse o mostrarse el producto</label><textarea value={productUsage} onChange={(event) => setProductUsage(event.target.value)} placeholder="Ej: abrir el envase, aplicar dos gotas y mostrar la textura de cerca" rows={2} /><label>Qué no debe aparecer ni afirmarse</label><textarea value={mustAvoid} onChange={(event) => setMustAvoid(event.target.value)} placeholder="Claims prohibidos, gestos, objetos, fondos o situaciones a evitar" rows={2} /></div></div>}

					{phase === 'setup' && step === 3 && <div className="video-wizard-step"><span className="picker-label">¿Dónde se va a publicar?</span><div className="video-form-row"><div className="video-wizard-fields"><label>Formato</label><select value={size} onChange={(event) => setSize(event.target.value)}><option value="720x1280">Vertical 9:16 · Reels/TikTok</option><option value="1280x720">Horizontal 16:9 · YouTube</option></select></div><div className="video-wizard-fields"><label>Duración final</label><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="4">4 segundos · hook rápido</option><option value="8">8 segundos · recomendado</option><option value="10">10 segundos · pieza breve</option><option value="20">20 segundos · 2 segmentos</option><option value="30">30 segundos · anuncio completo</option></select></div></div><div className="video-form-row"><div className="video-wizard-fields"><label>Idioma</label><input value={language} onChange={(event) => setLanguage(event.target.value)} /></div><div className="video-provider-card"><span>MOTOR VISUAL</span><strong>Gemini Omni Flash</strong><small>Video-to-Video directo · 720p</small></div></div><span className="picker-label">¿Qué hacemos si aparece alguien hablando?</span><div className="video-option-grid">{SPEECH_MODES.map(([value, label, hint]) => <button type="button" key={value} className={speechMode === value ? 'active' : ''} onClick={() => setSpeechMode(value)}><strong>{label}</strong><small>{hint}</small></button>)}</div><div className="video-wizard-fields">{speechMode !== 'none' && <><label>Qué tiene que decir sí o sí</label><textarea value={dialogueInstructions} onChange={(event) => setDialogueInstructions(event.target.value)} rows={2} placeholder="Ej: nombrar a MiMarca, explicar que el sérum hidrata y cerrar con Compralo hoy" /></>}<label>Voz en off</label><input value={voiceover} onChange={(event) => setVoiceover(event.target.value)} placeholder="Ej: voz femenina cálida, o sin voz en off" /><label>Textos en pantalla</label><input value={captions} onChange={(event) => setCaptions(event.target.value)} placeholder="Ej: beneficio principal, oferta y CTA" /><label>Audio y música</label><textarea value={audioDirection} onChange={(event) => setAudioDirection(event.target.value)} rows={2} placeholder="Ej: música energética, sonido de spray y cierre suave" /></div></div>}

					{phase === 'review' && plan && <div className="video-wizard-step video-plan-review"><div className="video-plan-header"><div><span className="picker-label">PLAN CREATIVO PROPUESTO POR LA IA</span><p>Revisá cada decisión. La IA va a usar exactamente esta versión para generar.</p></div><button type="button" className="video-secondary-button" onClick={() => void requestPlan()}>↻ Rehacer plan</button></div><div className="video-wizard-fields"><label>Hook / primer segundo</label><textarea value={plan.hook || ''} onChange={(event) => updatePlan('hook', event.target.value)} rows={2} /><label>Mensaje central</label><textarea value={plan.coreMessage || ''} onChange={(event) => updatePlan('coreMessage', event.target.value)} rows={2} /><label>Estilo visual</label><textarea value={plan.visualStyle || ''} onChange={(event) => updatePlan('visualStyle', event.target.value)} rows={2} /></div><div className="video-scenes-heading"><span className="picker-label">ESCENAS</span><button type="button" className="video-secondary-button" onClick={() => updatePlan('scenes', [...(plan.scenes || []), 'Nueva escena: tiempo, acción, cámara, producto, texto y audio.'])}>+ Agregar escena</button></div><div className="video-scenes-list">{(plan.scenes || []).map((scene, index) => <div className="video-scene-editor" key={`${index}-${scene.slice(0, 12)}`}><span>{String(index + 1).padStart(2, '0')}</span><textarea value={scene} onChange={(event) => updatePlan('scenes', (plan.scenes || []).map((item, itemIndex) => itemIndex === index ? event.target.value : item))} rows={3} /><button type="button" onClick={() => updatePlan('scenes', (plan.scenes || []).filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar escena">×</button></div>)}</div>{speechMode !== 'none' && <><div className="video-scenes-heading"><span className="picker-label">DIÁLOGOS DE LA MARCA</span><button type="button" className="video-secondary-button" onClick={() => setPlan((current) => ({ ...(current || {}), hasSpokenDialogue: true, dialogueLines: [...(current?.dialogueLines || []), { start: 0, end: 3, speaker: 'Creadora', line: '', delivery: 'Natural y mirando a cámara' }] }))}>+ Agregar diálogo</button></div><div className="video-scenes-list">{(plan.dialogueLines || []).map((dialogue, index) => <div className="video-scene-editor video-dialogue-editor" key={`dialogue-${index}`}><span>{dialogue.start}-{dialogue.end}s</span><textarea value={dialogue.line} onChange={(event) => setPlan((current) => ({ ...(current || {}), dialogueLines: (current?.dialogueLines || []).map((item, itemIndex) => itemIndex === index ? { ...item, line: event.target.value } : item) }))} rows={2} aria-label={`Diálogo ${index + 1}`} /><button type="button" onClick={() => setPlan((current) => ({ ...(current || {}), dialogueLines: (current?.dialogueLines || []).filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Eliminar diálogo">×</button></div>)}</div><p className="video-form-hint">Estas son las palabras exactas que dirá la persona. Revisá marca, producto, beneficios y oferta antes de generar.</p></>}<div className="video-form-row"><div className="video-wizard-fields"><label>Voz en off final</label><textarea value={plan.voiceover || ''} onChange={(event) => updatePlan('voiceover', event.target.value)} rows={2} /></div><div className="video-wizard-fields"><label>Audio final</label><textarea value={plan.audio || ''} onChange={(event) => updatePlan('audio', event.target.value)} rows={2} /></div></div><div className="video-form-row"><div className="video-wizard-fields"><label>Textos en pantalla</label><textarea value={plan.captions || ''} onChange={(event) => updatePlan('captions', event.target.value)} rows={2} /></div><div className="video-wizard-fields"><label>CTA final</label><input value={plan.cta || ''} onChange={(event) => updatePlan('cta', event.target.value)} /></div></div><div className="video-wizard-fields"><label>Indicaciones finales</label><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} placeholder="Cualquier detalle que la IA deba respetar sí o sí…" /></div><button type="button" className="video-generate-button" onClick={() => void start()}>Aprobar plan y generar video · {creditCost} créditos →</button><p className="video-form-hint">El plan no consume créditos. Se descuentan solo cuando aprobás y empieza la generación.</p></div>}

					{(phase === 'planning' || phase === 'starting') && <div className="video-job-progress"><div><strong>{phase === 'planning' ? 'Analizando referencia y armando el plan…' : 'Generando tu video…'}</strong><span>{phase === 'planning' ? 'IA' : `${progress}%`}</span></div><div className="video-progress-track"><span style={{ width: phase === 'planning' ? '44%' : `${Math.max(5, progress)}%` }} /></div><small>{phase === 'planning' ? 'Estamos tomando decisiones creativas antes de generar para mejorar el resultado.' : 'La generación puede tardar varios minutos. Podés dejar esta pestaña abierta.'}</small></div>}
					{error && <p className="video-form-error">{error}</p>}
					{phase === 'setup' && <div className="wiz-actions video-wizard-actions"><button type="button" className="wiz-back" onClick={() => step === 1 ? onBack() : setStep((step - 1) as 1 | 2 | 3)}>← Atrás</button>{step < 3 ? <button type="button" className="url-batch-submit-btn" onClick={() => { if (step === 1 && !canContinueProduct) { setError('Elegí un producto guardado o subí una foto real con su nombre.'); return; } if (step === 2 && avatarValidationError) { setError(avatarValidationError); return; } setError(''); setStep((step + 1) as 1 | 2 | 3); }}>Continuar →</button> : <button type="button" className="url-batch-submit-btn" onClick={() => void requestPlan()}>Analizar y crear plan →</button>}</div>}
					{phase === 'failed' && <button type="button" className="video-secondary-button" onClick={() => { setPhase('review'); setError(''); }}>Volver al plan</button>}
				</section>
			</div>

			{videoUrl && <section className="video-result-panel"><span className="studio-kicker">VIDEO LISTO</span><h2>Tu versión está lista para publicar.</h2><p>Se generó usando el plan que revisaste y aprobaste.</p><video src={videoUrl} controls playsInline className="video-result-player" /><a className="video-download-button" href={videoUrl} download>Descargar MP4 ↓</a></section>}
		</div>
	);
}
