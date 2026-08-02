import React, { useState, useEffect, useMemo } from 'react';

const VIDEOS_BASE = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-videos';
const MANIFEST_URL = `${VIDEOS_BASE}/manifests/video-library.json`;
const PAGE_SIZE = 24;

// Mismos nichos y ángulos que la biblioteca de imágenes (WinnersLibrary), para
// que el criterio de filtrado sea consistente en toda la app.
const nicheIcons: Record<string, string> = {
	'Accessories': '👜', 'Beauty': '💄', 'Business/Professional': '💼', 'Entertainment': '🎬',
	'Fashion': '👗', 'Food/Drink': '🍽️', 'Health/Wellness': '🌿', 'Medical': '🩺',
	'Service Business': '🛠️', 'Tech': '💻', 'Technology': '💻', 'App/Software': '📱',
	'Home/Garden': '🪴', 'Sports/Outdoors': '⛰️', 'Sports/Fitness': '🏋️', 'Travel': '✈️',
	'Pets': '🐾', 'Education': '🎓', 'Finance': '📈', 'Automotive': '🚗', 'Kids/Baby': '🧸',
	'Jewelry/Watches': '💎', 'Jewelry': '💎', 'Real Estate': '🏠',
};
const nicheLabels: Record<string, string> = {
	'Accessories': 'Accesorios', 'Beauty': 'Belleza', 'Business/Professional': 'Negocios',
	'Entertainment': 'Entretenimiento', 'Fashion': 'Moda', 'Food/Drink': 'Comida y Bebida',
	'Health/Wellness': 'Salud y Bienestar', 'Medical': 'Médico', 'Service Business': 'Servicios',
	'Tech': 'Tecnología', 'Technology': 'Tecnología', 'App/Software': 'Apps y Software',
	'Home/Garden': 'Hogar y Jardín', 'Sports/Outdoors': 'Deporte y Aire Libre', 'Sports/Fitness': 'Deporte y Fitness',
	'Travel': 'Viajes', 'Pets': 'Mascotas', 'Education': 'Educación', 'Finance': 'Finanzas',
	'Automotive': 'Automotor', 'Kids/Baby': 'Niños y Bebés', 'Jewelry/Watches': 'Joyería y Relojes',
	'Jewelry': 'Joyería', 'Real Estate': 'Inmobiliaria',
};
const videoCategories = [
	{ id: 'hero', label: 'Producto héroe', icon: '🎯' },
	{ id: 'caracteristicas', label: 'Características', icon: '📋' },
	{ id: 'precio', label: 'Precio / Oferta', icon: '💸' },
	{ id: 'resenas', label: 'Reseñas', icon: '⭐' },
	{ id: 'mitos', label: 'Cazador de mitos', icon: '💭' },
	{ id: 'urgencia', label: 'Urgencia', icon: '⏰' },
	{ id: 'envio', label: 'Envío gratis', icon: '📦' },
	{ id: 'competencia', label: 'Nosotros vs Ellos', icon: '⚔️' },
	{ id: 'garantia', label: 'Garantía', icon: '🛡️' },
];
const categoryIcons: Record<string, string> = Object.fromEntries(videoCategories.map((c) => [c.id, c.icon]));
const categoryLabels: Record<string, string> = Object.fromEntries(videoCategories.map((c) => [c.id, c.label]));

type VideoItem = {
	name: string;
	videoPath: string;
	thumbnailPath: string | null;
	promptNotes?: string;
	category: string;
	metadata?: { foreplayNiches?: string[]; likes?: number; daysActive?: string; domain?: string; durationSec?: number };
};

export default function VideosLibrary() {
	const [items, setItems] = useState<VideoItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [selectedNiches, setSelectedNiches] = useState<string[]>(['todos']);
	const [selectedCategories, setSelectedCategories] = useState<string[]>(['todos']);
	const [showNicheMenu, setShowNicheMenu] = useState(false);
	const [showCategoryMenu, setShowCategoryMenu] = useState(false);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [lightbox, setLightbox] = useState<VideoItem | null>(null);
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(MANIFEST_URL)
			.then((res) => res.json())
			.then((data) => { if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []); })
			.catch(() => {})
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!showNicheMenu && !showCategoryMenu) return;
		const close = () => { setShowNicheMenu(false); setShowCategoryMenu(false); };
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showNicheMenu, showCategoryMenu]);

	const availableNiches = useMemo(() => [...new Set(items.flatMap((i) => i.metadata?.foreplayNiches || []))].sort(), [items]);

	const matchesNiche = (item: VideoItem) => selectedNiches.includes('todos') || !selectedNiches.length
		|| selectedNiches.some((n) => (item.metadata?.foreplayNiches || []).includes(n));
	const matchesCategory = (item: VideoItem) => selectedCategories.includes('todos') || !selectedCategories.length
		|| selectedCategories.includes(item.category);
	const term = query.toLowerCase().trim();
	const matchesSearch = (item: VideoItem) => !term || item.name.toLowerCase().includes(term) || (item.promptNotes || '').toLowerCase().includes(term);

	// Filtros en cascada: el conteo de cada opción refleja los OTROS filtros ya
	// aplicados, así "nichos" muestra cuántos hay dentro del ángulo elegido y viceversa.
	const nicheCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		items.filter((i) => matchesCategory(i) && matchesSearch(i)).forEach((i) => {
			(i.metadata?.foreplayNiches || []).forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
		});
		return counts;
	}, [items, selectedCategories, query]);

	const categoryCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		items.filter((i) => matchesNiche(i) && matchesSearch(i)).forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
		return counts;
	}, [items, selectedNiches, query]);

	const nicheAllCount = useMemo(() => items.filter((i) => matchesCategory(i) && matchesSearch(i)).length, [items, selectedCategories, query]);
	const categoryAllCount = useMemo(() => items.filter((i) => matchesNiche(i) && matchesSearch(i)).length, [items, selectedNiches, query]);

	const filteredItems = useMemo(
		() => items.filter((i) => matchesNiche(i) && matchesCategory(i) && matchesSearch(i)),
		[items, selectedNiches, selectedCategories, query]
	);

	useEffect(() => setVisibleCount(PAGE_SIZE), [selectedNiches, selectedCategories, query]);

	const visibleItems = filteredItems.slice(0, visibleCount);

	function copyScript(item: VideoItem) {
		if (!item.promptNotes) return;
		navigator.clipboard.writeText(item.promptNotes).then(() => {
			setCopiedPath(item.videoPath);
			window.setTimeout(() => setCopiedPath((curr) => (curr === item.videoPath ? null : curr)), 1800);
		}).catch(() => {});
	}

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>VIDEOS</p>
					<h1>Biblioteca de videos ganadores.</h1>
					<span>{items.length ? `${items.length} videos reales, filtrados por nicho y ángulo — mirá cómo lo cuentan otras marcas antes de grabar el tuyo.` : 'Videos de anuncios reales, ordenados por nicho y ángulo de venta.'}</span>
				</div>
			</div>

			{loading ? (
				<div className="studio-empty large"><span className="studio-spinner" style={{ width: '28px', height: '28px' }} aria-hidden="true" /><h3>Cargando videos…</h3></div>
			) : !items.length ? (
				<div className="studio-empty large"><span>🎬</span><h3>Todavía no hay videos</h3><p>Volvé a intentarlo en un rato.</p></div>
			) : (
				<>
					<div className="library-format-bar" style={{ marginBottom: '18px', flexWrap: 'wrap', gap: '10px', padding: '10px' }}>
						<div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
							<input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Buscar por marca o producto…"
								style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid #e2dde6', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
							/>
						</div>

						<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
							<button type="button" className="niche-dd-trigger" onClick={() => { setShowNicheMenu((v) => !v); setShowCategoryMenu(false); }}>
								<span className="niche-dd-label">{(() => { const a = selectedNiches.filter((x) => x !== 'todos'); return a.length === 0 ? 'Todos los nichos' : a.length === 1 ? (nicheLabels[a[0]] || a[0]) : `${a.length} nichos`; })()}</span>
								<span className="niche-dd-badge">{(() => { const a = selectedNiches.filter((x) => x !== 'todos'); return a.length === 0 ? nicheAllCount : a.reduce((s, x) => s + (nicheCounts[x] || 0), 0); })()}</span>
								<span className={`niche-dd-caret${showNicheMenu ? ' is-open' : ''}`}>▾</span>
							</button>
							{showNicheMenu && (
								<div className="niche-dd-menu">
									<button type="button" className={`niche-dd-item${selectedNiches.includes('todos') || !selectedNiches.length ? ' is-active' : ''}`} onClick={() => setSelectedNiches(['todos'])}>
										<span className="niche-dd-icon" aria-hidden>✨</span>
										<span className="niche-dd-name">Todos los nichos</span><span className="niche-dd-count">{nicheAllCount}</span>
										<span className="niche-dd-check">{selectedNiches.includes('todos') || !selectedNiches.length ? '✓' : ''}</span>
									</button>
									{availableNiches.map((niche) => {
										const active = selectedNiches.includes(niche);
										return (
											<button type="button" key={niche} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => {
												setSelectedNiches((prev) => {
													const cleaned = prev.filter((x) => x !== 'todos');
													if (cleaned.includes(niche)) { const next = cleaned.filter((x) => x !== niche); return next.length ? next : ['todos']; }
													return [...cleaned, niche];
												});
											}}>
												<span className="niche-dd-icon" aria-hidden>{nicheIcons[niche] || '🏷️'}</span>
												<span className="niche-dd-name">{nicheLabels[niche] || niche}</span><span className="niche-dd-count">{nicheCounts[niche] || 0}</span>
												<span className="niche-dd-check">{active ? '✓' : ''}</span>
											</button>
										);
									})}
								</div>
							)}
						</div>

						<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
							<button type="button" className="niche-dd-trigger" onClick={() => { setShowCategoryMenu((v) => !v); setShowNicheMenu(false); }}>
								<span className="niche-dd-label">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? 'Todos los ángulos' : a.length === 1 ? (categoryLabels[a[0]] || a[0]) : `${a.length} ángulos`; })()}</span>
								<span className="niche-dd-badge">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? categoryAllCount : a.reduce((s, x) => s + (categoryCounts[x] || 0), 0); })()}</span>
								<span className={`niche-dd-caret${showCategoryMenu ? ' is-open' : ''}`}>▾</span>
							</button>
							{showCategoryMenu && (
								<div className="niche-dd-menu">
									<button type="button" className={`niche-dd-item${selectedCategories.includes('todos') || !selectedCategories.length ? ' is-active' : ''}`} onClick={() => setSelectedCategories(['todos'])}>
										<span className="niche-dd-icon" aria-hidden>✨</span>
										<span className="niche-dd-name">Todos los ángulos</span><span className="niche-dd-count">{categoryAllCount}</span>
										<span className="niche-dd-check">{selectedCategories.includes('todos') || !selectedCategories.length ? '✓' : ''}</span>
									</button>
									{videoCategories.map((cat) => {
										const active = selectedCategories.includes(cat.id);
										return (
											<button type="button" key={cat.id} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => {
												setSelectedCategories((prev) => {
													const cleaned = prev.filter((x) => x !== 'todos');
													if (cleaned.includes(cat.id)) { const next = cleaned.filter((x) => x !== cat.id); return next.length ? next : ['todos']; }
													return [...cleaned, cat.id];
												});
											}}>
												<span className="niche-dd-icon" aria-hidden>{categoryIcons[cat.id] || '🏷️'}</span>
												<span className="niche-dd-name">{cat.label}</span><span className="niche-dd-count">{categoryCounts[cat.id] || 0}</span>
												<span className="niche-dd-check">{active ? '✓' : ''}</span>
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>

					{filteredItems.length === 0 ? (
						<div className="studio-empty large"><span>🔍</span><h3>No hay videos con esos filtros</h3><p>Probá con otro nicho o ángulo.</p></div>
					) : (
						<>
							<div className="library-ad-grid-masonry">
								{visibleItems.map((item) => (
									<VideoCard key={item.videoPath} item={item} onPlay={() => setLightbox(item)} onCopy={() => copyScript(item)} copied={copiedPath === item.videoPath} />
								))}
							</div>

							{visibleCount < filteredItems.length && (
								<div style={{ textAlign: 'center', marginTop: '24px' }}>
									<button type="button" className="url-batch-submit-btn" style={{ display: 'inline-flex' }} onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
										Cargar más ({filteredItems.length - visibleCount} restantes)
									</button>
								</div>
							)}
						</>
					)}
				</>
			)}

			{lightbox && (
				<div className="ref-modal" onClick={() => setLightbox(null)}>
					<div className="ref-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(420px, 92vw)', padding: '14px' }}>
						<div className="ref-modal-head">
							<div>
								<span className="ref-modal-kicker">🎬 {categoryLabels[lightbox.category] || lightbox.category}{lightbox.metadata?.domain ? ` · ${lightbox.metadata.domain}` : ''}</span>
								<h4>{lightbox.name}</h4>
							</div>
							<button type="button" onClick={() => setLightbox(null)} aria-label="Cerrar">✕</button>
						</div>
						<video
							key={lightbox.videoPath}
							src={`${VIDEOS_BASE}/${lightbox.videoPath}`}
							controls
							autoPlay
							playsInline
							style={{ width: '100%', maxHeight: '68vh', borderRadius: '12px', display: 'block', background: '#000' }}
						/>
						<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
							<a
								href={`${VIDEOS_BASE}/${lightbox.videoPath}`}
								download
								style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '10px', background: '#19171d', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}
							>
								Descargar
							</a>
							{lightbox.promptNotes && (
								<button
									type="button"
									onClick={() => copyScript(lightbox)}
									style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
								>
									{copiedPath === lightbox.videoPath ? '✓ Copiado' : 'Copiar guion'}
								</button>
							)}
						</div>
						{lightbox.promptNotes && (
							<p style={{ margin: 0, fontSize: '12.5px', color: '#716d79', lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: '160px', overflowY: 'auto' }}>
								{lightbox.promptNotes}
							</p>
						)}
					</div>
				</div>
			)}
		</>
	);
}

function VideoCard({ item, onPlay, onCopy, copied }: { item: VideoItem; onPlay: () => void; onCopy: () => void; copied: boolean }) {
	const posterUrl = item.thumbnailPath ? `${VIDEOS_BASE}/${item.thumbnailPath}` : '';
	const likes = item.metadata?.likes || 0;
	return (
		<article className="library-ad-card-masonry">
			<button type="button" className="library-ad-open" onClick={onPlay} aria-label={`Reproducir ${item.name}`} style={{ position: 'relative' }}>
				{posterUrl ? (
					<img src={posterUrl} alt={item.name} loading="lazy" style={{ aspectRatio: '9 / 16', objectFit: 'cover' }} />
				) : (
					<div style={{ aspectRatio: '9 / 16', background: 'linear-gradient(135deg,#f8f5fc,#efe7f8)', display: 'grid', placeItems: 'center' }}>🎬</div>
				)}
				<span className="library-media-badge"><i />VIDEO{item.metadata?.durationSec ? ` · ${Math.round(item.metadata.durationSec)}s` : ''}</span>
				<span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(20,15,23,0.18)', opacity: 0, transition: '.2s ease' }} className="video-play-hint">
					<span style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="#19171d"><path d="M8 5v14l11-7L8 5Z" /></svg>
					</span>
				</span>
			</button>
			<footer style={{ padding: '11px 12px' }}>
				<h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#19171d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h3>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
					<span style={{ fontSize: '11px', color: '#958e99' }}>{categoryIcons[item.category] || '🏷️'} {categoryLabels[item.category] || item.category}{likes > 0 ? ` · ❤️ ${likes >= 1000 ? `${Math.round(likes / 100) / 10}k` : likes}` : ''}</span>
				</div>
				{item.promptNotes && (
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); onCopy(); }}
						style={{ marginTop: '8px', width: '100%', padding: '6px 0', borderRadius: '8px', border: '1px solid #e4ddeb', background: copied ? '#e8f9f0' : '#faf7fd', color: copied ? '#1e7e4a' : '#6940bc', fontSize: '11px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
					>
						{copied ? '✓ Guion copiado' : '📋 Copiar guion'}
					</button>
				)}
			</footer>
		</article>
	);
}
