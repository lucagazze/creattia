import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { fileAsDataUrl, normalizeProductUrlInput } from '../app-products';
import { getSessionId, getSessionToken } from '../app-session';
import { PRODUCTS_KEY, saveLocal } from '../app-storage';
import type { AppSession, Product } from '../app-types';
import { demoProductArt } from '../demo-mode';
import { useEffect, useRef, useState } from 'react';
/** Carga y listado de productos del usuario. */

export function ProductIntake({ session, products, onProductsChanged, onCreated, compact = false }: { session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onCreated: (productIds: string[]) => void; compact?: boolean }) {
	const [mode, setMode] = useState<'url' | 'manual'>('url');
	const [productUrl, setProductUrl] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [priceText, setPriceText] = useState('');
	const [currency, setCurrency] = useState('ARS');
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const manualInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const urls = files.map((file) => URL.createObjectURL(file));
		setPreviews(urls);
		return () => urls.forEach((url) => URL.revokeObjectURL(url));
	}, [files]);

	function resetManual() {
		setName(''); setDescription(''); setPriceText(''); setCurrency('ARS'); setProductUrl(''); setFiles([]);
	}

	async function importUrl() {
		if (!productUrl.trim()) { setError('Pegá la URL exacta del producto.'); return; }
		setSaving(true); setError(''); setNotice('');
		try {
			const normalizedUrl = normalizeProductUrlInput(productUrl);
			let ids: string[] = [];
			if (!isSupabaseConfigured) {
				const id = crypto.randomUUID();
				let label = `Producto ${products.length + 1}`;
				try { label = new URL(normalizedUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || label; } catch { /* demo label */ }
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#19171d');
				const item: Product = { id, name: label, description: 'Producto importado desde su URL.', priceText: '', currency: '', productUrl: normalizedUrl, imageUrl: artwork, imageUrls: [artwork], imageCount: 1, source: 'website' };
				saveLocal(PRODUCTS_KEY, [item, ...products]); ids = [id];
			} else {
				const response = await fetch('/api/creativos/products', {
					method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: normalizedUrl }),
				});
				const payload = await response.json();
				if (!response.ok || !payload.importedIds?.length) throw new Error(payload.error || payload.errors?.[0]?.error || 'No pudimos leer ese producto. Probá cargar sus fotos.');
				ids = payload.importedIds;
			}
			await onProductsChanged(); onCreated(ids); setProductUrl('');
			setNotice('Producto listo. Guardamos sus datos y las fotos disponibles.');
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo importar el producto.'); }
		finally { setSaving(false); }
	}

	async function saveManual() {
		if (!name.trim()) { setError('Poné el nombre del producto.'); return; }
		if (!files.length) { setError('Subí al menos una foto del producto.'); return; }
		if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type))) { setError('Usá imágenes PNG, JPG, WebP o AVIF.'); return; }
		if (files.some((file) => file.size > 15 * 1024 * 1024)) { setError('Cada imagen debe pesar menos de 15 MB.'); return; }
		setSaving(true); setError(''); setNotice('');
		let createdId = '';
		const uploadedPaths: string[] = [];
		try {
			createdId = crypto.randomUUID();
			const normalizedUrl = normalizeProductUrlInput(productUrl);
			if (!isSupabaseConfigured) {
				const imageUrls = await Promise.all(files.map(fileAsDataUrl));
				const item: Product = { id: createdId, name: name.trim(), description: description.trim(), priceText: priceText.trim(), currency: currency.trim(), productUrl: normalizedUrl, imageUrl: imageUrls[0], imageUrls, imageCount: imageUrls.length, source: 'manual' };
				saveLocal(PRODUCTS_KEY, [item, ...products]);
			} else {
				if (!supabase) throw new Error('Supabase no está disponible.');
				const { error: insertError } = await supabase.from('creative_products').insert({
					id: createdId, user_id: getSessionId(session), name: name.trim(), description: description.trim() || null,
					price_text: priceText.trim() || null, currency: currency.trim() || null, product_url: normalizedUrl || null,
					source: 'manual', external_id: crypto.randomUUID(), synced_at: new Date().toISOString(),
				});
				if (insertError) throw insertError;
				const imageRows = [];
				for (let index = 0; index < files.length; index += 1) {
					const file = files[index];
					const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' }[file.type] || 'png';
					const path = `${getSessionId(session)}/products/${createdId}/${index === 0 ? 'primary' : `angle-${index + 1}`}.${extension}`;
					const { error: uploadError } = await supabase.storage.from('creative-assets').upload(path, file, { contentType: file.type, upsert: false });
					if (uploadError) throw uploadError;
					uploadedPaths.push(path);
					imageRows.push({ user_id: getSessionId(session), product_id: createdId, storage_path: path, sort_order: index, is_primary: index === 0, media_type: 'image' });
				}
				let { error: imageError } = await supabase.from('creative_product_images').insert(imageRows);
				if (imageError && /media_type|schema cache|column .*does not exist/i.test(imageError.message || '')) {
					const legacyRows = imageRows.map(({ media_type: _mediaType, ...row }) => row);
					({ error: imageError } = await supabase.from('creative_product_images').insert(legacyRows));
				}
				if (imageError) throw imageError;
				const { error: updateError } = await supabase.from('creative_products').update({ image_path: uploadedPaths[0], updated_at: new Date().toISOString() }).eq('id', createdId).eq('user_id', getSessionId(session));
				if (updateError) throw updateError;
			}
			await onProductsChanged(); onCreated([createdId]); resetManual();
			setNotice(`${files.length} ${files.length === 1 ? 'foto guardada' : 'fotos guardadas'}. El producto ya se puede usar.`);
		} catch (cause) {
			if (isSupabaseConfigured && supabase && createdId) {
				if (uploadedPaths.length) await supabase.storage.from('creative-assets').remove(uploadedPaths);
				await supabase.from('creative_products').delete().eq('id', createdId).eq('user_id', getSessionId(session));
			}
			setError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto.');
		} finally { setSaving(false); }
	}

	return <section className={`product-intake ${compact ? 'compact' : ''}`}>
		<header><div><small>AGREGAR PRODUCTO</small><strong>Elegí la forma más rápida.</strong></div><nav><button className={mode === 'url' ? 'active' : ''} onClick={() => { setMode('url'); setError(''); }}>Desde una URL</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setError(''); }}>Con fotos</button></nav></header>
		{mode === 'url' ? <div className="product-intake-url"><label>URL exacta del producto<input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://mitienda.com/productos/..."/></label><p>Leemos nombre, descripción, precio y hasta 6 imágenes públicas del producto.</p><button onClick={() => void importUrl()} disabled={saving || !productUrl.trim()}>{saving ? <><span className="studio-spinner small"/> Analizando…</> : <><Icon name="external" size={16}/>Analizar y guardar</>}</button></div> : <div className="product-intake-manual">
			<input ref={manualInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 6))}/>
			<button className="product-photo-drop" onClick={() => manualInput.current?.click()}><span><Icon name="upload"/></span><strong>{files.length ? `${files.length} ${files.length === 1 ? 'foto elegida' : 'fotos elegidas'}` : 'Subir entre 1 y 6 fotos'}</strong><small>Frente, dorso, detalle o distintos ángulos.</small></button>
			{previews.length > 0 && <div className="product-photo-previews">{previews.map((url, index) => <span key={url}><img src={url} alt={`Foto ${index + 1}`}/>{index === 0 && <b>Principal</b>}</span>)}</div>}
			<div className="product-manual-fields"><label>Nombre *<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Zapatilla Urban White"/></label><label>URL (opcional)<input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="Link del producto"/></label><label className="wide">Descripción útil para el anuncio<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Material, beneficio real, variante, tamaño o cualquier dato que la IA deba respetar."/></label><label>Precio (opcional)<input value={priceText} onChange={(event) => setPriceText(event.target.value)} placeholder="89.900"/></label><label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="ARS">ARS</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="">Sin moneda</option></select></label></div>
			<button className="product-save-manual" onClick={() => void saveManual()} disabled={saving || !name.trim() || !files.length}>{saving ? <><span className="studio-spinner small"/> Guardando…</> : <><Icon name="check" size={16}/>Guardar producto</>}</button>
		</div>}
		{notice && <p className="studio-form-notice product-intake-message"><Icon name="check" size={14}/>{notice}</p>}
		{error && <p className="studio-form-error product-intake-message">{error}</p>}
	</section>;
}


// Página dedicada a la creación en curso: progreso en vivo, se puede navegar
// a otras secciones o cerrar la pestaña — la generación sigue en el servidor.
