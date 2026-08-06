import { getSessionToken } from '../app-session';
import type { AppSession } from '../app-types';
import { useEffect, useState } from 'react';
/** Administrador de marcas y el formulario de "Mi marca". */

export function BrandsManager({ session, planCode, onPlans }: { session: AppSession; planCode: string; onPlans: () => void }) {
	const [brands, setBrands] = useState<any[]>([]);
	const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
	const [limit, setLimit] = useState(1);
	const [url, setUrl] = useState('');
	const [scanning, setScanning] = useState(false);
	const [error, setError] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);

	const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [editStyleSummary, setEditStyleSummary] = useState('');
	const [editPersonality, setEditPersonality] = useState('');
	const [editVoice, setEditVoice] = useState('');
	const [editButtonStyle, setEditButtonStyle] = useState('');
	const [editColors, setEditColors] = useState<string[]>([]);
	const [newColorInput, setNewColorInput] = useState('#744bde');
	const [savingBrandId, setSavingBrandId] = useState<string | null>(null);
	const [activatingBrandId, setActivatingBrandId] = useState<string | null>(null);
	const [removingBrandId, setRemovingBrandId] = useState<string | null>(null);

	function startEditing(brand: any) {
		setEditingBrandId(brand.id);
		setEditName(brand.name || '');
		setEditStyleSummary(brand.brand_style?.styleSummary || '');
		setEditPersonality(brand.brand_style?.brandPersonality || '');
		setEditVoice(brand.brand_style?.brandVoice || '');
		setEditButtonStyle(brand.brand_style?.buttonStyle || '');
		setEditColors(brand.brand_colors || []);
	}

	async function saveBrand(brandId: string) {
		setSavingBrandId(brandId);
		try {
			const response = await fetch('/api/creativos/brands', {
				method: 'PATCH',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'update',
					brandId,
					name: editName,
					brand_colors: editColors,
					brand_style: {
						styleSummary: editStyleSummary,
						brandPersonality: editPersonality,
						brandVoice: editVoice,
						buttonStyle: editButtonStyle,
					}
				})
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la marca.');
			
			setBrands(brands.map((b) => b.id === brandId ? { 
				...b, 
				name: editName, 
				brand_colors: editColors,
				brand_style: {
					...b.brand_style,
					styleSummary: editStyleSummary,
					brandPersonality: editPersonality,
					brandVoice: editVoice,
					buttonStyle: editButtonStyle,
				}
			} : b));
			setEditingBrandId(null);
			if (brandId === activeBrandId) {
				window.location.reload();
			}
		} catch (cause) {
			alert(cause instanceof Error ? cause.message : 'Error al guardar la marca.');
		} finally {
			setSavingBrandId(null);
		}
	}

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const response = await fetch('/api/creativos/brands', { headers: { authorization: `Bearer ${getSessionToken(session)}` } });
				const payload = await response.json();
				if (!active || !response.ok) return;
				setBrands(payload.brands || []);
				setActiveBrandId(payload.activeBrandId);
				setLimit(payload.limit || 1);
			} catch { /* red caída: la vista queda vacía */ }
			finally { if (active) setLoaded(true); }
		})();
		return () => { active = false; };
	}, [session]);

	async function scan() {
		if (!url.trim()) return;
		setScanning(true); setError('');
		try {
			const response = await fetch('/api/creativos/brands', {
				method: 'POST',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ url: url.trim() }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo analizar la marca.');
			setBrands((previous) => [...previous, payload.brand]);
			if (!activeBrandId) setActiveBrandId(payload.brand.id);
			setUrl('');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo analizar la marca.');
		} finally { setScanning(false); }
	}

	async function activate(brandId: string) {
		setActiveBrandId(brandId);
		setActivatingBrandId(brandId);
		try {
			const response = await fetch('/api/creativos/brands', {
				method: 'PATCH',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ brandId }),
			});
			if (!response.ok) throw new Error('No se pudo activar la marca.');
		} catch (cause) {
			setActiveBrandId(null);
			alert(cause instanceof Error ? cause.message : 'No se pudo activar la marca.');
		} finally { setActivatingBrandId(null); }
	}

	async function remove(brandId: string) {
		setRemovingBrandId(brandId);
		try {
			const response = await fetch(`/api/creativos/brands?id=${encodeURIComponent(brandId)}`, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${getSessionToken(session)}` },
			});
			if (!response.ok) throw new Error('No se pudo quitar la marca.');
			setBrands((previous) => previous.filter((brand) => brand.id !== brandId));
			if (activeBrandId === brandId) setActiveBrandId(null);
		} catch (cause) {
			alert(cause instanceof Error ? cause.message : 'No se pudo quitar la marca.');
			window.location.reload();
		} finally { setRemovingBrandId(null); }
	}

	if (editingBrandId !== null) {
		const brandToEdit = brands.find(b => b.id === editingBrandId);
		if (brandToEdit) {
			return (
				<section style={{ background: '#fff', border: '1px solid #e5e1e8', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
					<button 
						onClick={() => setEditingBrandId(null)} 
						style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 0, color: '#744bde', fontSize: '14px', fontWeight: 800, cursor: 'pointer', padding: '6px 0', width: 'fit-content' }}
					>
						← Volver a tus negocios
					</button>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee9f2', paddingBottom: '14px' }}>
						<h3 style={{ margin: 0, fontSize: '20px', color: '#19171d', fontWeight: 800 }}>Editar detalles de diseño: {brandToEdit.name}</h3>
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#716d79', marginBottom: '6px' }}>Nombre del negocio:</label>
							<input
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '14px', fontWeight: 600 }}
							/>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>✨ ESTILO GENERAL:</label>
							<textarea
								value={editStyleSummary}
								onChange={(e) => setEditStyleSummary(e.target.value)}
								rows={4}
								style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
							/>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🧠 PERSONALIDAD:</label>
							<textarea
								value={editPersonality}
								onChange={(e) => setEditPersonality(e.target.value)}
								rows={4}
								style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
							/>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🗣️ VOZ Y TONO:</label>
							<textarea
								value={editVoice}
								onChange={(e) => setEditVoice(e.target.value)}
								rows={4}
								style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
							/>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🖱️ ESTILO DE BOTONES:</label>
							<input
								value={editButtonStyle}
								onChange={(e) => setEditButtonStyle(e.target.value)}
								placeholder="Ej: Bordes redondeados con sombra..."
								style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px' }}
							/>
						</div>

						<div>
							<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🎨 PALETA DE COLORES:</label>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
								{editColors.map((color, idx) => (
									<span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f5f2f9', border: '1px solid #e5e1e8', padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
										<span style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
										{color}
										<button
											type="button"
											onClick={() => setEditColors(editColors.filter((_, i) => i !== idx))}
											style={{ border: 0, background: 'transparent', color: '#a43f3f', fontSize: '14px', cursor: 'pointer', padding: '0 2px', marginLeft: '4px' }}
										>
											×
										</button>
									</span>
								))}
							</div>
							<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
								<input
									type="color"
									value={newColorInput.startsWith('#') && newColorInput.length === 7 ? newColorInput : '#744bde'}
									onChange={(e) => setNewColorInput(e.target.value)}
									style={{ width: '40px', height: '36px', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
								/>
								<input
									type="text"
									value={newColorInput}
									onChange={(e) => setNewColorInput(e.target.value)}
									placeholder="#HEX"
									style={{ width: '90px', height: '36px', boxSizing: 'border-box', padding: '0 8px', borderRadius: '8px', border: '1px solid #dcd5e4', fontSize: '13.5px', fontFamily: 'monospace' }}
								/>
								<button
									type="button"
									onClick={() => {
										let colorToAdd = newColorInput.trim();
										if (colorToAdd) {
											if (!colorToAdd.startsWith('#')) {
												colorToAdd = '#' + colorToAdd;
											}
											if (/^#[0-9A-F]{3,6}$/i.test(colorToAdd)) {
												if (!editColors.includes(colorToAdd)) {
													setEditColors([...editColors, colorToAdd]);
												}
											} else {
												alert('Por favor ingresa un código HEX válido (ej: #ff0000)');
											}
										}
									}}
									style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
								>
									+ Agregar color
								</button>
							</div>
						</div>
					</div>

					<div style={{ display: 'flex', gap: '12px', marginTop: '14px', borderTop: '1px solid #eee9f2', paddingTop: '16px' }}>
						<button
							type="button"
							onClick={() => void saveBrand(brandToEdit.id)}
							disabled={savingBrandId === brandToEdit.id}
							style={{ flex: 1, height: '46px', borderRadius: '10px', border: 0, background: '#744bde', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: savingBrandId === brandToEdit.id ? 0.6 : 1 }}
						>
							{savingBrandId === brandToEdit.id ? <><span className="studio-spinner small" aria-hidden="true" /> Guardando cambios...</> : 'Guardar todo'}
						</button>
						<button
							type="button"
							onClick={() => setEditingBrandId(null)}
							style={{ height: '46px', padding: '0 20px', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#716d79', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
						>
							Cancelar
						</button>
					</div>
				</section>
			);
		}
	}

	return (
		<section style={{ background: '#fff', border: '1px solid #e5e1e8', borderRadius: '16px', padding: '24px' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
				<h2 style={{ margin: 0, fontSize: '18px', color: '#744bde' }}>Tus negocios</h2>
				<span style={{ fontSize: '13px', color: '#716d79' }}>
					{brands.length}/{limit} {limit === 1 ? 'marca' : 'marcas'} del plan
					{brands.length >= limit && <button onClick={onPlans} style={{ marginLeft: '8px', border: 0, background: 'transparent', color: '#744bde', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', fontSize: '13px', minHeight: '34px', padding: '0 4px' }}>Mejorar plan</button>}
				</span>
			</div>
			<p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
				Pegá la URL principal de tu negocio y la IA analiza todo sola: diseño, colores, tipografía, cómo habla la marca, estilo de botones y logo.
			</p>

			<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
				<input
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					placeholder="https://tunegocio.com"
					style={{ flex: '1 1 280px', padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '14px' }}
				/>
				<button
					onClick={() => void scan()}
					disabled={scanning || !url.trim() || brands.length >= limit}
					style={{ padding: '0 20px', height: '44px', borderRadius: '10px', border: 0, background: '#744bde', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: scanning || brands.length >= limit ? 0.55 : 1 }}
				>
					{scanning ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando tu negocio…</> : 'Analizar con IA'}
				</button>
			</div>
			{error && <p style={{ margin: '0 0 14px', padding: '11px 13px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '13px' }}>{error}</p>}

			{!loaded ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><span className="studio-spinner" style={{ width: '22px', height: '22px' }} /></div>
			) : brands.length === 0 ? (
				<p style={{ margin: 0, fontSize: '13px', color: '#8b8490' }}>Todavía no agregaste ningún negocio.</p>
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
					{brands.map((brand) => {
						const isActive = brand.id === activeBrandId;
						const style = brand.brand_style || {};
						const isExpanded = expandedBrandId === brand.id;
						return (
							<article key={brand.id} style={{ position: 'relative', border: isActive ? '2px solid #744bde' : '1px solid #e5e1e8', borderRadius: '14px', padding: '16px', background: isActive ? '#faf9fb' : '#fff' }}>
								<button onClick={() => void remove(brand.id)} disabled={removingBrandId === brand.id} aria-label="Eliminar marca" style={{ position: 'absolute', top: '6px', right: '6px', display: 'grid', placeItems: 'center', width: '32px', height: '32px', border: 0, borderRadius: '50%', background: 'transparent', color: '#b0a8b8', fontSize: '17px', lineHeight: 1, cursor: removingBrandId === brand.id ? 'wait' : 'pointer', opacity: removingBrandId === brand.id ? .6 : 1 }}>{removingBrandId === brand.id ? <span className="studio-spinner small" aria-hidden="true" /> : '×'}</button>
								<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
									{brand.logoUrl
										? <img src={brand.logoUrl} alt="" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '10px', background: '#f4f2f6', padding: '4px' }} />
										: <span style={{ width: '44px', height: '44px', display: 'grid', placeItems: 'center', borderRadius: '10px', background: '#f4f2f6', fontWeight: 800, color: '#744bde' }}>{(brand.name || '?').slice(0, 1).toUpperCase()}</span>}
									<div style={{ minWidth: 0, flex: 1 }}>
										{editingBrandId === brand.id ? (
											<input
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: '6px', border: '1px solid #e5e1e8', fontSize: '13px', fontWeight: 700 }}
											/>
										) : (
											<>
												<strong style={{ display: 'block', fontSize: '15px', color: '#19171d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</strong>
												<span style={{ fontSize: '12px', color: '#8b8490' }}>{String(brand.website_url || '').replace(/^https?:[/][/]/, '').replace(/[/]$/, '')}</span>
											</>
										)}
									</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
									{(brand.brand_colors || []).slice(0, 5).map((color: string) => (
										<span key={color} title={color} style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, border: '1px solid rgba(0,0,0,0.08)' }} />
									))}
									{style.typography?.headings && <span style={{ marginLeft: '6px', fontSize: '12px', color: '#716d79' }}>{style.typography.headings}{style.typography.body ? ` · ${style.typography.body}` : ''}</span>}
								</div>
								
								{style.brandVoice && <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#716d79', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{style.brandVoice}</p>}
								
								<div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
									<button 
										onClick={() => startEditing(brand)}
										style={{
											background: 'transparent',
											border: 0,
											color: '#744bde',
											fontSize: '12.5px',
											fontWeight: 700,
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											gap: '4px',
											marginTop: '10px',
											marginBottom: '12px',
											padding: '6px 0',
											minHeight: '34px'
										}}
									>
										✏️ Ver detalles de diseño
									</button>
								</div>

								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									{isActive
										? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#128a51' }}>● Marca activa</span>
										: <button onClick={() => void activate(brand.id)} disabled={activatingBrandId === brand.id} style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: activatingBrandId === brand.id ? 'wait' : 'pointer', opacity: activatingBrandId === brand.id ? .65 : 1 }}>{activatingBrandId === brand.id ? <><span className="studio-spinner small" aria-hidden="true" /> Activando…</> : 'Usar esta marca'}</button>}
								</div>
							</article>
						);
					})}
				</div>
			)}


		</section>
	);
}
