import { useCallback, useEffect, useMemo, useState } from 'react';
import { imagenFallada } from '../../../lib/creattia/image-ready';
import { useReferenceUrls } from '../../../lib/creattia/reference-urls';
import { ImagenDeTarjeta, useCercaDePantalla } from '../carga-por-pantalla';
import { Icon } from '../Icon';
import type { Generation } from '../app-types';
import { GenerationCard } from './History';
import { useMasonry } from '../use-masonry';
/** Favoritos: generaciones e ideas de la biblioteca guardadas. */

/**
 * Cuántas ideas se firman por adelantado.
 *
 * Las de la biblioteca viven en un bucket privado: sin URL firmada la tarjeta no
 * tiene ni qué pedirle al navegador. Firmar la lista entera de una era pedirle al
 * servidor trabajo para tarjetas que están veinte pantallas más abajo, y encima
 * dejaba a las de arriba esperando dentro de la misma respuesta. Se firma la
 * primera pantalla larga y de ahí en más se va estirando a medida que las
 * tarjetas se acercan.
 */
const TANDA_IDEAS = 12;

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
	/**
	 * Hasta dónde se firmó: primero lo que se ve, y el resto a medida que bajás.
	 *
	 * Antes se esperaba a que un tramo entero estuviera decodificado antes de
	 * dibujar nada, así que entrar acá dejaba la pantalla en esqueletos aunque en
	 * ella entraran cuatro tarjetas; y las rutas se mandaban a firmar todas juntas,
	 * sin importar dónde estaba parada la persona. Ahora las tarjetas se dibujan
	 * enseguida y cada una pide su tramo de firmas al acercarse a la pantalla.
	 *
	 * Solo crece, nunca se reinicia —ni al cambiar la lista de guardados—. Una
	 * tarjeta avisa UNA vez que se acercó y después deja de observarse: si acá se
	 * volviera a cero, esas tarjetas ya no tendrían quién las vuelva a pedir y se
	 * quedarían sin URL firmada para siempre. Que sobre alcance no cuesta nada,
	 * porque el `slice` lo recorta contra la lista real.
	 */
	const [alcance, setAlcance] = useState(TANDA_IDEAS);
	const acercarse = useCallback((indice: number) => {
		setAlcance((actual) => Math.max(actual, indice + 1 + TANDA_IDEAS));
	}, []);
	const likedScrapedUrls = useReferenceUrls(
		useMemo(() => likedScrapedItems.slice(0, alcance).map((winner: any) => winner.imagePath), [likedScrapedItems, alcance]),
	);
	const hasContent = likedGenerations.length > 0 || likedScrapedItems.length > 0;

	const urlDe = (winner: any) => winner?.imageUrl || likedScrapedUrls[winner?.imagePath] || '';
	const guardadosVisibles = likedScrapedItems.filter((winner) => !imagenFallada(urlDe(winner)));
	const faltanGuardados = guardadosVisibles.length === 0 && likedScrapedItems.length > 0;

	// Las dos grillas son independientes —cada una arranca su propia fila 1 y se
	// mide por separado—, así que cada una necesita su instancia del masonry.
	const creaciones = useMasonry([likedGenerations.length]);
	const ideas = useMasonry([guardadosVisibles.length, faltanGuardados]);

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
							<div ref={creaciones.grillaRef} className="studio-history-grid" style={creaciones.estiloDeGrilla}>
								{likedGenerations.map((item, posicion) => (
									<GenerationCard
										key={item.id}
										// Cuándo se pide cada imagen lo decide la cercanía a la pantalla;
										// la posición decide otra cosa: cuáles de las cercanas van con
										// prioridad alta. Sin pasarla, las cien tarjetas se creían la
										// primera fila y competían todas entre sí por el mismo lugar.
										posicion={posicion}
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
							<div ref={ideas.grillaRef} className="studio-history-grid" style={ideas.estiloDeGrilla}>
								{guardadosVisibles.map((winner, idx) => (
									<IdeaGuardada
										key={winner.imagePath || idx}
										winner={winner}
										imageUrl={urlDe(winner)}
										posicion={idx}
										onCerca={acercarse}
										onUsar={onUseScrapedWinner}
										onQuitar={toggleLikedScraped}
									/>
								))}
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

/**
 * Una idea guardada de la biblioteca.
 *
 * Está separada en su propio componente por una sola razón: necesita un hook por
 * tarjeta para saber cuándo se acerca a la pantalla, y dentro de un `.map()` no
 * se pueden usar hooks. Avisa hacia arriba con su posición para que la pantalla
 * mande a firmar el tramo siguiente, y la foto la pide sola cuando corresponde.
 */
function IdeaGuardada({
	winner,
	imageUrl,
	posicion,
	onCerca,
	onUsar,
	onQuitar,
}: {
	winner: any;
	imageUrl: string;
	posicion: number;
	onCerca: (posicion: number) => void;
	onUsar: (path: string) => void;
	onQuitar: (path: string) => void;
}) {
	const { ref, cerca } = useCercaDePantalla<HTMLElement>();
	useEffect(() => {
		if (cerca) onCerca(posicion);
	}, [cerca, posicion, onCerca]);

	return (
		<article
			ref={ref}
			className="studio-generation-card"
			style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', border: '1px solid #e9e6ed', borderRadius: '14px', overflow: 'hidden' }}
			onClick={() => onUsar(winner.imagePath)}
		>
			<div style={{ position: 'relative' }}>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onQuitar(winner.imagePath);
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
				<ImagenDeTarjeta
					url={imageUrl}
					alt=""
					prioritaria={posicion < 4}
					style={{ width: '100%', height: 'auto', display: 'block' }}
				/>
			</div>
			<footer style={{ padding: '12px' }}>
				<h3 style={{ fontSize: '14.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{winner.name || 'Idea Guardada'}
				</h3>
			</footer>
		</article>
	);
}
