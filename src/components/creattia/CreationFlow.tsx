import React, { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Página completa de creación fiel al ganador (reemplaza el modal):
// 1) producto  2) formato  3) idioma  4) estilo (colores/tipografía/logo)
// 5) indicación extra → "Generar textos" → editor de copy por zona → generar.
// ─────────────────────────────────────────────────────────────────────────────
export default function CreationFlow({ ad, session, savedProducts, onToast, onGenerationStarted, onBack }: {
	ad: any;
	session: any;
	savedProducts: any[];
	onToast?: (message: string) => void;
	onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onBack: () => void;
}) {
	const token = session?.access_token || '';
	const referenceUrl = `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${ad.imagePath}`;

	const [products, setProducts] = useState<any[]>(savedProducts);
	// Sin auto-selección: el usuario elige su producto explícitamente.
	const [selectedProductId, setSelectedProductId] = useState<string>('');
	const [urlValue, setUrlValue] = useState('');
	const [scanning, setScanning] = useState(false);
	const [uploadFiles, setUploadFiles] = useState<File[]>([]);
	const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);

	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [languageOpen, setLanguageOpen] = useState(false);
	const [colorMode, setColorMode] = useState<'winner' | 'brand'>('winner');
	const [typoMode, setTypoMode] = useState<'winner' | 'brand'>('winner');
	const [includeLogo, setIncludeLogo] = useState(false);
	const [extra, setExtra] = useState('');
	const [count, setCount] = useState(1);
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');
	const [showManualDesc, setShowManualDesc] = useState(false);

	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting'>('setup');
	const [copyMode, setCopyMode] = useState<'auto' | 'edit'>('auto');
	const [plan, setPlan] = useState<any>(null);
	const [zones, setZones] = useState<Array<{ where?: string; messageRole?: string; original?: string; replacement?: string; onProduct?: boolean }>>([]);
	const [creativeOptions, setCreativeOptions] = useState<string[]>([]);
	const [pickedOptions, setPickedOptions] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [regeneratingIndexes, setRegeneratingIndexes] = useState<number[]>([]);

	const selectedProduct = products.find((item) => item.id === selectedProductId) || null;
	const hasProduct = Boolean(selectedProduct || uploadFiles.length > 0);

	const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '9px', letterSpacing: '.01em' } as const;
	const chip = (active: boolean) => ({
		padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
		border: active ? '2px solid #744bde' : '1px solid #e2dde9', background: active ? '#f4f2f6' : '#fff', color: active ? '#744bde' : '#3f3a48',
	} as const);

	async function scanUrl(): Promise<any | null> {
		const raw = urlValue.trim();
		if (!raw) return null;
		setScanning(true); setError('');
		try {
			const response = await fetch('/api/creativos/products', {
				method: 'POST',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ url: raw }),
			});
			const payload = await response.json();
			if (!response.ok || !payload.importedIds?.length) throw new Error(payload.errors?.[0]?.error || payload.error || 'No pudimos analizar esa URL.');
			const imported = (payload.products || []).filter((item: any) => payload.importedIds.includes(item.id));
			setProducts(payload.products || products);
			if (imported[0]) setSelectedProductId(imported[0].id);
			if (onToast) onToast(`Producto "${imported[0]?.name || 'importado'}" listo para usar.`);
			return imported[0] || null;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo escanear la URL.');
			return null;
		} finally { setScanning(false); }
	}

	async function requestPlan() {
		setPhase('planning'); setError('');
		try {
			// Si pegó una URL pero no la escaneó, se escanea acá mismo.
			let productForPlan = selectedProduct;
			if (!productForPlan && uploadFiles.length === 0 && !manualProductName.trim() && urlValue.trim()) {
				productForPlan = await scanUrl();
				if (!productForPlan) { setPhase('setup'); return; }
			}
			const form = new FormData();
			form.set('referencePath', ad.imagePath);
			if (language !== 'auto') form.set('language', language);
			if (productForPlan) form.set('productId', productForPlan.id);
			else if (uploadFiles.length > 0) {
				uploadFiles.forEach(file => form.append('product', file));
				form.set('productFacts', extra);
			} else {
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			const response = await fetch('/api/creativos/plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudieron generar los textos.');
			const analysis = payload.analysis || {};
			if (analysis.referenceHasProduct !== false && !productForPlan && uploadFiles.length === 0 && !manualProductName.trim()) {
				throw new Error('Este anuncio ganador muestra un producto: elegí, subí o describí el tuyo para reemplazarlo.');
			}
			setPlan(analysis);
			setZones((analysis.textZones || []).filter((zone: any) => analysis.productHasPackaging ? true : !zone.onProduct));
			setCreativeOptions(Array.isArray(analysis.creativeOptions) ? analysis.creativeOptions.slice(0, 5) : []);
			setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudieron generar los textos.');
			setPhase('setup');
		}
	}

	async function approveAndGenerate() {
		setPhase('starting'); setError('');
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
			if (language !== 'auto') form.set('language', language);
			form.set('colorMode', colorMode);
			form.set('typoMode', typoMode);
			form.set('includeLogo', includeLogo ? '1' : '0');
			if (selectedProduct) form.set('productIds', selectedProduct.id);
			else if (uploadFiles.length > 0) {
				uploadFiles.forEach(file => form.append('product', file));
			} else {
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			const brief = extra.trim();
			form.set('brief', brief);
			form.set('plan', JSON.stringify({ ...plan, textZones: zones }));

			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación.');
			if (payload.async && payload.batchId && onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					title: selectedProduct?.name ? `${selectedProduct.name} · ${ad.name}` : ad.name,
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
					productName: selectedProduct?.name || manualProductName || 'producto',
					productFacts: selectedProduct ? `${selectedProduct.description} ${selectedProduct.price_text || ''}` : manualProductFacts,
					extra: extra,
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
					<p style={{ margin: '0 0 22px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>Se replica el diseño y el mensaje del ganador con tu producto. Antes de generar revisás y aprobás cada texto.</p>

					{phase !== 'review' && phase !== 'starting' && <>
						{/* 1. Producto / Servicio */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>1 · Tu producto / Servicio</strong>
							{products.length > 0 && (
								<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
									{products.slice(0, 12).map((item) => (
										<span key={item.id} style={{ position: 'relative', display: 'inline-flex' }}>
											<button type="button" onClick={() => { setSelectedProductId(item.id === selectedProductId ? '' : item.id); setUploadFiles([]); setUploadPreviews([]); }} style={{ ...chip(selectedProductId === item.id), display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 24px 5px 5px' }}>
												{(item.imageUrl || item.source_image_url) ? (
													<img src={item.imageUrl || item.source_image_url} alt="" style={{ width: '26px', height: '26px', objectFit: 'cover', borderRadius: '6px' }} />
												) : (
													<span style={{ width: '26px', height: '26px', display: 'grid', placeItems: 'center', borderRadius: '6px', background: '#f2eef6' }}>🛍️</span>
												)}
												{item.name}
											</button>
											<button
												type="button"
												aria-label={`Quitar ${item.name}`}
												onClick={async () => {
													setProducts(products.filter((product) => product.id !== item.id));
													if (selectedProductId === item.id) setSelectedProductId('');
													try {
														await fetch(`/api/creativos/products?id=${encodeURIComponent(item.id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
													} catch { /* si falla, reaparece al recargar */ }
												}}
												style={{ position: 'absolute', top: '4px', right: '6px', width: '18px', height: '18px', border: 0, borderRadius: '50%', background: 'transparent', color: '#b0a8b8', fontSize: '13px', lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
											>×</button>
										</span>
									))}
								</div>
							)}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
								<input
									value={urlValue}
									onChange={(event) => {
										setUrlValue(event.target.value);
										if (event.target.value.trim()) {
											setSelectedProductId('');
											setUploadFiles([]);
											setUploadPreviews([]);
										}
									}}
									placeholder="Pegá la URL de tu producto (Shopify, Tiendanube...)"
									style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '14.5px' }}
								/>
							</div>

							{selectedProduct && (selectedProduct.imageUrls || selectedProduct.imageUrl) && (
								<div style={{ marginTop: '12px' }}>
									<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#716d79', display: 'block', marginBottom: '8px' }}>
										Imágenes del producto detectadas:
									</span>
									<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
										{(selectedProduct.imageUrls || [selectedProduct.imageUrl || selectedProduct.source_image_url]).filter(Boolean).map((imgUrl: string, idx: number) => (
											<div key={idx} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #744bde', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
												<img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
											</div>
										))}
									</div>
								</div>
							)}

							<div style={{ marginTop: '12px' }}>
								<button
									type="button"
									onClick={() => setShowManualDesc(!showManualDesc)}
									style={{
										background: 'transparent',
										border: 0,
										color: '#744bde',
										fontSize: '13px',
										fontWeight: 700,
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: '4px',
										padding: '4px 0',
										textDecoration: 'underline'
									}}
								>
									{showManualDesc ? '✕ Ocultar carga manual' : '✍️ Cargar fotos y describir el producto o servicio manualmente'}
								</button>

								{showManualDesc && (
									<div style={{ 
										marginTop: '12px', 
										padding: '16px', 
										background: '#fcfbfe', 
										border: '1px dashed #dcd2ff', 
										borderRadius: '12px',
										display: 'flex',
										flexDirection: 'column',
										gap: '12px'
									}}>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
											<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#716d79' }}>Imágenes del producto:</span>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#744bde', width: 'fit-content' }}>
												📸 Cargar imágenes de producto...
												<input 
													type="file" 
													accept="image/png,image/jpeg,image/webp" 
													multiple 
													style={{ display: 'none' }} 
													onChange={(event) => {
														const files = event.target.files ? Array.from(event.target.files) : [];
														setUploadFiles(files);
														setSelectedProductId('');
														setUrlValue('');
														setUploadPreviews(files.map(f => URL.createObjectURL(f)));
													}} 
												/>
											</label>
											{uploadPreviews.length > 0 && (
												<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
													{uploadPreviews.map((preview, idx) => (
														<div key={idx} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2dde9' }}>
															<img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
														</div>
													))}
												</div>
											)}
										</div>
										
										<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
											<input
												value={manualProductName}
												onChange={(e) => {
													setManualProductName(e.target.value);
													if (e.target.value.trim()) {
														setSelectedProductId('');
														setUrlValue('');
													}
												}}
												placeholder="Nombre del servicio o producto..."
												style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '13px' }}
											/>
											<textarea
												value={manualProductFacts}
												onChange={(e) => setManualProductFacts(e.target.value)}
												placeholder="Descripción de tu producto, servicio, beneficios o características especiales..."
												rows={3}
												style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }}
											/>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* 2. Formato */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>2 · Formato</strong>
							<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
								{[
									{ id: 'original', text: 'Original', desc: 'Igual al ganador', w: 24, h: 24, dashed: true },
									{ id: '1:1', text: '1:1', desc: 'Feed', w: 26, h: 26 },
									{ id: '3:4', text: '3:4', desc: 'Vertical', w: 21, h: 28 },
									{ id: '9:16', text: '9:16', desc: 'Historia', w: 16, h: 28 },
									{ id: '4:3', text: '4:3', desc: 'Horizontal', w: 28, h: 21 },
									{ id: '16:9', text: '16:9', desc: 'Panorámico', w: 30, h: 17 },
								].map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setFormat(item.id)}
										style={{ ...chip(format === item.id), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: '76px', padding: '10px 9px 8px' }}
									>
										<span style={{
											display: 'block', width: `${item.w}px`, height: `${item.h}px`, borderRadius: '4px',
											border: `2px ${item.dashed ? 'dashed' : 'solid'} ${format === item.id ? '#19171d' : '#b9b3c2'}`,
											background: format === item.id ? 'rgba(25,23,29,0.12)' : '#f6f4f9',
										}} />
										<b style={{ fontSize: '12px', lineHeight: 1 }}>{item.text}</b>
										<small style={{ fontSize: '10px', color: '#8b8490', lineHeight: 1 }}>{item.desc}</small>
									</button>
								))}
							</div>
						</div>

						{/* 3. Idioma */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>3 · Idioma del anuncio</strong>
							{(() => {
								const LANGS = [
									{ id: 'auto', name: 'Automático (según el producto)', cc: '' },
									{ id: 'es', name: 'Español', cc: 'ar' },
									{ id: 'en', name: 'English', cc: 'us' },
									{ id: 'pt', name: 'Português', cc: 'br' },
									{ id: 'fr', name: 'Français', cc: 'fr' },
									{ id: 'it', name: 'Italiano', cc: 'it' },
									{ id: 'de', name: 'Deutsch', cc: 'de' },
								];
								const current = LANGS.find((item) => item.id === language) || LANGS[0];
								const flag = (cc: string) => cc
									? <img src={`https://flagcdn.com/w40/${cc}.png`} alt="" width={22} height={16} style={{ borderRadius: '3px', objectFit: 'cover' }} />
									: <span style={{ fontSize: '16px' }}>🌐</span>;
								return (
									<div style={{ position: 'relative', maxWidth: '290px' }}>
										<button type="button" onClick={() => setLanguageOpen(!languageOpen)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 13px', borderRadius: '10px', border: '1px solid #e2dde9', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#19171d' }}>
											<span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{flag(current.cc)}{current.name}</span>
											<span style={{ color: '#8b8490' }}>▾</span>
										</button>
										{languageOpen && (
											<div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2dde9', borderRadius: '12px', boxShadow: '0 16px 40px rgba(25,23,29,0.14)', zIndex: 30, overflow: 'hidden' }}>
												{LANGS.map((item) => (
													<button key={item.id} type="button" onClick={() => { setLanguage(item.id); setLanguageOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', border: 0, background: language === item.id ? '#f4f2f6' : '#fff', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', color: '#19171d', textAlign: 'left' }}>
														{flag(item.cc)}{item.name}
														{language === item.id && <span style={{ marginLeft: 'auto', color: '#19171d', fontWeight: 800 }}>✓</span>}
													</button>
												))}
											</div>
										)}
									</div>
								);
							})()}
						</div>

						{/* 4. Estilo */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>4 · Estilo</strong>
							<div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
								<div>
									<p style={{ margin: '0 0 4px', fontSize: '12px', color: '#716d79' }}>Colores</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setColorMode('winner')} style={chip(colorMode === 'winner')}>Del ganador</button>
										<button type="button" onClick={() => setColorMode('brand')} style={chip(colorMode === 'brand')}>De mi marca</button>
									</div>
								</div>
								<div>
									<p style={{ margin: '0 0 4px', fontSize: '12px', color: '#716d79' }}>Tipografía</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setTypoMode('winner')} style={chip(typoMode === 'winner')}>Del ganador</button>
										<button type="button" onClick={() => setTypoMode('brand')} style={chip(typoMode === 'brand')}>De mi marca</button>
									</div>
								</div>
								<div>
									<p style={{ margin: '0 0 4px', fontSize: '12px', color: '#716d79' }}>Logo de mi marca</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setIncludeLogo(false)} style={chip(!includeLogo)}>Sin logo</button>
										<button type="button" onClick={() => setIncludeLogo(true)} style={chip(includeLogo)}>Incluir logo</button>
									</div>
								</div>
							</div>
						</div>

						{/* 5. Cantidad de variantes */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>5 · Cantidad de variantes</strong>
							<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
								{[1, 2, 3, 4].map((val) => (
									<button
										key={val}
										type="button"
										onClick={() => setCount(val)}
										style={{
											...chip(count === val),
											padding: '10px 18px',
											fontSize: '14px',
											fontWeight: 700,
										}}
									>
										{val}
									</button>
								))}
								<span style={{ fontSize: '13px', color: '#716d79', marginLeft: '8px', fontWeight: 600 }}>
									{count === 1 ? 'Usa 1 crédito' : `Usa ${count} créditos`}
								</span>
							</div>
						</div>

						{/* 6. Indicación extra */}
						<div style={{ marginBottom: '20px' }}>
							<strong style={label}>6 · Indicación extra (opcional)</strong>
							<textarea
								value={extra}
								onChange={(event) => setExtra(event.target.value)}
								placeholder="Ej: resaltá el precio, tono más descontracturado…"
								style={{ width: '100%', minHeight: '52px', padding: '11px 13px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '13.5px', resize: 'vertical', fontFamily: 'inherit' }}
							/>
						</div>

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<button
							type="button"
							onClick={() => void requestPlan()}
							disabled={phase === 'planning'}
							className="studio-primary-button"
							style={{ width: '100%', height: '50px', background: '#744bde', color: '#fff', border: 0, fontSize: '15px', fontWeight: 800, borderRadius: '11px', cursor: 'pointer', opacity: phase === 'planning' ? 0.6 : 1 }}
						>
							{phase === 'planning' ? 'Analizando el ganador y escribiendo los textos…' : 'Generar textos del anuncio →'}
						</button>
						<p style={{ margin: '7px 0 0', fontSize: '12px', color: '#8b8490', textAlign: 'center' }}>Todavía no se genera la imagen: primero revisás y aprobás los textos.</p>
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
								<button type="button" onClick={() => void regenerateAllCopies()} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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
									<div key={index} title={`${zone.where || ''}${zone.messageRole ? ` · ${zone.messageRole}` : ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr', gap: '12px', alignItems: 'center', padding: '12px 14px', borderBottom: index < zones.length - 1 ? '1px solid #f4f0f8' : 'none' }}>
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
												{isRegen ? '...' : '✨ Rehacer'}
											</button>
										</div>
									</div>
								);
							})}
						</div>

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<div style={{ display: 'flex', gap: '10px' }}>
							<button type="button" onClick={() => setPhase('setup')} style={{ flex: '0 0 auto', padding: '0 22px', height: '52px', borderRadius: '12px', border: '1px solid #744bde', background: '#fff', color: '#744bde', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>← Ajustes</button>
							<button
								type="button"
								onClick={() => void approveAndGenerate()}
								disabled={phase === 'starting'}
								className="studio-primary-button"
								style={{ flex: 1, height: '52px', background: '#744bde', color: '#fff', border: 0, fontSize: '16px', fontWeight: 800, borderRadius: '12px', cursor: 'pointer', opacity: phase === 'starting' ? 0.6 : 1 }}
							>
								{phase === 'starting' ? 'Iniciando generación…' : 'Aprobar textos y generar imagen ✓'}
							</button>
						</div>
					</>}
				</section>
			</div>
		</div>
	);
}
