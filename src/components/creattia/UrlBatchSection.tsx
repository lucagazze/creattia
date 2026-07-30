import React, { useEffect, useState, useRef } from 'react';
import { signGenerationPaths } from '../../lib/creattia/generation-image';
import { supabase } from '../../lib/creattia/supabase-browser';

// Cuántos anuncios se generan a la vez. Cada uno es una request independiente:
// si una falla o se corta, las demás siguen y esa se puede reintentar sola.
// 5 verificado contra OpenAI sin toparse con límites de tasa.
const WORKER_CONCURRENCY = 5;

/** Dispara un worker por generación pendiente, con concurrencia limitada. */
async function driveBatchWorkers(
	generationIds: string[],
	accessToken: string,
	onSettled?: (id: string, ok: boolean) => void,
) {
	const queue = [...generationIds];
	const runNext = async (): Promise<void> => {
		const id = queue.shift();
		if (!id) return;
		try {
			const response = await fetch('/api/creativos/batch-worker', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
				body: JSON.stringify({ generationId: id }),
			});
			if (onSettled) onSettled(id, response.ok);
		} catch {
			if (onSettled) onSettled(id, false);
		}
		return runNext();
	};
	await Promise.all(Array.from({ length: Math.min(WORKER_CONCURRENCY, queue.length) }, runNext));
}

export { driveBatchWorkers };


/**
 * Desplegable propio. El <select> nativo no sirve acá: en Windows los emoji de
 * bandera dentro de un <option> se dibujan como las dos letras del código
 * ("AR Español" en vez de "🇦🇷 Español"), porque el sistema no trae los glifos.
 */
const BatchSelect: React.FC<{
	label: string;
	value: string;
	options: Array<{ value: string; label: string; flag?: string; emoji?: string; hint?: string }>;
	onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
	const [open, setOpen] = useState(false);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const current = options.find((option) => option.value === value) || options[0];

	useEffect(() => {
		if (!open) return;
		const close = (event: MouseEvent) => {
			if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [open]);

	const face = (option: { flag?: string; emoji?: string }) => option.flag
		? <span className="bsel-flag" aria-hidden>{option.flag}</span>
		: <span className="bsel-emoji" aria-hidden>{option.emoji}</span>;

	return (
		<div className="batch-select-field" ref={boxRef}>
			<span className="picker-label">{label}</span>
			<div className="bsel">
				<button type="button" className={`bsel-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
					{face(current)}
					<span className="bsel-value">{current.label}</span>
					<svg className="bsel-arrow" width="11" height="7" viewBox="0 0 12 8" aria-hidden>
						<path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
					</svg>
				</button>
				{open && (
					<div className="bsel-menu" role="listbox">
						{options.map((option) => (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={option.value === value}
								className={`bsel-option ${option.value === value ? 'active' : ''}`}
								onClick={() => { onChange(option.value); setOpen(false); }}
							>
								{face(option)}
								<span className="bsel-option-text">
									<span>{option.label}</span>
									{option.hint && <small>{option.hint}</small>}
								</span>
								{option.value === value && <span className="bsel-check" aria-hidden>✓</span>}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

type UrlBatchSectionProps = {
	onSelectRemodel?: (generation: any, templateId?: number) => void;
	userCredits?: number;
	onRefreshCredits?: () => void;
	onNavigateToPlans?: () => void;
	initialUrl?: string;
	session?: any;
	onBatchCreated?: (generations: any[], batchId: string) => void;
};

type BatchItem = {
	id: string;
	templateId?: number;
	title: string;
	imageUrl?: string;
	status: 'processing' | 'completed' | 'failed';
	error?: string;
	// Anuncio ganador de la biblioteca que este creativo está clonando.
	referenceUrl?: string;
	referenceName?: string;
	referenceLeaf?: string;
};

// Nombre legible del tipo de anuncio ganador.

const REFERENCES_PUBLIC_BASE = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references';

// Referencia ganadora propuesta para el lote (paso de revisión).
type WinnerRef = {
	imagePath: string;
	name: string;
	notes?: string;
	leaf?: string;
	niches?: string[];
	templateId?: number | null;
	domain?: string;
};

type BatchPreview = {
	product: { id: string; name: string; description?: string; priceText?: string; imageUrl?: string };
	count: number;
	wearable?: boolean;
	hasImage?: boolean;
};

const FORMAT_OPTIONS = [
	{ value: 'original', label: 'Igual al ganador', emoji: '🏆', hint: 'Conserva la proporción del anuncio original' },
	{ value: 'square', label: 'Cuadrado 1:1', emoji: '⬛', hint: 'Feed de Instagram y Facebook' },
	{ value: 'portrait', label: 'Vertical 4:5', emoji: '📱', hint: 'El que más pantalla ocupa en el feed' },
	{ value: 'story', label: 'Story / Reel 9:16', emoji: '📲', hint: 'Historias y Reels' },
	{ value: 'landscape', label: 'Horizontal 4:3', emoji: '🖥️', hint: 'Display y ubicaciones de escritorio' },
];

// Se usa la sigla del país en una pastilla en vez del emoji de bandera: Windows
// no tiene glifos de bandera y los dibuja como las dos letras sueltas.
const LANGUAGE_OPTIONS = [
	{ value: 'es', label: 'Español', flag: 'AR' },
	{ value: 'en', label: 'Inglés', flag: 'US' },
	{ value: 'pt', label: 'Portugués', flag: 'BR' },
	{ value: 'it', label: 'Italiano', flag: 'IT' },
	{ value: 'fr', label: 'Francés', flag: 'FR' },
	{ value: 'de', label: 'Alemán', flag: 'DE' },
];

const STYLE_OPTIONS = [
	{ value: 'winner', label: 'Del anuncio ganador', emoji: '🏆', hint: 'Conserva lo que hizo funcionar al original' },
	{ value: 'brand', label: 'De mi marca', emoji: '🎨', hint: 'Usa los colores y la tipografía de tu marca' },
];


const referenceUrlFor = (imagePath: string) => `${REFERENCES_PUBLIC_BASE}/${imagePath}`;

export const UrlBatchSection: React.FC<UrlBatchSectionProps> = ({
	onSelectRemodel,
	userCredits = 0,
	onRefreshCredits,
	onNavigateToPlans,
	initialUrl = '',
	session,
	onBatchCreated,
}) => {
	const [url, setUrl] = useState(initialUrl);
	// Tres formas de arrancar. 'text' genera sin foto de producto, clonando
	// ganadores puramente tipográficos.
	const [mode, setMode] = useState<'url' | 'manual' | 'text'>('url');
	const [manualName, setManualName] = useState('');
	const [manualDescription, setManualDescription] = useState('');
	const [manualPrice, setManualPrice] = useState('');
	const [count, setCount] = useState<10 | 20 | 30 | 40>(10);
	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [colorMode, setColorMode] = useState('winner');
	const [typoMode, setTypoMode] = useState('winner');
	const [brief, setBrief] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [extraImages, setExtraImages] = useState<File[]>([]);
	const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([]);

	const [isGenerating, setIsGenerating] = useState(false);
	const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
	const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
	const [productName, setProductName] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

	// Paso 2: revisión de las referencias ganadoras antes de gastar créditos.
	const [step, setStep] = useState<'form' | 'review' | 'results'>('form');
	// El formulario es secuencial: primero la cantidad, después el producto.
	const [formStep, setFormStep] = useState<1 | 2>(1);
	const [isScanning, setIsScanning] = useState(false);
	const [preview, setPreview] = useState<BatchPreview | null>(null);
	const [selected, setSelected] = useState<WinnerRef[]>([]);
	const [spares, setSpares] = useState<WinnerRef[]>([]);
	// Todo lo que el usuario ya vio en esta sesión de revisión: ninguna referencia
	// se repite, ni siquiera después de descartarla.
	const seenPathsRef = useRef<Set<string>>(new Set());
	const [replacingPath, setReplacingPath] = useState<string | null>(null);

	const pollRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (initialUrl && !url) {
			setUrl(initialUrl);
		}
	}, [initialUrl]);

	// Manejo de carga de fotos extra
	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files?.length) return;
		const files = Array.from(e.target.files).slice(0, 4);
		setExtraImages((prev) => [...prev, ...files].slice(0, 5));

		const newPreviews = files.map((f) => URL.createObjectURL(f));
		setExtraImagePreviews((prev) => [...prev, ...newPreviews].slice(0, 5));
	};

	const removeExtraImage = (index: number) => {
		setExtraImages((prev) => prev.filter((_, i) => i !== index));
		setExtraImagePreviews((prev) => prev.filter((_, i) => i !== index));
	};

	const getAccessToken = async () => {
		let accessToken = session?.access_token || '';
		if (!accessToken && supabase) {
			try {
				const { data: sessData } = await supabase.auth.getSession();
				accessToken = sessData.session?.access_token || '';
			} catch { /* ignore */ }
		}
		return accessToken;
	};

	// PASO 1 — Analizar el producto y proponer las referencias ganadoras.
	// No cobra créditos: solo devuelve los ganadores para que el usuario revise.
	const handleScan = async (e: React.FormEvent) => {
		e.preventDefault();
		if (mode === 'url' && !url.trim()) {
			setError('Ingresá la URL del producto para continuar.');
			return;
		}
		if (mode !== 'url' && !manualName.trim()) {
			setError('Escribí al menos el nombre de lo que querés promocionar.');
			return;
		}
		if (userCredits < count) {
			setError(`No tenés créditos suficientes (${userCredits} disponible, ${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar tus anuncios.`);
			return;
		}

		setError(null);
		setIsScanning(true);
		setBatchItems([]);
		setProductName('');

		try {
			const formData = new FormData();
			formData.append('mode', mode);
			formData.append('count', String(count));
			if (mode === 'url') formData.append('productUrl', url.trim());
			else {
				formData.append('productName', manualName.trim());
				formData.append('productDescription', manualDescription.trim());
				if (manualPrice.trim()) formData.append('productPriceText', manualPrice.trim());
			}
			extraImages.forEach((file) => formData.append('extraImages', file));

			const accessToken = await getAccessToken();
			const response = await fetch('/api/creativos/batch-url', {
				method: 'POST',
				headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
				body: formData,
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'No se pudo analizar el producto.');

			setPreview({ product: data.product, count: data.count, wearable: data.wearable, hasImage: data.hasImage });
			seenPathsRef.current = new Set<string>([
				...(data.winners || []).map((w: WinnerRef) => w.imagePath),
				...(data.spares || []).map((w: WinnerRef) => w.imagePath),
			]);
			setSelected(data.winners || []);
			setSpares(data.spares || []);
			setProductName(data.product?.name || 'Producto');
			setStep('review');
		} catch (err: any) {
			console.error('Error analizando el producto:', err);
			setError(err.message || 'Ocurrió un error al conectar con el servidor.');
		} finally {
			setIsScanning(false);
		}
	};

	/**
	 * Reemplaza una referencia por otra al azar de TODA la biblioteca.
	 *
	 * Se pide al servidor en el momento en vez de tirar de un banco precalculado:
	 * ese banco se agotaba enseguida y limitaba las opciones. Los anuncios que
	 * guardaste tienen prioridad, y nada se repite dentro de la misma revisión.
	 */
	const discardWinner = async (imagePath: string) => {
		const index = selected.findIndex((winner) => winner.imagePath === imagePath);
		if (index === -1 || replacingPath) return;
		setReplacingPath(imagePath);

		// Suplente local si hay: entra al instante y el banco se repone de fondo.
		const localSpare = spares[0];
		if (localSpare) {
			const next = [...selected];
			next[index] = localSpare;
			setSelected(next);
			setSpares(spares.slice(1));
			seenPathsRef.current.add(localSpare.imagePath);
		}

		try {
			const accessToken = await getAccessToken();
			const savedPaths = (() => {
				try { return JSON.parse(window.localStorage.getItem('creattia-liked-scraped-v1') || '[]'); }
				catch { return []; }
			})();
			const response = await fetch('/api/creativos/next-reference', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
				},
				body: JSON.stringify({
					exclude: Array.from(seenPathsRef.current),
					savedPaths,
					wearable: preview?.wearable !== false,
					hasImage: preview?.hasImage !== false,
					count: localSpare ? 2 : 1,
				}),
			});
			const data = await response.json();
			const fresh: WinnerRef[] = data.winners || [];
			fresh.forEach((winner) => seenPathsRef.current.add(winner.imagePath));

			if (!localSpare) {
				if (!fresh.length) {
					setError('No quedan más referencias compatibles en la biblioteca.');
					return;
				}
				setSelected((prev) => prev.map((winner) => (winner.imagePath === imagePath ? fresh[0] : winner)));
				setSpares((prev) => [...prev, ...fresh.slice(1)]);
			} else {
				setSpares((prev) => [...prev, ...fresh]);
			}
		} catch (err) {
			if (!localSpare) setError('No se pudo buscar otra referencia. Probá de nuevo.');
		} finally {
			setReplacingPath(null);
		}
	};

	// PASO 2 — Confirmar: acá se cobran los créditos y arranca la generación.
	const handleConfirmGeneration = async () => {
		if (!preview || !selected.length) return;
		setError(null);
		setIsGenerating(true);

		try {
			const accessToken = await getAccessToken();
			const response = await fetch('/api/creativos/batch-start', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
				},
				body: JSON.stringify({
					mode,
					productId: preview.product.id,
					productName: preview.product.name,
					productDescription: preview.product.description,
					winnerPaths: selected.map((winner) => winner.imagePath),
					format,
					language,
					colorMode,
					typoMode,
					brief: brief.trim(),
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'No se pudo iniciar la generación del lote.');

			setCurrentBatchId(data.batchId);
			const initialItems: BatchItem[] = (data.generations || []).map((gen: any) => ({
				id: gen.id,
				templateId: gen.template_id,
				title: gen.title,
				status: 'processing',
				referenceUrl: gen.settings_snapshot?.referencePath ? referenceUrlFor(gen.settings_snapshot.referencePath) : undefined,
				referenceName: gen.settings_snapshot?.referenceName,
				referenceLeaf: gen.settings_snapshot?.referenceLeaf,
			}));
			setBatchItems(initialItems);
			setStep('results');

			if (onRefreshCredits) onRefreshCredits();
			if (onBatchCreated && data.generations?.length) onBatchCreated(data.generations, data.batchId);

			startPollingBatch(data.batchId, initialItems);

			// Un worker por anuncio, de a 4 en paralelo. Si el usuario recarga la
			// página, la barrida de reanudación de la app retoma las que falten.
			void driveBatchWorkers(initialItems.map((item) => item.id), accessToken);
		} catch (err: any) {
			console.error('Error al generar lote por URL:', err);
			setError(err.message || 'Ocurrió un error al conectar con el servidor.');
			setIsGenerating(false);
		}
	};

	const startPollingBatch = (batchId: string, initialItems: BatchItem[]) => {
		if (pollRef.current) clearInterval(pollRef.current);

		let attempts = 0;

		pollRef.current = setInterval(async () => {
			attempts += 1;
			try {
				if (!supabase) return;

				const client = supabase;
				const { data: rows, error: fetchErr } = await client
					.from('creative_generations')
					.select('id,template_id,title,status,output_path,error_code,output_index,settings_snapshot')
					.eq('batch_id', batchId)
					.order('output_index');

				if (fetchErr || !rows || rows.length === 0) return;

				const signed = await signGenerationPaths(client, rows.map((row: any) => row.output_path));

				const updatedItems: BatchItem[] = rows.map((row: any) => {
					const snapshot = row.settings_snapshot || {};
					return {
						id: row.id,
						templateId: row.template_id,
						title: row.title,
						status: row.status as any,
						imageUrl: row.output_path ? signed.get(row.output_path) : undefined,
						error: row.error_code,
						referenceUrl: snapshot.referencePath ? `${REFERENCES_PUBLIC_BASE}/${snapshot.referencePath}` : undefined,
						referenceName: snapshot.referenceName,
						referenceLeaf: snapshot.referenceLeaf,
					};
				});

				setBatchItems(updatedItems);

				const allFinished = updatedItems.length >= initialItems.length && updatedItems.every((item) => item.status === 'completed' || item.status === 'failed');
				if (allFinished || attempts > 120) {
					if (pollRef.current) clearInterval(pollRef.current);
					setIsGenerating(false);
					if (onRefreshCredits) onRefreshCredits();
				}
			} catch (err) {
				console.error('Polling error:', err);
			}
		}, 3000);
	};

	const completedCount = batchItems.filter((i) => i.status === 'completed').length;
	const failedCount = batchItems.filter((i) => i.status === 'failed').length;
	const totalCount = batchItems.length || count;
	const progressPercent = Math.min(Math.round(((completedCount + failedCount) / totalCount) * 100), 100);

	return (
		<div className="url-batch-container">
			{/* Banner / Header */}
			<div className="url-batch-header">
				<div className="url-batch-badge">
					<span className="badge-icon">⚡</span>
					<span>CLONADOR DE ANUNCIOS GANADORES</span>
				</div>
				<h2 className="url-batch-title">Generá Anuncios Ganadores desde URL</h2>
				<p className="url-batch-subtitle">
					Pegá el enlace de tu producto. La IA elige los anuncios ganadores de la biblioteca que mejor le pegan y los recrea con tu producto real, cubriendo todo el embudo.
				</p>
			</div>

			{/* Formulario Principal */}
			{/* PASO 1 — Cuántos anuncios y qué vas a promocionar. Nada más:
			    formato, idioma y estilo no influyen en qué referencias se traen,
			    así que se piden recién en el paso 2. */}
			{/* Indicador de progreso: siempre visible, marca dónde estás. */}
			<ol className="wiz-progress" aria-label="Progreso">
				{[
					{ n: 1, label: 'Cantidad', active: step === 'form' && formStep === 1, done: step !== 'form' || formStep > 1 },
					{ n: 2, label: 'Tu producto', active: step === 'form' && formStep === 2, done: step !== 'form' },
					{ n: 3, label: 'Referencias y estilo', active: step === 'review', done: step === 'results' },
				].map((item) => (
					<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
						<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
						<span className="wiz-progress-label">{item.label}</span>
					</li>
				))}
			</ol>

			{step === 'form' && (
			<form onSubmit={handleScan} className="url-batch-form">
				<div className="wiz-step" hidden={formStep !== 1}>
					<div className="wiz-body">
						<label className="picker-label">¿Cuántos anuncios querés crear?</label>
						<div className="picker-options">
							{[10, 20, 30, 40].map((num) => (
								<button
									key={num}
									type="button"
									className={`picker-pill ${count === num ? 'active' : ''}`}
									onClick={() => setCount(num as any)}
								>
									<span className="pill-count">{num} Anuncios</span>
									<span className="pill-sub">{num} créditos</span>
								</button>
							))}
						</div>
					</div>
				</div>

				{formStep === 1 && (
					<button type="button" className="url-batch-submit-btn" onClick={() => { setError(null); setFormStep(2); }}>
						<span>Continuar</span>
						<span className="btn-credits-badge">{count} créditos cuando generes</span>
					</button>
				)}

				<div className="wiz-step" hidden={formStep !== 2}>
					<div className="wiz-body">
						<label className="picker-label">¿Qué vas a promocionar?</label>
						<div className="wiz-tabs">
							{([
								['url', '🔗', 'Con URL', 'Analizamos tu página'],
								['manual', '✍️', 'A mano', 'Vos cargás los datos'],
								['text', '📝', 'Solo texto', 'Sin foto de producto'],
							] as const).map(([value, icon, label, hint]) => (
								<button
									key={value}
									type="button"
									className={`wiz-tab ${mode === value ? 'active' : ''}`}
									onClick={() => setMode(value)}
								>
									<span className="wiz-tab-icon">{icon}</span>
									<span className="wiz-tab-label">{label}</span>
									<small>{hint}</small>
								</button>
							))}
						</div>

						{mode === 'url' && (
							<div className="url-batch-input-wrap" style={{ background: '#ffffff', border: '2px solid #744bde', boxShadow: '0 4px 16px rgba(116, 75, 222, 0.08)' }}>
								<span className="input-icon" style={{ fontSize: '20px' }}>🔗</span>
								<input
									type="url"
									className="url-batch-input"
									placeholder="https://tu-tienda.com/productos/zapato-deportivo-run"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									style={{ color: '#19171d', fontWeight: 600, fontSize: '15px' }}
								/>
								<button
									type="button"
									className="paste-btn"
									onClick={async () => {
										try {
											const text = await navigator.clipboard.readText();
											if (text.startsWith('http')) setUrl(text);
										} catch { /* ignore */ }
									}}
									title="Pegar URL"
								>
									📋 Pegar
								</button>
							</div>
						)}

						{mode !== 'url' && (
							<div className="wiz-fields">
								<input
									className="wiz-input"
									placeholder="Nombre del producto o servicio"
									value={manualName}
									onChange={(e) => setManualName(e.target.value)}
								/>
								<textarea
									className="wiz-input"
									rows={3}
									placeholder={mode === 'text'
										? 'Qué ofrecés, a quién le sirve y por qué. La IA escribe los anuncios con esto.'
										: 'Descripción del producto: materiales, medidas, beneficios reales.'}
									value={manualDescription}
									onChange={(e) => setManualDescription(e.target.value)}
								/>
								{mode === 'manual' && (
									<>
										<input
											className="wiz-input"
											placeholder="Precio (opcional). Ej: $38.50"
											value={manualPrice}
											onChange={(e) => setManualPrice(e.target.value)}
										/>
										<div className="image-uploader-box">
											<input
												type="file"
												accept="image/png, image/jpeg, image/webp"
												multiple
												onChange={handleImageChange}
												id="wiz-manual-imgs"
												className="hidden-file-input"
											/>
											<label htmlFor="wiz-manual-imgs" className="uploader-label">
												<span>📷 Subir fotos reales del producto (necesario)</span>
											</label>
										</div>
									</>
								)}
								{mode === 'text' && (
									<p className="wiz-hint">
										Sin foto usamos solo anuncios ganadores que no muestran producto: placas
										tipográficas, comparativas y tarjetas de reseña.
									</p>
								)}
							</div>
						)}

						{mode !== 'text' && (
							<>
								<button
									type="button"
									className="wiz-ghost"
									onClick={() => setShowAdvanced(!showAdvanced)}
								>
									<span>{showAdvanced ? 'Ocultar fotos' : `+ ${mode === 'url' ? 'Sumar fotos propias' : 'Más fotos'} · opcional`}</span>
								</button>
								{showAdvanced && mode === 'url' && (
									<div className="image-uploader-box">
										<input
											type="file"
											accept="image/png, image/jpeg, image/webp"
											multiple
											onChange={handleImageChange}
											id="wiz-extra-imgs"
											className="hidden-file-input"
										/>
										<label htmlFor="wiz-extra-imgs" className="uploader-label">
											<span>📷 Subir fotos adicionales (máx. 5)</span>
										</label>
									</div>
								)}
							</>
						)}

						{extraImagePreviews.length > 0 && (
							<div className="extra-previews-grid">
								{extraImagePreviews.map((src, idx) => (
									<div key={idx} className="preview-thumb">
										<img src={src} alt="Foto del producto" />
										<button type="button" className="remove-img-btn" onClick={() => removeExtraImage(idx)}>✕</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{error && (
					<div className="url-batch-error" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
						<span>{error}</span>
						{onNavigateToPlans && userCredits < count && (
							<button
								type="button"
								onClick={onNavigateToPlans}
								style={{
									alignSelf: 'flex-start', padding: '9px 18px', borderRadius: '10px', border: 0,
									background: '#744bde', color: '#ffffff', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
								}}
							>
								💳 Comprar Créditos / Ver Planes
							</button>
						)}
					</div>
				)}

				{formStep === 2 && (
					<div className="wiz-actions">
						<button type="button" className="wiz-back" onClick={() => { setError(null); setFormStep(1); }} disabled={isScanning}>
							← Atrás
						</button>
						<button
							type="submit"
							className="url-batch-submit-btn"
							disabled={isScanning || (mode === 'url' ? !url.trim() : !manualName.trim())}
						>
							{isScanning ? (
								<><span className="spinner">⌛</span> Buscando los mejores anuncios ganadores…</>
							) : (
								<>
									<span>🔎 Buscar {count} anuncios ganadores</span>
									<span className="btn-credits-badge">Todavía no gastás créditos</span>
								</>
							)}
						</button>
					</div>
				)}
			</form>
			)}

			{/* PASO 2 — Revisión de las referencias ganadoras elegidas */}
			{step === 'review' && preview && (
				<div className="active-batch-results">
					<div className="batch-status-header">
						<div className="batch-status-info">
							<h3>🏆 Estos son los {selected.length} anuncios ganadores que vamos a recrear</h3>
							<p className="product-tag">
								Producto: <strong>{preview.product?.name}</strong>
							</p>
							<p style={{ fontSize: '12.5px', color: '#6b6478', marginTop: '6px' }}>
								Tocá <strong>Reemplazar</strong> en el que no te guste y entra otro al azar de toda la
								biblioteca, sin repetir. Tus anuncios guardados tienen prioridad. Recién cuando toques
								<strong> Generar</strong> se usan tus créditos.
							</p>
						</div>
						<div className="batch-counter">
							<span>{selected.length} referencias</span>
						</div>
					</div>

					<div className="ref-grid">
						{selected.map((winner, index) => (
							<div key={winner.imagePath} className="ref-card">
								<button
									type="button"
									className="ref-thumb"
									onClick={() => setPreviewModalUrl(referenceUrlFor(winner.imagePath))}
									title="Ver el anuncio ganador en grande"
								>
									<img src={referenceUrlFor(winner.imagePath)} alt={winner.name} loading="lazy" />
									<span className="ref-index">{index + 1}</span>
								</button>
								<div className="ref-foot single">
									<button
										type="button"
										className="ref-replace"
										onClick={() => discardWinner(winner.imagePath)}
										disabled={replacingPath === winner.imagePath}
										title="Cambiar por otro anuncio ganador al azar de la biblioteca"
									>
										{replacingPath === winner.imagePath ? 'Buscando…' : 'Reemplazar'}
									</button>
								</div>
							</div>
						))}
					</div>

					{/* Los ajustes de generación viven acá: no cambian qué referencias se
				    eligen, solo cómo se construye cada anuncio. */}
				<div className="wiz-step" style={{ marginTop: '20px' }}>
					<div className="wiz-body">
						<label className="picker-label">Cómo querés que salgan</label>
						<div className="batch-select-row">
							<BatchSelect label="Formato" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
							<BatchSelect label="Idioma de los textos" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
								<BatchSelect label="Colores" value={colorMode} options={STYLE_OPTIONS} onChange={setColorMode} />
							<BatchSelect label="Tipografía" value={typoMode} options={STYLE_OPTIONS} onChange={setTypoMode} />
						</div>

						<label className="field-label" style={{ marginTop: '14px', display: 'block' }}>
							Qué querés que digan los anuncios (Opcional)
						</label>
						<textarea
							className="brief-textarea"
							placeholder="Ej: hablarle a mujeres de 30-45, destacar que es libre de fragancia, tono cercano y sin tecnicismos."
							value={brief}
							onChange={(e) => setBrief(e.target.value)}
							rows={2}
						/>
						<small style={{ color: '#6b6478', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
							La IA solo usa datos reales de tu producto: nunca inventa precios, descuentos ni certificaciones.
						</small>
					</div>
				</div>

				<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
						<button
							type="button"
							className="url-batch-submit-btn"
							style={{ flex: '1 1 260px' }}
							onClick={handleConfirmGeneration}
							disabled={isGenerating || !selected.length}
						>
							{isGenerating ? (
								<><span className="spinner">⌛</span> Iniciando la generación…</>
							) : (
								<>
									<span>🚀 Generar {selected.length} anuncios con estas referencias</span>
									<span className="btn-credits-badge">({selected.length} créditos)</span>
								</>
							)}
						</button>
						<button
							type="button"
							onClick={() => { setStep('form'); setFormStep(1); setPreview(null); setSelected([]); setSpares([]); seenPathsRef.current = new Set(); }}
							disabled={isGenerating}
							style={{
								padding: '0 20px', borderRadius: '12px', border: '2px solid #e6e0f2',
								background: '#fff', color: '#5f32cf', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
							}}
						>
							← Cambiar producto
						</button>
					</div>

					{error && (
						<div className="url-batch-error" style={{ marginTop: '14px' }}>
							<span>{error}</span>
						</div>
					)}
				</div>
			)}

			{/* Barra de Progreso y Visualización del Lote Activo */}
			{batchItems.length > 0 && (
				<div className="active-batch-results">
					<div className="batch-status-header">
						<div className="batch-status-info">
							<h3>
								{isGenerating ? '⏳ Clonando anuncios ganadores…' : '✅ Lote de creativos completado'}
							</h3>
							{productName && <p className="product-tag">Producto: <strong>{productName}</strong></p>}
						</div>
						<div className="batch-counter" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
							<span>{completedCount} de {totalCount} listos</span>
							{!isGenerating && (
								<button
									type="button"
									onClick={() => {
										if (pollRef.current) clearInterval(pollRef.current);
										setStep('form');
										setFormStep(1);
										setPreview(null);
										setSelected([]);
										setSpares([]);
										setBatchItems([]);
									}}
									style={{
										padding: '6px 12px', borderRadius: '9px', border: '2px solid #e6e0f2',
										background: '#fff', color: '#5f32cf', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
									}}
								>
									＋ Nuevo lote
								</button>
							)}
						</div>
					</div>

					<div className="batch-progress-bar-container">
						<div
							className="batch-progress-bar-fill"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>

					{/* Grilla de Anuncios Generados */}
					<div className="batch-grid">
						{batchItems.map((item, index) => (
								<div key={item.id || index} className="batch-card">
									<div className="batch-card-header">
										<span className="template-badge">Anuncio #{index + 1}</span>
									</div>

									<div className="batch-card-body">
										{item.status === 'processing' && (
											<div className="card-skeleton" style={{ position: 'relative', overflow: 'hidden' }}>
												{/* Se muestra el ganador que se está clonando, así se ve de dónde sale el anuncio */}
												{item.referenceUrl && (
													<img
														src={item.referenceUrl}
														alt=""
														loading="lazy"
														style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'blur(1px)' }}
													/>
												)}
												<div className="skeleton-pulse"></div>
												<span style={{ position: 'relative' }}>Clonando el ganador con tu producto…</span>
											</div>
										)}

										{item.status === 'failed' && (
											<div className="card-error">
												<span>⚠️ Error en generación</span>
												<small>{item.error || 'Intentalo nuevamente'}</small>
											</div>
										)}

										{item.status === 'completed' && item.imageUrl && (
											<div className="card-image-wrap">
												<img
													src={item.imageUrl}
													alt={item.title}
													loading="lazy"
													onClick={() => setPreviewModalUrl(item.imageUrl || null)}
												/>
												<div className="card-overlay-actions">
													<button
														className="overlay-action-btn remodel"
														onClick={() => {
															if (onSelectRemodel) onSelectRemodel(item, item.templateId);
														}}
														title="Modelar / Rehacer en el Studio"
													>
														✨ Modelar / Rehacer
													</button>
													<a
														href={item.imageUrl}
														download={`creattia-anuncio-${item.id}.${item.imageUrl?.includes('.png') ? 'png' : 'jpg'}`}
														target="_blank"
														rel="noreferrer"
														className="overlay-action-btn download"
														title="Descargar imagen"
													>
														⬇️
													</a>
												</div>
											</div>
										)}
									</div>
								</div>
						))}
					</div>
				</div>
			)}

			{/* Modal de vista previa rápida */}
			{previewModalUrl && (
				<div className="image-preview-modal" onClick={() => setPreviewModalUrl(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<button className="modal-close" onClick={() => setPreviewModalUrl(null)}>✕</button>
						<img src={previewModalUrl} alt="Vista previa del anuncio" />
					</div>
				</div>
			)}
		</div>
	);
};
