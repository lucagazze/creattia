import type { Creativo } from '../../../data/creativos50';
import { creativeNumber, referencePresets, ringMeta } from '../../../lib/creattia/catalog';
import { fetchLibraryItems, fetchReferenceUrls } from '../../../lib/creattia/reference-urls';
import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { normalizeProductUrlInput } from '../app-products';
import { getSessionToken } from '../app-session';
import { PRODUCTS_KEY, saveLocal } from '../app-storage';
import type { ActiveBatch, AppProfile, AppSession, CreativeReference, Generation, Product, VariationStrength } from '../app-types';
import { createDemoCreative, demoProductArt } from '../demo-mode';
import { ProductIntake } from './Products';
import { useEffect, useMemo, useState } from 'react';
import { downloadImage } from '../download';
/** Wizard de generación y el seguimiento del lote en curso. */

export function GenerationView({ batch, onBack, onReuse, onHistory }: { batch: ActiveBatch; onBack: () => void; onReuse: (generation: Generation) => void; onHistory: () => void }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (batch.status !== 'processing') return;
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [batch.status]);
	const elapsed = Math.max(0, Math.floor((now - batch.startedAt) / 1000));
	const minutes = Math.floor(elapsed / 60);
	const seconds = String(elapsed % 60).padStart(2, '0');
	const stage = elapsed < 25
		? 'Analizando el anuncio ganador y tu producto…'
		: elapsed < 55
			? 'Analizando la composición y planificando la imagen…'
			: 'Generando tu imagen en alta calidad…';

	return (
		<section style={{ width: '100%', padding: '30px 10px', boxSizing: 'border-box', ...(batch.status === 'processing' ? { minHeight: 'calc(100svh - 140px)', display: 'flex', flexDirection: 'column' } : {}) }}>
			<button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '13px', marginBottom: '18px', padding: 0 }}>← Volver a la biblioteca</button>

			{batch.status === 'processing' && (
				<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
					<div style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #eee9f2', borderRadius: '18px', padding: '46px 30px', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
						{batch.referenceUrl && (
							<img src={batch.referenceUrl} alt="" style={{ width: '92px', height: '92px', objectFit: 'cover', borderRadius: '14px', marginBottom: '20px', boxShadow: '0 10px 26px rgba(0,0,0,0.14)' }} />
						)}
						<h1 style={{ margin: '0 0 8px', fontSize: '22px', color: '#19171d' }}>Creando “{batch.title}”</h1>
						<p style={{ margin: '0 0 26px', color: '#716d79', fontSize: '14px' }}>{stage}</p>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '26px' }}>
							<span className="studio-spinner" style={{ width: '22px', height: '22px' }} />
							<b style={{ fontSize: '15px', color: '#19171d', fontVariantNumeric: 'tabular-nums' }}>{minutes}:{seconds}</b>
						</div>
						<p style={{ margin: 0, fontSize: '12px', color: '#8b8490', lineHeight: 1.6 }}>
							Suele tardar alrededor de un minuto.<br/>
							Podés seguir usando la app o cerrar esta pestaña: el anuncio se guarda solo en <b>Mis imágenes</b>.
						</p>
					</div>
				</div>
			)}

			{batch.status === 'completed' && (
				<div>
					<h1 style={{ margin: '0 0 6px', fontSize: '24px', color: '#19171d' }}>¡Tu anuncio está listo!</h1>
					<p style={{ margin: '0 0 22px', color: '#716d79', fontSize: '14px' }}>Basado en “{batch.title}”. También quedó guardado en Mis imágenes.</p>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 460px))', justifyContent: 'center', gap: '18px' }}>
						{batch.results.map((generation) => (
							<figure key={generation.id} style={{ margin: 0, background: '#fff', border: '1px solid #eee9f2', borderRadius: '16px', padding: '14px' }}>
								<img src={generation.imageUrl} alt={generation.title} style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
								<figcaption style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
									<button onClick={() => void downloadImage(generation.imageUrl, `creattia-${generation.id}.png`)} style={{ flex: 1, padding: '11px 0', borderRadius: '10px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Descargar</button>
									<button onClick={() => onReuse(generation)} style={{ flex: 1, padding: '11px 0', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#19171d', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Nueva versión</button>
								</figcaption>
							</figure>
						))}
					</div>
					<button onClick={onHistory} style={{ marginTop: '20px', border: 0, background: 'transparent', color: '#7a4fd3', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: 0 }}>Ver todas mis imágenes →</button>
				</div>
			)}

			{batch.status === 'failed' && (
				<div style={{ background: '#fff5f5', border: '1px solid #f3dada', borderRadius: '18px', padding: '38px 30px', textAlign: 'center' }}>
					<h1 style={{ margin: '0 0 10px', fontSize: '20px', color: '#a43f3f' }}>No pudimos generar este anuncio</h1>
					<p style={{ margin: '0 0 6px', color: '#8a5555', fontSize: '13px' }}>{batch.error}</p>
					<p style={{ margin: '0 0 22px', color: '#8a5555', fontSize: '12px' }}>Tus créditos no usados fueron devueltos automáticamente.</p>
					<button onClick={onBack} style={{ padding: '11px 22px', borderRadius: '10px', border: 0, background: '#19171d', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Probar de nuevo</button>
				</div>
			)}
		</section>
	);
}

export function Studio({ creative, reuseSeed, initialProductIds, onSeedConsumed, profile, session, products, onProductsChanged, onChooseLibrary, onGenerated, onToast, onGenerationStarted, onGenerationRequested }: { creative: Creativo; reuseSeed: Generation | null; initialProductIds: string[]; onSeedConsumed: () => void; profile: AppProfile; session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onChooseLibrary: () => void; onGenerated: (generations: Generation[], credits: number) => void; onToast: (message: string) => void; onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void; onGenerationRequested?: () => void }) {
	const [wizardOpen, setWizardOpen] = useState(true);
	const [step, setStep] = useState(1);
	const [imageType, setImageType] = useState('product');
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [productQuery, setProductQuery] = useState('');
	const [showProductIntake, setShowProductIntake] = useState(false);
	const [preset, setPreset] = useState('fiel');
	const [references, setReferences] = useState<CreativeReference[]>([]);
	const [referenceId, setReferenceId] = useState('');
	const [format, setFormat] = useState('square');
	const count = 1;
	const [revisionBrief, setRevisionBrief] = useState('');
	const [showRevisionProducts, setShowRevisionProducts] = useState(false);
	const [variationStrength, setVariationStrength] = useState<VariationStrength>('exact');
	const [generating, setGenerating] = useState(false);
	const [results, setResults] = useState<Generation[]>([]);
	const [result, setResult] = useState<Generation | null>(null);
	const [error, setError] = useState('');
	const [fastUrl, setFastUrl] = useState('');
	const [fastImporting, setFastImporting] = useState(false);

	const selectedProducts = selectedProductIds.flatMap((id) => {
		const product = products.find((item) => item.id === id);
		return product ? [product] : [];
	});
	const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(productQuery.toLowerCase().trim())).slice(0, 30), [products, productQuery]);
	const typeOptions = [
		{ id: 'product', title: 'Producto protagonista', copy: 'Tu producto ocupa el centro de la imagen.', badge: 'Más usado', icon: 'bag' },
		{ id: 'promotion', title: 'Promoción de marca', copy: 'Comunicá una oferta con o sin producto.', badge: 'Flexible', icon: 'spark' },
		{ id: 'lifestyle', title: 'Producto en contexto', copy: 'Mostralo dentro de una escena real.', badge: 'Lifestyle', icon: 'brand' },
		{ id: 'catalog', title: 'Foto de catálogo', copy: 'Fondo limpio y foco total en el producto.', badge: 'E-commerce', icon: 'grid' },
	];
	const formatOptions = [
		{ id: 'square', title: 'Feed cuadrado', ratio: '1:1', copy: '1024 × 1024' },
		{ id: 'portrait', title: 'Feed vertical', ratio: '4:5', copy: '1024 × 1280' },
		{ id: 'story', title: 'Stories / Reels', ratio: '9:16', copy: '1008 × 1792' },
		{ id: 'landscape', title: 'Horizontal', ratio: '5:4', copy: '1280 × 1024' },
	];

	useEffect(() => {
		setWizardOpen(true); setStep(reuseSeed ? 4 : 1); setResults([]); setResult(null); setError(''); setRevisionBrief(''); setShowRevisionProducts(false); setVariationStrength('exact');
		const reusableIds = reuseSeed?.productIds?.length ? reuseSeed.productIds : reuseSeed?.productId ? [reuseSeed.productId] : initialProductIds;
		setSelectedProductIds(reusableIds.filter((id) => products.some((item) => item.id === id)).slice(0, 5));
		if (!reuseSeed && initialProductIds.length) onSeedConsumed();
		setImageType(reuseSeed?.imageType || 'product'); setPreset(reuseSeed?.preset || 'fiel'); setFormat(reuseSeed?.format || 'square');
	}, [creative.id, reuseSeed?.id]);
	useEffect(() => {
		if (!wizardOpen) return;
		const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = previous; };
	}, [wizardOpen]);
	useEffect(() => {
		let cancelled = false; setReferences([]); setReferenceId('');
		if (!isSupabaseConfigured || !supabase) return;
		const client = supabase;
		void (async () => {
			const { data } = await client.from('creative_references').select('id,name,image_path').eq('template_id', creative.id).eq('is_active', true).in('rights_status', ['owned', 'licensed', 'public_domain']).order('sort_order').limit(5);
			let loaded: CreativeReference[] = (data || []).map((item) => ({
				id: item.id,
				name: item.name,
				description: 'Composición visual ganadora validada.',
				imageUrl: '',
				storagePath: item.image_path,
			}));
			if (!loaded.length) {
				const remoteManifest = await fetchLibraryItems(client);
				loaded = remoteManifest.filter((item) => Number(item.templateId) === creative.id).slice(0, 5).map((item) => ({
					id: `storage:${item.imagePath}`,
					name: item.name,
					description: 'Composición estática original.',
					imageUrl: '',
					storagePath: item.imagePath,
				}));
			}
			// Una sola llamada firma todas las miniaturas de esta plantilla.
			const signed = await fetchReferenceUrls(client, loaded.map((item) => item.storagePath || ''));
			loaded = loaded.map((item) => ({ ...item, imageUrl: signed[item.storagePath || ''] || '' })).filter((item) => item.imageUrl);
			if (cancelled) return;
			if (!cancelled) { setReferences(loaded); setReferenceId(loaded[0]?.id || ''); }
		})();
		return () => { cancelled = true; };
	}, [creative.id]);

	function nextStep() {
		setError('');
		if (step === 2 && imageType !== 'promotion' && !selectedProductIds.length) { setError('Elegí al menos un producto o cargá una foto para continuar.'); return; }
		setStep((current) => Math.min(4, current + 1));
	}

	function toggleProduct(productId: string) {
		setError('');
		setSelectedProductIds((current) => {
			if (current.includes(productId)) return current.filter((id) => id !== productId);
			if (current.length >= 5) { setError('Podés combinar hasta 5 productos en una imagen.'); return current; }
			return [...current, productId];
		});
	}

	async function handleFastImport() {
		if (!fastUrl.trim()) return;
		setFastImporting(true); setError('');
		try {
			const normalizedUrl = normalizeProductUrlInput(fastUrl);
			let ids: string[] = [];
			if (!isSupabaseConfigured) {
				const id = crypto.randomUUID();
				let label = `Producto ${products.length + 1}`;
				try { label = new URL(normalizedUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || label; } catch {}
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#19171d');
				const item: Product = { id, name: label, description: 'Producto importado desde su URL.', priceText: '', currency: '', productUrl: normalizedUrl, imageUrl: artwork, imageUrls: [artwork], imageCount: 1, source: 'website' };
				saveLocal(PRODUCTS_KEY, [item, ...products]); ids = [id];
			} else {
				const response = await fetch('/api/creativos/products', {
					method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: normalizedUrl }),
				});
				const payload = await response.json();
				if (!response.ok || !payload.importedIds?.length) throw new Error(payload.error || payload.errors?.[0]?.error || 'No pudimos analizar ese producto. Probá cargarlo con fotos.');
				ids = payload.importedIds;
			}
			await onProductsChanged();
			setSelectedProductIds((current) => [...new Set([...current, ...ids])].slice(-5));
			setFastUrl('');
			onToast('Producto importado y seleccionado con éxito.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo importar.');
		} finally {
			setFastImporting(false);
		}
	}

	async function generate(sourceGeneration: Generation | null = null) {
		setError('');
		const effectiveCount = sourceGeneration ? 1 : count;
		if (profile.credits < effectiveCount) { setError(`Necesitás ${effectiveCount} ${effectiveCount === 1 ? 'crédito' : 'créditos'} para generar este lote.`); return; }
		if (imageType !== 'promotion' && !selectedProducts.length) { setError('Elegí al menos un producto para generar esta imagen.'); return; }
		const effectiveBrief = sourceGeneration ? revisionBrief.trim() : '';
		onGenerationRequested?.();
		setGenerating(true); if (!sourceGeneration) { setResults([]); setResult(null); }
		try {
			let generations: Generation[]; let credits = profile.credits - effectiveCount;
			if (!isSupabaseConfigured) {
				await new Promise((resolve) => window.setTimeout(resolve, 1350));
				let demoFile: File | null = null;
				const firstProduct = selectedProducts[0];
				if (firstProduct?.imageUrl.startsWith('data:')) { const blob = await (await fetch(firstProduct.imageUrl)).blob(); demoFile = new File([blob], `${firstProduct.name}.svg`, { type: blob.type }); }
				const batchId = crypto.randomUUID();
				generations = await Promise.all(Array.from({ length: effectiveCount }, async (_, index) => ({
					id: crypto.randomUUID(),
					title: creative.nombre,
					imageUrl: await createDemoCreative({ creative, profile, preset, format, brief: `${effectiveBrief}${effectiveCount > 1 ? ` · Variante ${index + 1}` : ''}`, product: demoFile }),
					format,
					createdAt: new Date().toISOString(),
					category: ringMeta[creative.ring]?.label || 'Creativo',
					templateId: creative.id,
					brief: effectiveBrief,
					preset,
					imageType,
					productId: selectedProductIds[0],
					productIds: selectedProductIds,
					batchId,
					outputIndex: index + 1,
				})));
			} else {
				const form = new FormData();
				form.set('templateId', String(creative.id)); form.set('templateName', creative.nombre); form.set('purpose', creative.sirve); form.set('usageHint', creative.cuando);
				form.set('preset', referencePresets.find((item) => item.id === preset)?.name || preset); form.set('imageType', imageType); form.set('format', format); form.set('brief', effectiveBrief);
				const chosenReference = references.find((item) => item.id === referenceId);
				if (referenceId.startsWith('storage:') && chosenReference?.storagePath) form.set('referencePath', chosenReference.storagePath);
				else if (referenceId) form.set('referenceId', referenceId);
				selectedProductIds.forEach((id) => form.append('productIds', id)); form.set('count', String(effectiveCount));
				if (sourceGeneration) { form.set('sourceGenerationId', sourceGeneration.id); form.set('variationStrength', variationStrength); }
				const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}` }, body: form });
				const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo generar.');
				if (payload.async && payload.batchId && onGenerationStarted) {
					// La generación sigue en el servidor: pasamos a la página dedicada.
					setGenerating(false);
					setWizardOpen(false);
					onGenerated([], payload.creditsRemaining);
					onGenerationStarted({ batchId: payload.batchId, title: creative.nombre, count: effectiveCount });
					return;
				}
				credits = payload.creditsRemaining;
				generations = (payload.generations || [{ id: payload.id, imageUrl: payload.imageUrl, outputIndex: 1 }]).map((item: any) => ({
					id: item.id, title: creative.nombre, imageUrl: item.imageUrl, format, createdAt: new Date().toISOString(), category: ringMeta[creative.ring]?.label || 'Creativo', templateId: creative.id, brief: effectiveBrief, preset, imageType, productId: selectedProductIds[0], productIds: selectedProductIds, batchId: item.batchId, outputIndex: item.outputIndex,
				}));
			}
			const nextResults = sourceGeneration ? [generations[0]] : generations;
			setResults(nextResults); setResult(nextResults[0]); setStep(6); setRevisionBrief(''); onGenerated(generations, credits);
			onToast(isSupabaseConfigured ? `${generations.length === 1 ? 'Tu imagen está lista' : `Tus ${generations.length} imágenes están listas`} y guardada${generations.length === 1 ? '' : 's'}.` : 'Vista demo creada.');
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo generar la imagen.'); }
		finally { setGenerating(false); }
	}

	const meta = ringMeta[creative.ring] || ringMeta.demo;
	const currentVariant = references.length ? references.find((item) => item.id === referenceId)?.name : referencePresets.find((item) => item.id === preset)?.name;
	return <>
		<div className="studio-page-heading studio-editor-heading"><div><button onClick={onChooseLibrary}>Biblioteca</button><span>/</span><p>Crear imagen</p><h1>{creative.nombre}</h1></div><div className="studio-angle-meta"><span style={{ background: meta?.accent }}>{meta?.short}</span><b>#{creativeNumber(creative.id)}</b><b>{creative.n}</b></div></div>
		<section className="studio-resume-card">
			<div><span style={{ background: meta?.accent }}>{creativeNumber(creative.id)}</span><p><small>IDEA ELEGIDA</small><strong>{creative.nombre}</strong><em>{selectedProducts.length ? `${selectedProducts.length} ${selectedProducts.length === 1 ? 'producto elegido' : 'productos elegidos'}` : 'Elegí producto, formato y estilo dentro del generador'}</em></p></div>
			<button onClick={() => { setWizardOpen(true); if (result) setStep(6); }}>{result ? 'Volver al resultado' : 'Abrir generador'} <Icon name="arrow" size={17}/></button>
		</section>

		{wizardOpen && <div className="creative-wizard-overlay" role="dialog" aria-modal="true" aria-label="Generador guiado de imágenes"><div className="creative-wizard-modal">
			<header className="wizard-header"><div><span className="wizard-brand-mark"><Icon name="spark" size={17}/></span><p><small>CREATTIA</small><strong>{step === 6 ? 'Tu imagen está lista' : `Crear · ${creative.nombre}`}</strong></p></div><button onClick={() => setWizardOpen(false)} aria-label="Cerrar generador"><Icon name="close"/></button></header>
			{step <= 4 && <div className="wizard-progress">{['Tipo', 'Producto', 'Estilo', 'Formato'].map((label, index) => <button key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''} onClick={() => index + 1 < step && setStep(index + 1)}><span>{step > index + 1 ? <Icon name="check" size={11}/> : index + 1}</span><b>{label}</b></button>)}</div>}
			<div className="wizard-body"><main>
				{step === 1 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 1 DE 4</span><h2>¿Qué tipo de imagen querés?</h2><p>Elegí cómo mostrar tu producto o promoción.</p></div><div className="wizard-type-grid">{typeOptions.map((item) => <button key={item.id} className={imageType === item.id ? 'active' : ''} onClick={() => setImageType(item.id)}><span><Icon name={item.icon}/></span><em>{item.badge}</em><h3>{item.title}</h3><p>{item.copy}</p>{imageType === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div></section>}
				{step === 2 && <section className="wizard-step">
					<div className="wizard-step-heading"><span>PASO 2 DE 4 · HASTA 5</span><h2>{imageType === 'promotion' ? '¿Querés sumar productos?' : 'Elegí uno o varios productos'}</h2><p>Elegí los que ya guardaste o agregá uno nuevo sin salir del generador.</p></div>
					
					{/* Fast Product URL Import Box */}
					<div className="fast-url-import-box" style={{ background: '#110d17', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<strong style={{ fontSize: '11px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="spark" size={13} /> ¿Querés crear con un producto nuevo?</strong>
						<p style={{ margin: 0, fontSize: '9px', color: '#8b8490', lineHeight: 1.4 }}>Pegá la URL del producto de tu tienda. Analizaremos las imágenes y el estilo visual automáticamente para la generación.</p>
						<div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
							<input 
								type="text" 
								placeholder="https://mitienda.com/productos/zapato-urban" 
								value={fastUrl}
								onChange={(e) => setFastUrl(e.target.value)}
								style={{ flex: 1, height: '36px', background: '#15121c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', padding: '0 10px', fontSize: '10.5px', outline: 'none' }}
							/>
							<button 
								type="button"
								onClick={handleFastImport}
								disabled={fastImporting || !fastUrl.trim()}
								style={{ height: '36px', padding: '0 16px', background: '#19171d', border: 0, borderRadius: '8px', color: '#fff', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
							>
								{fastImporting ? <span className="studio-spinner small" /> : <><Icon name="external" size={14}/> Analizar</>}
							</button>
						</div>
					</div>

					<div className="wizard-product-toolbar"><label className="wizard-product-search"><Icon name="search" size={18}/><input aria-label="Buscar producto" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto…"/><span>{selectedProductIds.length}/5</span></label><button className={showProductIntake ? 'active' : ''} onClick={() => setShowProductIntake((current) => !current)}><Icon name="plus" size={15}/>{showProductIntake ? 'Cerrar carga' : 'Agregar producto'}</button></div>
					{showProductIntake && <ProductIntake
						compact
						session={session}
						products={products}
						onProductsChanged={onProductsChanged}
						onCreated={(ids) => {
							setSelectedProductIds((current) => [...new Set([...current, ...ids])].slice(-5));
							setShowProductIntake(false);
							onToast('Producto guardado y seleccionado.');
						}}
					/>}
					{imageType === 'promotion' && <button className={`wizard-no-product ${!selectedProductIds.length ? 'active' : ''}`} onClick={() => setSelectedProductIds([])}><span><Icon name="spark"/></span><p><strong>Promoción sin producto</strong><small>Creá una oferta general de tu marca</small></p>{!selectedProductIds.length && <b><Icon name="check" size={13}/></b>}</button>}
					{filteredProducts.length ? <div className="wizard-product-grid">{filteredProducts.map((product) => { const selectedIndex = selectedProductIds.indexOf(product.id); return <button key={product.id} className={selectedIndex >= 0 ? 'active' : ''} onClick={() => toggleProduct(product.id)}><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span><Icon name="bag"/></span>}{selectedIndex >= 0 && <b>{selectedIndex + 1}</b>}{product.imageCount > 1 && <em>{product.imageCount} fotos</em>}</div><strong>{product.name}</strong><small>{product.priceText ? `${product.priceText} ${product.currency}` : product.source === 'manual' ? 'Cargado por vos' : 'Desde tu tienda'}</small></button>; })}</div> : !showProductIntake && <div className="wizard-products-empty"><Icon name="bag"/><strong>No hay productos guardados</strong><p>Agregá uno por URL o subiendo sus fotos.</p><button onClick={() => setShowProductIntake(true)}>Agregar mi producto</button></div>}
				</section>}
				{step === 3 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 3 DE 4</span><h2>¿Cómo querés que se vea?</h2><p>{references.length ? 'Elegí una referencia para conservar su composición.' : 'Elegí una versión visual para esta idea.'}</p></div>{references.length ? <div className="wizard-reference-grid">{references.map((item, index) => <button key={item.id} className={referenceId === item.id ? 'active' : ''} onClick={() => setReferenceId(item.id)}><div><img src={item.imageUrl} alt={item.name}/><span>OPCIÓN {String(index + 1).padStart(2, '0')}</span></div><strong>{item.name}</strong><small>{item.description}</small>{referenceId === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div> : <div className="wizard-variant-grid">{referencePresets.map((item, index) => <button key={item.id} className={preset === item.id ? 'active' : ''} onClick={() => setPreset(item.id)}><div className={`preset-preview preset-${index + 1}`}><i/><b/><span/><small/></div><em>{item.label}</em><strong>{item.name}</strong><p>{item.description}</p>{preset === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div>}</section>}
				{step === 4 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 4 DE 4</span><h2>Formato</h2><p>Elegí dónde vas a publicar tu anuncio.</p></div><div className="wizard-format-grid">{formatOptions.map((item) => <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><span className={`format-shape shape-${item.id}`}><i/></span><p><strong>{item.title}</strong><small>{item.copy}</small></p><em>{item.ratio}</em>{format === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div></section>}
				{step === 6 && <section className="wizard-result"><div className="wizard-result-visual"><div className={`wizard-result-image result-${format}`}>{generating ? <div><span className="studio-spinner"/><h3>Creando tu imagen…</h3></div> : result && <img src={result.imageUrl} alt={`Imagen ${result.title}`}/>}</div>{results.length > 1 && <div className="wizard-result-gallery">{results.map((item, index) => <button key={item.id} className={result?.id === item.id ? 'active' : ''} onClick={() => setResult(item)}><img src={item.imageUrl} alt={`Variante ${index + 1}`}/><span>{index + 1}</span></button>)}</div>}</div>{result && <div className="wizard-result-copy"><span><Icon name="check" size={14}/> {results.length > 1 ? `${results.length} VARIANTES GENERADAS` : 'IMAGEN GENERADA'}</span><h2>Lista para publicar.</h2><p>La guardamos en “Mis imágenes”. Elegí una variante, descargala o pedí un cambio.</p><div className="wizard-result-actions"><a href={result.imageUrl} download={`creattia-${creative.id}-${result.outputIndex || 1}.png`}><Icon name="download" size={18}/>Descargar elegida</a><button onClick={() => { setResults([]); setResult(null); setRevisionBrief(''); setStep(1); }}><Icon name="plus" size={17}/>Crear otra</button></div><div className="wizard-revision"><header><span><Icon name="spark" size={16}/></span><p><strong>¿Querés hacer un cambio?</strong><small>Usaremos la variante elegida como referencia.</small></p></header><label>Describí el cambio (opcional)<textarea value={revisionBrief} maxLength={500} onChange={(event) => setRevisionBrief(event.target.value)} placeholder="Ej: cambiar el fondo, reemplazar un producto o destacar más el beneficio."/></label><div className="wizard-selected-products-note"><Icon name="bag" size={15}/><span><strong>{selectedProducts.length || 0} {selectedProducts.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}</strong><small>Podés reemplazarlos antes de generar la nueva versión.</small></span><button onClick={() => setShowRevisionProducts((current) => !current)}>{showRevisionProducts ? 'Listo' : 'Cambiar'}</button></div>{showRevisionProducts && <div className="wizard-revision-products">{products.map((product) => <button key={product.id} className={selectedProductIds.includes(product.id) ? 'active' : ''} onClick={() => toggleProduct(product.id)}>{product.imageUrl ? <img src={product.imageUrl} alt=""/> : <Icon name="bag"/>}<span>{product.name}</span>{selectedProductIds.includes(product.id) && <b><Icon name="check" size={10}/></b>}</button>)}</div>}<div className="wizard-revision-strength">{([{ id: 'exact', title: 'Conservar todo', copy: 'Cambia solo lo que pedís.' }, { id: 'light', title: 'Variar detalles', copy: 'Mantiene el diseño base.' }, { id: 'strong', title: 'Reinterpretar', copy: 'Mismo enfoque, nueva composición.' }] as { id: VariationStrength; title: string; copy: string }[]).map((option) => <button key={option.id} className={variationStrength === option.id ? 'active' : ''} onClick={() => setVariationStrength(option.id)}><span>{variationStrength === option.id && <Icon name="check" size={11}/>}</span><p><strong>{option.title}</strong><small>{option.copy}</small></p></button>)}</div><button className="wizard-revision-generate" onClick={() => void generate(result)} disabled={generating}><Icon name="spark" size={17}/>Generar nueva versión <span>1 crédito</span></button></div></div>}</section>}
				{error && <p className="wizard-error">{error}</p>}
			</main>{step <= 4 && <aside className="wizard-summary"><small>RESUMEN</small><div><span style={{ background: meta?.accent }}>{creativeNumber(creative.id)}</span><p><strong>{creative.nombre}</strong><small>{meta?.label} · {creative.n}</small></p></div><ul><li><span>Tipo</span><b>{typeOptions.find((item) => item.id === imageType)?.title}</b></li><li><span>Productos</span><b>{selectedProducts.length ? `${selectedProducts.length} elegidos` : imageType === 'promotion' ? 'Sin producto' : 'Sin elegir'}</b></li><li><span>Estilo</span><b>{currentVariant || 'Fiel a la referencia'}</b></li><li><span>Formato</span><b>{formatOptions.find((item) => item.id === format)?.ratio}</b></li><li><span>Resultado</span><b>{count} {count === 1 ? 'imagen' : 'variantes'}</b></li></ul><footer><span><Icon name="brand" size={15}/></span><p><strong>{profile.brandName}</strong><small>Marca y catálogo listos</small></p></footer></aside>}</div>
			{step <= 4 && <footer className="wizard-footer"><button onClick={() => step === 1 ? setWizardOpen(false) : setStep(step - 1)}>{step === 1 ? 'Cancelar' : 'Atrás'}</button>{step < 4 ? <button className="primary" onClick={nextStep}>Continuar <Icon name="arrow" size={17}/></button> : <button className="primary generate" onClick={() => void generate()} disabled={generating || profile.credits < count}>{generating ? <><span className="studio-spinner small"/> Generando…</> : <><Icon name="spark" size={17}/>Generar {count === 1 ? 'imagen' : `${count} imágenes`} <span>{count} {count === 1 ? 'crédito' : 'créditos'}</span></>}</button>}</footer>}
		</div></div>}
	</>;
}
