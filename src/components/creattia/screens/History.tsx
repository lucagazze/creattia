import { useReferenceUrl } from '../../../lib/creattia/reference-urls';
import UrlInput from '../UrlInput';
import { Icon } from '../Icon';
import { getSessionToken } from '../app-session';
import type { ActiveBatch, AppSession, Generation, Product } from '../app-types';
import { groupCarouselHistory } from '../history-utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadImage } from '../download';
import { signOriginalGeneration, useFullGenerationUrl } from '../../../lib/creattia/generation-image';
/** Historial de generaciones: tarjetas, lightbox y la referencia ganadora. */

export function History({ 
	history, 
	onCreate, 
	onReuse, 
	onExpand, 
	pending, 
	onViewProgress,
	likedImageIds = [],
	onToggleLike,
	likedReferencePaths = new Set<string>(),
	onToggleReferenceLike,
	onUseReference,
	onDeleteImage,
	activeBatch,
	stuckCount,
	onCleanupStuck,
}: { 
	history: Generation[]; 
	onCreate: () => void; 
	onReuse: (item: Generation) => void; 
	onExpand?: (item: Generation, slides?: Generation[]) => void;
	pending?: { count: number; title: string; referenceUrl?: string; startedAt?: number } | null; 
	onViewProgress?: () => void;
	likedImageIds?: string[];
	onToggleLike?: (id: string) => void;
	likedReferencePaths?: Set<string>;
	onToggleReferenceLike?: (path: string) => void;
	onUseReference?: (path: string) => void;
	onDeleteImage?: (imgIds: string | string[]) => void;
	activeBatch?: ActiveBatch | null;
	stuckCount?: number;
	onCleanupStuck?: (generationId?: string) => void;
}) {
	const [currentFolderId, setCurrentFolderId] = useState<string>('all');
	// Selección múltiple para borrar varias de una: se guardan las "keys" de
	// grupo (id de la imagen, o batchId si es un carrusel agrupado).
	const [multiSelectMode, setMultiSelectMode] = useState(false);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const toggleMultiSelect = () => { setMultiSelectMode((v) => !v); setSelectedKeys(new Set()); };

	const filteredHistory = history.filter((item) => {
		if (currentFolderId === 'all') return true;
		if (currentFolderId === 'liked') return likedImageIds.includes(item.id);
		return true;
	});

	const hasContent = filteredHistory.length > 0 || Boolean(pending);
	const pendingPlaceholders = pending && filteredHistory.length === 0
		? Array.from({ length: Math.min(Math.max(pending.count, 1), 40) })
		: [];

	const historyGroups = useMemo(() => groupCarouselHistory(filteredHistory), [filteredHistory]);

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>MIS IMÁGENES</p>
					<h1>Todo lo que creaste.</h1>
					<span>Tocá una imagen para verla grande, descargarla o crear otra versión.</span>
				</div>
				<div style={{ display: 'flex', gap: '8px' }}>
					<button
						className="studio-primary-button compact"
						onClick={toggleMultiSelect}
						style={{ background: multiSelectMode ? '#19171d' : '#fff', color: multiSelectMode ? '#fff' : '#19171d', border: '1.5px solid #dcd5e4' }}
					>
						{multiSelectMode ? 'Cancelar selección' : 'Seleccionar'}
					</button>
					<button className="studio-primary-button compact" onClick={onCreate} style={{ background: '#744bde' }}>
						<Icon name="plus" size={17}/>
						Crear imagen
					</button>
				</div>
			</div>

			{multiSelectMode && (
				<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', padding: '10px 16px', borderRadius: '12px', background: '#f4f0ff', border: '1px solid #e1d7fb' }}>
					<strong style={{ fontSize: '13.5px', color: '#4c2f9e' }}>{selectedKeys.size} {selectedKeys.size === 1 ? 'seleccionada' : 'seleccionadas'}</strong>
					<button
						type="button"
						disabled={!selectedKeys.size}
						onClick={() => {
							if (!onDeleteImage) return;
							const ids = historyGroups
								.filter((g) => selectedKeys.has(g.key))
								.flatMap((g) => (g.slides || [g.item]).map((s) => s.id));
							onDeleteImage(ids);
							setSelectedKeys(new Set());
							setMultiSelectMode(false);
						}}
						style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: '9px', border: 0, background: selectedKeys.size ? '#dc2626' : '#e9c9c9', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: selectedKeys.size ? 'pointer' : 'default', fontFamily: 'inherit' }}
					>
						🗑️ Eliminar seleccionadas
					</button>
				</div>
			)}

			{/* Library filters */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px', alignItems: 'center', background: '#fcfbfe', padding: '10px 14px', borderRadius: '12px', border: '1px solid #eee9f3' }}>
				<button
					type="button"
					className={`history-filter-pill${currentFolderId === 'all' ? ' is-active' : ''}`}
					onClick={() => setCurrentFolderId('all')}
				>
					Todas ({history.length})
				</button>
				<button 
					onClick={() => setCurrentFolderId('liked')} 
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						const imgId = e.dataTransfer.getData("text/plain");
						if (imgId && onToggleLike && !likedImageIds.includes(imgId)) {
							onToggleLike(imgId);
						}
					}}
					type="button"
					className={`history-filter-pill is-liked${currentFolderId === 'liked' ? ' is-active' : ''}`}
				>
					❤️ Favoritas ({history.filter(h => likedImageIds.includes(h.id)).length})
				</button>

				{Boolean(stuckCount) && onCleanupStuck && (
					<button
						type="button"
						onClick={() => onCleanupStuck()}
						title="Cierra las generaciones que quedaron a medias y te devuelve los créditos"
						style={{
							padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #f0d8a8',
							background: '#fff9ee', color: '#9a6b12', fontSize: '12.5px', fontWeight: 800,
							cursor: 'pointer', fontFamily: 'inherit', marginBottom: '20px',
						}}
					>
						🧹 Limpiar {stuckCount} {stuckCount === 1 ? 'pendiente' : 'pendientes'}
					</button>
				)}
			</div>

			{hasContent ? (
				<div className="studio-history-grid">
						{historyGroups.map((group) => (
						<GenerationCard
							key={group.key}
							item={group.item}
							slides={group.slides}
							isLiked={likedImageIds.includes(group.item.id)}
							onToggleLike={onToggleLike ? () => onToggleLike(group.item.id) : undefined}
							likedReferencePaths={likedReferencePaths}
							onToggleReferenceLike={onToggleReferenceLike}
							onUseReference={onUseReference}
							onExpand={onExpand}
							onReuse={onReuse}
							onDeleteImage={group.slides ? (onDeleteImage ? () => onDeleteImage(group.slides!.map((s) => s.id)) : undefined) : onDeleteImage}
							onCancel={onCleanupStuck ? (group.slides ? () => group.slides!.forEach((s) => onCleanupStuck(s.id)) : () => onCleanupStuck(group.item.id)) : undefined}
							selectMode={multiSelectMode}
							selected={selectedKeys.has(group.key)}
							onToggleSelect={() => setSelectedKeys((prev) => {
								const next = new Set(prev);
								if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
								return next;
							})}
							/>
						))}
					{pendingPlaceholders.map((_, index) => (
						<GenerationCard
							key={`pending-${index}`}
							item={{
								id: `pending-${index}`,
								title: pending!.title,
								imageUrl: '',
								format: 'square',
								createdAt: new Date(pending!.startedAt || Date.now()).toISOString(),
								category: 'Creativo',
								status: 'processing',
							}}
						/>
					))}
				</div>
			) : (
				// El vacío depende del filtro: "Carpeta vacía" con "Todas" seleccionada
				// mandaba a asignar imágenes a una carpeta cuando lo que faltaba era
				// haber creado la primera.
				currentFolderId === 'all' ? (
					<div className="studio-empty large">
						<span>🎨</span>
						<h3>Todavía no creaste ninguna imagen</h3>
						<p>Cuando generes tu primera, va a aparecer acá con todo lo que hagas después.</p>
					</div>
				) : currentFolderId === 'liked' ? (
					<div className="studio-empty large">
						<span>❤️</span>
						<h3>No marcaste ninguna favorita</h3>
						<p>Tocá el corazón en cualquier creación para tenerla siempre a mano.</p>
					</div>
				) : (
					<div className="studio-empty large">
						<span>📁</span>
						<h3>Carpeta vacía</h3>
						<p>Asigná tus creaciones a esta carpeta usando el icono 📁 en cada imagen.</p>
					</div>
				)
			)}
		</>
	);
}


// Descarga sin abrir pestaña nueva (las URLs firmadas de Supabase son cross-origin
// y el atributo download solo no alcanza).

export function WinnerReferenceModal({
	reference,
	isLiked,
	onClose,
	onToggleLike,
	onUse,
}: {
	reference: { path: string; name: string };
	isLiked?: boolean;
	onClose: () => void;
	onToggleLike?: (path: string) => void;
	onUse?: (path: string) => void;
}) {
	// El bucket es privado: la referencia se muestra con URL firmada.
	const referenceUrl = useReferenceUrl(reference.path);
	return (
		<div className="ref-modal" onClick={(event) => { event.stopPropagation(); onClose(); }} role="dialog" aria-modal="true" aria-label="Anuncio ganador de referencia">
			<div className="ref-modal-box" onClick={(event) => event.stopPropagation()}>
				<div className="ref-modal-head">
					<div>
						<span className="ref-modal-kicker">🏆 ANUNCIO GANADOR DE REFERENCIA</span>
						<h4>{reference.name || 'Idea ganadora de la biblioteca'}</h4>
					</div>
					<button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
				</div>
				<div className="ref-modal-visual">
					<img src={referenceUrl} alt={reference.name || 'Anuncio ganador'} />
				</div>
				<div className="ref-modal-context">
					<span>REFERENCIA ORIGINAL</span>
					<p>Guardala para volver después o usala ahora como punto de partida para una imagen nueva.</p>
				</div>
				<div className="ref-modal-actions">
					{onToggleLike && (
						<button
							type="button"
							className={`ref-modal-like ${isLiked ? 'active' : ''}`}
							onClick={() => onToggleLike(reference.path)}
							aria-pressed={Boolean(isLiked)}
						>
							<Icon name="heart" size={16} fill={isLiked ? 'currentColor' : 'none'} />
							{isLiked ? 'Te gusta' : 'Me gusta'}
						</button>
					)}
					{onUse && (
						<button type="button" className="ref-modal-use" onClick={() => { onClose(); onUse(reference.path); }}>
							Usar esta idea <Icon name="arrow" size={16} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

export function GenerationCard({
	item,
	slides,
	onReuse,
	onExpand,
	isLiked,
	onToggleLike,
	likedReferencePaths = new Set<string>(),
	onToggleReferenceLike,
	onUseReference,
	folders = [],
	onToggleFolder,
	onDeleteImage,
	onCancel,
	selectMode,
	selected,
	onToggleSelect,
}: {
	item: Generation;
	/** Cuando el creativo es un carrusel: todas sus páginas, ordenadas. La tarjeta pagina entre ellas como un solo creativo. */
	slides?: Generation[];
	onReuse?: (gen: Generation) => void;
	onExpand?: (gen: Generation, slides?: Generation[]) => void;
	isLiked?: boolean;
	onToggleLike?: () => void;
	likedReferencePaths?: Set<string>;
	onToggleReferenceLike?: (path: string) => void;
	onUseReference?: (path: string) => void;
	folders?: Array<{ id: string; name: string; imageIds: string[] }>;
	onToggleFolder?: (folderId: string) => void;
	onDeleteImage?: (imgIds: string | string[]) => void;
	/** Cierra una generación que quedó colgada y devuelve el crédito. */
	onCancel?: () => void;
	/** Selección múltiple para borrado masivo: al estar activa, tocar la tarjeta selecciona en vez de abrir. */
	selectMode?: boolean;
	selected?: boolean;
	onToggleSelect?: () => void;
}) {
	const [showFolderDropdown, setShowFolderDropdown] = useState(false);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	// El anuncio ganador de referencia se ve en un modal, no en una pestaña nueva.
	const [refPreview, setRefPreview] = useState<{ path: string; name: string } | null>(null);
	const [slideIndex, setSlideIndex] = useState(0);
	const isCarousel = Boolean(slides && slides.length > 1);
	const active = isCarousel ? slides![Math.min(slideIndex, slides!.length - 1)] : item;
	const referenceThumbUrl = useReferenceUrl(active.referencePath);
	const deleteIds = isCarousel ? slides!.map((slide) => slide.id) : active.id;
	// Precarga el resto de las páginas del carrusel apenas se ve la tarjeta:
	// sin esto, cada vez que tocás la flecha se descargaba la imagen recién
	// en ese momento y se sentía trabado en vez de pasar al toque.
	useEffect(() => {
		if (!isCarousel) return;
		slides!.forEach((slide) => { if (slide.imageUrl) { const img = new Image(); img.src = slide.imageUrl; } });
	}, [isCarousel, slides]);
	const goToSlide = (delta: number) => {
		if (!isCarousel) return;
		setSlideIndex((prev) => (prev + delta + slides!.length) % slides!.length);
	};

	useEffect(() => {
		if (!showFolderDropdown) return;
		const close = () => setShowFolderDropdown(false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showFolderDropdown]);

	useEffect(() => {
		if (!contextMenu) return;
		const close = () => setContextMenu(null);
		window.addEventListener('click', close);
		window.addEventListener('contextmenu', close);
		return () => {
			window.removeEventListener('click', close);
			window.removeEventListener('contextmenu', close);
		};
	}, [contextMenu]);

	return (
		<article 
			className="studio-generation-card"
			draggable="true"
			onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", item.id);
			}}
			onContextMenu={(e) => {
				e.preventDefault();
				setContextMenu({ x: e.clientX, y: e.clientY });
			}}
			style={{ position: 'relative', outline: selectMode && selected ? '3px solid #744bde' : undefined, borderRadius: selectMode && selected ? '14px' : undefined }}
		>
							<div style={{ cursor: selectMode ? 'pointer' : onExpand ? 'zoom-in' : 'default', position: 'relative' }} onClick={selectMode ? onToggleSelect : (onExpand ? () => onExpand(active, slides) : undefined)}>
				{selectMode ? (
					<div
						style={{
							position: 'absolute', top: '8px', left: '8px', zIndex: 10,
							width: '26px', height: '26px', borderRadius: '50%',
							background: selected ? '#744bde' : 'rgba(255,255,255,0.9)',
							border: selected ? 'none' : '2px solid #d8d2e0',
							color: '#fff', display: 'grid', placeItems: 'center',
							boxShadow: '0 2px 6px rgba(0,0,0,0.1)', fontSize: '13px', fontWeight: 800,
						}}
					>
						{selected ? '✓' : ''}
					</div>
				) : onToggleLike && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleLike();
						}}
						style={{
							position: 'absolute',
							top: '8px',
							left: '8px',
							zIndex: 10,
							border: 0,
							background: 'rgba(255,255,255,0.9)',
							color: isLiked ? '#ff4185' : '#716d79',
							borderRadius: '50%',
							width: '28px',
							height: '28px',
							display: 'grid',
							placeItems: 'center',
							cursor: 'pointer',
							boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
						}}
						title={isLiked ? "Quitar de favoritos" : "Añadir a favoritos"}
					>
						<Icon name="heart" size={13} fill={isLiked ? '#ff4185' : 'none'} />
					</button>
				)}

				{onToggleFolder && folders.length > 0 && (
					<div style={{ position: 'absolute', top: '8px', right: '40px', zIndex: 10 }}>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowFolderDropdown(!showFolderDropdown);
							}}
							style={{
								border: 0,
								background: 'rgba(255,255,255,0.9)',
								color: '#716d79',
								borderRadius: '50%',
								width: '28px',
								height: '28px',
								display: 'grid',
								placeItems: 'center',
								cursor: 'pointer',
								boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
							}}
							title="Organizar en carpeta"
						>
							📁
						</button>
						{showFolderDropdown && (
							<div 
								onClick={(e) => e.stopPropagation()}
								style={{
									position: 'absolute',
									top: '32px',
									right: 0,
									background: '#fff',
									border: '1px solid #e9e6ed',
									borderRadius: '8px',
									boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
									padding: '6px',
									minWidth: '150px',
									zIndex: 100
								}}
							>
								<p style={{ margin: '4px 6px 6px', fontSize: '11px', color: '#8b8490', fontWeight: 'bold' }}>CARPETAS:</p>
								{folders.map(f => {
									const inFolder = f.imageIds.includes(item.id);
									return (
										<label 
											key={f.id} 
											style={{
												display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
												borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d',
												fontWeight: 500, userSelect: 'none'
											}}
										>
											<input 
												type="checkbox" 
												checked={inFolder} 
												onChange={() => onToggleFolder(f.id)} 
												style={{ cursor: 'pointer' }}
											/>
											<span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</span>
										</label>
									);
								})}
							</div>
						)}
					</div>
				)}

				{!active.imageUrl && active.status === 'failed' ? (
					<div className="studio-generation-error" role="status">
						<span aria-hidden>!</span>
						<strong>No se pudo generar</strong>
						<small>{active.error || 'Probá de nuevo en unos segundos.'}</small>
						{onCancel && <button type="button" onClick={(event) => { event.stopPropagation(); onCancel(); }}>Limpiar</button>}
					</div>
				) : !active.imageUrl ? (
					<div
						style={{
							width: '100%',
							height: '100%',
							minHeight: '220px',
							boxSizing: 'border-box',
							background: 'linear-gradient(135deg, #f8f5fc 0%, #efe7f8 100%)',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '10px',
							padding: '20px',
							textAlign: 'center',
							borderRadius: '8px'
						}}
					>
						<span className="studio-spinner" style={{ width: '28px', height: '28px' }} />
						<strong style={{ fontSize: '12.5px', color: '#19171d' }}>Generando anuncio…</strong>
						{onCancel && (
							<button
								type="button"
								onClick={(event) => { event.stopPropagation(); onCancel(); }}
								style={{
									marginTop: '4px', padding: '5px 11px', borderRadius: '8px',
									border: '1.5px solid #e6e0f2', background: '#fff', color: '#6b6478',
									fontSize: '10.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
								}}
							>
								Cancelar
							</button>
						)}
					</div>
				) : (
					<>
						<img src={active.imageUrl} alt={item.title} loading="lazy"/>
						{isCarousel && (
							<>
								<button type="button" className="carousel-arrow carousel-arrow-prev" aria-label="Página anterior" onClick={(event) => { event.preventDefault(); event.stopPropagation(); goToSlide(-1); }}>‹</button>
								<button type="button" className="carousel-arrow carousel-arrow-next" aria-label="Página siguiente" onClick={(event) => { event.preventDefault(); event.stopPropagation(); goToSlide(1); }}>›</button>
								<span style={{ position: 'absolute', top: '8px', left: '44px', zIndex: 10, background: 'rgba(25,23,29,0.75)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
									🖼️ {slideIndex + 1}/{slides!.length}
								</span>
							</>
						)}
						<a href={active.imageUrl} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void downloadImage(active.imageUrl, `creattia-${active.id}.png`); }} aria-label={`Descargar ${item.title}`}><Icon name="download" size={17}/></a>
						{active.referencePath && (
							<button
								type="button"
								className="studio-card-ref"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setRefPreview({ path: active.referencePath!, name: active.referenceName || '' });
								}}
								title={`Inspirado en el anuncio ganador${active.referenceName ? ` de ${active.referenceName}` : ''} — tocá para verlo`}
							>
								<img src={referenceThumbUrl} alt="" loading="lazy" />
								<span>🏆 Referencia</span>
							</button>
						)}
						{onDeleteImage && (
							<button
								type="button"
								className="studio-card-delete"
								onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteImage(deleteIds); }}
								aria-label={`Eliminar ${item.title}`}
								title={isCarousel ? 'Eliminar carrusel' : 'Eliminar imagen'}
							>
								<Icon name="trash" size={15}/>
							</button>
						)}
					</>
				)}
			</div>
			<footer>
				<h3>{item.title}{isCarousel && <em style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 700, fontStyle: 'normal', color: '#8b6fd8' }}>· Carrusel</em>}</h3>
				<span>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(item.createdAt))}</span>
				{(onExpand || onReuse) && <button onClick={() => (onExpand || onReuse)?.(active)}><Icon name="history" size={14}/>Crear otra versión</button>}
			</footer>
			{refPreview && <WinnerReferenceModal
				reference={refPreview}
				isLiked={likedReferencePaths.has(refPreview.path)}
				onClose={() => setRefPreview(null)}
				onToggleLike={onToggleReferenceLike}
				onUse={onUseReference}
			/>}

			{/* Context menu for right-click premium features */}
			{contextMenu && (
				<div 
					style={{
						position: 'fixed',
						top: `${contextMenu.y}px`,
						left: `${contextMenu.x}px`,
						zIndex: 1000,
						background: '#fff',
						border: '1px solid #e9e6ed',
						borderRadius: '12px',
						boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
						padding: '6px',
						minWidth: '180px',
						display: 'flex',
						flexDirection: 'column',
						gap: '2px'
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<div style={{ padding: '6px 10px', fontSize: '11px', color: '#8b8490', fontWeight: 'bold', borderBottom: '1px solid #f4eff6', marginBottom: '4px' }}>
						OPCIONES DE ANUNCIO
					</div>
					
					{folders.length > 0 && (
						<>
							<div style={{ padding: '6px 10px', fontSize: '11.5px', color: '#716d79', fontWeight: 700 }}>
								📁 Clasificar en carpeta:
							</div>
							{folders.map(f => {
								const inFolder = f.imageIds.includes(item.id);
								return (
									<button
										key={f.id}
										type="button"
										onClick={() => {
											if (onToggleFolder) onToggleFolder(f.id);
											setContextMenu(null);
										}}
										style={{
											display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
											background: inFolder ? '#f3efff' : 'transparent', border: 0,
											borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: inFolder ? '#744bde' : '#19171d',
											fontWeight: inFolder ? 700 : 500, textAlign: 'left', width: '100%', fontFamily: 'inherit'
										}}
									>
										<input 
											type="checkbox" 
											checked={inFolder} 
											readOnly 
											style={{ pointerEvents: 'none' }}
										/>
										{f.name}
									</button>
								);
							})}
							<div style={{ height: '1px', background: '#f4eff6', margin: '4px 0' }} />
						</>
					)}
					
					{onToggleLike && (
						<button
							type="button"
							onClick={() => {
								onToggleLike();
								setContextMenu(null);
							}}
							style={{
								display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
								background: 'transparent', border: 0, borderRadius: '6px', cursor: 'pointer',
								fontSize: '12.5px', color: '#19171d', fontWeight: 500, textAlign: 'left', width: '100%', fontFamily: 'inherit'
							}}
						>
							<Icon name="heart" size={13} fill={isLiked ? '#ff4185' : 'none'} />
							{isLiked ? 'Quitar de favoritos' : 'Añadir a favoritos'}
						</button>
					)}
					
					{onDeleteImage && (
						<button
							type="button"
							onClick={() => {
								onDeleteImage(deleteIds);
								setContextMenu(null);
							}}
							style={{
								display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
								background: '#fff0f0', border: 0, borderRadius: '6px', cursor: 'pointer',
								fontSize: '12.5px', color: '#a43f3f', fontWeight: 700, textAlign: 'left', width: '100%',
								marginTop: '4px', fontFamily: 'inherit'
							}}
						>
							🗑️ {isCarousel ? 'Eliminar carrusel' : 'Eliminar imagen'}
						</button>
					)}
				</div>
			)}
		</article>
	);
}

export function ImageLightbox({ item, slides, session, onClose, onStarted, onGenerationRequested, products, onProductsChanged, isReferenceLiked, onToggleReferenceLike, onUseReference }: {
	item: Generation;
	slides?: Generation[];
	session: AppSession;
	onClose: () => void;
	onStarted: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onGenerationRequested?: () => void;
	products: Product[];
	onProductsChanged?: () => void;
	isReferenceLiked?: boolean;
	onToggleReferenceLike?: (path: string) => void;
	onUseReference?: (path: string) => void;
}) {
	const carouselSlides = slides && slides.length > 1 ? slides : [item];
	const [slideIndex, setSlideIndex] = useState(0);
	const activeItem = carouselSlides[Math.min(slideIndex, carouselSlides.length - 1)] || item;
	const referenceThumbUrl = useReferenceUrl(activeItem.referencePath);
	// La grilla muestra miniaturas para abrir rápido; acá se pide el original.
	const fullUrl = useFullGenerationUrl(activeItem.outputPath, activeItem.imageUrl);
	const isCarousel = carouselSlides.length > 1;
	const goToSlide = (delta: number) => setSlideIndex((previous) => (previous + delta + carouselSlides.length) % carouselSlides.length);
	const touchStartX = useRef<number | null>(null);
	useEffect(() => {
		if (!isCarousel) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'ArrowLeft') goToSlide(-1);
			if (event.key === 'ArrowRight') goToSlide(1);
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isCarousel]);
	const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
		touchStartX.current = event.touches[0]?.clientX ?? null;
	};
	const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
		const start = touchStartX.current;
		touchStartX.current = null;
		const end = event.changedTouches[0]?.clientX;
		if (!isCarousel || start == null || end == null || Math.abs(end - start) < 45) return;
		goToSlide(end < start ? 1 : -1);
	};
	const [revision, setRevision] = useState('');
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState('');
	const [showReference, setShowReference] = useState(false);
	// Ganador de referencia en modal, sin salir de la app.
	const [lightboxRef, setLightboxRef] = useState<{ path: string; name: string } | null>(null);
	const [revisionFormat, setRevisionFormat] = useState<string>(item.format || 'original');
	// Nunca se agrega el logo solo: el usuario lo pide a propósito, tocando este botón.
	const [includeLogo, setIncludeLogo] = useState(false);
	/**
	 * De dónde sale la identidad al regenerar. Antes estaba clavado en "Mi
	 * marca": no había forma de usar el logo de otra web sin volver a empezar.
	 */
	const [logoSource, setLogoSource] = useState<'mine' | 'url'>('mine');
	const [brandUrl, setBrandUrl] = useState('');
	const [brandPreview, setBrandPreview] = useState<any>(null);
	const [brandLoading, setBrandLoading] = useState(false);
	const [brandError, setBrandError] = useState('');
	/** Si además de la marca se toman los colores y la tipografía de esa web. */
	const [applyBrandStyle, setApplyBrandStyle] = useState(true);
	/**
	 * De qué habla la nueva versión: se hereda de la imagen original.
	 *
	 * Había un selector para elegirlo a mano y sobraba. La imagen ya se generó
	 * sabiendo si hablaba de la tienda, de un producto o de un servicio, y al
	 * rehacerla no hay motivo para volver a preguntarlo: si cambia el producto,
	 * el análisis lo vuelve a detectar sobre el contenido nuevo. Lo que sí hacía
	 * falta era mandarlo, porque sin esto el servidor lo daba por "un producto".
	 */
	const subjectMode: 'catalog' | 'product' | 'service' =
		item.subjectMode === 'catalog' ? 'catalog' : item.subjectMode && item.subjectMode !== 'product' ? 'service' : 'product';

	async function loadBrandFromUrl() {
		const url = brandUrl.trim();
		if (!url) return;
		setBrandLoading(true); setBrandError(''); setBrandPreview(null);
		try {
			const response = await fetch('/api/creativos/brand-preview', {
				method: 'POST',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ url }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No pudimos leer esa página.');
			setBrandPreview(payload.brand);
		} catch (cause) {
			setBrandError(cause instanceof Error ? cause.message : 'No pudimos leer esa página.');
		} finally { setBrandLoading(false); }
	}

	// Product overrides
	const originalProductId = item.productId || item.productIds?.[0] || '';
	const [productMode, setProductMode] = useState<'keep' | 'catalog' | 'url' | 'manual' | 'none'>('keep');
	const [catalogProductId, setCatalogProductId] = useState(originalProductId);
	const [localProducts, setLocalProducts] = useState<Product[]>(products);
	/** Cómo se llama lo que ya usa esta imagen, para poder nombrarlo y no decir
	 *  "el mismo producto" sin que se sepa cuál es. */
	const keptProductName = localProducts.find((candidate) => candidate.id === originalProductId)?.name
		|| item.title
		|| 'El producto de esta imagen';
	
	// Arranca con la URL de la que salió la imagen: regenerar "en base a la URL"
	// no debería obligar a buscarla y pegarla de nuevo.
	const [fastUrl, setFastUrl] = useState(item.sourceUrl || '');
	const [fastImporting, setFastImporting] = useState(false);

	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadPreview, setUploadPreview] = useState('');
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');

	// Auto-resize textarea
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, [revision]);

	async function handleFastImport() {
		if (!fastUrl.trim()) return;
		setFastImporting(true);
		try {
			const response = await fetch('/api/creativos/products', {
				method: 'POST',
				headers: { 
					authorization: `Bearer ${getSessionToken(session)}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ url: fastUrl.trim() }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo importar el producto.');
			// Add to local list and select it
			if (payload.product) {
				setLocalProducts(prev => [payload.product, ...prev]);
				setCatalogProductId(payload.product.id);
				setProductMode('catalog');
				setFastUrl('');
				alert('¡Producto importado con éxito!');
				if (onProductsChanged) onProductsChanged();
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al importar producto.');
		} finally {
			setFastImporting(false);
		}
	}

	async function requestRevision() {
		setStarting(true); setError('');
		try {
			const form = new FormData();
			form.set('templateId', String(item.templateId || 40));
			form.set('templateName', item.title);
			form.set('sourceGenerationId', item.id);
			form.set('variationStrength', revision.trim() ? 'exact' : 'light');
			form.set('imageType', item.imageType || 'promotion');
			form.set('format', revisionFormat || item.format || '1:1');
			form.set('fidelity', '1');
			form.set('preset', 'Nueva versión');
			form.set('count', '1');
			form.set('brief', revision.trim());
			form.set('includeLogo', includeLogo ? '1' : '0');
			form.set('subjectMode', subjectMode);
			form.set('brandSource', includeLogo ? (logoSource === 'url' ? 'url' : 'mine') : 'none');
			// Identidad de otra web: el logo siempre, y los colores y la tipografía
			// solo si se pidió reemplazarlos también.
			if (includeLogo && logoSource === 'url' && brandPreview) {
				form.set('brandOverride', JSON.stringify({
					name: brandPreview.name,
					logoUrl: brandPreview.logoUrl,
					...(applyBrandStyle ? { palette: brandPreview.palette, typography: brandPreview.typography } : {}),
				}));
				if (applyBrandStyle) { form.set('colorMode', 'url'); form.set('typoMode', 'url'); }
			}

			// Handle product override based on selected mode
			if (productMode === 'catalog') {
				if (!catalogProductId) {
					throw new Error('Por favor, selecciona un producto del catálogo.');
				}
				form.append('productIds', catalogProductId);
			} else if (productMode === 'manual') {
				if (!manualProductName.trim()) {
					throw new Error('Por favor, ingresa el nombre de tu producto o servicio.');
				}
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
				if (uploadFile) {
					form.append('product', uploadFile);
				}
			} else if (productMode === 'none') {
				form.set('productId', '');
			} else if (productMode === 'url') {
				if (!catalogProductId) {
					throw new Error('Por favor, importa el producto ingresando la URL y haciendo clic en Analizar.');
				}
				form.append('productIds', catalogProductId);
			}

			onGenerationRequested?.();
			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la nueva versión.');
			if (payload.async && payload.batchId) {
				onStarted({ batchId: payload.batchId, title: item.title, referenceUrl: item.imageUrl, count: 1 });
				onClose();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la nueva versión.');
		} finally { setStarting(false); }
	}

	return (
		<div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(12,10,16,0.78)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: '24px' }}>
			<div className="studio-lightbox-panel" onClick={(event) => event.stopPropagation()} style={{ position: 'relative', display: 'flex', gap: '22px', alignItems: 'stretch', maxWidth: '1100px', width: '100%', maxHeight: '90vh' }}>
				<button onClick={onClose} aria-label="Cerrar" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 8, border: 0, background: 'rgba(255,255,255,0.94)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: '#19171d', fontSize: '16px', fontWeight: 700, boxShadow: '0 4px 14px rgba(0,0,0,0.22)' }}>✕</button>
				<div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ flex: '1 1 auto', display: 'grid', placeItems: 'center', minWidth: 0, position: 'relative', touchAction: isCarousel ? 'pan-y' : 'auto' }}>
					<img src={showReference && activeItem.referenceUrl ? activeItem.referenceUrl : fullUrl} alt={activeItem.title} style={{ maxWidth: '100%', maxHeight: '86vh', borderRadius: '14px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }} />
					{isCarousel && !showReference && <>
						<button type="button" aria-label="Página anterior" onClick={() => goToSlide(-1)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.92)', color: '#19171d', fontSize: '25px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>‹</button>
						<button type="button" aria-label="Página siguiente" onClick={() => goToSlide(1)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.92)', color: '#19171d', fontSize: '25px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>›</button>
						<span style={{ position: 'absolute', bottom: '14px', left: '50%', transform: 'translateX(-50%)', padding: '5px 10px', borderRadius: '999px', background: 'rgba(25,23,29,.78)', color: '#fff', fontSize: '12px', fontWeight: 800 }}>{slideIndex + 1} / {carouselSlides.length}</span>
					</>}
					{showReference && (
						<button onClick={() => setShowReference(false)} style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', padding: '9px 18px', borderRadius: '999px', border: 0, background: 'rgba(12,10,16,0.85)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
							Viendo el anuncio ganador — Volver a tu imagen
						</button>
					)}
				</div>
				<aside style={{ flex: '0 0 350px', background: '#fff', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
					<div>
						<h3 style={{ margin: 0, fontSize: '17px', color: '#19171d', paddingRight: '30px' }}>{item.title}</h3>
						<p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b8490' }}>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long' }).format(new Date(item.createdAt))}</p>
					</div>

					{/* De qué anuncio ganador salió esta imagen */}
					{activeItem.referencePath && (
						<button
							type="button"
							onClick={() => setLightboxRef({ path: activeItem.referencePath!, name: activeItem.referenceName || '' })}
							style={{
								width: '100%', font: 'inherit', cursor: 'pointer',
								display: 'flex', alignItems: 'center', gap: '10px', padding: '9px',
								borderRadius: '12px', border: '1.5px solid #eae5f3', background: '#faf8fd',
								textDecoration: 'none',
							}}
							title="Ver el anuncio ganador original"
						>
							<img
								src={referenceThumbUrl}
								alt=""
								loading="lazy"
								style={{ width: '46px', height: '46px', borderRadius: '9px', objectFit: 'cover', flex: '0 0 auto' }}
							/>
							<span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
								<span style={{ fontSize: '10px', fontWeight: 800, color: '#8b8490', letterSpacing: '.04em' }}>
									🏆 INSPIRADO EN
								</span>
								<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#5f32cf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
									{item.referenceName || 'Anuncio ganador de la biblioteca'}
								</span>
							</span>
						</button>
					)}
					<button type="button" className="regen-download" onClick={async () => downloadImage(await signOriginalGeneration(activeItem.outputPath, fullUrl), `creattia-${activeItem.id}.png`)}>
						<Icon name="download" size={16} />
						Descargar imagen
					</button>
					{activeItem.referenceUrl && (
						<button onClick={() => setShowReference(!showReference)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: showReference ? '#eceaef' : '#f8f6fb', border: showReference ? '1px solid #cfc9d8' : '1px solid transparent', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
							<img src={activeItem.referenceUrl} alt="Anuncio ganador usado" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px' }} />
							<div>
								<strong style={{ display: 'block', fontSize: '12px', color: '#19171d' }}>Anuncio ganador usado</strong>
								<span style={{ fontSize: '11.5px', color: '#8b8490' }}>{showReference ? 'Tocá para volver a tu imagen.' : 'Tocá para verlo grande.'}</span>
							</div>
						</button>
					)}
					<div style={{ borderTop: '1px solid #eee9f2', paddingTop: '14px' }}>
						<strong style={{ display: 'block', fontSize: '14px', color: '#19171d', marginBottom: '8px' }}>Crear otra versión</strong>
						<p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#8b8490', lineHeight: 1.5 }}>Contale a la IA qué cambiar. Si lo dejás vacío genera una variante manteniendo el diseño.</p>
						
						{/* Qué producto usa la nueva versión.
						    Antes eran cinco pestañas siempre visibles con el título
						    "CAMBIAR PRODUCTO O FOTO (OPCIONAL)": obligaba a decidir algo
						    que en la enorme mayoría de los casos no se cambia. Ahora se
						    afirma lo que va a pasar y las opciones aparecen solo si se
						    pide cambiarlo. */}
						<div className="regen-product">
							{productMode === 'keep' ? (
								<div className="regen-product-kept">
									<span className="regen-product-check" aria-hidden="true"><Icon name="check" size={13} /></span>
									<p>
										<strong>{keptProductName}</strong>
										<small>Se mantiene el mismo producto de esta imagen.</small>
									</p>
									<button type="button" onClick={() => setProductMode(localProducts.length ? 'catalog' : 'url')}>Cambiar</button>
								</div>
							) : (
								<div className="regen-product-change">
									<div className="regen-product-tabs" role="tablist" aria-label="De dónde sale el producto">
										{[
											...(localProducts.length ? [{ id: 'catalog', label: 'De los míos' }] : []),
											{ id: 'url', label: 'Desde una URL' },
											{ id: 'manual', label: 'Subir fotos' },
										].map((m) => (
											<button
												key={m.id}
												type="button"
												role="tab"
												aria-selected={productMode === m.id}
												className={productMode === m.id ? 'active' : ''}
												onClick={() => setProductMode(m.id as any)}
											>
												{m.label}
											</button>
										))}
										<button type="button" className="regen-product-cancel" onClick={() => setProductMode('keep')}>Cancelar</button>
									</div>
								</div>
							)}

							{productMode === 'catalog' && (
								<select
									value={catalogProductId}
									onChange={(e) => setCatalogProductId(e.target.value)}
									style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #dcd5e4', padding: '0 8px', fontSize: '13px', background: '#fff', color: '#19171d' }}
								>
									<option value="">-- Selecciona un producto --</option>
									{localProducts.map(p => (
										<option key={p.id} value={p.id}>{p.name} {p.id === originalProductId ? '(Original)' : ''}</option>
									))}
								</select>
							)}

							{productMode === 'url' && (
								<div style={{ display: 'flex', gap: '6px' }}>
									<UrlInput
										className="is-compact"
										value={fastUrl}
										onChange={setFastUrl}
										placeholder="Pegá la URL del producto o de la tienda…"
										ariaLabel="URL para regenerar"
										onEnter={() => { if (!fastImporting && fastUrl.trim()) void handleFastImport(); }}
										style={{ flex: 1 }}
									/>
									<button
										type="button"
										disabled={fastImporting || !fastUrl.trim()}
										onClick={() => void handleFastImport()}
										style={{ height: '36px', padding: '0 14px', borderRadius: '8px', border: 0, background: '#744bde', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', opacity: fastImporting ? 0.6 : 1 }}
									>
										{fastImporting ? <><span className="studio-spinner small" aria-hidden="true" /> Importando…</> : 'Analizar'}
									</button>
								</div>
							)}

							{productMode === 'manual' && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
									<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fcfbfe', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#744bde', width: 'fit-content' }}>
										{uploadFile ? `Foto: ${uploadFile.name.slice(0, 16)}` : '📸 Seleccionar foto de producto'}
										<input 
											type="file" 
											accept="image/png,image/jpeg,image/webp" 
											style={{ display: 'none' }} 
											onChange={(event) => {
												const file = event.target.files?.[0] || null;
												setUploadFile(file);
												if (file) setUploadPreview(URL.createObjectURL(file));
											}} 
										/>
									</label>
									{uploadPreview && (
										<img src={uploadPreview} alt="Vista previa" style={{ display: 'block', width: '74px', height: '74px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2dde9' }} />
									)}
									<input
										value={manualProductName}
										onChange={(e) => setManualProductName(e.target.value)}
										placeholder="Nombre del servicio o producto..."
										style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '13px' }}
									/>
									<textarea
										value={manualProductFacts}
										onChange={(e) => setManualProductFacts(e.target.value)}
										placeholder="Descripción, beneficios clave..."
										rows={2}
										style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '12.5px', resize: 'vertical', fontFamily: 'inherit' }}
									/>
								</div>
							)}

							{productMode === 'none' && (
								<p style={{ margin: 0, fontSize: '12px', color: '#ff4185', fontWeight: 600 }}>✓ Generación sin foto de producto (basada en el texto).</p>
							)}
						</div>

						<div style={{ marginBottom: '10px' }}>
							<p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#716d79' }}>Formato</p>
							<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
								{[
									{ id: 'original', text: 'Igual' },
									{ id: '1:1', text: '1:1' },
									{ id: '3:4', text: '3:4' },
									{ id: '9:16', text: '9:16' },
									{ id: '4:3', text: '4:3' },
									{ id: '16:9', text: '16:9' },
								].map((f) => (
									<button key={f.id} type="button" onClick={() => setRevisionFormat(f.id)}
										style={{ padding: '6px 12px', borderRadius: '9px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
											border: revisionFormat === f.id ? '2px solid #19171d' : '1px solid #e2dde9',
											background: revisionFormat === f.id ? '#f4f2f6' : '#fff', color: revisionFormat === f.id ? '#19171d' : '#6f6a77' }}>
										{f.text}
									</button>
								))}
							</div>
						</div>
						<div style={{ marginBottom: '10px' }}>
							<p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#716d79' }}>Logo</p>
							<div style={{ display: 'flex', gap: '6px' }}>
								<button type="button" onClick={() => setIncludeLogo(false)}
									style={{ flex: 1, padding: '8px 0', borderRadius: '9px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
										border: !includeLogo ? '2px solid #19171d' : '1px solid #e2dde9',
										background: !includeLogo ? '#f4f2f6' : '#fff', color: !includeLogo ? '#19171d' : '#6f6a77' }}>
									Sin logo
								</button>
								<button type="button" onClick={() => setIncludeLogo(true)}
									style={{ flex: 1, padding: '8px 0', borderRadius: '9px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
										border: includeLogo ? '2px solid #19171d' : '1px solid #e2dde9',
										background: includeLogo ? '#f4f2f6' : '#fff', color: includeLogo ? '#19171d' : '#6f6a77' }}>
									Con logo
								</button>
							</div>
							{includeLogo && (
								<div className="regen-brand">
									<div className="regen-brand-tabs">
										<button type="button" className={logoSource === 'mine' ? 'active' : ''} onClick={() => setLogoSource('mine')}>Mi marca</button>
										<button type="button" className={logoSource === 'url' ? 'active' : ''} onClick={() => setLogoSource('url')}>De una URL</button>
									</div>
									{logoSource === 'url' && (
										<>
											<div className="regen-brand-row">
												<UrlInput
													className="is-compact"
													value={brandUrl}
													onChange={(next) => { setBrandUrl(next); setBrandPreview(null); }}
													placeholder="https://lamarca.com"
													ariaLabel="URL de la marca"
													onEnter={() => { if (!brandLoading && brandUrl.trim()) void loadBrandFromUrl(); }}
												/>
												<button type="button" onClick={() => void loadBrandFromUrl()} disabled={brandLoading || !brandUrl.trim()}>
													{brandLoading ? 'Leyendo…' : 'Leer'}
												</button>
											</div>
											{brandError && <small className="regen-brand-error">{brandError}</small>}
											{brandPreview && (
												<div className="regen-brand-found">
													{brandPreview.logoUrl
														? <img src={brandPreview.logoUrl} alt="" />
														: <span className="regen-brand-nologo">Sin logo</span>}
													<div>
														<strong>{brandPreview.name}</strong>
														<span className="regen-brand-colors">
															{(brandPreview.colors || []).slice(0, 4).map((color: string) => (
																<i key={color} style={{ background: color }} title={color} />
															))}
														</span>
													</div>
													<label className="regen-brand-apply">
														<input type="checkbox" checked={applyBrandStyle} onChange={(event) => setApplyBrandStyle(event.target.checked)} />
														Usar también sus colores y tipografía
													</label>
												</div>
											)}
										</>
									)}
								</div>
							)}
						</div>
						<textarea
							ref={textareaRef}
							value={revision}
							onChange={(event) => setRevision(event.target.value)}
							placeholder="Ej: usá fondo azul, agrandá el titular, agregá el precio $99…"
							style={{ width: '100%', minHeight: '90px', padding: '11px 12px', borderRadius: '10px', border: '1px solid #dcd5e4', fontSize: '14px', resize: 'none', fontFamily: 'inherit', overflowY: 'hidden', boxSizing: 'border-box' }}
						/>
						{error && <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: '#a43f3f' }}>{error}</p>}
						<button
							onClick={() => void requestRevision()}
							disabled={starting}
							style={{ width: '100%', height: '46px', marginTop: '10px', borderRadius: '11px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: starting ? 0.6 : 1 }}
						>
							{starting ? <><span className="studio-spinner small" aria-hidden="true" /> Iniciando…</> : 'Generar nueva versión'}
						</button>
					</div>
				</aside>
			</div>

			{lightboxRef && <WinnerReferenceModal
				reference={lightboxRef}
				isLiked={isReferenceLiked}
				onClose={() => setLightboxRef(null)}
				onToggleLike={onToggleReferenceLike}
				onUse={onUseReference}
			/>}
		</div>
	);
}
