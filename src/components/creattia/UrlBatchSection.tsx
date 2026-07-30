import React, { useEffect, useState, useRef } from 'react';
import { signGenerationPaths } from '../../lib/creattia/generation-image';
import { supabase } from '../../lib/creattia/supabase-browser';

// Cuántos anuncios se generan a la vez. Cada uno es una request independiente:
// si una falla o se corta, las demás siguen y esa se puede reintentar sola.
const WORKER_CONCURRENCY = 4;

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
const LEAF_LABELS: Record<string, string> = {
	hero: 'Producto destacado',
	resenas: 'Prueba social',
	precio: 'Oferta / precio',
	competencia: 'Comparación',
	caracteristicas: 'Características',
	urgencia: 'Urgencia',
	garantia: 'Garantía',
	mitos: 'Mito vs realidad',
	envio: 'Envío',
};

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
	matchedNiches?: string[];
};

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
	const [count, setCount] = useState<10 | 20 | 30 | 40>(10);
	const [format, setFormat] = useState<'original' | 'square' | 'portrait' | 'story'>('original');
	const [language, setLanguage] = useState('es');
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
	const [isScanning, setIsScanning] = useState(false);
	const [preview, setPreview] = useState<BatchPreview | null>(null);
	const [selected, setSelected] = useState<WinnerRef[]>([]);
	const [spares, setSpares] = useState<WinnerRef[]>([]);

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
		if (!url.trim()) {
			setError('Ingresá la URL del producto para continuar.');
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
			formData.append('productUrl', url.trim());
			formData.append('count', String(count));
			formData.append('format', format);
			formData.append('language', language);
			if (brief.trim()) formData.append('brief', brief.trim());
			extraImages.forEach((file) => formData.append('extraImages', file));

			const accessToken = await getAccessToken();
			const response = await fetch('/api/creativos/batch-url', {
				method: 'POST',
				headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
				body: formData,
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'No se pudo analizar el producto.');

			setPreview({ product: data.product, count: data.count, matchedNiches: data.matchedNiches });
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

	// Descartar una referencia: entra automáticamente la mejor suplente.
	const discardWinner = (imagePath: string) => {
		const index = selected.findIndex((winner) => winner.imagePath === imagePath);
		if (index === -1) return;
		const discarded = selected[index];

		// Se prioriza una suplente del mismo tipo de anuncio para no romper la
		// cobertura del embudo del lote.
		const sameLeaf = spares.findIndex((spare) => spare.leaf === discarded.leaf);
		const pickIndex = sameLeaf !== -1 ? sameLeaf : 0;
		const replacement = spares[pickIndex];

		const nextSelected = [...selected];
		if (replacement) nextSelected[index] = replacement;
		else nextSelected.splice(index, 1);
		setSelected(nextSelected);

		// La descartada vuelve al final del banco, por si se arrepiente.
		setSpares(replacement
			? [...spares.filter((_, i) => i !== pickIndex), discarded]
			: [...spares, discarded]);
	};

	// PASO 2 — Confirmar: acá se cobran los créditos y arranca la generación.
	const handleConfirmGeneration = async () => {
		if (!preview?.product?.id || !selected.length) return;
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
					productId: preview.product.id,
					winnerPaths: selected.map((winner) => winner.imagePath),
					format,
					language,
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
			{step === 'form' && (
			<form onSubmit={handleScan} className="url-batch-form">
				<div className="url-batch-input-wrap" style={{ background: '#ffffff', border: '2px solid #744bde', boxShadow: '0 4px 16px rgba(116, 75, 222, 0.08)' }}>
					<span className="input-icon" style={{ fontSize: '20px' }}>🔗</span>
					<input
						type="url"
						className="url-batch-input"
						placeholder="https://tu-tienda.com/productos/zapato-deportivo-run"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						required
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

				{/* Selector de Cantidad (10, 20, 30, 40) */}
				<div className="batch-quantity-picker">
					<label className="picker-label">¿Cuántos anuncios ganadores querés recrear con tu producto?</label>
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

				{/* Formato e idioma: siempre visibles porque cambian el resultado */}
				<div className="batch-quantity-picker">
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
						<div>
							<label className="picker-label">Formato del anuncio</label>
							<div className="format-selector">
								{([
									['original', '🏆 Igual al ganador'],
									['square', '🔲 Cuadrado 1:1'],
									['portrait', '📱 Vertical 4:5'],
									['story', '📐 Story 9:16'],
								] as const).map(([value, label]) => (
									<button
										key={value}
										type="button"
										className={`format-btn ${format === value ? 'active' : ''}`}
										onClick={() => setFormat(value)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
						<div>
							<label className="picker-label">Idioma de los textos</label>
							<div className="format-selector">
								{([
									['es', '🇦🇷 Español'],
									['en', '🇺🇸 Inglés'],
									['pt', '🇧🇷 Portugués'],
									['it', '🇮🇹 Italiano'],
									['fr', '🇫🇷 Francés'],
									['de', '🇩🇪 Alemán'],
								] as const).map(([value, label]) => (
									<button
										key={value}
										type="button"
										className={`format-btn ${language === value ? 'active' : ''}`}
										onClick={() => setLanguage(value)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Desplegable de Opciones Avanzadas */}
				<div className="advanced-options-toggle">
					<button
						type="button"
						className="toggle-btn"
						onClick={() => setShowAdvanced(!showAdvanced)}
					>
						<span>{showAdvanced ? '➖ Menos opciones' : '➕ Más fotos e instrucciones para la IA (Opcional)'}</span>
					</button>
				</div>

				{showAdvanced && (
					<div className="advanced-panel">
						<div className="advanced-grid">
							{/* Subida de Imágenes Adicionales */}
							<div className="advanced-field">
								<label className="field-label">Sumar otras fotos del producto</label>
								<div className="image-uploader-box">
									<input
										type="file"
										accept="image/png, image/jpeg, image/webp"
										multiple
										onChange={handleImageChange}
										id="batch-extra-imgs"
										className="hidden-file-input"
									/>
									<label htmlFor="batch-extra-imgs" className="uploader-label">
										<span>📷 Subir fotos adicionales (max 5)</span>
									</label>
								</div>
								{extraImagePreviews.length > 0 && (
									<div className="extra-previews-grid">
										{extraImagePreviews.map((src, idx) => (
											<div key={idx} className="preview-thumb">
												<img src={src} alt="Foto extra" />
												<button
													type="button"
													className="remove-img-btn"
													onClick={() => removeExtraImage(idx)}
												>
													✕
												</button>
											</div>
										))}
									</div>
								)}
							</div>

						</div>

						{/* Brief: se inyecta como USER DIRECTION en cada anuncio del lote */}
						<div className="advanced-field full-width">
							<label className="field-label">Qué querés que digan los anuncios (Opcional)</label>
							<textarea
								className="brief-textarea"
								placeholder="Ej: hablarle a mujeres de 30-45, destacar que es libre de fragancia, tono cercano y sin tecnicismos. Estas indicaciones se aplican a los anuncios del lote."
								value={brief}
								onChange={(e) => setBrief(e.target.value)}
								rows={3}
							/>
							<small style={{ color: '#6b6478', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
								La IA solo usa datos reales de tu producto: nunca inventa precios, descuentos ni certificaciones.
							</small>
						</div>
					</div>
				)}

				{error && (
					<div className="url-batch-error" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
						<span>{error}</span>
						{onNavigateToPlans && userCredits < count && (
							<button
								type="button"
								onClick={onNavigateToPlans}
								style={{
									alignSelf: 'flex-start',
									padding: '9px 18px',
									borderRadius: '10px',
									border: 0,
									background: '#744bde',
									color: '#ffffff',
									fontWeight: 800,
									fontSize: '13px',
									cursor: 'pointer'
								}}
							>
								💳 Comprar Créditos / Ver Planes
							</button>
						)}
					</div>
				)}

				{/* Botón de Acción Principal */}
				<button
					type="submit"
					className="url-batch-submit-btn"
					disabled={isScanning || !url.trim()}
				>
					{isScanning ? (
						<>
							<span className="spinner">⌛</span> Analizando tu producto y buscando ganadores…
						</>
					) : (
						<>
							<span>🔎 Buscar {count} Anuncios Ganadores para mi Producto</span>
							<span className="btn-credits-badge">Todavía no gastás créditos</span>
						</>
					)}
				</button>
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
								{preview.matchedNiches?.length ? ` · Rubro detectado: ${preview.matchedNiches.join(', ')}` : ''}
							</p>
							<p style={{ fontSize: '12.5px', color: '#6b6478', marginTop: '6px' }}>
								Descartá con ✕ el que no te guste y entra otro automáticamente. Recién cuando toques
								<strong> Generar</strong> se usan tus créditos.
							</p>
						</div>
						<div className="batch-counter">
							<span>{selected.length} referencias · {spares.length} en banco</span>
						</div>
					</div>

					<div className="batch-grid">
						{selected.map((winner, index) => (
							<div key={winner.imagePath} className="batch-card">
								<div className="batch-card-header">
									<span className="template-badge">🏆 {winner.name}</span>
									{winner.leaf && <span className="ring-tag">{LEAF_LABELS[winner.leaf] || winner.leaf}</span>}
								</div>
								<div className="batch-card-body">
									<div className="card-image-wrap">
										<img
											src={referenceUrlFor(winner.imagePath)}
											alt={winner.name}
											loading="lazy"
											onClick={() => setPreviewModalUrl(referenceUrlFor(winner.imagePath))}
										/>
										<button
											type="button"
											onClick={() => discardWinner(winner.imagePath)}
											title="Descartar y traer otro ganador"
											style={{
												position: 'absolute', top: '8px', right: '8px', zIndex: 3,
												width: '30px', height: '30px', borderRadius: '999px', border: 0,
												background: 'rgba(25,23,29,0.82)', color: '#fff', cursor: 'pointer',
												fontSize: '14px', fontWeight: 800, lineHeight: 1,
											}}
										>
											✕
										</button>
										<span
											style={{
												position: 'absolute', bottom: '8px', left: '8px', zIndex: 3,
												padding: '3px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700,
												background: 'rgba(255,255,255,0.92)', color: '#5f32cf',
											}}
										>
											#{index + 1}
										</span>
									</div>
									{winner.notes && (
										<p style={{ fontSize: '11px', color: '#6b6478', padding: '8px 10px 0', margin: 0 }}>
											{winner.notes}
										</p>
									)}
								</div>
							</div>
						))}
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
							onClick={() => { setStep('form'); setPreview(null); setSelected([]); setSpares([]); }}
							disabled={isGenerating}
							style={{
								padding: '0 20px', borderRadius: '12px', border: '2px solid #e6e0f2',
								background: '#fff', color: '#5f32cf', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
							}}
						>
							← Cambiar producto u opciones
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
										<span className="template-badge">
											{item.referenceName ? `🏆 ${item.referenceName}` : `Anuncio #${index + 1}`}
										</span>
										{item.referenceLeaf && (
											<span className="ring-tag">{LEAF_LABELS[item.referenceLeaf] || item.referenceLeaf}</span>
										)}
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
