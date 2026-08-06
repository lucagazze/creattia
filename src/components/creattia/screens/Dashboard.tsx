import type { Creativo } from '../../../data/creativos50';
import { useReferenceUrls } from '../../../lib/creattia/reference-urls';
import { Icon } from '../Icon';
import { UrlBatchSection } from '../UrlBatchSection';
import type { AppProfile, AppSession, Generation, View } from '../app-types';
import { groupCarouselHistory } from '../history-utils';
import { DiscoverGrid } from './Discover';
import { GenerationCard } from './History';
import { useEffect } from 'react';
/** Pantalla de inicio: atajos, lote en curso y ganadores guardados. */

export function Dashboard({
	profile,
	session,
	email,
	history,
	catalog,
	onView,
	onChoose,
	onReuse,
	randomWinners = [],
	swipePool = [],
	onDiscoverSeen,
	likedWinners = [],
	likedScrapedPaths,
	onToggleLikedScraped,
	onUseScrapedWinner,
	onExpand,
	onBatchCreated,
	onGenerationRequested,
	pendingProductUrl = '',
	onPendingProductUrlUsed,
}: {
	profile: AppProfile;
	session?: AppSession;
	email: string;
	history: Generation[];
	catalog: Creativo[];
	onView: (view: View) => void;
	onChoose: (creative: Creativo) => void;
	onReuse: (generation: Generation) => void;
	randomWinners?: any[];
	swipePool?: any[];
	onDiscoverSeen?: (path: string) => void;
	likedWinners?: any[];
	likedScrapedPaths: Set<string>;
	onToggleLikedScraped: (path: string) => void;
	onUseScrapedWinner: (path: string) => void;
	onExpand?: (generation: Generation, slides?: Generation[]) => void;
	onBatchCreated?: (generations: any[], batchId: string) => void;
	onGenerationRequested?: () => void;
	// URL de producto que quedó pendiente de la landing (sobrevive a la
	// confirmación de email / login con Google).
	pendingProductUrl?: string;
	onPendingProductUrlUsed?: () => void;
}) {
	// El bucket de referencias es privado: las miniaturas se piden firmadas.
	const likedWinnerUrls = useReferenceUrls(likedWinners.map((winner: any) => winner.imagePath));
	// Se precarga una sola vez: si el usuario la borra o la cambia, no se le
	// vuelve a imponer en la próxima visita.
	useEffect(() => {
		if (pendingProductUrl) onPendingProductUrlUsed?.();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<>
			{/* ── Generador Masivo de Anuncios por URL ── */}
			<UrlBatchSection
				userCredits={profile.credits}
				initialUrl={pendingProductUrl}
				session={session}
				onBatchCreated={onBatchCreated}
				onGenerationRequested={onGenerationRequested}
				onNavigateToPlans={() => onView('plans')}
				onSelectRemodel={(generation, templateId) => {
					const tplId = templateId || generation.templateId || 1;
					const template = catalog.find((c) => c.id === tplId) || catalog[0];
					onChoose(template);
					onReuse(generation);
				}}
			/>

			{/* ── Descubrí ganadores: grid de 4 para swipear ── */}
			{swipePool.length > 3 && (
				<DiscoverGrid
					pool={swipePool}
					likedPaths={likedScrapedPaths}
					onLike={(path) => onToggleLikedScraped(path)}
					onUse={(path) => onUseScrapedWinner(path)}
					onSeen={onDiscoverSeen}
					onOpenSwipe={() => onView('discover')}
				/>
			)}

			{/* ── User's generated history ── */}
			{history.length > 0 && (
				<>
					<div className="studio-section-title">
						<div>
							<h2>Últimas imágenes</h2>
							<p>Descargalas o creá otra versión.</p>
						</div>
						<button onClick={() => onView('history')}>
							Ver todas <Icon name="arrow" size={15} />
						</button>
					</div>
					<div className="studio-recent-row" style={{ marginBottom: '40px' }}>
						{groupCarouselHistory(history).slice(0, 4).map((group) => (
							<GenerationCard key={group.key} item={group.item} slides={group.slides} onExpand={onExpand} onReuse={onReuse} />
						))}
					</div>
				</>
			)}

			{/* ── Liked scraped ads from library ── */}
			{likedWinners.length > 0 && (
				<>
					<div className="studio-section-title">
						<div>
							<h2>Anuncios guardados de la biblioteca</h2>
							<p>Tus ideas ganadoras favoritas para tener a mano.</p>
						</div>
						<button onClick={() => onView('winners')}>
							Biblioteca completa <Icon name="arrow" size={15} />
						</button>
					</div>
					<div className="library-ad-grid-masonry dashboard-masonry" style={{ columnGap: '16px' }}>
						{likedWinners.map((winner, idx) => {
							const imageUrl = winner.imageUrl || likedWinnerUrls[winner.imagePath] || '';
							const isLiked = likedScrapedPaths.has(winner.imagePath);

							return (
								<article
									className="library-ad-card-masonry"
									key={winner.imagePath || idx}
									style={{
										display: 'flex',
										flexDirection: 'column',
										position: 'relative',
										cursor: 'pointer'
									}}
									onClick={() => onUseScrapedWinner(winner.imagePath)}
								>
									{/* Card header */}
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
												color: '#19171d',
												fontWeight: 'bold',
												display: 'grid',
												placeItems: 'center',
												fontSize: '11px',
												overflow: 'hidden'
											}}
										>
											{winner.metadata?.logoUrl ? (
												<img src={winner.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
											) : (
												(winner.name || 'F').slice(0, 1).toUpperCase()
											)}
										</span>
										<div style={{ flex: 1, minWidth: 0 }}>
											<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
												{winner.name || 'Foreplay Ad'}
											</strong>
										</div>
									</div>

									{/* Image Container with Heart */}
									<div style={{ background: '#f8f6fb', position: 'relative', overflow: 'hidden' }}>
										{/* Protection overlay */}
										<div
											style={{
												position: 'absolute',
												inset: 0,
												zIndex: 2,
												background: 'transparent'
											}}
											onContextMenu={(e) => e.preventDefault()}
											onDragStart={(e) => e.preventDefault()}
										/>
										
										{/* Heart Button */}
										<button
											onClick={(e) => {
												e.stopPropagation();
												onToggleLikedScraped(winner.imagePath);
											}}
											style={{
												position: 'absolute',
												top: '10px',
												right: '10px',
												zIndex: 4,
												border: 0,
												background: 'rgba(255,255,255,0.85)',
												color: isLiked ? '#ff4185' : '#716d79',
												borderRadius: '50%',
												width: '30px',
												height: '30px',
												display: 'grid',
												placeItems: 'center',
												cursor: 'pointer',
												boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
												outline: 0
											}}
											title={isLiked ? "Quitar de guardados" : "Guardar idea"}
										>
											<Icon name="heart" size={15} fill={isLiked ? '#ff4185' : 'none'} />
										</button>

										<img
											src={imageUrl}
											alt={winner.name}
											style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
											loading="lazy"
											onContextMenu={(e) => e.preventDefault()}
											onDragStart={(e) => e.preventDefault()}
										/>
									</div>

									{/* Footer with prompt details */}
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
											Inspiración visual ganadora.
										</p>
										<button
											onClick={(e) => {
												e.stopPropagation();
												onUseScrapedWinner(winner.imagePath);
											}}
											style={{
												width: '100%',
												height: '35px',
												background: '#f2ecfc',
												border: 0,
												borderRadius: '8px',
												color: '#19171d',
												fontWeight: 'bold',
												fontSize: '10.5px',
												cursor: 'pointer',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												gap: '6px'
											}}
										>
											Usar esta idea
											<Icon name="arrow" size={13} />
										</button>
									</div>
								</article>
							);
						})}
					</div>
				</>
			)}
		</>
	);
}

