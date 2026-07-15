import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/creattia/supabase-browser';
import { creativeCatalog } from '../../lib/creattia/catalog';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
	const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
	if (name === 'home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>;
	if (name === 'grid') return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>;
	if (name === 'spark') return <svg {...common}><path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4L21 12l-4.4 1.5a5 5 0 0 0-3.4 3.4L12 21l-1.2-4.1a5 5 0 0 0-3.4-3.4L3 12l4.4-1.5a5 5 0 0 0 3.4-3.4L12 3Z"/></svg>;
	if (name === 'history') return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
	if (name === 'brand') return <svg {...common}><path d="M5 20h14"/><path d="M7 17V7l5-3 5 3v10"/><path d="M9.5 10h5M9.5 13h5"/></svg>;
	if (name === 'bag') return <svg {...common}><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
	if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
	if (name === 'arrow') return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
	if (name === 'upload') return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/></svg>;
	if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
	if (name === 'download') return <svg {...common}><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>;
	if (name === 'logout') return <svg {...common}><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4M8 12h10"/></svg>;
	if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
	if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
	if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
	if (name === 'external') return <svg {...common}><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>;
	if (name === 'heart') return <svg {...common}><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/></svg>;
	if (name === 'layers') return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
	return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

// Supported Winners Categories
const winnersCategories = [
	{ id: 'todos', label: 'Miles de ideas disponibles', templateIds: [] },
	{ id: 'vs', label: 'Nosotros vs Ellos', templateIds: [23, 24] },
	{ id: 'testimonios', label: 'Testimonios', templateIds: [1, 2, 3, 6, 7, 11, 12] },
	{ id: 'mas-vendidos', label: 'Más vendidos', templateIds: [9, 14, 17, 18, 19, 20] },
	{ id: 'multimedia', label: 'Multimedia', templateIds: [10] },
	{ id: 'gancho-negativo', label: 'Gancho negativo', templateIds: [31] },
	{ id: 'mitos', label: 'Cazador de mitos', templateIds: [32, 33, 37] },
	{ id: 'caracteristicas', label: 'Características', templateIds: [41, 43, 46] },
	{ id: 'notas', label: 'Notas', templateIds: [4, 5, 8, 39] },
	{ id: 'contenido', label: 'Qué contiene', templateIds: [41, 43] },
	{ id: 'preguntas', label: 'Preguntas frecuentes', templateIds: [30] },
	{ id: 'antes-despues', label: 'Antes y después', templateIds: [28, 29] },
	{ id: 'top-razones', label: 'Top razones', templateIds: [38] },
	{ id: 'problema-solucion', label: 'Problema-solución', templateIds: [30, 31, 34] },
	{ id: 'estadisticas', label: 'Estadísticas', templateIds: [9, 38] }
];

type WinnerItem = {
	templateId: number;
	name: string;
	imagePath: string;
	promptNotes: string | null;
	categoryGroup: string | null;
	categoryBranch: string | null;
	categoryLeaf: string | null;
	metadata: {
		scrapedAt?: string;
		addedBy?: string;
		industry?: string;
		logoUrl?: string;
	};
};

export default function WinnersLibrary({
	session,
	onChoose,
	onView
}: {
	session: any;
	onChoose: (creative: any) => void;
	onView: (view: any) => void;
}) {
	const [items, setItems] = useState<WinnerItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeCategory, setActiveCategory] = useState('todos');
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');
	
	// Admin form states
	const [showAddModal, setShowAddModal] = useState(false);
	const [newAdName, setNewAdName] = useState('');
	const [newAdCopy, setNewAdCopy] = useState('');
	const [newAdTemplateId, setNewAdTemplateId] = useState('40'); // default hero
	const [newAdFile, setNewAdFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const userEmail = session?.user?.email || '';
	const isAdmin = userEmail.toLowerCase().trim() === 'lucagazze1@gmail.com';

	const loadWinners = async () => {
		if (!supabase) return;
		try {
			setLoading(true);
			const { data: manifestUrl } = supabase.storage.from('creative-references').getPublicUrl('manifests/starter-static-50.json');
			const res = await fetch(manifestUrl.publicUrl + '?t=' + Date.now());
			if (!res.ok) throw new Error('No se pudo descargar el catálogo de ganadores.');
			const data = await res.json();
			setItems(data.items || []);
		} catch (err: any) {
			setError(err.message || 'Error cargando ganadores.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadWinners();
	}, []);

	// Filter items
	const filteredItems = useMemo(() => {
		return items.filter(item => {
			// Category filter
			const cat = winnersCategories.find(c => c.id === activeCategory);
			const matchesCategory = !cat || cat.id === 'todos' || cat.templateIds.includes(item.templateId);

			// Search query filter
			const search = query.toLowerCase().trim();
			const matchesSearch = !search || 
				item.name.toLowerCase().includes(search) || 
				(item.promptNotes || '').toLowerCase().includes(search) ||
				(item.categoryLeaf || '').toLowerCase().includes(search);

			return matchesCategory && matchesSearch;
		});
	}, [items, activeCategory, query]);

	// Delete winner handler
	const handleDelete = async (imagePath: string) => {
		if (!window.confirm('¿Seguro que querés eliminar este anuncio de la biblioteca de ganadores?')) return;
		try {
			const res = await fetch(`/api/creativos/references?imagePath=${encodeURIComponent(imagePath)}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				}
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar.');
			
			// Update local state
			setItems(prev => prev.filter(item => item.imagePath !== imagePath));
		} catch (err: any) {
			alert(err.message);
		}
	};

	// Add winner handler
	const handleAddSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newAdName) return alert('Por favor ingresá la marca.');
		if (!newAdFile) return alert('Por favor subí una imagen.');
		
		try {
			setSubmitting(true);
			const formData = new FormData();
			formData.append('name', newAdName);
			formData.append('promptNotes', newAdCopy);
			formData.append('templateId', newAdTemplateId);
			formData.append('image', newAdFile);
			
			// Find taxonomy from selected template
			const temp = creativeCatalog.find(c => c.id === Number(newAdTemplateId));
			if (temp) {
				formData.append('categoryGroup', temp.categoryGroup || 'producto');
				formData.append('categoryBranch', temp.categoryBranch || 'presentar');
				formData.append('categoryLeaf', temp.categoryLeaf || 'hero');
			}

			const res = await fetch('/api/creativos/references', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				},
				body: formData
			});
			
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al agregar.');

			alert('¡Anuncio ganador agregado con éxito!');
			setShowAddModal(false);
			setNewAdName('');
			setNewAdCopy('');
			setNewAdFile(null);
			void loadWinners();
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="winners-library-container">
			<div className="studio-page-heading">
				<div>
					<p>Catálogo de Alto Rendimiento</p>
					<h1>Biblioteca de ganadores</h1>
					<span>Inspirate en más de {items.length} anuncios ganadores reales y usalos como plantilla.</span>
				</div>
				{isAdmin && (
					<button className="studio-primary-button compact" onClick={() => setShowAddModal(true)}>
						<Icon name="plus" size={16} />
						Agregar Ganador
					</button>
				)}
			</div>

			<div className="studio-library-tools">
				<label>
					<Icon name="search" size={18} />
					<input 
						value={query} 
						onChange={(e) => setQuery(e.target.value)} 
						placeholder="Buscar por marca o palabra clave..." 
					/>
				</label>
				<span>{filteredItems.length} ganadores encontrados</span>
			</div>

			{/* Category rail */}
			<div className="studio-filter-row">
				{winnersCategories.map(cat => (
					<button 
						key={cat.id}
						className={activeCategory === cat.id ? 'active' : ''}
						onClick={() => setActiveCategory(cat.id)}
					>
						{cat.label}
					</button>
				))}
			</div>

			{loading ? (
				<div className="studio-boot" style={{ minHeight: '300px', background: 'transparent' }}>
					<span className="studio-spinner" />
					<p>Cargando anuncios ganadores...</p>
				</div>
			) : error ? (
				<div className="studio-empty large">
					<Icon name="close" size={40} />
					<h3>Error de conexión</h3>
					<p>{error}</p>
					<button onClick={() => void loadWinners()}>Reintentar</button>
				</div>
			) : filteredItems.length === 0 ? (
				<div className="studio-empty large">
					<Icon name="search" size={40} />
					<h3>No encontramos anuncios</h3>
					<p>Probá cambiando la categoría o la palabra clave de búsqueda.</p>
					<button onClick={() => { setActiveCategory('todos'); setQuery(''); }}>Limpiar filtros</button>
				</div>
			) : (
				<div className="library-ad-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
					{filteredItems.map((item, idx) => {
						const imageUrl = supabase 
							? supabase.storage.from('creative-references').getPublicUrl(item.imagePath).data.publicUrl
							: '';
						const templateName = creativeCatalog.find(c => c.id === item.templateId)?.nombre || 'Idea Creativa';
						
						return (
							<article 
								className="library-ad-card" 
								key={item.imagePath || idx}
								style={{ 
									background: '#fff', 
									borderRadius: '16px', 
									border: '1px solid #e5dfe8', 
									overflow: 'hidden',
									display: 'flex',
									flexDirection: 'column',
									position: 'relative'
								}}
							>
								{/* Card header (Social Proof looks like FB ad) */}
								<div 
									style={{ 
										padding: '12px', 
										display: 'flex', 
										alignItems: 'center', 
										gap: '10px', 
										borderBottom: '1px solid #f3eff6' 
									}}
								>
									<span 
										style={{ 
											width: '32px', 
											height: '32px', 
											borderRadius: '50%', 
											background: '#ece7f4', 
											color: '#6d35e8', 
											fontWeight: 'bold', 
											display: 'grid', 
											placeItems: 'center',
											fontSize: '11px',
											overflow: 'hidden'
										}}
									>
										{item.metadata?.logoUrl ? (
											<img src={item.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
										) : (
											item.name.slice(0, 1).toUpperCase()
										)}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{item.name}
										</strong>
										<span style={{ fontSize: '9px', color: '#918b95' }}>Patrocinado</span>
									</div>

									{isAdmin && (
										<button 
											onClick={() => handleDelete(item.imagePath)}
											style={{ 
												border: 0, 
												background: 'transparent', 
												color: '#dc2626', 
												cursor: 'pointer',
												padding: '4px'
											}}
											title="Eliminar ganador"
										>
											<Icon name="close" size={16} />
										</button>
									)}
								</div>

								{/* Image visual */}
								<div 
									style={{ 
										aspectRatio: '9/16', 
										background: '#f8f6fb', 
										position: 'relative',
										overflow: 'hidden' 
									}}
								>
									<img 
										src={imageUrl} 
										alt={item.name} 
										style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
										loading="lazy" 
									/>
									<span 
										style={{ 
											position: 'absolute', 
											left: '10px', 
											bottom: '10px', 
											fontSize: '9px', 
											background: 'rgba(28,21,32,.78)', 
											color: '#fff', 
											padding: '4px 8px', 
											borderRadius: '6px',
											fontWeight: 700 
										}}
									>
										{templateName}
									</span>
								</div>

								{/* Copy text and actions */}
								<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
									<p 
										style={{ 
											fontSize: '11px', 
											color: '#4a444f', 
											margin: '0 0 12px 0', 
											lineHeight: '1.45',
											maxHeight: '44px',
											overflow: 'hidden',
											display: '-webkit-box',
											WebkitLineClamp: 2,
											WebkitBoxOrient: 'vertical'
										}}
									>
										{item.promptNotes || 'Inspiración publicitaria ganadora.'}
									</p>
									<button 
										onClick={() => {
											// Open the studio using this template
											const creative = creativeCatalog.find(c => c.id === item.templateId) || creativeCatalog[0];
											onChoose(creative);
										}}
										style={{ 
											width: '100%', 
											height: '35px', 
											background: '#f2ecfc', 
											border: 0, 
											borderRadius: '8px', 
											color: '#6d35e8', 
											fontWeight: 'bold', 
											fontSize: '10.5px', 
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											gap: '6px'
										}}
									>
										Crear con esta idea
										<Icon name="arrow" size={13} />
									</button>
								</div>
							</article>
						);
					})}
				</div>
			)}

			{/* Add winner modal */}
			{showAddModal && (
				<div 
					style={{
						position: 'fixed',
						inset: 0,
						background: 'rgba(0,0,0,0.5)',
						display: 'grid',
						placeItems: 'center',
						zIndex: 100,
						backdropFilter: 'blur(4px)'
					}}
				>
					<div 
						style={{
							background: '#fff',
							padding: '24px',
							borderRadius: '16px',
							width: '100%',
							maxWidth: '460px',
							border: '1px solid #e5dfe8',
							boxShadow: '0 12px 30px rgba(0,0,0,0.15)'
						}}
					>
						<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
							<h3 style={{ margin: 0, fontSize: '16px' }}>Agregar anuncio ganador</h3>
							<button 
								onClick={() => setShowAddModal(false)}
								style={{ border: 0, background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}
							>
								<Icon name="close" size={18} />
							</button>
						</header>

						<form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Marca / Nombre del anuncio
								<input 
									type="text"
									value={newAdName}
									onChange={(e) => setNewAdName(e.target.value)}
									placeholder="ej. Slack, Coca Cola, True Classic"
									style={{ height: '38px', padding: '0 12px', border: '1px solid #ded7e2', borderRadius: '8px' }}
									required
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Copy / Texto principal
								<textarea 
									value={newAdCopy}
									onChange={(e) => setNewAdCopy(e.target.value)}
									placeholder="ej. ¿Cansado de reuniones eternas? Pasate a Slack hoy."
									style={{ minHeight: '60px', padding: '10px 12px', border: '1px solid #ded7e2', borderRadius: '8px', resize: 'none' }}
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Ángulo / Plantilla asociada
								<select
									value={newAdTemplateId}
									onChange={(e) => setNewAdTemplateId(e.target.value)}
									style={{ height: '38px', padding: '0 10px', border: '1px solid #ded7e2', borderRadius: '8px' }}
								>
									{creativeCatalog.map(c => (
										<option key={c.id} value={c.id}>
											#{String(c.id).padStart(2, '0')} - {c.nombre}
										</option>
									))}
								</select>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Imagen del anuncio (formato vertical 9:16 preferido)
								<input 
									type="file"
									accept="image/png, image/jpeg, image/webp"
									onChange={(e) => setNewAdFile(e.target.files?.[0] || null)}
									style={{ fontSize: '11px' }}
									required
								/>
							</label>

							<button 
								type="submit" 
								className="studio-primary-button" 
								style={{ height: '42px', marginTop: '10px' }}
								disabled={submitting}
							>
								{submitting ? 'Guardando...' : 'Guardar en la biblioteca'}
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
