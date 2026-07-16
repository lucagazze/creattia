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
	const [selectedProductId, setSelectedProductId] = useState<string>(savedProducts[0]?.id || '');
	const [urlValue, setUrlValue] = useState('');
	const [scanning, setScanning] = useState(false);
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadPreview, setUploadPreview] = useState('');

	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('auto');
	const [languageOpen, setLanguageOpen] = useState(false);
	const [colorMode, setColorMode] = useState<'winner' | 'brand'>('winner');
	const [typoMode, setTypoMode] = useState<'winner' | 'brand'>('winner');
	const [includeLogo, setIncludeLogo] = useState(false);
	const [extra, setExtra] = useState('');

	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting'>('setup');
	const [copyMode, setCopyMode] = useState<'auto' | 'edit'>('auto');
	const [plan, setPlan] = useState<any>(null);
	const [zones, setZones] = useState<Array<{ where?: string; messageRole?: string; original?: string; replacement?: string; onProduct?: boolean }>>([]);
	const [creativeOptions, setCreativeOptions] = useState<string[]>([]);
	const [pickedOptions, setPickedOptions] = useState<string[]>([]);
	const [error, setError] = useState('');

	const selectedProduct = products.find((item) => item.id === selectedProductId) || null;
	const hasProduct = Boolean(selectedProduct || uploadFile);

	const label = { display: 'block', fontSize: '14px', fontWeight: 800, color: '#19171d', marginBottom: '10px' } as const;
	const chip = (active: boolean) => ({
		padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
		border: active ? '2px solid #ec4492' : '1px solid #e2dde9', background: active ? '#fdf0f6' : '#fff', color: active ? '#d63274' : '#3f3a48',
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
			if (!productForPlan && !uploadFile && urlValue.trim()) {
				productForPlan = await scanUrl();
				if (!productForPlan) { setPhase('setup'); return; }
			}
			const form = new FormData();
			form.set('referencePath', ad.imagePath);
			if (language !== 'auto') form.set('language', language);
			if (productForPlan) form.set('productId', productForPlan.id);
			else if (uploadFile) {
				form.set('product', uploadFile);
				form.set('productFacts', extra);
			}
			const response = await fetch('/api/creativos/plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudieron generar los textos.');
			const analysis = payload.analysis || {};
			if (analysis.referenceHasProduct !== false && !productForPlan && !uploadFile) {
				throw new Error('Este anuncio ganador muestra un producto: elegí o subí el tuyo para reemplazarlo.');
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
			form.set('count', '1');
			form.set('format', format);
			if (language !== 'auto') form.set('language', language);
			form.set('colorMode', colorMode);
			form.set('typoMode', typoMode);
			form.set('includeLogo', includeLogo ? '1' : '0');
			if (selectedProduct) form.set('productIds', selectedProduct.id);
			else if (uploadFile) form.set('product', uploadFile);
			const brief = [extra.trim(), pickedOptions.length ? `Enfoques elegidos: ${pickedOptions.join(' · ')}` : ''].filter(Boolean).join('\n');
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
					count: 1,
				});
				onBack();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación.');
			setPhase('review');
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
					<h1 style={{ margin: '0 0 4px', fontSize: '26px', color: '#19171d' }}>Crear con este diseño</h1>
					<p style={{ margin: '0 0 26px', fontSize: '15px', color: '#716d79' }}>Se replica el diseño y el mensaje del ganador con tu producto. Antes de generar vas a poder revisar y editar cada texto.</p>

					{phase !== 'review' && phase !== 'starting' && <>
						{/* 1. Producto */}
						<div style={{ marginBottom: '26px' }}>
							<strong style={label}>1 · Tu producto</strong>
							{products.length > 0 && (
								<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
									{products.slice(0, 12).map((item) => (
										<button key={item.id} type="button" onClick={() => { setSelectedProductId(item.id === selectedProductId ? '' : item.id); setUploadFile(null); setUploadPreview(''); }} style={{ ...chip(selectedProductId === item.id), display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 14px 7px 7px' }}>
											{(item.imageUrl || item.source_image_url) ? (
												<img src={item.imageUrl || item.source_image_url} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '7px' }} />
											) : (
												<span style={{ width: '32px', height: '32px', display: 'grid', placeItems: 'center', borderRadius: '7px', background: '#f2eef6' }}>🛍️</span>
											)}
											{item.name}
										</button>
									))}
								</div>
							)}
							<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
								<input
									value={urlValue}
									onChange={(event) => setUrlValue(event.target.value)}
									placeholder="Pegá la URL de tu producto (Shopify, Tiendanube...)"
									style={{ flex: '1 1 280px', padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '14px' }}
								/>
								<button type="button" onClick={() => void scanUrl()} disabled={scanning || !urlValue.trim()} style={{ ...chip(false), opacity: scanning ? 0.6 : 1 }}>
									{scanning ? 'Analizando…' : 'Escanear URL'}
								</button>
								<label style={{ ...chip(Boolean(uploadFile)), display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
									{uploadFile ? `Foto: ${uploadFile.name.slice(0, 16)}` : 'Subir foto'}
									<input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(event) => {
										const file = event.target.files?.[0] || null;
										setUploadFile(file); setSelectedProductId('');
										if (file) setUploadPreview(URL.createObjectURL(file));
									}} />
								</label>
							</div>
							{uploadPreview && <img src={uploadPreview} alt="" style={{ marginTop: '10px', width: '84px', height: '84px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e2dde9' }} />}
						</div>

						{/* 2. Formato */}
						<div style={{ marginBottom: '26px' }}>
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
										style={{ ...chip(format === item.id), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '7px', minWidth: '86px', padding: '12px 10px 10px' }}
									>
										<span style={{
											display: 'block', width: `${item.w}px`, height: `${item.h}px`, borderRadius: '4px',
											border: `2px ${item.dashed ? 'dashed' : 'solid'} ${format === item.id ? '#ec4492' : '#b9b3c2'}`,
											background: format === item.id ? 'rgba(236,68,146,0.12)' : '#f6f4f9',
										}} />
										<b style={{ fontSize: '13px', lineHeight: 1 }}>{item.text}</b>
										<small style={{ fontSize: '11px', color: '#8b8490', lineHeight: 1 }}>{item.desc}</small>
									</button>
								))}
							</div>
						</div>

						{/* 3. Idioma */}
						<div style={{ marginBottom: '26px' }}>
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
									<div style={{ position: 'relative', maxWidth: '330px' }}>
										<button type="button" onClick={() => setLanguageOpen(!languageOpen)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2dde9', background: '#fff', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit', color: '#19171d' }}>
											<span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{flag(current.cc)}{current.name}</span>
											<span style={{ color: '#8b8490' }}>▾</span>
										</button>
										{languageOpen && (
											<div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2dde9', borderRadius: '12px', boxShadow: '0 16px 40px rgba(25,23,29,0.14)', zIndex: 30, overflow: 'hidden' }}>
												{LANGS.map((item) => (
													<button key={item.id} type="button" onClick={() => { setLanguage(item.id); setLanguageOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', border: 0, background: language === item.id ? '#fdf0f6' : '#fff', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', color: '#19171d', textAlign: 'left' }}>
														{flag(item.cc)}{item.name}
														{language === item.id && <span style={{ marginLeft: 'auto', color: '#d63274', fontWeight: 800 }}>✓</span>}
													</button>
												))}
											</div>
										)}
									</div>
								);
							})()}
						</div>

						{/* 4. Estilo */}
						<div style={{ marginBottom: '26px' }}>
							<strong style={label}>4 · Estilo</strong>
							<div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
								<div>
									<p style={{ margin: '0 0 6px', fontSize: '13px', color: '#716d79' }}>Colores</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setColorMode('winner')} style={chip(colorMode === 'winner')}>Del ganador</button>
										<button type="button" onClick={() => setColorMode('brand')} style={chip(colorMode === 'brand')}>De mi marca</button>
									</div>
								</div>
								<div>
									<p style={{ margin: '0 0 6px', fontSize: '13px', color: '#716d79' }}>Tipografía</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setTypoMode('winner')} style={chip(typoMode === 'winner')}>Del ganador</button>
										<button type="button" onClick={() => setTypoMode('brand')} style={chip(typoMode === 'brand')}>De mi marca</button>
									</div>
								</div>
								<div>
									<p style={{ margin: '0 0 6px', fontSize: '13px', color: '#716d79' }}>Logo de mi marca</p>
									<div style={{ display: 'flex', gap: '8px' }}>
										<button type="button" onClick={() => setIncludeLogo(false)} style={chip(!includeLogo)}>Sin logo</button>
										<button type="button" onClick={() => setIncludeLogo(true)} style={chip(includeLogo)}>Incluir logo</button>
									</div>
								</div>
							</div>
						</div>

						{/* 5. Indicación extra */}
						<div style={{ marginBottom: '26px' }}>
							<strong style={label}>5 · Indicación extra (opcional)</strong>
							<textarea
								value={extra}
								onChange={(event) => setExtra(event.target.value)}
								placeholder="Ej: resaltá el precio, tono más descontracturado…"
								style={{ width: '100%', minHeight: '72px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }}
							/>
						</div>

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<button
							type="button"
							onClick={() => void requestPlan()}
							disabled={phase === 'planning'}
							className="studio-primary-button"
							style={{ width: '100%', height: '52px', background: 'var(--holo-gradient)', color: '#fff', border: 0, fontSize: '16px', fontWeight: 800, borderRadius: '12px', cursor: 'pointer', opacity: phase === 'planning' ? 0.6 : 1 }}
						>
							{phase === 'planning' ? 'Analizando el ganador y escribiendo los textos…' : 'Generar textos del anuncio →'}
						</button>
						<p style={{ margin: '10px 0 0', fontSize: '13px', color: '#8b8490', textAlign: 'center' }}>Todavía no se genera la imagen: primero revisás y aprobás los textos.</p>
					</>}

					{(phase === 'review' || phase === 'starting') && plan && <>
						<div style={{ background: '#fdf0f6', border: '1px solid #f8d7e7', borderRadius: '12px', padding: '16px 18px', marginBottom: '22px' }}>
							<strong style={{ display: 'block', fontSize: '13px', color: '#d63274', marginBottom: '6px' }}>ESTRATEGIA DEL GANADOR</strong>
							<p style={{ margin: 0, fontSize: '14px', color: '#3f3a48', lineHeight: 1.55 }}>{plan.messageStrategy}</p>
						</div>

						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
							<strong style={{ ...label, marginBottom: 0 }}>Textos del anuncio</strong>
							<div style={{ display: 'flex', gap: '8px' }}>
								<button type="button" onClick={() => setCopyMode('auto')} style={chip(copyMode === 'auto')}>✨ Automáticos</button>
								<button type="button" onClick={() => setCopyMode('edit')} style={chip(copyMode === 'edit')}>✏️ Editarlos yo</button>
							</div>
						</div>

						<div style={{ background: '#fff', border: '1px solid #eee9f2', borderRadius: '12px', marginBottom: '22px', overflow: 'hidden' }}>
							{zones.map((zone, index) => (
								<div key={index} title={`Original: “${zone.original}”${zone.messageRole ? ` · ${zone.messageRole}` : ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 170px) 1fr', gap: '12px', alignItems: 'center', padding: '9px 14px', borderBottom: index < zones.length - 1 ? '1px solid #f4f0f8' : 'none' }}>
									<span style={{ fontSize: '12px', fontWeight: 700, color: '#8b8490', lineHeight: 1.3 }}>{zone.where}</span>
									{copyMode === 'edit' ? (
										<textarea
											value={zone.replacement || ''}
											rows={1}
											onChange={(event) => {
												setZones(zones.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item));
												event.target.style.height = 'auto';
												event.target.style.height = `${event.target.scrollHeight}px`;
											}}
											style={{ width: '100%', minHeight: '34px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e6e0ee', background: '#faf8fc', fontSize: '13.5px', resize: 'none', overflow: 'hidden', fontFamily: 'inherit', lineHeight: 1.4 }}
										/>
									) : (
										<span style={{ fontSize: '13.5px', color: '#19171d', lineHeight: 1.4 }}>{zone.replacement}</span>
									)}
								</div>
							))}
						</div>

						{creativeOptions.length > 0 && (
							<div style={{ marginBottom: '22px' }}>
								<strong style={label}>Enfoques sugeridos para este anuncio (opcional)</strong>
								<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
									{creativeOptions.map((option) => (
										<button key={option} type="button" onClick={() => setPickedOptions(pickedOptions.includes(option) ? pickedOptions.filter((item) => item !== option) : [...pickedOptions, option])} style={{ ...chip(pickedOptions.includes(option)), fontSize: '12.5px', lineHeight: 1.35, textAlign: 'left', padding: '8px 12px' }}>
											{pickedOptions.includes(option) ? '✓ ' : ''}{option}
										</button>
									))}
								</div>
							</div>
						)}

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<div style={{ display: 'flex', gap: '10px' }}>
							<button type="button" onClick={() => setPhase('setup')} style={{ flex: '0 0 auto', padding: '0 22px', height: '52px', borderRadius: '12px', border: '1px solid #dcd5e4', background: '#fff', color: '#19171d', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>← Ajustes</button>
							<button
								type="button"
								onClick={() => void approveAndGenerate()}
								disabled={phase === 'starting'}
								className="studio-primary-button"
								style={{ flex: 1, height: '52px', background: 'var(--holo-gradient)', color: '#fff', border: 0, fontSize: '16px', fontWeight: 800, borderRadius: '12px', cursor: 'pointer', opacity: phase === 'starting' ? 0.6 : 1 }}
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
