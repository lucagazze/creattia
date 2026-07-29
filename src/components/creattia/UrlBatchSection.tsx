import React, { useEffect, useState, useRef } from 'react';
import { creativos } from '../../data/creativos50';
import { getTemplateBlueprint } from '../../lib/creattia/ad-prompt-builder';
import { supabase } from '../../lib/creattia/supabase-browser';

type UrlBatchSectionProps = {
	onSelectRemodel?: (generation: any, templateId?: number) => void;
	userCredits?: number;
	onRefreshCredits?: () => void;
	onNavigateToPlans?: () => void;
	initialUrl?: string;
	session?: any;
};

type BatchItem = {
	id: string;
	templateId?: number;
	title: string;
	imageUrl?: string;
	status: 'processing' | 'completed' | 'failed';
	error?: string;
};

export const UrlBatchSection: React.FC<UrlBatchSectionProps> = ({
	onSelectRemodel,
	userCredits = 0,
	onRefreshCredits,
	onNavigateToPlans,
	initialUrl = '',
	session,
}) => {
	const [url, setUrl] = useState(initialUrl);
	const [count, setCount] = useState<10 | 20 | 30 | 40>(10);
	const [format, setFormat] = useState<'square' | 'portrait' | 'story'>('square');
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

	// Generación de Lote por URL
	const handleGenerateBatch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim()) {
			setError('Ingresá la URL del producto para continuar.');
			return;
		}

		// Verificación obligatoria de créditos antes de permitir la generación
		if (userCredits < count) {
			setError(`No tenés créditos suficientes (${userCredits} disponible, ${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar tus anuncios.`);
			return;
		}

		setError(null);
		setIsGenerating(true);
		setBatchItems([]);
		setProductName('');

		try {
			const formData = new FormData();
			formData.append('productUrl', url.trim());
			formData.append('count', String(count));
			formData.append('format', format);
			if (brief.trim()) formData.append('brief', brief.trim());

			extraImages.forEach((file) => {
				formData.append('extraImages', file);
			});

			let accessToken = session?.access_token || '';
			if (!accessToken && supabase) {
				try {
					const { data: sessData } = await supabase.auth.getSession();
					accessToken = sessData.session?.access_token || '';
				} catch { /* ignore */ }
			}

			const headers: Record<string, string> = {};
			if (accessToken) {
				headers['authorization'] = `Bearer ${accessToken}`;
			}

			const response = await fetch('/api/creativos/batch-url', {
				method: 'POST',
				headers,
				body: formData,
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'No se pudo iniciar la generación en lote.');
			}

			setCurrentBatchId(data.batchId);
			setProductName(data.product?.name || 'Producto');
			
			// Inicializar items del lote
			const initialItems: BatchItem[] = (data.generations || []).map((gen: any) => ({
				id: gen.id,
				templateId: gen.template_id,
				title: gen.title,
				status: 'processing',
			}));
			setBatchItems(initialItems);

			if (onRefreshCredits) onRefreshCredits();

			// Polling en tiempo real para actualizar las imágenes completadas
			startPollingBatch(data.batchId, initialItems);

		} catch (err: any) {
			console.error('Error al generar lote por URL:', err);
			setError(err.message || 'Ocurrió un error al conectar con el servidor.');
			setIsGenerating(false);
		}
	};

	const startPollingBatch = (batchId: string, initialItems: BatchItem[]) => {
		if (pollRef.current) clearInterval(pollRef.current);

		let items = [...initialItems];
		let attempts = 0;

		pollRef.current = setInterval(async () => {
			attempts += 1;
			try {
				const { data: rows, error: fetchErr } = await supabase
					.from('creative_generations')
					.select('id,template_id,title,status,output_path,error_message')
					.eq('batch_id', batchId);

				if (fetchErr || !rows) return;

				// Obtener URLs firmadas para las imágenes completadas
				const completedPaths = rows
					.filter((r) => r.status === 'completed' && r.output_path)
					.map((r) => r.output_path);

				let signedMap = new Map<string, string>();
				if (completedPaths.length > 0) {
					const { data: signed } = await supabase.storage
						.from('creative-assets')
						.createSignedUrls(completedPaths, 3600);
					
					(signed || []).forEach((item, idx) => {
						if (item.signedUrl) signedMap.set(completedPaths[idx], item.signedUrl);
					});
				}

				const updatedItems: BatchItem[] = rows.map((row) => ({
					id: row.id,
					templateId: row.template_id,
					title: row.title,
					status: row.status as any,
					imageUrl: row.output_path ? signedMap.get(row.output_path) : undefined,
					error: row.error_message,
				}));

				setBatchItems(updatedItems);

				const allFinished = updatedItems.every((item) => item.status === 'completed' || item.status === 'failed');
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
					<span>GENERADOR IA DE ANUNCIOS PROBADOS</span>
				</div>
				<h2 className="url-batch-title">Generá Anuncios Probados desde URL</h2>
				<p className="url-batch-subtitle">
					Pegá el enlace de tu producto. La IA analizará la web y creará creativos de alto rendimiento ajustados a tu marca.
				</p>
			</div>

			{/* Formulario Principal */}
			<form onSubmit={handleGenerateBatch} className="url-batch-form">
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
					<label className="picker-label">¿Cuántos anuncios probados querés generar en paralelo?</label>
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

							{/* Formato de la imagen */}
							<div className="advanced-field">
								<label className="field-label">Formato del anuncio</label>
								<div className="format-selector">
									<button
										type="button"
										className={`format-btn ${format === 'square' ? 'active' : ''}`}
										onClick={() => setFormat('square')}
									>
										🔲 Cuadrado 1:1
									</button>
									<button
										type="button"
										className={`format-btn ${format === 'portrait' ? 'active' : ''}`}
										onClick={() => setFormat('portrait')}
									>
										📱 Vertical 3:4
									</button>
									<button
										type="button"
										className={`format-btn ${format === 'story' ? 'active' : ''}`}
										onClick={() => setFormat('story')}
									>
										📐 Story 9:16
									</button>
								</div>
							</div>
						</div>

						{/* Brief o indicaciones adicionales */}
						<div className="advanced-field full-width">
							<label className="field-label">Indicaciones especiales para la IA (Opcional)</label>
							<textarea
								className="brief-textarea"
								placeholder="Ej: Destacar el descuento del 20% de bienvenida, usar tono directo y colores cálidos."
								value={brief}
								onChange={(e) => setBrief(e.target.value)}
								rows={2}
							/>
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
					disabled={isGenerating || !url.trim()}
				>
					{isGenerating ? (
						<>
							<span className="spinner">⌛</span> Generando {count} anuncios en paralelo ({progressPercent}%)...
						</>
					) : (
						<>
							<span>🚀 Generar {count} Anuncios Probados en Paralelo</span>
							<span className="btn-credits-badge">({count} créditos)</span>
						</>
					)}
				</button>
			</form>

			{/* Barra de Progreso y Visualización del Lote Activo */}
			{batchItems.length > 0 && (
				<div className="active-batch-results">
					<div className="batch-status-header">
						<div className="batch-status-info">
							<h3>
								{isGenerating ? '⏳ Procesando lote publicitario...' : '✅ Lote de creativos completado'}
							</h3>
							{productName && <p className="product-tag">Producto: <strong>{productName}</strong></p>}
						</div>
						<div className="batch-counter">
							<span>{completedCount} de {totalCount} listos</span>
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
						{batchItems.map((item, index) => {
							const templateInfo = creativos.find((c) => c.id === item.templateId);

							return (
								<div key={item.id || index} className="batch-card">
									<div className="batch-card-header">
										<span className="template-badge">
											{templateInfo ? `#${templateInfo.id} ${templateInfo.nombre}` : `Anuncio #${index + 1}`}
										</span>
										{templateInfo?.ring && (
											<span className="ring-tag">{templateInfo.ring}</span>
										)}
									</div>

									{templateInfo && (() => {
										const blueprint = getTemplateBlueprint(templateInfo);
										return (
											<div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '6px 10px', background: '#f8f6fc', borderBottom: '1px solid #f0ebf8' }}>
												{blueprint.slots.map((s, i) => (
													<span key={i} title={s.description} style={{ fontSize: '9.5px', fontWeight: 700, color: '#5f32cf', background: '#efeafc', padding: '2px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
														<span>{s.icon}</span> <span>{s.name}</span>
													</span>
												))}
											</div>
										);
									})()}

									<div className="batch-card-body">
										{item.status === 'processing' && (
											<div className="card-skeleton">
												<div className="skeleton-pulse"></div>
												<span>Diseñando anuncio probado #{index + 1}...</span>
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
														download={`creattia-anuncio-${item.id}.png`}
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
							);
						})}
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
