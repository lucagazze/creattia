import React, { useState } from 'react';
import { BatchSelect, LANGUAGE_OPTIONS, STYLE_OPTIONS, BRAND_OPTIONS, brandSourceDescription } from './UrlBatchSection';

// ─────────────────────────────────────────────────────────────────────────────
// Página completa de creación fiel al ganador (reemplaza el modal). Mismo
// wizard paso a paso que el generador por lote (UrlBatchSection): un tema por
// pantalla, con la misma barra de progreso, tabs, pills y botones.
// Pasos: 1) producto  2) formato  3) estilo (idioma/colores/tipografía/
// cantidad/indicación) → "Generar textos" → editor de copy por zona → generar.
// ─────────────────────────────────────────────────────────────────────────────

// Formatos visuales del paso 2, mismos valores que ya entiende el backend de
// generación individual (distintos de los alias del lote, pero mismo diseño).
const FORMAT_ITEMS = [
	{ id: 'original', text: 'Original', desc: 'Igual al ganador', shape: 'original' },
	{ id: '1:1', text: '1:1', desc: 'Feed', shape: 'square' },
	{ id: '3:4', text: '3:4', desc: 'Vertical', shape: 'portrait' },
	{ id: '9:16', text: '9:16', desc: 'Historia', shape: 'story' },
	{ id: '4:3', text: '4:3', desc: 'Horizontal', shape: 'landscape' },
	{ id: '16:9', text: '16:9', desc: 'Panorámico', shape: 'wide' },
];

export default function CreationFlow({ ad, session, savedProducts, onToast, onGenerationStarted, onGenerationRequested, onBack }: {
	ad: any;
	session: any;
	savedProducts: any[];
	onToast?: (message: string) => void;
	onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onGenerationRequested?: () => void;
	onBack: () => void;
}) {
	const token = session?.access_token || '';
	const referenceUrl = `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${ad.imagePath}`;

	// Cómo cargar el producto: por URL(s), a mano (con archivos), o sin producto.
	const [productMode, setProductMode] = useState<'url' | 'manual' | 'none'>('url');
	const [urls, setUrls] = useState<string[]>(['']);
	const [scanning, setScanning] = useState(false);
	const [scannedProductIds, setScannedProductIds] = useState<string[]>([]);
	const [uploadFiles, setUploadFiles] = useState<File[]>([]);
	const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
	const [parsingDoc, setParsingDoc] = useState(false);

	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [colorMode, setColorMode] = useState<'winner' | 'brand'>('winner');
	const [typoMode, setTypoMode] = useState<'winner' | 'brand'>('winner');
	const [brandSource, setBrandSource] = useState('url');
	const [includeLogo, setIncludeLogo] = useState(false);
	const [count, setCount] = useState(1);
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');

	// El armado es secuencial, como en el lote: 1 producto, 2 formato, 3 estilo.
	const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting'>('setup');
	const [copyMode, setCopyMode] = useState<'auto' | 'edit'>('auto');
	const [plan, setPlan] = useState<any>(null);
	const [zones, setZones] = useState<Array<{ where?: string; messageRole?: string; original?: string; replacement?: string; onProduct?: boolean }>>([]);
	const [people, setPeople] = useState<Array<{ where?: string; role?: string; description?: string; directive?: string }>>([]);
	const [comparisons, setComparisons] = useState<Array<{ where?: string; role?: string; description?: string; directive?: string }>>([]);
	const [creativeOptions, setCreativeOptions] = useState<string[]>([]);
	const [pickedOptions, setPickedOptions] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [regeneratingIndexes, setRegeneratingIndexes] = useState<number[]>([]);

	const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '9px', letterSpacing: '.01em' } as const;
	const chip = (active: boolean) => ({
		padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
		border: active ? '2px solid #744bde' : '1px solid #e2dde9', background: active ? '#f4f2f6' : '#fff', color: active ? '#744bde' : '#3f3a48',
	} as const);

	const step1Ready = productMode === 'none'
		|| (productMode === 'url' && urls.some((u) => u.trim()))
		|| (productMode === 'manual' && manualProductName.trim());

	// Escanea una o varias URLs → devuelve los IDs de producto importados.
	async function scanUrls(list: string[]): Promise<string[]> {
		setScanning(true); setError('');
		const ids: string[] = [];
		try {
			for (const raw of list) {
				const response = await fetch('/api/creativos/products', {
					method: 'POST',
					headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: raw }),
				});
				const payload = await response.json();
				if (response.ok && payload.importedIds?.length) ids.push(...payload.importedIds);
				else if (list.length === 1) throw new Error(payload.errors?.[0]?.error || payload.error || 'No pudimos analizar esa URL.');
			}
			if (!ids.length) throw new Error('No pudimos analizar ninguna de las URLs.');
			return ids;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo escanear la URL.');
			return [];
		} finally { setScanning(false); }
	}

	// Lee un PDF / Word / Excel y precarga nombre + descripción + imágenes.
	async function parseDoc(file: File | null) {
		if (!file) return;
		setParsingDoc(true); setError('');
		try {
			const form = new FormData();
			form.set('file', file);
			const res = await fetch('/api/creativos/parse-doc', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'No pudimos leer el archivo.');
			if (payload.name) setManualProductName(payload.name);
			if (payload.facts) setManualProductFacts(payload.facts);
			if (Array.isArray(payload.images) && payload.images.length) {
				const files: File[] = [];
				const previews: string[] = [];
				for (let i = 0; i < payload.images.length; i++) {
					try {
						const blob = await (await fetch(payload.images[i])).blob();
						files.push(new File([blob], `doc-img-${i}.png`, { type: blob.type || 'image/png' }));
						previews.push(payload.images[i]);
					} catch { /* imagen inválida */ }
				}
				if (files.length) { setUploadFiles((prev) => [...prev, ...files]); setUploadPreviews((prev) => [...prev, ...previews]); }
			}
			if (onToast) onToast('Archivo analizado: revisá el nombre y la descripción.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No pudimos leer el archivo.');
		} finally { setParsingDoc(false); }
	}

	async function requestPlan() {
		setPhase('planning'); setError('');
		try {
			let productIds: string[] = [];
			if (productMode === 'url') {
				const list = urls.map((u) => u.trim()).filter(Boolean);
				if (!list.length) { setError('Pegá al menos una URL.'); setPhase('setup'); return; }
				productIds = await scanUrls(list);
				if (!productIds.length) { setPhase('setup'); return; }
				setScannedProductIds(productIds);
			}
			const form = new FormData();
			form.set('referencePath', ad.imagePath);
			form.set('language', language);
			form.set('brandSource', brandSource);
			if (productMode === 'url' && productIds.length) {
				form.set('productId', productIds[0]); // contexto de análisis
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			// productMode === 'none' → no se manda producto
			const response = await fetch('/api/creativos/plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudieron generar los textos.');
			const analysis = payload.analysis || {};
			if (analysis.referenceHasProduct !== false && productMode === 'none') {
				throw new Error('Este anuncio ganador muestra un producto: usá una URL o carga manual para reemplazarlo.');
			}
			setPlan(analysis);
			setZones((analysis.textZones || []).filter((zone: any) => analysis.productHasPackaging ? true : !zone.onProduct));
			setPeople(Array.isArray(analysis.people) ? analysis.people.map((p: any) => ({ ...p, directive: '' })) : []);
			setComparisons(Array.isArray(analysis.comparisonItems) ? analysis.comparisonItems.map((c: any) => ({ ...c, directive: '' })) : []);
			setCreativeOptions(Array.isArray(analysis.creativeOptions) ? analysis.creativeOptions.slice(0, 5) : []);
			setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudieron generar los textos.');
			setPhase('setup');
		}
	}

	async function approveAndGenerate() {
		setPhase('starting'); setError('');
		onGenerationRequested?.();
		try {
			const pathPrefixId = parseInt(ad.imagePath.split('/')[0], 10);
			const form = new FormData();
			form.set('templateId', String(!isNaN(pathPrefixId) ? pathPrefixId : 40));
			form.set('templateName', ad.name || 'Anuncio Ganador');
			form.set('referencePath', ad.imagePath);
			form.set('imageType', 'promotion');
			form.set('fidelity', '1');
			form.set('preset', 'Fiel al ganador');
			form.set('count', String(count));
			form.set('format', format);
			form.set('language', language);
			form.set('colorMode', colorMode);
			form.set('typoMode', typoMode);
			form.set('brandSource', brandSource);
			form.set('includeLogo', includeLogo ? '1' : '0');
			if (productMode === 'url' && scannedProductIds.length) {
				scannedProductIds.forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			// productMode === 'none' → sin producto
			form.set('plan', JSON.stringify({ ...plan, textZones: zones, people, comparisonItems: comparisons }));

			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación.');
			if (payload.async && payload.batchId && onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					title: manualProductName.trim() ? `${manualProductName.trim()} · ${ad.name}` : ad.name,
					referenceUrl,
					count,
				});
				onBack();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación.');
			setPhase('review');
		}
	}

	async function regenerateCopy(index: number) {
		if (regeneratingIndexes.includes(index)) return;
		setRegeneratingIndexes(prev => [...prev, index]);
		try {
			const zone = zones[index];
			const response = await fetch('/api/creativos/rewrite', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					original: zone.original,
					current: zone.replacement,
					messageRole: zone.messageRole,
					productName: manualProductName || 'producto',
					productFacts: manualProductFacts,
					language: language
				})
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo reescribir el texto.');

			// Update the specific zone
			setZones(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: payload.replacement } : item));
			if (onToast) onToast('Texto regenerado con éxito.');
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al reescribir con IA.');
		} finally {
			setRegeneratingIndexes(prev => prev.filter(x => x !== index));
		}
	}

	async function regenerateAllCopies() {
		setError('');
		if (zones.length === 0) return;

		const confirmRegen = window.confirm('¿Seguro que querés volver a escribir todos los textos con IA? Se perderán las ediciones manuales actuales.');
		if (!confirmRegen) return;

		setPhase('planning');
		try {
			await requestPlan();
			if (onToast) onToast('Todos los textos fueron regenerados.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'No se pudieron regenerar los textos.');
		}
	}

	return (
		<div style={{ width: '100%' }}>
			<button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '16px' }}>← Volver a la biblioteca</button>
			<div className="creation-flow-layout">

				{/* Referencia fija a la izquierda */}
				<aside className="creation-flow-aside">
					<img src={referenceUrl} alt={ad.name} style={{ width: '100%', borderRadius: '14px', boxShadow: '0 14px 40px rgba(25,23,29,0.16)' }} />
					<p style={{ margin: '12px 0 0', fontSize: '14px', color: '#716d79' }}>Anuncio ganador: <b style={{ color: '#19171d' }}>{ad.name}</b></p>
				</aside>

				<section>
					<h1 style={{ margin: '0 0 5px', fontSize: '23px', color: '#19171d', letterSpacing: '-.02em' }}>Crear con este diseño</h1>
					<p style={{ margin: '0 0 18px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>Se replica el diseño y el mensaje del ganador con tu producto. Antes de generar revisás y aprobás cada texto.</p>

					{/* Misma barra de progreso que el generador por lote. */}
					<ol className="wiz-progress" aria-label="Progreso">
						{[
							{ n: 1, label: 'Tu producto', active: phase === 'setup' && formStep === 1, done: phase !== 'setup' || formStep > 1 },
							{ n: 2, label: 'Formato', active: phase === 'setup' && formStep === 2, done: phase !== 'setup' || formStep > 2 },
							{ n: 3, label: 'Estilo', active: phase === 'setup' && formStep === 3, done: phase !== 'setup' },
							{ n: 4, label: 'Revisar textos', active: phase === 'planning' || phase === 'review' || phase === 'starting', done: false },
						].map((item) => (
							<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
								<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
								<span className="wiz-progress-label">{item.label}</span>
							</li>
						))}
					</ol>

					{(phase === 'setup' || phase === 'planning') && <>
						{/* 1 · Tu producto / Servicio */}
						<div className="wiz-step" hidden={formStep !== 1}>
							<div className="wiz-body">
								<label className="picker-label">¿Qué vas a promocionar?</label>
								<div className="wiz-tabs">
									{([
										['url', '🔗', 'Con URL', 'Analizamos tu página'],
										['manual', '✍️', 'Cargar a mano', 'Cargás los datos'],
										['none', '🚫', 'Sin producto', 'Solo el diseño'],
									] as const).map(([value, icon, text, hint]) => (
										<button key={value} type="button" className={`wiz-tab ${productMode === value ? 'active' : ''}`} onClick={() => setProductMode(value)}>
											<span className="wiz-tab-icon">{icon}</span>
											<span className="wiz-tab-label">{text}</span>
											<small>{hint}</small>
										</button>
									))}
								</div>

								{productMode === 'url' && (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										{urls.map((u, i) => (
											<div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
												<input value={u}
													onChange={(e) => setUrls((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
													placeholder="Pegá la URL de tu producto o servicio a analizar"
													className="wiz-input"
													style={{ flex: 1 }} />
												{urls.length > 1 && (
													<button type="button" aria-label="Quitar URL" onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
														style={{ width: '38px', height: '38px', borderRadius: '9px', border: '1px solid #e2dde9', background: '#fff', color: '#b0a8b8', cursor: 'pointer', fontSize: '17px', flexShrink: 0 }}>×</button>
												)}
											</div>
										))}
										<button type="button" onClick={() => setUrls((prev) => [...prev, ''])}
											style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: '9px', border: '1px dashed #cbb8f0', background: '#faf8ff', color: '#5b3fc4', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
											+ Agregar otra URL (otro producto)
										</button>
									</div>
								)}

								{productMode === 'manual' && (
									<div className="wiz-fields">
										<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
											<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#716d79' }}>Fotos del producto:</span>
											<div className="image-uploader-box">
												<input type="file" accept="image/png,image/jpeg,image/webp" multiple id="creation-manual-imgs" className="hidden-file-input"
													onChange={(event) => {
														const files = event.target.files ? Array.from(event.target.files) : [];
														setUploadFiles((prev) => [...prev, ...files]);
														setUploadPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
														event.target.value = '';
													}} />
												<label htmlFor="creation-manual-imgs" className="uploader-label">
													<span>📸 Cargar fotos del producto (opcional · podés subir varias)</span>
												</label>
											</div>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', border: '1px dashed #cbb8f0', background: '#faf8ff', fontSize: '12.5px', fontWeight: 700, cursor: parsingDoc ? 'wait' : 'pointer', color: '#5b3fc4', width: 'fit-content', marginTop: '2px', opacity: parsingDoc ? 0.6 : 1 }}>
												{parsingDoc ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando archivo…</> : '📄 Subir PDF / Word / Excel'}
												<input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,application/pdf" style={{ display: 'none' }} disabled={parsingDoc}
													onChange={(event) => { void parseDoc(event.target.files?.[0] || null); event.target.value = ''; }} />
											</label>
											{uploadPreviews.length > 0 && (
												<div className="extra-previews-grid">
													{uploadPreviews.map((preview, idx) => (
														<div key={idx} className="preview-thumb">
															<img src={preview} alt="" />
															<button type="button" className="remove-img-btn" onClick={() => { setUploadFiles((prev) => prev.filter((_, j) => j !== idx)); setUploadPreviews((prev) => prev.filter((_, j) => j !== idx)); }}>✕</button>
														</div>
													))}
												</div>
											)}
										</div>
										<input className="wiz-input" value={manualProductName} onChange={(e) => setManualProductName(e.target.value)} placeholder="Nombre del servicio o producto..." />
										<textarea className="wiz-input" value={manualProductFacts} onChange={(e) => setManualProductFacts(e.target.value)} rows={3}
											placeholder="Descripción de tu producto, servicio, beneficios o características especiales..." />
									</div>
								)}

								{productMode === 'none' && (
									<p className="wiz-hint">
										Se recrea el diseño del ganador sin reemplazar ningún producto (ideal para anuncios de texto, servicios o lifestyle).
									</p>
								)}
							</div>
						</div>

						{/* 2 · Formato */}
						<div className="wiz-step" hidden={formStep !== 2}>
							<div className="wiz-body">
								<label className="picker-label">Formato</label>
								<p className="batch-detail-help">Elegí dónde se va a publicar el anuncio.</p>
								<div className="batch-format-grid">
									{FORMAT_ITEMS.map((item) => (
										<button key={item.id} type="button" className={`batch-format-card ${format === item.id ? 'active' : ''}`} onClick={() => setFormat(item.id)} aria-pressed={format === item.id}>
											<span className={`batch-format-shape shape-${item.shape}`} aria-hidden="true"><i /></span>
											<span className="batch-format-copy"><strong>{item.text}</strong><small>{item.desc}</small></span>
											{format === item.id && <b aria-hidden="true">✓</b>}
										</button>
									))}
								</div>
							</div>
						</div>

						{/* 3 · Estilo (idioma, de quién es el anuncio, colores, tipografía, cantidad) */}
						<div className="wiz-step" hidden={formStep !== 3}>
							<div className="wiz-body">
								<BatchSelect label="Idioma del anuncio" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />

								<div className="batch-brand-block">
									<span className="picker-label">¿De quién es el anuncio?</span>
									<div className="batch-brand-options">
										{BRAND_OPTIONS.map((option) => (
											<button key={option.value} type="button" className={`batch-brand-option ${brandSource === option.value ? 'active' : ''}`} onClick={() => setBrandSource(option.value)} aria-pressed={brandSource === option.value}>
												<span className="batch-brand-icon" aria-hidden="true">{option.emoji}</span>
												<span><strong>{option.label}</strong></span>
												{brandSource === option.value && <b aria-hidden="true">✓</b>}
											</button>
										))}
									</div>
									<small className="batch-brand-note">{brandSourceDescription(brandSource)}</small>
								</div>

								<div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
									<div className="batch-style-group" style={{ flex: '0 1 220px', maxWidth: '260px' }}>
										<span className="picker-label">Colores</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={colorMode === option.value ? 'active' : ''} onClick={() => setColorMode(option.value as 'winner' | 'brand')} aria-pressed={colorMode === option.value}>{option.label}</button>
											))}
										</div>
									</div>
									<div className="batch-style-group" style={{ flex: '0 1 220px', maxWidth: '260px' }}>
										<span className="picker-label">Tipografía</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={typoMode === option.value ? 'active' : ''} onClick={() => setTypoMode(option.value as 'winner' | 'brand')} aria-pressed={typoMode === option.value}>{option.label}</button>
											))}
										</div>
									</div>
								</div>

								<label className="picker-label" style={{ marginTop: '4px' }}>Cantidad de variantes</label>
								<div className="picker-options" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
									{[1, 2, 3, 4].map((val) => (
										<button key={val} type="button" className={`picker-pill ${count === val ? 'active' : ''}`} onClick={() => setCount(val)}>
											<span className="pill-count">{val} {val === 1 ? 'variante' : 'variantes'}</span>
											<span className="pill-sub">{val === 1 ? 'Usa 1 crédito' : `Usa ${val} créditos`}</span>
										</button>
									))}
								</div>
							</div>
						</div>

						{error && <p style={{ margin: '14px 0 0', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						{formStep === 1 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="url-batch-submit-btn wiz-continue-btn" onClick={() => { if (!step1Ready) { setError('Contanos qué vas a promocionar antes de continuar.'); return; } setError(''); setFormStep(2); }}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{formStep === 2 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(1)}>← Atrás</button>
								<button type="button" className="url-batch-submit-btn" onClick={() => setFormStep(3)}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{formStep === 3 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(2)} disabled={phase === 'planning'}>← Atrás</button>
								<div className="batch-continue-wrap">
									<button
										type="button"
										onClick={() => void requestPlan()}
										disabled={phase === 'planning'}
										className="url-batch-submit-btn"
									>
										{phase === 'planning' ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando el ganador y escribiendo los textos…</> : 'Generar textos del anuncio'}
									</button>
									{phase !== 'planning' && <span className="batch-credit-note">Todavía no gastás créditos</span>}
								</div>
							</div>
						)}
					</>}

					{(phase === 'review' || phase === 'starting') && plan && <>
						{plan.templateHasLogoSlot && !includeLogo && (
							<div style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								gap: '12px',
								flexWrap: 'wrap',
								padding: '12px 16px',
								background: '#f4f0ff',
								border: '1px solid #dcd2ff',
								borderRadius: '11px',
								marginBottom: '16px'
							}}>
								<span style={{ fontSize: '13.5px', color: '#522cbd', fontWeight: 600 }}>
									💡 Este diseño tiene un espacio ideal para colocar tu logo o nombre de marca.
								</span>
								<button
									type="button"
									onClick={() => setIncludeLogo(true)}
									style={{
										padding: '6px 12px',
										borderRadius: '8px',
										border: 0,
										background: '#744bde',
										color: '#fff',
										fontSize: '13px',
										fontWeight: 700,
										cursor: 'pointer'
									}}
								>
									Incluir mi logo
								</button>
							</div>
						)}
						{plan.templateHasLogoSlot && includeLogo && (
							<div style={{
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								padding: '12px 16px',
								background: '#e8f9f0',
								border: '1px solid #c1eed6',
								borderRadius: '11px',
								marginBottom: '16px',
								fontSize: '13.5px',
								color: '#1e7e4a',
								fontWeight: 600
							}}>
								<span>✓ Incluiremos el logo de tu marca en el espacio del diseño.</span>
							</div>
						)}

						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
							<strong style={{ ...label, marginBottom: 0 }}>Textos del anuncio</strong>
							<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
								<button type="button" onClick={() => void regenerateAllCopies()} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
									✨ Rehacer todos
								</button>
								<button type="button" onClick={() => setCopyMode('auto')} style={chip(copyMode === 'auto')}>✨ Automáticos</button>
								<button type="button" onClick={() => setCopyMode('edit')} style={chip(copyMode === 'edit')}>✏️ Editarlos yo</button>
							</div>
						</div>

						<div style={{ background: '#fff', border: '1px solid #eee9f2', borderRadius: '12px', marginBottom: '22px', overflow: 'hidden' }}>
							{zones.map((zone, index) => {
								const isRegen = regeneratingIndexes.includes(index);
								return (
									<div key={index} title={`${zone.where || ''}${zone.messageRole ? ` · ${zone.messageRole}` : ''}`} className="copy-zone-row" style={{ gap: '12px', padding: '12px 14px', borderBottom: index < zones.length - 1 ? '1px solid #f4f0f8' : 'none' }}>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
											<span style={{ fontSize: '12px', fontWeight: 600, color: '#8b8490', lineHeight: 1.35, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>“{zone.original}”</span>
											{zone.messageRole && <span style={{ fontSize: '9.5px', color: '#744bde', fontWeight: 700 }}>{zone.messageRole}</span>}
										</div>
										<div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
											{copyMode === 'edit' ? (
												<textarea
													value={zone.replacement || ''}
													rows={1}
													onChange={(event) => {
														setZones(zones.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item));
														event.target.style.height = 'auto';
														event.target.style.height = `${event.target.scrollHeight}px`;
													}}
													style={{ flex: 1, minHeight: '38px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e6e0ee', background: '#faf8fc', fontSize: '13.5px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
												/>
											) : (
												<span style={{ flex: 1, fontSize: '13.5px', color: '#19171d', lineHeight: 1.4 }}>{zone.replacement}</span>
											)}
											<button
												type="button"
												disabled={isRegen}
												onClick={() => void regenerateCopy(index)}
												style={{
													border: '1px solid #dcd5e4',
													background: '#fff',
													color: '#744bde',
													padding: '6px 10px',
													borderRadius: '8px',
													fontSize: '11px',
													fontWeight: 700,
													cursor: 'pointer',
													display: 'flex',
													alignItems: 'center',
													gap: '4px',
													whiteSpace: 'nowrap',
													opacity: isRegen ? 0.6 : 1,
													transition: 'all 0.15s'
												}}
												title="Rehacer este texto con IA"
											>
												{isRegen ? <><span className="studio-spinner small" aria-hidden="true" /> Rehaciendo</> : '✨ Rehacer'}
											</button>
										</div>
									</div>
								);
							})}
						</div>

						{/* Personas detectadas en el anuncio */}
						{people.length > 0 && (
							<div style={{ marginBottom: '18px' }}>
								<strong style={label}>👤 {people.length === 1 ? 'Persona en el anuncio' : 'Personas en el anuncio'}</strong>
								<p style={{ margin: '-4px 0 10px', fontSize: '12px', color: '#8b8490' }}>Detectamos {people.length === 1 ? 'una persona' : `${people.length} personas`}. Decinos cómo querés que se vea (o dejalo vacío para mantenerla parecida).</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{people.map((person, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fcfbfe' }}>
											<p style={{ margin: '0 0 7px', fontSize: '12.5px', color: '#5f5a67' }}>{person.description || person.where || 'Persona'}{person.role ? ` · ${person.role}` : ''}</p>
											<input value={person.directive || ''} onChange={(e) => setPeople(people.map((pp, i) => i === index ? { ...pp, directive: e.target.value } : pp))} placeholder="Ej: mujer 30 años, pelo castaño, sonriendo en cocina luminosa…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }} />
										</div>
									))}
								</div>
							</div>
						)}

						{/* Comparación: qué poner en los ítems que no son tu producto */}
						{comparisons.length > 0 && (
							<div style={{ marginBottom: '18px' }}>
								<strong style={label}>⚖️ Comparación detectada</strong>
								<p style={{ margin: '-4px 0 10px', fontSize: '12px', color: '#8b8490' }}>Tu producto es el destacado. En los otros ítems comparados podés decir qué poner (por defecto: alternativas neutras sin marca).</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{comparisons.map((item, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fcfbfe' }}>
											<p style={{ margin: '0 0 7px', fontSize: '12.5px', color: '#5f5a67' }}>{item.description || item.where || 'Ítem comparado'}{item.role ? ` · ${item.role}` : ''}</p>
											<input value={item.directive || ''} onChange={(e) => setComparisons(comparisons.map((c, i) => i === index ? { ...c, directive: e.target.value } : c))} placeholder="Ej: otras barritas genéricas, sin marca ni logo…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }} />
										</div>
									))}
								</div>
							</div>
						)}

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<div className="wiz-actions">
							<button type="button" className="wiz-back" onClick={() => { setPhase('setup'); setFormStep(3); }} disabled={phase === 'starting'}>← Ajustes</button>
							<button
								type="button"
								onClick={() => void approveAndGenerate()}
								disabled={phase === 'starting'}
								className="url-batch-submit-btn"
							>
								{phase === 'starting' ? <><span className="studio-spinner small" aria-hidden="true" /> Iniciando generación…</> : <span>Aprobar y generar ✓ · {count} {count === 1 ? 'crédito' : 'créditos'}</span>}
							</button>
						</div>
					</>}
				</section>
			</div>
		</div>
	);
}
