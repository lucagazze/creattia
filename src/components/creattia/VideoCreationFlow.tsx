import React, { useEffect, useMemo, useState } from 'react';

type VideoReference = {
	name: string;
	imagePath: string;
	promptNotes?: string | null;
	metadata?: { videoPath?: string; durationSec?: number };
};

type Props = {
	reference: VideoReference;
	session: any;
	profile?: any;
	savedProducts: any[];
	onBack: () => void;
	onToast?: (message: string) => void;
};

export default function VideoCreationFlow({ reference, session, profile, savedProducts, onBack, onToast }: Props) {
	const [productId, setProductId] = useState('');
	const [productName, setProductName] = useState('');
	const [brandName, setBrandName] = useState(profile?.brandName || profile?.brand_name || '');
	const [brief, setBrief] = useState('');
	const [duration, setDuration] = useState('8');
	const [size, setSize] = useState('720x1280');
	const [model, setModel] = useState('sora-2');
	const [productFile, setProductFile] = useState<File | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [status, setStatus] = useState<'idle' | 'starting' | 'queued' | 'in_progress' | 'completed' | 'failed'>('idle');
	const [progress, setProgress] = useState(0);
	const [videoUrl, setVideoUrl] = useState('');
	const [error, setError] = useState('');
	const [creditCost, setCreditCost] = useState(4);

	const referenceVideoUrl = reference.metadata?.videoPath || '';
	const referencePosterUrl = reference.imagePath;
	const isBusy = status === 'starting' || status === 'queued' || status === 'in_progress';
	const productPreviewUrl = useMemo(() => productFile ? URL.createObjectURL(productFile) : '', [productFile]);

	useEffect(() => () => {
		if (productPreviewUrl) URL.revokeObjectURL(productPreviewUrl);
	}, [productPreviewUrl]);

	useEffect(() => {
		if (!jobId || !session?.access_token) return;
		let cancelled = false;
		let timer: number | undefined;

		const poll = async () => {
			try {
				const response = await fetch(`/api/creativos/video-status?id=${encodeURIComponent(jobId)}`, {
					headers: { authorization: `Bearer ${session.access_token}` },
				});
				const payload = await response.json().catch(() => ({}));
				if (cancelled) return;
				if (!response.ok) throw new Error(payload.error || 'No se pudo consultar el video.');
				setStatus(payload.status || 'queued');
				setProgress(Number(payload.progress || 0));
				if (payload.videoUrl) {
					setVideoUrl(payload.videoUrl);
					setStatus('completed');
					onToast?.('¡Video listo para descargar!');
					return;
				}
				if (payload.status === 'failed') {
					setError(payload.error || 'El video no pudo generarse.');
					return;
				}
				timer = window.setTimeout(poll, 5000);
			} catch (cause) {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : 'No se pudo consultar el video.');
					timer = window.setTimeout(poll, 7000);
				}
			}
		};
		void poll();
		return () => {
			cancelled = true;
			if (timer) window.clearTimeout(timer);
		};
	}, [jobId, onToast, session?.access_token]);

	const start = async () => {
		setError('');
		const hasSavedProduct = Boolean(productId);
		if (!hasSavedProduct && (!productName.trim() || !productFile)) {
			setError('Elegí un producto guardado o subí una foto y escribí su nombre.');
			return;
		}
		setStatus('starting');
		try {
			const form = new FormData();
			form.append('referenceVideoUrl', referenceVideoUrl);
			form.append('referencePosterUrl', referencePosterUrl);
			form.append('referenceScript', reference.promptNotes || '');
			form.append('productId', productId);
			form.append('productName', productId ? (savedProducts.find((product) => product.id === productId)?.name || '') : productName.trim());
			form.append('brandName', brandName.trim());
			form.append('brief', brief.trim());
			form.append('duration', duration);
			form.append('size', size);
			form.append('model', model);
			if (productFile) form.append('productImage', productFile);

			const response = await fetch('/api/creativos/video-start', {
				method: 'POST',
				headers: { authorization: `Bearer ${session?.access_token || ''}` },
				body: form,
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar el video.');
			setCreditCost(Number(payload.creditCost || 4));
			setJobId(payload.job?.id || null);
			setStatus(payload.job?.status || 'queued');
			setProgress(Number(payload.job?.progress || 0));
		} catch (cause) {
			setStatus('idle');
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el video.');
		}
	};

	return (
		<div className="video-creation-shell">
			<button type="button" className="video-creation-back" onClick={onBack}>← Volver a la biblioteca</button>
			<div className="video-creation-heading">
				<div>
					<span className="studio-kicker">CREAR VIDEO CON IA</span>
					<h1>Usá la idea del video ganador para tu marca.</h1>
					<p>Conservamos el gancho, el ritmo y la estructura creativa. Cambiamos el producto, la marca y la ejecución para que sea tuyo.</p>
				</div>
				<span className="video-creation-cost">{creditCost} créditos</span>
			</div>

			<div className="video-creation-grid">
				<section className="video-reference-panel">
					<div className="video-panel-label">VIDEO DE REFERENCIA</div>
					<video src={referenceVideoUrl} poster={referencePosterUrl} controls playsInline className="video-reference-player" />
					<h2>{reference.name}</h2>
					{reference.promptNotes && <p>{reference.promptNotes}</p>}
					<div className="video-reference-note">La referencia guía la dirección creativa; no copiamos logos, marcas ni identidades ajenas.</div>
				</section>

				<section className="video-creation-form-panel">
					<div className="video-form-section">
						<label>Producto que querés mostrar</label>
						<select value={productId} onChange={(event) => { setProductId(event.target.value); if (event.target.value) setProductFile(null); }} disabled={isBusy}>
							<option value="">Subir otro producto…</option>
							{savedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
						</select>
						{productId ? (
							<p className="video-form-hint">Usaremos la foto real guardada de este producto.</p>
						) : (
							<div className="video-product-upload">
								<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Nombre del producto" disabled={isBusy} />
								<label className="video-file-picker">
									<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductFile(event.target.files?.[0] || null)} disabled={isBusy} />
									<span>{productFile ? `✓ ${productFile.name}` : 'Elegir foto real del producto'}</span>
								</label>
								{productPreviewUrl && <img src={productPreviewUrl} alt="Vista previa del producto" className="video-product-preview" />}
							</div>
						)}
					</div>

					<div className="video-form-section video-form-row">
						<label>Marca</label>
						<input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Nombre de tu marca" disabled={isBusy} />
					</div>

					<div className="video-form-section video-form-row">
						<label>Formato y duración</label>
						<div className="video-control-pair">
							<select value={size} onChange={(event) => setSize(event.target.value)} disabled={isBusy}>
								<option value="720x1280">Vertical 9:16</option>
								<option value="1280x720">Horizontal 16:9</option>
								<option value="1024x1792">Story alta 9:16</option>
								<option value="1792x1024">Panorámico 16:9</option>
							</select>
							<select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={isBusy}>
								<option value="4">4 segundos</option>
								<option value="8">8 segundos</option>
								<option value="12">12 segundos</option>
							</select>
						</div>
					</div>

					<div className="video-form-section video-form-row">
						<label>Modelo</label>
						<select value={model} onChange={(event) => setModel(event.target.value)} disabled={isBusy}>
							<option value="sora-2">Sora 2 · recomendado</option>
							<option value="sora-2-pro">Sora 2 Pro · máxima calidad</option>
						</select>
					</div>

					<div className="video-form-section video-form-row">
						<label>Dirección opcional</label>
						<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Ej: que se vea premium, con una persona usando el producto y cierre con mi logo." rows={3} disabled={isBusy} />
					</div>

					{error && <p className="video-form-error">{error}</p>}
					{isBusy && (
						<div className="video-job-progress">
							<div><strong>{status === 'starting' ? 'Preparando la referencia…' : 'Generando tu video…'}</strong><span>{progress}%</span></div>
							<div className="video-progress-track"><span style={{ width: `${Math.max(5, progress)}%` }} /></div>
							<small>La generación de video puede tardar varios minutos. Podés dejar esta pestaña abierta.</small>
						</div>
					)}
					{status === 'idle' && <button type="button" className="video-generate-button" onClick={() => void start()}>Generar video · {creditCost} créditos <span>→</span></button>}
				</section>
			</div>

			{videoUrl && (
				<section className="video-result-panel">
					<div><span className="studio-kicker">VIDEO LISTO</span><h2>Tu versión está lista para publicar.</h2></div>
					<video src={videoUrl} controls playsInline className="video-result-player" />
					<a className="video-download-button" href={videoUrl} download>Descargar MP4 <span>↓</span></a>
				</section>
			)}
		</div>
	);
}
