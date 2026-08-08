import { useMemo } from 'react';
import { imagenFallada, ratioDeImagen } from '../../../lib/creattia/image-ready';
import { useReferenceUrls } from '../../../lib/creattia/reference-urls';
import { Icon } from '../Icon';
import type { Generation } from '../app-types';
import { GenerationCard } from './History';
/** Favoritos: generaciones e ideas de la biblioteca guardadas. */

export function SavedAds({ 
	history, 
	likedImageIds, 
	toggleLike, 
	folders, 
	toggleFolder, 
	scrapedWinners, 
	likedScrapedPaths, 
	toggleLikedScraped, 
	onUseScrapedWinner,
	onExpand,
	onReuse
}: { 
	history: Generation[]; 
	likedImageIds: string[]; 
	toggleLike: (id: string) => void;
	folders: any[];
	toggleFolder: (imgId: string, folderId: string) => void;
	scrapedWinners: any[]; 
	likedScrapedPaths: Set<string>; 
	toggleLikedScraped: (path: string) => void; 
	onUseScrapedWinner: (path: string) => void;
	onExpand?: (item: Generation, slides?: Generation[]) => void;
	onReuse?: (item: Generation) => void;
}) {
	const likedGenerations = history.filter(item => likedImageIds.includes(item.id));
	// La lista se arma desde las rutas guardadas, NO filtrando el catálogo.
	// Antes era al revés y por eso un "me gusta" podía no aparecer nunca: el
	// catálogo que llega acá es una muestra, y si el anuncio guardado no estaba
	// en ella se perdía. La ruta alcanza para mostrar la tarjeta —la imagen se
	// resuelve por ruta— y la metadata se suma cuando está disponible.
	const byPath = useMemo(
		() => new Map(scrapedWinners.filter((winner) => winner?.imagePath).map((winner) => [winner.imagePath as string, winner])),
		[scrapedWinners],
	);
	const likedScrapedItems = useMemo(
		() => Array.from(likedScrapedPaths).map((path) => byPath.get(path) || { imagePath: path }),
		[likedScrapedPaths, byPath],
	);
	const likedScrapedUrls = useReferenceUrls(likedScrapedItems.map((winner: any) => winner.imagePath));
	const hasContent = likedGenerations.length > 0 || likedScrapedItems.length > 0;

	/**
	 * Primero lo que se ve, y el resto a medida que bajás.
	 *
	 * Antes se esperaba a que un tramo entero estuviera decodificado antes de
	 * dibujar nada, así que entrar acá dejaba la pantalla en esqueletos aunque en
	 * ella entraran cuatro tarjetas. Ahora se dibujan enseguida y cada imagen la
	 * pide el navegador cuando su tarjeta se acerca a la pantalla; el lugar queda
	 * reservado con la proporción para que no salte nada.
	 */
	const urlDe = (winner: any) => winner?.imageUrl || likedScrapedUrls[winner?.imagePath] || '';
	const guardadosVisibles = likedScrapedItems.filter((winner) => !imagenFallada(urlDe(winner)));
	const faltanGuardados = guardadosVisibles.length === 0 && likedScrapedItems.length > 0;

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>GUARDADOS</p>
					<h1>Tus anuncios guardados.</h1>
					<span>Ideas y creaciones que marcaste como favoritas.</span>
				</div>
			</div>

			{hasContent ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
					{likedGenerations.length > 0 && (
						<div>
							<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#744bde', marginBottom: '14px' }}>Tus creaciones favoritas</h2>
							<div className="studio-history-grid">
								{likedGenerations.map((item) => (
									<GenerationCard 
										key={item.id} 
										item={item} 
										isLiked={true} 
										onToggleLike={() => toggleLike(item.id)} 
										folders={folders} 
										onToggleFolder={(fid) => toggleFolder(item.id, fid)} 
										onExpand={onExpand ? () => onExpand(item) : undefined} 
										onReuse={onReuse ? () => onReuse(item) : undefined} 
									/>
								))}
							</div>
						</div>
					)}

					{likedScrapedItems.length > 0 && (
						<div>
							<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#744bde', marginBottom: '14px' }}>Ideas de la biblioteca guardadas</h2>
							<div className="studio-history-grid">
								{guardadosVisibles.map((winner, idx) => {
									const imageUrl = urlDe(winner);
									return (
										<article
											className="studio-generation-card"
											key={winner.imagePath || idx}
											style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', border: '1px solid #e9e6ed', borderRadius: '14px', overflow: 'hidden' }}
											onClick={() => onUseScrapedWinner(winner.imagePath)}
										>
											<div style={{ position: 'relative' }}>
												<button
													onClick={(e) => {
														e.stopPropagation();
														toggleLikedScraped(winner.imagePath);
													}}
													style={{
														position: 'absolute',
														top: '8px',
														right: '8px',
														zIndex: 10,
														border: 0,
														background: 'rgba(255,255,255,0.9)',
														color: '#ff4185',
														borderRadius: '50%',
														width: '28px',
														height: '28px',
														display: 'grid',
														placeItems: 'center',
														cursor: 'pointer',
														boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
													}}
												>
													<Icon name="heart" size={13} fill="#ff4185" />
												</button>
												<img
													src={imageUrl}
													alt=""
													loading={idx < 4 ? 'eager' : 'lazy'}
													fetchPriority={idx < 4 ? 'high' : 'auto'}
													decoding="async"
													style={{
														width: '100%', height: 'auto', display: 'block',
														// El lugar reservado hasta que llegue la foto.
														aspectRatio: ratioDeImagen(imageUrl) || 0.8,
													}}
													onLoad={(event) => { event.currentTarget.style.aspectRatio = ''; }}
												/>
											</div>
											<footer style={{ padding: '12px' }}>
												<h3 style={{ fontSize: '14.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
													{winner.name || 'Idea Guardada'}
												</h3>
											</footer>
										</article>
									);
								})}
								{/* Los huecos van al final de la grilla: es el único lugar donde
								    crecer no empuja lo que ya estás mirando. */}
								{faltanGuardados && [0, 1].map((hueco) => (
									<article key={`esqueleto-${hueco}`} className="library-card-esqueleto" aria-hidden="true" />
								))}
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="studio-empty large">
					<span>❤️</span>
					<h3>No tenés anuncios guardados</h3>
					<p>Hacé clic en el corazón de tus creaciones o de la biblioteca para guardarlas acá.</p>
				</div>
			)}
		</>
	);
}
