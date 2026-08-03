import React, { useEffect, useMemo, useState } from 'react';

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
	const [language, setLanguage] = useState('Español rioplatense');
	const [duration, setDuration] = useState('8');
	const [size, setSize] = useState('720x1280');
	const [model, setModel] = useState('sora-2');
	const [audioDirection, setAudioDirection] = useState('Música comercial moderna, con sonido ambiente suave.');
	const [voiceover, setVoiceover] = useState('Sin voz en off; usar textos breves y demostración visual.');
	const [captions, setCaptions] = useState('Textos grandes, breves y fáciles de leer.');
	const [brief, setBrief] = useState('');
	const [productFile, setProductFile] = useState<File | null>(null);
	const [plan, setPlan] = useState<VideoPlan | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [videoUrl, setVideoUrl] = useState('');
	const [error, setError] = useState('');
	const [creditCost, setCreditCost] = useState(4);

	const referenceVideoUrl = reference.metadata?.videoPath || '';
	const referencePosterUrl = reference.imagePath;
	const productPreviewUrl = useMemo(() => productFile ? URL.createObjectURL(productFile) : '', [productFile]);

	useEffect(() => {
		window.scrollTo(0, 0);
		return () => { if (productPreviewUrl) URL.revokeObjectURL(productPreviewUrl); };
		// La URL se revoca cuando cambia la imagen o se desmonta el flujo.
	}, [productPreviewUrl]);

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
	const canContinueProduct = Boolean(productId || (productName.trim() && productFile));

	const updatePlan = (key: keyof VideoPlan, value: string | string[]) => setPlan((current) => ({ ...(current || {}), [key]: value }));

	const requestPlan = async () => {
		if (!canContinueProduct) { setError('Elegí un producto guardado o subí una foto real y escribí su nombre.'); setStep(1); return; }
		setPhase('planning'); setError('');
		try {
			const form = new FormData();
			form.set('referencePosterUrl', referencePosterUrl);
			form.set('referenceScript', reference.promptNotes || '');
			form.set('productId', productId);
			form.set('productName', productId ? (selectedProduct?.name || '') : productName.trim());
			form.set('productFacts', productFacts.trim());
			form.set('brandName', brandName.trim());
			form.set('objective', objective); form.set('audience', audience.trim()); form.set('benefit', benefit.trim());
			form.set('proof', proof.trim()); form.set('offer', offer.trim()); form.set('cta', cta.trim()); form.set('tone', tone);
			form.set('language', language); form.set('duration', duration); form.set('size', size); form.set('audioDirection', audioDirection.trim());
			form.set('voiceover', voiceover.trim()); form.set('captions', captions.trim()); form.set('peopleDirection', peopleDirection.trim());
			if (productFile) form.append('productImage', productFile);
			const response = await fetch('/api/creativos/video-plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo crear el plan del video.');
			setPlan(payload.plan || {}); setStep(4); setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo crear el plan del video.'); setPhase('setup');
		}
	};

	const start = async () => {
		if (!plan) return;
		setPhase('starting'); setError('');
		try {
			const form = new FormData();
			form.set('referenceVideoUrl', referenceVideoUrl); form.set('referencePosterUrl', referencePosterUrl); form.set('referenceScript', reference.promptNotes || '');
			form.set('videoPlan', JSON.stringify(plan)); form.set('productId', productId); form.set('productName', productId ? (selectedProduct?.name || '') : productName.trim()); form.set('productFacts', productFacts.trim());
			form.set('brandName', brandName.trim()); form.set('brief', brief.trim()); form.set('objective', objective); form.set('audience', audience.trim()); form.set('benefit', benefit.trim()); form.set('proof', proof.trim()); form.set('offer', offer.trim()); form.set('tone', tone); form.set('language', language);
			form.set('duration', duration); form.set('size', size); form.set('model', model); form.set('audioDirection', audioDirection.trim()); form.set('voiceover', voiceover.trim()); form.set('captions', captions.trim()); form.set('peopleDirection', peopleDirection.trim());
			if (productFile) form.append('productImage', productFile);
			const response = await fetch('/api/creativos/video-start', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar el video.');
			setCreditCost(Number(payload.creditCost || 4)); setJobId(payload.job?.id || null); setProgress(Number(payload.job?.progress || 0));
		} catch (cause) { setPhase('review'); setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el video.'); }
	};

	const stepLabels = ['Producto', 'Estrategia', 'Producción', 'Revisar'];
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
					<div className="video-reference-note">La referencia guía el hook, el ritmo y la estructura. La ejecución final se adapta a tu producto y no copia marcas, logos, personas ni claims ajenos.</div>
				</section>

				<section className="video-creation-form-panel video-wizard-card">
					<ol className="wiz-progress" aria-label="Progreso del video">
						{stepLabels.map((label, index) => <li key={label} className={`wiz-progress-item ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'done' : ''}`}><span className="wiz-progress-dot">{step > index + 1 ? '✓' : index + 1}</span><span className="wiz-progress-label">{label}</span></li>)}
					</ol>

					{phase === 'setup' && step === 1 && <div className="video-wizard-step"><span className="picker-label">¿Qué producto querés mostrar?</span><select value={productId} onChange={(event) => { setProductId(event.target.value); if (event.target.value) setProductFile(null); }}><option value="">Subir otro producto…</option>{savedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{productId ? <p className="video-form-hint">Usaremos la foto y los datos reales guardados de {selectedProduct?.name || 'este producto'}.</p> : <><div className="video-wizard-fields"><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Nombre del producto" /><textarea value={productFacts} onChange={(event) => setProductFacts(event.target.value)} placeholder="Características, beneficios, precio o datos que sí podemos afirmar…" rows={3} /></div><label className="video-file-picker"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductFile(event.target.files?.[0] || null)} /><span>{productFile ? `✓ ${productFile.name}` : 'Elegir foto real del producto'}</span></label>{productPreviewUrl && <img src={productPreviewUrl} alt="Vista previa del producto" className="video-product-preview" />}</>}<div className="video-wizard-fields"><label>Nombre de la marca</label><input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Ej: Creattia" /></div></div>}

					{phase === 'setup' && step === 2 && <div className="video-wizard-step"><span className="picker-label">¿Qué tiene que lograr este video?</span><div className="video-option-grid">{OBJECTIVES.map(([value, hint]) => <button type="button" key={value} className={objective === value ? 'active' : ''} onClick={() => setObjective(value)}><strong>{value}</strong><small>{hint}</small></button>)}</div><div className="video-wizard-fields"><label>¿A quién le hablamos?</label><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ej: mujeres de 25 a 40 con piel sensible" /><label>Beneficio principal</label><input value={benefit} onChange={(event) => setBenefit(event.target.value)} placeholder="Qué cambia para el cliente después de usarlo" /><label>Prueba o evidencia</label><input value={proof} onChange={(event) => setProof(event.target.value)} placeholder="Testimonio, ingrediente, resultado o dato verificable" /><label>Oferta, si existe</label><input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Ej: 20% off, envío gratis o dejar vacío" /><label>CTA deseado</label><input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Ej: Compralo hoy" /></div><span className="picker-label">Tono</span><div className="video-chip-row">{TONES.map((item) => <button type="button" key={item} className={tone === item ? 'active' : ''} onClick={() => setTone(item)}>{item}</button>)}</div><div className="video-wizard-fields"><label>Personas o creador</label><input value={peopleDirection} onChange={(event) => setPeopleDirection(event.target.value)} placeholder="Ej: creadora argentina de 30 años, natural, en su baño" /></div></div>}

					{phase === 'setup' && step === 3 && <div className="video-wizard-step"><span className="picker-label">¿Dónde se va a publicar?</span><div className="video-form-row"><div className="video-wizard-fields"><label>Formato</label><select value={size} onChange={(event) => setSize(event.target.value)}><option value="720x1280">Vertical 9:16 · Reels/TikTok</option><option value="1280x720">Horizontal 16:9 · YouTube</option><option value="1024x1792">Story alta 9:16</option><option value="1792x1024">Panorámico 16:9</option></select></div><div className="video-wizard-fields"><label>Duración</label><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="4">4 segundos · hook rápido</option><option value="8">8 segundos · recomendado</option><option value="12">12 segundos · más desarrollo</option></select></div></div><div className="video-form-row"><div className="video-wizard-fields"><label>Idioma</label><input value={language} onChange={(event) => setLanguage(event.target.value)} /></div><div className="video-wizard-fields"><label>Modelo</label><select value={model} onChange={(event) => setModel(event.target.value)}><option value="sora-2">Sora 2 · recomendado</option><option value="sora-2-pro">Sora 2 Pro · máxima calidad</option></select></div></div><div className="video-wizard-fields"><label>Voz en off</label><input value={voiceover} onChange={(event) => setVoiceover(event.target.value)} placeholder="Qué debería decir una voz, o sin voz" /><label>Textos en pantalla</label><input value={captions} onChange={(event) => setCaptions(event.target.value)} placeholder="Cantidad, estilo y mensajes obligatorios" /><label>Audio y música</label><textarea value={audioDirection} onChange={(event) => setAudioDirection(event.target.value)} rows={2} placeholder="Ej: música energética, sonido de spray, golpe al mostrar el resultado" /></div></div>}

					{phase === 'review' && plan && <div className="video-wizard-step video-plan-review"><div className="video-plan-header"><div><span className="picker-label">PLAN CREATIVO PROPUESTO POR LA IA</span><p>Revisá cada decisión. La IA va a usar exactamente esta versión para generar.</p></div><button type="button" className="video-secondary-button" onClick={() => void requestPlan()}>↻ Rehacer plan</button></div><div className="video-wizard-fields"><label>Hook / primer segundo</label><textarea value={plan.hook || ''} onChange={(event) => updatePlan('hook', event.target.value)} rows={2} /><label>Mensaje central</label><textarea value={plan.coreMessage || ''} onChange={(event) => updatePlan('coreMessage', event.target.value)} rows={2} /><label>Estilo visual</label><textarea value={plan.visualStyle || ''} onChange={(event) => updatePlan('visualStyle', event.target.value)} rows={2} /></div><div className="video-scenes-heading"><span className="picker-label">ESCENAS</span><button type="button" className="video-secondary-button" onClick={() => updatePlan('scenes', [...(plan.scenes || []), 'Nueva escena: tiempo, acción, cámara, producto, texto y audio.'])}>+ Agregar escena</button></div><div className="video-scenes-list">{(plan.scenes || []).map((scene, index) => <div className="video-scene-editor" key={`${index}-${scene.slice(0, 12)}`}><span>{String(index + 1).padStart(2, '0')}</span><textarea value={scene} onChange={(event) => updatePlan('scenes', (plan.scenes || []).map((item, itemIndex) => itemIndex === index ? event.target.value : item))} rows={3} /><button type="button" onClick={() => updatePlan('scenes', (plan.scenes || []).filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar escena">×</button></div>)}</div><div className="video-form-row"><div className="video-wizard-fields"><label>Voz en off final</label><textarea value={plan.voiceover || ''} onChange={(event) => updatePlan('voiceover', event.target.value)} rows={2} /></div><div className="video-wizard-fields"><label>Audio final</label><textarea value={plan.audio || ''} onChange={(event) => updatePlan('audio', event.target.value)} rows={2} /></div></div><div className="video-form-row"><div className="video-wizard-fields"><label>Textos en pantalla</label><textarea value={plan.captions || ''} onChange={(event) => updatePlan('captions', event.target.value)} rows={2} /></div><div className="video-wizard-fields"><label>CTA final</label><input value={plan.cta || ''} onChange={(event) => updatePlan('cta', event.target.value)} /></div></div><div className="video-wizard-fields"><label>Indicaciones finales</label><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} placeholder="Cualquier detalle que la IA deba respetar sí o sí…" /></div><button type="button" className="video-generate-button" onClick={() => void start()}>Aprobar plan y generar video · {creditCost} créditos →</button><p className="video-form-hint">El plan no consume créditos. Se descuentan solo cuando aprobás y empieza la generación.</p></div>}

					{(phase === 'planning' || phase === 'starting') && <div className="video-job-progress"><div><strong>{phase === 'planning' ? 'Analizando referencia y armando el plan…' : 'Generando tu video…'}</strong><span>{phase === 'planning' ? 'IA' : `${progress}%`}</span></div><div className="video-progress-track"><span style={{ width: phase === 'planning' ? '44%' : `${Math.max(5, progress)}%` }} /></div><small>{phase === 'planning' ? 'Estamos tomando decisiones creativas antes de generar para mejorar el resultado.' : 'La generación puede tardar varios minutos. Podés dejar esta pestaña abierta.'}</small></div>}
					{error && <p className="video-form-error">{error}</p>}
					{phase === 'setup' && <div className="wiz-actions video-wizard-actions"><button type="button" className="wiz-back" onClick={() => step === 1 ? onBack() : setStep((step - 1) as 1 | 2 | 3)}>← Atrás</button>{step < 3 ? <button type="button" className="url-batch-submit-btn" onClick={() => { if (step === 1 && !canContinueProduct) { setError('Elegí un producto guardado o subí una foto real con su nombre.'); return; } setError(''); setStep((step + 1) as 1 | 2 | 3); }}>Continuar →</button> : <button type="button" className="url-batch-submit-btn" onClick={() => void requestPlan()}>Analizar y crear plan →</button>}</div>}
					{phase === 'failed' && <button type="button" className="video-secondary-button" onClick={() => { setPhase('review'); setError(''); }}>Volver al plan</button>}
				</section>
			</div>

			{videoUrl && <section className="video-result-panel"><span className="studio-kicker">VIDEO LISTO</span><h2>Tu versión está lista para publicar.</h2><p>Se generó usando el plan que revisaste y aprobaste.</p><video src={videoUrl} controls playsInline className="video-result-player" /><a className="video-download-button" href={videoUrl} download>Descargar MP4 ↓</a></section>}
		</div>
	);
}
