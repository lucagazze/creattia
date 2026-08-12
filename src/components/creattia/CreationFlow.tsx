import { useReferenceUrls } from '../../lib/creattia/reference-urls';
import { subjectModeDesde, alcanceDesde, personModeRecomendado, logoModeRecomendado, type Alcance, type PersonMode, type LogoMode } from '../../lib/creattia/generation-pipeline';
import UrlInput from './UrlInput';
import React, { useState, useEffect, useRef } from 'react';
import { BatchSelect, LANGUAGE_OPTIONS, STYLE_OPTIONS, BRAND_OPTIONS, BrandOptionIcon, driveBatchWorkers } from './UrlBatchSection';
import ProductAssetReview, { type ProductReviewItem } from './ProductAssetReview';
import { leerRespuestaDeEscaneo } from '../../lib/creattia/errores-de-escaneo';
import { guardarBorrador, leerBorrador, borrarBorrador, resumenDelBorrador, type Borrador } from '../../lib/creattia/borrador-de-creacion';
import { reportarPantalla } from '../../lib/creattia/presencia';

// ─────────────────────────────────────────────────────────────────────────────
// Página completa de creación fiel al ganador (reemplaza el modal). Mismo
// wizard paso a paso que el generador por lote (UrlBatchSection): un tema por
// pantalla, con la misma barra de progreso, tabs, pills y botones.
// Pasos: 1) producto  2) formato  3) estilo visual → analizar referencia → generar.
// ─────────────────────────────────────────────────────────────────────────────

// Formatos visuales del paso 2, mismos valores que ya entiende el backend de
// generación individual (distintos de los alias del lote, pero mismo diseño).
/**
 * Para qué usa la marca cada color. El escaneo devuelve una paleta suelta; esto
 * le pone función a cada uno, que es lo que la vuelve útil: el mismo violeta
 * como fondo o como acento son dos avisos distintos.
 */
const ROLES_DE_COLOR = [
	{ id: 'fondo', label: 'Fondo', desde: 'background' },
	{ id: 'titulo', label: 'Títulos', desde: 'text' },
	{ id: 'texto', label: 'Textos', desde: 'secondary' },
	{ id: 'acento', label: 'Acento', desde: 'accent' },
	{ id: 'boton', label: 'Botones', desde: 'accent' },
	// El texto del botón es su propio color: con el botón pintado del acento,
	// escribirle encima con el color de los textos lo deja ilegible la mitad de
	// las veces. Arranca del fondo, que es lo que contrasta con el acento.
	{ id: 'textoBoton', label: 'Texto del botón', desde: 'background' },
] as const;

/**
 * Treinta colores para elegir a mano.
 *
 * El escaneo acierta casi siempre, pero cuando falla —o cuando el sitio no tiene
 * paleta declarada— quedaba un selector nativo del sistema operativo, que es
 * distinto en cada máquina y no le sirve a nadie. Una fila de neutros y una
 * rueda de tonos cubre lo que una marca usa de verdad.
 */
const COLORES_A_MANO = [
	'#FFFFFF', '#F5F5F7', '#E5E5EA', '#C7C7CC', '#8E8E93', '#48484A', '#1D1D1F', '#000000',
	'#FF3B30', '#DD1D1D', '#FF6B35', '#FF9500', '#FFCC00', '#FFE066', '#34C759', '#0B6E4F',
	'#00C7BE', '#32ADE6', '#007AFF', '#17254B', '#0B1120', '#5856D6', '#744BDE', '#AF52DE',
	'#FF2D55', '#FF7A9C', '#8B5E3C', '#C9A96E', '#F5E6D3', '#1B4332',
];

/**
 * Las tipografías que se pueden elegir a mano.
 *
 * Van embebidas y no se le piden a Google en vivo: la lista casi no cambia y
 * traerla por red sería una dependencia más que se puede caer justo cuando
 * alguien está por generar. Se puede escribir cualquier otra igual — el campo
 * acepta lo que sea, esto solo evita tener que acordarse del nombre exacto.
 */
const FUENTES = [
	'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Nunito', 'Nunito Sans',
	'Work Sans', 'Rubik', 'Manrope', 'DM Sans', 'Karla', 'Mulish', 'Outfit', 'Figtree', 'Plus Jakarta Sans',
	'Source Sans 3', 'PT Sans', 'Noto Sans', 'Barlow', 'Cabin', 'Quicksand', 'Josefin Sans', 'Urbanist',
	'Space Grotesk', 'Sora', 'Epilogue', 'Archivo', 'Public Sans', 'Red Hat Display', 'Chivo', 'Lexend',
	'Oswald', 'Anton', 'Bebas Neue', 'Teko', 'Archivo Black', 'Alfa Slab One', 'Fjalla One', 'Staatliches',
	'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Libre Baskerville', 'Crimson Text', 'Cormorant Garamond',
	'EB Garamond', 'Bitter', 'Source Serif 4', 'Noto Serif', 'Spectral', 'Zilla Slab', 'Frank Ruhl Libre',
	'DM Serif Display', 'Abril Fatface', 'Prata', 'Marcellus', 'Cinzel', 'Italiana', 'Bodoni Moda', 'Instrument Serif',
	'Dancing Script', 'Pacifico', 'Great Vibes', 'Lobster', 'Caveat', 'Satisfy', 'Sacramento', 'Parisienne',
	'Righteous', 'Comfortaa', 'Fredoka', 'Baloo 2', 'Titan One', 'Bangers', 'Luckiest Guy', 'Permanent Marker',
	'Roboto Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Space Mono', 'Fira Code', 'Courier Prime',
	'Helvetica', 'Helvetica Neue', 'Arial', 'Futura', 'Avenir', 'Gotham', 'Proxima Nova', 'Georgia', 'Garamond', 'Times New Roman',
];

/**
 * Trae de Google los archivos de las fuentes de la lista, para poder mostrarlas.
 *
 * Se pide UNA sola vez y con `text=`: así Google devuelve un subconjunto con las
 * letras que hacen falta para escribir los nombres y nada más. Sin eso serían
 * cuarenta tipografías completas bajando para leer cuarenta palabras.
 */
let fuentesPedidas = false;
function cargarFuentes() {
	if (fuentesPedidas || typeof document === 'undefined') return;
	fuentesPedidas = true;
	const familias = FUENTES.map((fuente) => `family=${fuente.replace(/ /g, '+')}`).join('&');
	const letras = encodeURIComponent('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz 0123456789');
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = `https://fonts.googleapis.com/css2?${familias}&display=swap&text=${letras}`;
	document.head.appendChild(link);
}

/**
 * Elegir tipografía de una lista, viéndola.
 *
 * Antes era un campo libre: había que saber el nombre exacto y escribirlo bien, y
 * no se veía cómo era hasta tener la imagen generada. Ahora cada opción se
 * dibuja en su propia tipografía. "Otra" queda para el que use una que no está
 * en la lista, que es un caso real pero no el común.
 *
 * Va fuera del componente a propósito: definido adentro, React lo trataría como
 * un tipo nuevo en cada render y el panel se cerraría a cada tecla.
 */
function SelectorDeFuente({ etiqueta, valor, onChange, disabled }: {
	etiqueta: string; valor: string; onChange: (v: string) => void; disabled?: boolean;
}) {
	const [abierto, setAbierto] = useState(false);
	const [busqueda, setBusqueda] = useState('');
	const [aMano, setAMano] = useState(false);
	const caja = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!abierto) return;
		cargarFuentes();
		const afuera = (evento: MouseEvent) => {
			if (caja.current && !caja.current.contains(evento.target as Node)) setAbierto(false);
		};
		document.addEventListener('mousedown', afuera);
		return () => document.removeEventListener('mousedown', afuera);
	}, [abierto]);

	const filtro = busqueda.trim().toLowerCase();
	const coincidencias = filtro ? FUENTES.filter((fuente) => fuente.toLowerCase().includes(filtro)) : FUENTES;

	return (
		<div className="creation-typo-field" ref={caja}>
			<span>{etiqueta}</span>
			<div className="creation-typo-combo">
				<button
					type="button"
					className="creation-typo-boton"
					disabled={disabled}
					aria-expanded={abierto}
					onClick={() => { cargarFuentes(); setAbierto((previo) => !previo); }}
					style={valor ? { fontFamily: `'${valor}', system-ui, sans-serif` } : undefined}
				>
					<span>{valor || 'Elegir tipografía'}</span>
					<i aria-hidden="true">▾</i>
				</button>
				{abierto && (
					<div className="creation-typo-panel">
						<input
							type="text"
							className="creation-typo-buscador"
							placeholder="Buscar…"
							value={busqueda}
							autoFocus
							onChange={(evento) => setBusqueda(evento.target.value)}
						/>
						<ul>
							{coincidencias.map((fuente) => (
								<li key={fuente}>
									<button
										type="button"
										className={fuente === valor ? 'active' : ''}
										style={{ fontFamily: `'${fuente}', system-ui, sans-serif` }}
										onClick={() => { onChange(fuente); setAbierto(false); setBusqueda(''); }}
									>
										{fuente}
									</button>
								</li>
							))}
							{!coincidencias.length && <li className="creation-typo-vacio">Ninguna coincide</li>}
						</ul>
						<div className="creation-typo-otra">
							{aMano ? (
								<input
									type="text"
									maxLength={60}
									autoFocus
									placeholder="Nombre de tu tipografía"
									defaultValue={FUENTES.includes(valor) ? '' : valor}
									onKeyDown={(evento) => { if (evento.key === 'Enter') { onChange((evento.target as HTMLInputElement).value); setAbierto(false); } }}
									onBlur={(evento) => { if (evento.target.value.trim()) onChange(evento.target.value.trim()); }}
								/>
							) : (
								<button type="button" onClick={() => setAMano(true)}>Usar otra que no está en la lista</button>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

const FORMAT_ITEMS = [
	{ id: 'original', text: 'Original', desc: 'Igual al ganador', shape: 'original' },
	{ id: '1:1', text: '1:1', desc: 'Feed', shape: 'square' },
	{ id: '3:4', text: '3:4', desc: 'Vertical', shape: 'portrait' },
	{ id: '9:16', text: '9:16', desc: 'Historia', shape: 'story' },
	{ id: '4:3', text: '4:3', desc: 'Horizontal', shape: 'landscape' },
	{ id: '16:9', text: '16:9', desc: 'Panorámico', shape: 'wide' },
];

/**
 * Lo que alguien está escribiendo en un campo de color.
 *
 * Mientras se tipea "#1D1D1F" pasa por "#1", "#1D", "#1D1"… que no son colores.
 * Rechazar lo intermedio hace que no se pueda escribir nada: la única forma de
 * llegar a un valor completo es pasando por los incompletos. Se guarda tal cual
 * y el render descarta lo que no sea un hexadecimal entero.
 */
function hexEscrito(valor: string): string {
	const limpio = valor.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
	return `#${limpio.toUpperCase()}`;
}

export default function CreationFlow({ ad, session, onToast, onGenerationStarted, onGenerationRequested, onBack, retomarBorrador: retomarAlAbrir }: {
	ad: any;
	session: any;
	/** Viene en true cuando se entró desde el aviso de la biblioteca: ahí el
	 * borrador se restaura de una, sin pedir un segundo clic sobre lo mismo. */
	retomarBorrador?: boolean;
	onToast?: (message: string) => void;
	onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onGenerationRequested?: () => void;
	/**
	 * Cierra el flujo. `traGenerar` avisa que se acaba de mandar una generación:
	 * en ese caso NO hay que volver a la pantalla de la que se venía, porque el
	 * usuario ya fue llevado a "Mis imágenes" a ver lo que se está creando.
	 */
	onBack: (opciones?: { trasGenerar?: boolean }) => void;
}) {
	const token = session?.access_token || '';

	// Al entrar a este flujo (p.ej. desde la mitad de la grilla en mobile) hay
	// que verse a uno mismo arriba de todo, no quedar scrolleado donde estaba
	// la tarjeta que se tocó.
	useEffect(() => {
		window.scrollTo(0, 0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// El bucket de referencias es privado: las URLs las firma el servidor.
	// Se piden juntas la portada y todas las páginas del carrusel.
	const signedReferenceUrls = useReferenceUrls([
		ad.imagePath,
		...(Array.isArray(ad.metadata?.carouselImages) ? ad.metadata.carouselImages : []),
	]);
	const referenceUrlFor = (path: string) => (path.startsWith('http') ? path : signedReferenceUrls[path] || '');
	const referenceUrl = referenceUrlFor(ad.imagePath);

	/**
	 * Carrusel ganador: varias páginas para elegir cómo generar.
	 *
	 * Sin repetidas a propósito. El servidor las descarta al analizar y al arrancar
	 * el lote, así que una página repetida en la biblioteca dejaba tres listas de
	 * largos distintos y el análisis de cada página terminaba corrido una posición.
	 */
	const carouselSlides: string[] = ad.metadata?.mediaType === 'carousel' && Array.isArray(ad.metadata?.carouselImages) && ad.metadata.carouselImages.length > 1
		? [...new Set(ad.metadata.carouselImages as string[])]
		: [];
	const isCarouselAd = carouselSlides.length > 0;
	const [carouselMode, setCarouselMode] = useState<'full' | 'single'>('full');
	/**
	 * Qué páginas del carrusel se generan.
	 *
	 * Antes eran las dos puntas: todas, o una sola. Un carrusel de seis del que
	 * solo sirven la primera y la última obligaba a generar seis y pagar seis.
	 * Vacío quiere decir todas, que es lo que corresponde al entrar.
	 */
	const [paginasElegidas, setPaginasElegidas] = useState<number[]>([]);
	const [carouselSameProduct, setCarouselSameProduct] = useState(true);
	const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
	/**
	 * Cerrojo contra el doble envío.
	 *
	 * El botón no se deshabilitaba mientras el lote estaba en vuelo, así que un
	 * segundo clic mandaba otra tanda entera: quedaron dos lotes idénticos de 10
	 * páginas con 126 ms de diferencia, o sea el doble de créditos gastados. El
	 * estado de React no alcanza para frenarlo —entre dos clics seguidos todavía
	 * vale el valor viejo—, hace falta una referencia que cambie en el acto.
	 */
	const enviando = useRef(false);
	const wantsFullCarousel = isCarouselAd && carouselMode === 'full';
	/** Las páginas que se van a generar, en su orden original. */
	const paginasAGenerar: string[] = !isCarouselAd ? [] : carouselSlides.filter(
		(_, indice) => !paginasElegidas.length || paginasElegidas.includes(indice),
	);
	// La página que se clona cuando se elige "solo una página": el resto del
	// flujo de revisión visual funciona exactamente igual que un anuncio suelto.
	const effectiveReferencePath = isCarouselAd && carouselMode === 'single' ? carouselSlides[selectedSlideIndex] : ad.imagePath;
	// La vista grande de la izquierda: en un carrusel siempre muestra la
	// página que se está mirando (se puede pasar de página para verlas
	// todas), sea cual sea el modo elegido.
	const previewSlidePath = isCarouselAd ? carouselSlides[selectedSlideIndex] : ad.imagePath;
	const previewUrl = referenceUrlFor(previewSlidePath);
	const goToPreviewSlide = (delta: number) => {
		if (!isCarouselAd) return;
		setSelectedSlideIndex((prev) => (prev + delta + carouselSlides.length) % carouselSlides.length);
	};

	// Precarga todas las páginas del carrusel apenas se entra a este flujo,
	// para que pasar de página con las flechas sea instantáneo.
	useEffect(() => {
		if (!isCarouselAd) return;
		carouselSlides.forEach((slide) => { const img = new Image(); img.src = referenceUrlFor(slide); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isCarouselAd]);

	// Cómo cargar el producto: por URL(s), a mano (con archivos), o sin producto.
	const [productMode, setProductMode] = useState<'url' | 'manual'>('url');
	/**
	 * Producto físico o servicio/SaaS. Ya no se pregunta: lo detecta la IA al
	 * analizar la URL. Preguntarlo obligaba al usuario a clasificar algo que la
	 * página ya dice sola, y si se equivocaba el creativo terminaba pidiendo una
	 * foto de producto que no existe.
	 */
	const [scannedOffering, setScannedOffering] = useState<'product' | 'service' | 'catalog'>('product');
	/** Corrección manual: gana sobre lo detectado. */
	/**
	 * El alcance elegido a mano: general o algo puntual. Si el negocio vende un
	 * objeto o no lo deduce el sistema mirando las fotos, así que no se pregunta.
	 */
	const [alcanceOverride, setAlcanceOverride] = useState<Alcance | null>(null);
	const [urls, setUrls] = useState<string[]>(['']);
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [importedProducts, setImportedProducts] = useState<ProductReviewItem[]>([]);

	/**
	 * Se deriva de los productos elegidos, no del último escaneo.
	 *
	 * Antes era estado que solo se seteaba al escanear una URL: si se generaba
	 * desde productos ya importados —sin volver a pegar la URL— quedaba en
	 * 'product' y el anuncio de un catálogo terminaba tratado como una ficha.
	 */
	const detectedOffering: 'product' | 'service' | 'catalog' = (() => {
		const elegidos = importedProducts.filter((item: any) => selectedProductIds.includes(item.id));
		const desdeProductos = (elegidos.length ? elegidos : importedProducts)
			.map((item: any) => item?.metadata?.pageType)
			.find((tipo: string) => tipo === 'catalog' || tipo === 'service' || tipo === 'product');
		const detectado = (desdeProductos as any) || scannedOffering;
		if (!alcanceOverride) return detectado;
		// Con el alcance corregido a mano, el tipo se resuelve igual que siempre:
		// hay fotos reales o no las hay.
		const conFotos = importedProducts.some((item: any) => (item?.media?.length || item?.imageUrls?.length));
		return subjectModeDesde(alcanceOverride, conFotos) as any;
	})();
	const isService = detectedOffering === 'service';
	/** La URL era la home de la tienda o una categoría: el anuncio habla del negocio. */
	const isCatalog = detectedOffering === 'catalog';
	const [uploadFiles, setUploadFiles] = useState<File[]>([]);
	const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
	const [parsingDoc, setParsingDoc] = useState(false);

	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [colorMode, setColorMode] = useState<'winner' | 'url' | 'brand'>('winner');
	/**
	 * Corrección manual de los colores detectados. La detección se confunde
	 * —agarra el gris de un banner o el color del aviso de cookies— y sin esto
	 * el creativo salía con una identidad que no era la de la marca.
	 */
	const [paletteOverride, setPaletteOverride] = useState<Record<string, string>>({});
	const [typoMode, setTypoMode] = useState<'winner' | 'url' | 'brand'>('winner');
	/**
	 * Lo que el usuario quiere destacar, en sus palabras.
	 *
	 * Es lo único que sobrevivió de la revisión vieja, y a propósito: ahí se
	 * decidía QUÉ decía cada texto y DÓNDE iba, y lo segundo es lo que hacía que el
	 * clon saliera rígido y con el mundo del otro anunciante adentro. Acá entra la
	 * intención sola; dónde ponerlo y de qué tamaño lo decide la IA.
	 */
	const [indicaciones, setIndicaciones] = useState('');
	/**
	 * Los colores de la web repartidos por función, corregidos a mano si hizo
	 * falta. Van al prompt como DATO —así usa la marca sus colores— y no como
	 * orden de pintado: el aviso lo sigue resolviendo el modelo.
	 */
	const [rolesDeColor, setRolesDeColor] = useState<Record<string, string>>({});
	/**
	 * El logo puesto a mano, cuando el que scrapeó el sitio no es el que la marca
	 * usa de verdad.
	 *
	 * Subir uno implica quererlo EN el aviso: sin archivo el aviso escribe el
	 * nombre de la marca donde el ganador firma, que es lo que sale bien casi
	 * siempre. Ofrecer un cambio que no cambia nada sería un control decorativo.
	 */
	/**
	 * La foto del producto elegida a mano, si se eligió alguna.
	 *
	 * Vacío quiere decir "todas", que es el default medido. Una sola elegida lo
	 * reemplaza: con una galería de una foto buena y cinco regulares, mandar solo
	 * la buena gana. El servidor ya sabía recibirlo — faltaba dónde elegirla.
	 */
	const [fotosElegidas, setFotosElegidas] = useState<string[]>([]);
	/**
	 * La persona descrita con palabras.
	 *
	 * El servidor ya la leía de `avatarDescription` desde siempre, pero no había
	 * dónde escribirla: "yo la describo" era un modo válido sin pantalla.
	 */
	const [personaEscrita, setPersonaEscrita] = useState('');
	/** Si el selector está abierto. Cerrado quiere decir: se usan todas. */
	const [eligiendoFotos, setEligiendoFotos] = useState(false);
	/**
	 * Que el aviso salga sin ninguna firma.
	 *
	 * Sin esto la única opción era cambiar el logo por otro: el aviso siempre
	 * terminaba escribiendo el nombre de la marca donde el ganador firma, y no
	 * había forma de pedir que no firmara nada.
	 */
	const [sinLogo, setSinLogo] = useState(false);
	const [logoPropio, setLogoPropio] = useState<File | null>(null);
	const [logoPropioVista, setLogoPropioVista] = useState('');
	/**
	 * Qué rol se está editando, o null cuando no se está editando ninguno.
	 *
	 * Arranca cerrado: el panel abierto por defecto ocupaba media pantalla para
	 * una corrección que casi nunca hace falta, y hacía parecer que había algo
	 * pendiente de resolver antes de generar.
	 */
	const [rolActivo, setRolActivo] = useState<string | null>(null);
	/**
	 * La tipografía que va a usar el aviso, corregible.
	 *
	 * El escaneo lee el CSS del sitio y a veces devuelve el nombre interno de la
	 * fuente —"judgemestar"— que no le dice nada al modelo. Verlo sin poder
	 * tocarlo era ver el error y no poder hacer nada.
	 */
	const [tipografiaElegida, setTipografiaElegida] = useState<{ headings: string; body: string }>({ headings: '', body: '' });
	const [brandSource, setBrandSource] = useState('url');
	/**
	 * El logo arranca apagado y no se enciende solo nunca.
	 *
	 * Se pre-elegía "con logo" cuando el análisis marcaba que el ganador llevaba
	 * marca, pero ese aviso se prende igual con un emblema dibujado que con el
	 * nombre puesto en tipografía, que es la enorme mayoría de los casos. Contra
	 * un ganador firmado con el nombre no hay ningún hueco donde pegar un
	 * archivo, así que el logo del cliente terminaba apareciendo en una esquina
	 * cualquiera del aviso, sin que nadie lo hubiera pedido. Encenderlo es una
	 * decisión de la persona; acá solo se recomienda.
	 */
	const [logoMode, setLogoMode] = useState<LogoMode>('nada');
	// El archivo del logo solo se adjunta —y solo se pide— cuando se eligió
	// dibujarlo. Con la firma escrita alcanza el nombre del negocio.
	const includeLogo = logoMode === 'imagen';
	// Carrusel completo: en cuáles páginas va el logo. Solo se mira cuando
	// `includeLogo` está prendido; al prenderlo arrancan todas.
	const [logoCarouselPages, setLogoCarouselPages] = useState<Set<number>>(new Set());
	/**
	 * Cuántas versiones distintas del mismo aviso se piden de una.
	 *
	 * El motor no devuelve dos veces lo mismo con el mismo prompt, así que
	 * pedir cuatro es la forma barata de elegir: se generan juntas, con el
	 * análisis y las decisiones ya tomadas, en vez de rehacer todo el flujo
	 * cuatro veces. En un carrusel no aplica: ahí la cantidad la fija cuántas
	 * páginas tiene el ganador.
	 */
	const [variantes, setVariantes] = useState(1);
	const count = wantsFullCarousel ? paginasAGenerar.length : variantes;

	/**
	 * Una sola URL fuera del carrusel por página.
	 *
	 * Varias URLs hacían que un aviso hablara de dos productos a la vez, y el
	 * ganador que se está clonando fue diseñado para uno: los textos, el lugar
	 * del héroe y la jerarquía son de un solo producto. Se sacó el botón de
	 * agregar, pero faltaba esto: quien armaba tres en el carrusel y después
	 * volvía a imagen suelta se quedaba con tres cargadas y sin nada en la
	 * pantalla que explicara de dónde salían.
	 */
	const variasUrls = wantsFullCarousel && !carouselSameProduct;
	useEffect(() => {
		if (!variasUrls) setUrls((prev) => (prev.length > 1 ? [prev[0]] : prev));
	}, [variasUrls]);
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');
	/**
	 * Quién aparece en el anuncio.
	 *
	 * Arranca en 'ai' pero se pisa apenas vuelve el análisis: la opción marcada
	 * depende de si el ganador muestra gente o no (ver `personModeRecomendado`).
	 * Antes solo había dos botones —"sin persona" y "cargar referencias"— y el
	 * primero no significaba lo que decía: el prompt seguía conservando a las
	 * personas del ganador, así que quien quería un aviso sin nadie no tenía
	 * ninguna forma de pedirlo.
	 *
	 * Desde esta pantalla solo se llega a tres de los cuatro valores. 'ai' y
	 * 'none' salen del análisis y no se preguntan; 'upload' es la única que se
	 * elige a mano, dentro de las decisiones para clonar. 'described' quedó sin
	 * puerta: describir a la persona con palabras es exactamente lo que se
	 * escribe en esas decisiones, y tener las dos cosas hacía que el usuario
	 * contestara la misma pregunta dos veces, a veces distinto.
	 */
	const [personMode, setPersonMode] = useState<PersonMode>('ai');
	/** La recomendación que salió del análisis: es la que manda si nadie la pisa. */
	const [personModeSugerido, setPersonModeSugerido] = useState<PersonMode>('ai');
	const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
	const [avatarPreviews, setAvatarPreviews] = useState<string[]>([]);
	const [avatarConsent, setAvatarConsent] = useState(false);

	// El armado es secuencial, como en el lote: 1 producto, 2 formato, 3 estilo.
	const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
	/**
	 * `confirmar` es la pantalla que reemplazó a la revisión larga: no se edita
	 * nada, se MIRA. Qué se leyó de la URL, qué colores y qué letra se detectaron,
	 * y qué ganador se va a clonar. Con eso a la vista se escriben las
	 * indicaciones, que es lo único que se escribe a mano.
	 */
	const [phase, setPhase] = useState<'setup' | 'planning' | 'confirmar' | 'review' | 'starting'>('setup');
	/** Lo que devolvió el escaneo: se guarda porque el setState no llega a tiempo. */
	const [confirmacion, setConfirmacion] = useState<{ productIds: string[]; offering: 'product' | 'service' | 'catalog' } | null>(null);
	const [copyMode, setCopyMode] = useState<'auto' | 'edit'>('auto');
	const [plan, setPlan] = useState<any>(null);
	/**
	 * El análisis de cada página del carrusel, en orden.
	 *
	 * `plan` es la vista de revisión —las páginas juntas en una sola pantalla—,
	 * pero lo que se le manda al render de cada página es SU análisis: el que se
	 * leyó de esa imagen. Mezclarlos era el motivo de que una página conservara el
	 * sujeto del ganador (un gato) en vez de reemplazarlo por el producto.
	 */
	const [slidePlans, setSlidePlans] = useState<any[]>([]);

	/**
	 * Los colores que se muestran al revisar.
	 *
	 * Prioriza lo que devolvió el análisis de la referencia, porque es lo que
	 * realmente se va a aplicar; si no vino, cae en lo que se detectó de la URL
	 * de la marca. Con "colores del ganador" no se muestra nada: no hay identidad
	 * propia que corregir, se respeta la del anuncio.
	 */
	/**
	 * Los colores que se muestran en la revisión.
	 *
	 * Con "colores del ganador" no se mostraba ninguno: la sección entera se
	 * escondía. Eso dejaba el caso más usado de los tres sin forma de ver ni de
	 * corregir la paleta, y encima es el que más importa — es la paleta que hay
	 * que CONSERVAR, y si el análisis la midió mal el aviso sale de otro color sin
	 * que nadie lo haya podido ver antes de gastar el crédito.
	 */
	const revisionPalette: Record<string, string> | null = (() => {
		if (colorMode === 'winner') {
			const medida = (plan as any)?.winnerPalette;
			if (!medida) return null;
			// Se muestran con los nombres del ganador: acá "texto" es el titular, que
			// es de lo que se leyó el color.
			return { background: medida.background || '', accent: medida.accent || '', secondary: medida.secondary || '', text: medida.headline || '' };
		}
		return (plan as any)?.brandPalette
			|| (importedProducts[0] as any)?.metadata?.brandFromUrl?.palette
			|| null;
	})();
	const paletaEsDelGanador = colorMode === 'winner';
	/**
	 * Todas las páginas analizadas: una sola cuando es una imagen suelta, todas
	 * las del carrusel cuando es completo. La pregunta del logo se responde
	 * mirándolas a todas, porque el archivo se coloca en varias imágenes.
	 */
	const planesDelGanador: any[] = slidePlans.length ? slidePlans : plan ? [plan] : [];
	/**
	 * Si el ganador firma con un logo DIBUJADO (un emblema, un escudo, un
	 * símbolo), que es el único caso donde poner el archivo del logo propio tiene
	 * dónde entrar.
	 *
	 * `templateHasLogoSlot` sola no alcanza: se prende igual cuando el ganador
	 * firma escribiendo su nombre en una tipografía, que es lo que pasa casi
	 * siempre. En esos avisos el clon escribe el nombre del negocio en ese mismo
	 * lugar y el archivo del logo no hace falta para nada.
	 */
	const ganadorTieneLogoDibujado = planesDelGanador.some((pagina) => pagina?.templateHasLogoSlot && !pagina?.logoIsWordmark);
	/** El ganador firma con el nombre escrito: ese lugar lo hereda el negocio. */
	const ganadorFirmaConElNombre = planesDelGanador.some((pagina) => pagina?.templateHasLogoSlot && pagina?.logoIsWordmark);
	const descripcionDelLogo: string = planesDelGanador.find((pagina) => pagina?.templateHasLogoSlot)?.logoDescription || '';

	/**
	 * El logo que se detectó en la web del producto: sale del escaneo de la URL,
	 * que lo deja guardado con el producto importado. Es el mismo archivo que el
	 * servidor vuelve a bajar al generar con logo.
	 */
	/**
	 * Lo que el escaneo leyó de la web, para mostrarlo antes de gastar un crédito.
	 * Se muestra aunque el aviso vaya con la identidad del ganador: es la única
	 * forma de darse cuenta a tiempo de que el escaneo leyó cualquier cosa.
	 */
	const marcaDeLaUrl: any = (importedProducts.find((item: any) => selectedProductIds.includes(item.id) && item?.metadata?.brandFromUrl)
		|| importedProducts[0] as any)?.metadata?.brandFromUrl || null;
	const paletaDeLaUrl: string[] = [...new Set(Object.values(marcaDeLaUrl?.palette || {})
		.filter((valor): valor is string => typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor)))];
	const tipografiaDeLaUrl: string = [marcaDeLaUrl?.typography?.headings, marcaDeLaUrl?.typography?.body]
		.filter(Boolean).join(' · ');

	const logoDeLaUrl: string = (() => {
		const elegido = importedProducts.find((item: any) => selectedProductIds.includes(item.id) && item?.metadata?.brandFromUrl?.logoUrl);
		return (elegido as any)?.metadata?.brandFromUrl?.logoUrl
			|| (importedProducts[0] as any)?.metadata?.brandFromUrl?.logoUrl
			|| '';
	})();
	/**
	 * El logo guardado en "Mi marca".
	 *
	 * Vive en un bucket privado, así que la miniatura no se puede armar sola en
	 * el navegador: la URL la firma el servidor y dura una hora. Se pide recién
	 * en la revisión, que es donde aparece la pregunta del logo.
	 *
	 * Se usa `profileLogoUrl` y no el logo de ninguna marca de la lista: el que
	 * el servidor baja al generar es el del perfil. Es el mismo archivo salvo en
	 * un caso, y ese caso importa —el logo que se detecta al analizar el sitio
	 * del negocio queda solo en el perfil—, así que mirando las marcas la
	 * miniatura decía "no tenemos logo" y el anuncio salía con uno.
	 */
	const [logoDeMiMarca, setLogoDeMiMarca] = useState('');
	/**
	 * Los colores y la tipografía guardados en Mi marca.
	 *
	 * La pantalla de confirmar mostraba siempre lo scrapeado de la URL, aunque el
	 * aviso fuera a usar la identidad propia: se veían unos colores y salían
	 * otros. Se traen del mismo endpoint que el logo.
	 */
	const [miMarca, setMiMarca] = useState<{ colors: string[]; typography: { headings?: string; body?: string } } | null>(null);
	/** Si hay algo detectado que valga la pena poder restablecer. */
	const hayColoresDetectados: boolean = colorMode === 'brand'
		? Boolean(miMarca?.colors?.length)
		: Boolean(paletaDeLaUrl.length || (Array.isArray(marcaDeLaUrl?.colors) && marcaDeLaUrl.colors.length));
	useEffect(() => {
		const laNecesito = brandSource === 'mine' || colorMode === 'brand' || typoMode === 'brand';
		if ((phase !== 'review' && phase !== 'confirmar') || !laNecesito || !token) return;
		let cancelado = false;
		void fetch('/api/creativos/brands', { headers: { authorization: `Bearer ${token}` } })
			.then((response) => response.ok ? response.json() : null)
			.then((payload) => {
				if (cancelado) return;
				setLogoDeMiMarca(typeof payload?.profileLogoUrl === 'string' ? payload.profileLogoUrl : '');
				const activa = (payload?.brands || []).find((marca: any) => marca.id === payload?.activeBrandId) || (payload?.brands || [])[0];
				setMiMarca(activa ? {
					colors: Array.isArray(activa.brand_colors) ? activa.brand_colors : [],
					typography: activa.brand_style?.typography || {},
				} : null);
			})
			.catch(() => { /* sin miniatura se sigue pudiendo elegir */ });
		return () => { cancelado = true; };
	}, [phase, brandSource, colorMode, typoMode, token]);
	/** El archivo concreto que se pegaría si se elige "con logo". */
	const logoQueSePondria = brandSource === 'mine' ? logoDeMiMarca : brandSource === 'url' ? logoDeLaUrl : '';
	const origenDelLogo = brandSource === 'mine' ? 'Mi marca' : 'la URL';
	/**
	 * El nombre que se va a escribir, para poder mostrarlo en la opción.
	 *
	 * Es solo para la pantalla: el que termina en la imagen lo resuelve el
	 * servidor, que ve el perfil además de lo escaneado. Si acá no se sabe se
	 * dice en genérico antes que arriesgar un nombre que después no sea ese.
	 */
	const nombreParaFirmar: string = (importedProducts.find((item: any) => selectedProductIds.includes(item.id) && item?.metadata?.brandFromUrl?.name) as any)?.metadata?.brandFromUrl?.name
		|| (importedProducts[0] as any)?.metadata?.brandFromUrl?.name || '';
	// En el botón entra recortado: los botones van en una fila que envuelve, y
	// un nombre largo lo estiraba hasta pasarse del ancho de la pantalla.
	const nombreEnElBoton = nombreParaFirmar.length > 22 ? `${nombreParaFirmar.slice(0, 21)}…` : nombreParaFirmar;
	/** Dónde firma el ganador, en castellano, para poder decírselo al usuario. */
	const dondeFirmaElGanador: string = planesDelGanador.find((pagina) => pagina?.templateHasLogoSlot)?.logoWhere || '';
	/**
	 * El link del logo existe pero la imagen no carga. Pasa con logos detectados
	 * en webs ajenas: el archivo se movió o el sitio no lo sirve afuera. Sin esto
	 * quedaba el ícono de imagen rota justo donde había que confiar en lo que se
	 * iba a poner en el anuncio.
	 */
	const [logoRoto, setLogoRoto] = useState(false);
	useEffect(() => { setLogoRoto(false); }, [logoQueSePondria]);
	/**
	 * Si hay un archivo de logo que efectivamente se pueda pegar en la imagen.
	 *
	 * Sin esto, "Con logo de la URL" salía marcado como RECOMENDADO aunque no se
	 * hubiera podido traer ningún archivo: se elegía la opción recomendada, abajo
	 * aparecía un recuadro vacío y el anuncio salía sin logo igual. La
	 * recomendación tiene que mirar lo que hay, no lo que el ganador hace.
	 */
	const hayLogoUsable = Boolean(logoQueSePondria) && !logoRoto;

	// `slide` viene sellado por el análisis de cada página del carrusel: es lo que
	// permite agrupar los textos por imagen y devolverle a cada página lo suyo.
	const [zones, setZones] = useState<Array<{ slide?: number; where?: string; messageRole?: string; original?: string; replacement?: string; onProduct?: boolean }>>([]);
	const [people, setPeople] = useState<Array<{ slide?: number; where?: string; role?: string; description?: string; directive?: string }>>([]);
	/**
	 * Las personas que el render va a tener en cuenta.
	 *
	 * El analizador devuelve a veces entradas sin un solo dato, y el prompt las
	 * descarta. Contarlas acá hacía que la pantalla dijera "el ganador muestra 2
	 * personas" sobre un aviso donde en realidad solo hay una.
	 */
	const personasVisibles = people.filter((persona) => persona && (persona.description || persona.directive || persona.where));
	const [comparisons, setComparisons] = useState<Array<{ slide?: number; where?: string; role?: string; description?: string; directive?: string }>>([]);
	/**
	 * Que hacer con la fila de medios del ganador ("As seen on: Forbes, NBC").
	 *
	 * Son marcas de terceros y afirman una cobertura que el anunciante no tiene,
	 * asi que el default es quitarla y el aviso se cierra solo. Pero hay negocios
	 * que SI tienen prensa o certificaciones propias, y hasta ahora no habia forma
	 * de mostrarlas: la unica salida era borrar el bloque.
	 */
	const [pressRowMode, setPressRowMode] = useState<'quitar' | 'texto' | 'logos'>('quitar');
	const [pressRowItems, setPressRowItems] = useState('');
	const [creativeDecisions, setCreativeDecisions] = useState<Array<{ slide?: number; type?: string; title?: string; where?: string; description?: string; question?: string; defaultStrategy?: string; options?: string[]; confidence?: string; directive?: string }>>([]);
	/**
	 * Dónde va la opción de usar fotos propias: dentro de la primera decisión que
	 * ya pregunta por la persona del anuncio.
	 *
	 * Vivía en una tarjeta aparte, pegada abajo de esa misma pregunta, así que la
	 * pantalla preguntaba dos veces por lo mismo y las respuestas podían chocar:
	 * "una mujer con estilo urbano" en una y "usar mis fotos" en la otra, sin
	 * forma de saber cuál mandaba. Es una sola decisión con una opción más.
	 */
	const indiceDecisionDePersona = personasVisibles.length
		? creativeDecisions.findIndex((decision) => decision?.type === 'person')
		: -1;
	/** Qué decisiones tienen abierto el campo para escribir una respuesta propia. */
	const [escribiendo, setEscribiendo] = useState<Set<number>>(new Set());
	/**
	 * El fondo del aviso, corregible antes de generar.
	 *
	 * Se medía en prosa —"verde salvia suave"— y un nombre se re-interpreta
	 * al volver a dibujar, así que el clon salía con otro verde. Ahora viene en
	 * hexadecimal, se ve, y se puede corregir: es lo único de la paleta que se
	 * podía arreglar en un segundo y había que descubrir gastando un crédito.
	 */
	const [fondoDelAviso, setFondoDelAviso] = useState('');
	const [comparisonGuidance, setComparisonGuidance] = useState('');
	const [error, setError] = useState('');

	/**
	 * El borrador de la revisión.
	 *
	 * Llegar hasta acá costó un análisis de visión del ganador, que ya se pagó y
	 * ya se esperó. Cerrar la pestaña o tocar atrás antes de generar lo tiraba
	 * todo y había que rehacerlo desde la url. Se guarda solo el último, y solo
	 * mientras está en revisión: en 'setup' no hay nada que valga la pena, y en
	 * 'starting' la generación ya salió.
	 */
	const usuarioId: string = session?.user?.id || '';
	const [borradorGuardado, setBorradorGuardado] = useState<Borrador | null>(null);

	/**
	 * Con qué anuncio está trabajando y en qué paso va.
	 *
	 * La vista sola dice "biblioteca de ganadores", que no distingue a alguien
	 * mirando la grilla de alguien a punto de gastar un crédito. Acá se sabe las
	 * dos cosas: qué ganador abrió y si ya pasó a revisar.
	 */
	useEffect(() => {
		if (!token) return;
		const paso = phase === 'review' ? 'revisando' : phase === 'planning' ? 'winners' : 'creando';
		reportarPantalla(token, paso, ad?.name || '');
	}, [token, phase, ad?.name]);

	// Se lee UNA vez, al abrir. Si se leyera en cada render, apenas la persona
	// tocara algo el aviso de "seguí donde estabas" reaparecería sobre su propio
	// trabajo.
	useEffect(() => {
		if (!usuarioId) return;
		const guardado = leerBorrador(usuarioId);
		// Solo se ofrece si es del MISMO anuncio ganador que está abierto: retomar
		// las decisiones de otro anuncio sobre este sería peor que no ofrecer nada.
		if (!guardado || guardado.ad?.imagePath !== ad?.imagePath) {
			// De otro ganador: retomarlo acá sería pisar este con decisiones ajenas.
			if (guardado) borrarBorrador();
			return;
		}
		// Si se entró desde el aviso de la biblioteca ya se decidió retomarlo: se
		// restaura solo. Si se entró por la grilla, se ofrece y decide la persona.
		if (retomarAlAbrir) retomarDelBorrador(guardado);
		else setBorradorGuardado(guardado);
		// El borrador se lee al abrir y nada más. Releerlo en cada render haría
		// que el aviso reapareciera encima del trabajo que se está haciendo.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [usuarioId, ad?.imagePath, retomarAlAbrir]);

	/**
	 * Lo que hay que volver a poner para que la revisión quede igual.
	 *
	 * `logoCarouselPages` es un Set y JSON lo serializa como {}: viajaba vacío y
	 * al restaurar un carrusel el logo desaparecía de todas las páginas.
	 */
	function estadoDeLaRevision() {
		return {
			phase, formStep, copyMode, fondoDelAviso, carouselMode, carouselSameProduct, selectedSlideIndex, paginasElegidas,
			productMode, scannedOffering, alcanceOverride, urls, selectedProductIds, importedProducts,
			manualProductName, manualProductFacts,
			format, language, colorMode, typoMode, brandSource, paletteOverride, indicaciones,
			logoMode, logoCarouselPages: [...logoCarouselPages],
			personMode, personModeSugerido, avatarConsent, personaEscrita,
			pressRowMode, pressRowItems, variantes,
			plan, slidePlans, zones, people, comparisons, creativeDecisions, comparisonGuidance,
		};
	}

	// Se guarda mientras está en revisión y ante cada cambio. En 'setup' no hay
	// nada que valga la pena guardar todavía, y en 'starting' la generación ya
	// salió: dejar el borrador ahí haría que al volver se ofreciera repetir algo
	// que ya se hizo y ya se cobró.
	/**
	 * Si hay algo cargado que valga la pena no perder.
	 *
	 * Abrir un ganador y salir no es trabajo: guardar eso llenaría el Inicio de
	 * un aviso que ofrece retomar una pantalla vacía. Cargar la url, elegir los
	 * productos o escribir el producto a mano, sí.
	 */
	const hayTrabajoCargado = selectedProductIds.length > 0
		|| importedProducts.length > 0
		|| Boolean(manualProductName.trim())
		|| urls.some((url) => url.trim());

	// Se guarda en el armado y en la revisión. En 'planning' no: el análisis está
	// corriendo y a mitad de camino no hay nada coherente que guardar. En
	// 'starting' tampoco: la generación ya salió y el borrador pasaría de ser una
	// ayuda a ofrecer repetir algo que ya se hizo y ya se cobró.
	useEffect(() => {
		if (!usuarioId) return;
		if (phase === 'review' || (phase === 'setup' && hayTrabajoCargado)) {
			guardarBorrador(usuarioId, ad, estadoDeLaRevision());
		}
	});

	/** Vuelve a poner lo guardado y salta directo a la revisión. */
	function retomarDelBorrador(guardado: Borrador) {
		const e = guardado.estado as any;
		const poner = <T,>(valor: T | undefined, set: (v: T) => void) => { if (valor !== undefined) set(valor); };
		poner(e.formStep, setFormStep); poner(e.copyMode, setCopyMode);
		poner(e.carouselMode, setCarouselMode); poner(e.carouselSameProduct, setCarouselSameProduct);
		poner(e.paginasElegidas, setPaginasElegidas);
		poner(e.selectedSlideIndex, setSelectedSlideIndex);
		poner(e.productMode, setProductMode); poner(e.scannedOffering, setScannedOffering);
		poner(e.alcanceOverride, setAlcanceOverride); poner(e.urls, setUrls);
		poner(e.selectedProductIds, setSelectedProductIds); poner(e.importedProducts, setImportedProducts);
		poner(e.manualProductName, setManualProductName); poner(e.manualProductFacts, setManualProductFacts);
		poner(e.format, setFormat); poner(e.language, setLanguage);
		poner(e.colorMode, setColorMode); poner(e.typoMode, setTypoMode);
		poner(e.indicaciones, setIndicaciones);
		poner(e.brandSource, setBrandSource); poner(e.paletteOverride, setPaletteOverride);
		poner(e.logoMode, setLogoMode);
		if (Array.isArray(e.logoCarouselPages)) setLogoCarouselPages(new Set(e.logoCarouselPages));
		poner(e.personMode, setPersonMode); poner(e.personModeSugerido, setPersonModeSugerido);
		poner(e.personaEscrita, setPersonaEscrita);
		poner(e.avatarConsent, setAvatarConsent);
		poner(e.pressRowMode, setPressRowMode); poner(e.pressRowItems, setPressRowItems);
		poner(e.variantes, setVariantes);
		poner(e.plan, setPlan); poner(e.slidePlans, setSlidePlans);
		poner(e.zones, setZones); poner(e.people, setPeople);
		poner(e.comparisons, setComparisons); poner(e.creativeDecisions, setCreativeDecisions);
		poner(e.comparisonGuidance, setComparisonGuidance);
		poner(e.fondoDelAviso, setFondoDelAviso);
		setBorradorGuardado(null);
		// Vuelve a la pantalla donde lo dejó. Mandarlo siempre a la revisión hacía
		// que un borrador sin analizar cayera en una pantalla que no tiene nada
		// que mostrar, porque el análisis del ganador todavía no existe.
		setPhase(e.phase === 'review' ? 'review' : 'setup');
	}

	const chip = (active: boolean) => ({
		padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
		border: active ? '2px solid #744bde' : '1px solid #e2dde9', background: active ? '#f4f2f6' : '#fff', color: active ? '#744bde' : '#3f3a48',
	} as const);

	const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '9px', letterSpacing: '.01em' } as const;
	/**
	 * Qué le falta a la carga de fotos para poder generar.
	 *
	 * Sin esto, elegir "usar mis fotos" y no subir ninguna dejaba seguir: se
	 * gastaba el crédito, arrancaba la generación y recién el worker cortaba con
	 * "el avatar necesita al menos 4 imágenes", que además de tarde era falso. La
	 * pantalla tiene que decirlo ANTES, que es cuando todavía se puede resolver.
	 */
	const faltaParaElAvatar = personMode !== 'upload'
		? ''
		: !avatarFiles.length
			? 'Subí al menos una foto de la persona para poder generar.'
			: !avatarConsent
				? 'Confirmá que tenés permiso para usar esas fotos.'
				: '';
	/**
	 * La carga de fotos de la persona. Se usa dentro de la decisión que ya
	 * pregunta por ella y, si el análisis no dejó ninguna, en su propia tarjeta.
	 */
	const cargaDeAvatar = (
		<div style={{ marginTop: '10px' }}>
			<input type="file" id="creation-avatar-files" accept="image/png,image/jpeg,image/webp" multiple className="hidden-file-input" onChange={(event) => {
				const files = event.target.files ? Array.from(event.target.files).slice(0, 6) : [];
				setAvatarFiles(files); setAvatarPreviews(files.map((file) => URL.createObjectURL(file))); event.target.value = '';
			}} />
			{/* Pedía cuatro como mínimo y era un cerrojo, no un consejo: el que tiene
			    una sola foto buena suya no podía usar la función. Con una alcanza
			    para fijar la identidad; que dos o tres la sostengan mejor entre
			    creativos es información útil, no un requisito. */}
			<label htmlFor="creation-avatar-files" className="uploader-label" style={{ display: 'inline-flex', width: 'auto' }}>Subir fotos de la persona</label>
			<p style={{ margin: '8px 0 0', fontSize: '12px', color: '#716d79', lineHeight: 1.45 }}>Con una foto alcanza; podés subir hasta 6. Con dos o tres de ángulos distintos —frente, perfil, medio cuerpo— la cara y la contextura salen más parecidas de un creativo a otro. La ropa no importa: en el anuncio va a llevar lo que estés vendiendo.</p>
			{avatarPreviews.length > 0 && <div className="extra-previews-grid" style={{ marginTop: '10px' }}>{avatarPreviews.map((preview) => <div className="preview-thumb" key={preview}><img src={preview} alt="Referencia de avatar" /></div>)}</div>}
			<label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '10px', fontSize: '12px', color: '#5f5a67' }}><input type="checkbox" checked={avatarConsent} onChange={(event) => setAvatarConsent(event.target.checked)} /> Confirmo que tengo permiso para usar estas imágenes.</label>
			{faltaParaElAvatar && <p style={{ margin: '9px 0 0', padding: '8px 10px', borderRadius: '9px', background: '#fdf0f3', color: '#b02a4a', fontSize: '12px', fontWeight: 700, lineHeight: 1.4 }}>⚠️ {faltaParaElAvatar}</p>}
		</div>
	);
	// Carrusel completo con productos distintos: 1 URL por página, en orden.
	// El resto de los casos (mismo producto, o solo una página) piden 1 solo.
	const urlsNeeded = wantsFullCarousel && !carouselSameProduct ? paginasAGenerar.length : 1;
	const filledUrls = urls.map((u) => u.trim()).filter(Boolean).length;
	const step1Ready = (productMode === 'url' && filledUrls >= urlsNeeded)
		
		|| (productMode === 'manual' && manualProductName.trim() && !(wantsFullCarousel && !carouselSameProduct));
	const comparisonInfo = plan?.comparison || {};
	const comparisonDetected = comparisons.length > 0 || comparisonInfo.detected === true;
	const comparisonTitle = comparisonInfo.type === 'us-vs-them'
		? 'Detectamos un “Nosotros vs. Ellos”'
		: comparisonInfo.type === 'before-after'
			? 'Detectamos una comparación antes y después'
			: comparisonInfo.type === 'comparison-grid'
				? 'Detectamos una comparación entre varias opciones'
			: 'Detectamos una comparación en el diseño';
	const creativeDecisionIcon = (type?: string) => ({
		person: '👤',
		scene: '◫',
		styling: '✦',
		object: '◆',
		comparison: '⇄',
		'product-handling': '◉',
		other: '✧',
	}[type || 'other'] || '✧');

	// Escanea una o varias URLs → devuelve los IDs de producto importados.
	async function scanUrls(list: string[]): Promise<string[]> {
		setError('');
		const ids: string[] = [];
		const productsById = new Map<string, ProductReviewItem>();
		try {
			for (const raw of list) {
				const response = await fetch('/api/creativos/products', {
					method: 'POST',
					headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: raw }),
				});
				// Un 504 de la función llega como HTML, no como JSON.
				const payload = await leerRespuestaDeEscaneo(response);
				if (response.ok && payload.importedIds?.length) {
					ids.push(...payload.importedIds);
					if (Array.isArray(payload.products)) {
						// Lo que detectó la IA al leer la página manda sobre el default.
						const pageType = payload.products.find((item: any) => item?.metadata?.pageType)?.metadata?.pageType;
						if (pageType === 'service' || pageType === 'product' || pageType === 'catalog') setScannedOffering(pageType);
						payload.products.forEach((product: ProductReviewItem) => {
							if (product?.id && payload.importedIds.includes(product.id)) productsById.set(product.id, product);
						});
					}
				}
				else if (list.length === 1) throw new Error(payload.errors?.[0]?.error || payload.error || 'No pudimos analizar esa URL.');
			}
			if (!ids.length) throw new Error('No pudimos analizar ninguna de las URLs.');
			const uniqueIds = [...new Set(ids)];
			const importados = [...productsById.values()];
			setImportedProducts(importados);
			/**
			 * Qué productos entran al anuncio, elegidos solos.
			 *
			 * Antes entraban TODOS. Con la home de una tienda eso son ocho, y como
			 * el anuncio habla del negocio en general, el usuario tenía que
			 * desmarcar a mano los que no quería: se le pedía curar un catálogo
			 * para hacer un aviso que ni siquiera va a nombrar productos.
			 *
			 * Ahora, cuando la página es una tienda, se eligen hasta cuatro y se
			 * prefieren aquellos cuya foto se pudo emparejar con su nombre. Los que
			 * quedaron con una foto que no les corresponde van al final: mostrar
			 * cuero de suela diciendo que es otra cosa es peor que no mostrarlo.
			 * Sigue siendo editable, pero ya no hace falta tocarlo.
			 */
			const esTienda = importados.some((item: any) => item?.metadata?.pageType === 'catalog');
			if (esTienda && importados.length > 1) {
				// Primero lo que la IA marcó como representativo del negocio, y entre
				// esos los que tienen una foto que de verdad les corresponde.
				const puntaje = (item: any) =>
					(item?.metadata?.representative ? 2 : 0) + (item?.metadata?.photoMatched ? 1 : 0);
				const ordenados = [...importados].sort((a: any, b: any) => puntaje(b) - puntaje(a));
				const elegidos = ordenados.slice(0, 4).map((item: any) => item.id);
				setSelectedProductIds(elegidos);
				return uniqueIds;
			}
			setSelectedProductIds(uniqueIds);
			return uniqueIds;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo escanear la URL.');
			setImportedProducts([]);
			setSelectedProductIds([]);
			return [];
		}
	}

	// Lee un PDF / Word / Excel y precarga nombre + descripción + imágenes.
	async function parseDoc(file: File | null) {
		if (!file) return;
		setParsingDoc(true); setError('');
		try {
			const form = new FormData();
			form.set('file', file);
			const res = await fetch('/api/creativos/parse-doc', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'No pudimos leer el archivo.');
			if (payload.name) setManualProductName(payload.name);
			if (payload.facts) setManualProductFacts(payload.facts);
			if (Array.isArray(payload.images) && payload.images.length) {
				const files: File[] = [];
				const previews: string[] = [];
				for (let i = 0; i < payload.images.length; i++) {
					try {
						const blob = await (await fetch(payload.images[i])).blob();
						files.push(new File([blob], `doc-img-${i}.png`, { type: blob.type || 'image/png' }));
						previews.push(payload.images[i]);
					} catch { /* imagen inválida */ }
				}
				if (files.length) { setUploadFiles((prev) => [...prev, ...files]); setUploadPreviews((prev) => [...prev, ...previews]); }
			}
			if (onToast) onToast('Archivo analizado: revisá el nombre y la descripción.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No pudimos leer el archivo.');
		} finally { setParsingDoc(false); }
	}

	async function requestPlan() {
		setPhase('planning'); setError('');
		try {
			let productIds: string[] = [];
			let offeringForSubmit: 'product' | 'service' | 'catalog' = detectedOffering;
			let isCatalogSubmit = false;
			if (productMode === 'url') {
				const list = urls.map((u) => u.trim()).filter(Boolean);
				if (!list.length && productMode === 'url') { setError('Pegá al menos una URL.'); setPhase('setup'); return; }
				if (list.length) productIds = await scanUrls(list);
				// Volver al paso de la URL, que es lo único que se puede arreglar.
				//
				// Antes se volvía a `setup` dejando el paso en 3: aparecía la pantalla de
				// estilo con un cartel rojo abajo y se leía como que la app se cayó sola,
				// cuando en realidad la URL no se pudo leer. `scanUrls` ya dejó el motivo
				// en `error`; acá se garantiza que haya uno aunque se haya perdido.
				if (productMode === 'url' && !productIds.length) {
					setError((previo) => previo || 'No pudimos leer esa URL. Revisala o probá con otra.');
					setFormStep(1);
					setPhase('setup');
					return;
				}
				// setState no se refleja en este mismo handler: se relee del producto.
				const scanned = importedProducts.find((item: any) => productIds.includes(item.id));
				const scannedType = (scanned as any)?.metadata?.pageType;
				if (scannedType === 'service' || scannedType === 'catalog') offeringForSubmit = scannedType;
				// De un catálogo se importan varios productos: entran todos como
				// referencia para que el anuncio muestre una selección de la tienda.
				if (scannedType === 'catalog' && productIds.length > 1) isCatalogSubmit = true;
			}
			// Se generaba después de una pantalla de revisión donde había que decidir
			// una cosa por vez: qué decía cada texto, quién aparecía, con qué se
			// firmaba, qué pasaba con la fila de medios. Eso existía porque el prompt
			// detallado necesitaba que alguien resolviera todo eso antes de dictárselo
			// al motor. El clon libre no le dicta nada: le da el ganador y la ficha del
			// producto y resuelve solo, así que la revisión pasó a ser una fila de
			// preguntas cuyas respuestas ya no se leen.
			//
			// Quedan los tres controles que sí cambian el aviso —colores, tipografía y
			// formato— y ya se eligieron en el paso anterior. El análisis se sigue
			// haciendo: lo corre el servidor dentro de la misma generación, antes de
			// pedirle la imagen al motor.
			//
			setConfirmacion({ productIds, offering: offeringForSubmit });
			// El análisis del ganador se pedía DURANTE la generación y su lista de
			// textos se descartaba entera. Ahora se pide acá para poder mostrarla y
			// corregirla: el mismo trabajo, movido antes. Viaja con la generación,
			// así que el servidor no lo repite.

			const form = new FormData();
			form.set('referencePath', effectiveReferencePath);
			if (wantsFullCarousel) form.set('referencePaths', JSON.stringify(paginasAGenerar));
			form.set('language', language);
			form.set('brandSource', brandSource);
			form.set('subjectMode', offeringForSubmit);
			if (productMode === 'url' && productIds.length) {
				form.set('productId', productIds[0]); // contexto de análisis
				if (isCatalogSubmit) productIds.slice(0, 5).forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			if (isService) {
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			// Tope propio del navegador: si el servidor se cuelga o la conexión se
			// corta, el fetch puede no resolver nunca y la pantalla queda girando
			// sin decir nada. Es lo que pasaba cuando el análisis excedía el límite
			// de la función: el trabajo terminaba y la respuesta no llegaba.
			const corte = new AbortController();
			const reloj = window.setTimeout(() => corte.abort(), 300000);
			let response: Response;
			try {
				response = await fetch('/api/creativos/plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form, signal: corte.signal });
			} catch (fallo) {
				if ((fallo as any)?.name === 'AbortError') throw new Error('El análisis tardó demasiado. Probá de nuevo, y si se repite elegí otro anuncio de referencia.');
				throw new Error('Se cortó la conexión mientras analizábamos la referencia. Probá de nuevo.');
			} finally {
				window.clearTimeout(reloj);
			}
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error((payload as any).error || 'No se pudo analizar la referencia.');
			const analysis = payload.analysis || {};
			setPlan(analysis);
			setSlidePlans(Array.isArray(payload.slideAnalyses) ? payload.slideAnalyses : []);
			setZones((analysis.textZones || []).filter((zone: any) => analysis.productHasPackaging ? true : !zone.onProduct));
			setPeople(Array.isArray(analysis.people) ? analysis.people.map((p: any) => ({ ...p, directive: '' })) : []);
			// La opción de persona se pre-elige acá, con el ganador ya leído: es el
			// único momento en que se sabe si el aviso que se va a clonar muestra
			// gente. Se pisa cualquier elección anterior a propósito — si se cambió
			// de anuncio ganador, la recomendación vieja ya no dice nada del nuevo.
			const sugerido = personModeRecomendado(analysis.people);
			setPersonModeSugerido(sugerido);
			setPersonMode(sugerido);
			// Con qué se firma se pre-elige igual: si el ganador firma en algún
			// lado, el clon firma ahí y con el nombre escrito. En un carrusel la
			// firma puede estar en una sola página, así que se miran todas.
			setLogoMode(logoModeRecomendado(Array.isArray(payload.slideAnalyses) && payload.slideAnalyses.length ? payload.slideAnalyses : analysis));
			setFondoDelAviso(analysis.backgroundColor || '');
			setComparisons(Array.isArray(analysis.comparisonItems) ? analysis.comparisonItems.map((c: any) => ({ ...c, directive: '' })) : []);
			setCreativeDecisions(Array.isArray(analysis.creativeDecisions) ? analysis.creativeDecisions.map((decision: any) => ({ ...decision, directive: '' })) : []);
			setComparisonGuidance('');
			setPhase(wantsFullCarousel ? 'review' : 'confirmar');
		} catch (cause) {
			// Sin análisis se puede generar igual: el prompt libre no lo necesita, solo
			// pierde la lista de textos. Cortar acá sería peor que seguir sin ella.
			console.error('No se pudo analizar la referencia:', cause);
			setPhase('confirmar');
		}
	}

	/**
	 * El análisis que se manda a generar, con la revisión del usuario encima.
	 *
	 * Sin `pagina` es el de una imagen suelta. Con `pagina` es el de ESA página del
	 * carrusel —el que se leyó de esa imagen y de ninguna otra— más solamente los
	 * textos, las personas, las comparaciones y las decisiones que le tocan. Antes
	 * viajaba un único análisis promedio para todas las páginas: los textos sí se
	 * repartían y todo lo que decide la IMAGEN no, así que la página 1 se generaba
	 * con el producto y la escena que el análisis había leído en la página 3.
	 */
	function planRevisado(pagina?: number) {
		const base = pagina ? (slidePlans[pagina - 1] || plan) : plan;
		const suyo = <T extends { slide?: number }>(items: T[]) => (pagina ? items.filter((item) => !item.slide || item.slide === pagina) : items);
		return {
			...base,
			textZones: suyo(zones),
			people: suyo(people),
			comparisonItems: suyo(comparisons),
			creativeDecisions: suyo(creativeDecisions),
			// El fondo corregido pisa al medido: si alguien lo tocó, es porque el
			// que se leyó estaba mal.
			backgroundColor: fondoDelAviso || base?.backgroundColor || '',
			comparison: { ...(base?.comparison || {}), userGuidance: comparisonGuidance.trim() },
		};
	}

	/**
	 * Sube las fotos del avatar y devuelve el id con el que el servidor las va a
	 * volver a buscar.
	 *
	 * Tiene que quedar guardado: el render de un carrusel no ocurre en este
	 * pedido, lo hace un worker minutos después, y para entonces los archivos que
	 * el usuario eligió en el navegador ya no existen en ningún lado.
	 */
	/**
	 * Los colores tal como los leyó el escaneo.
	 *
	 * `pisando` distingue los dos usos: al entrar a la pantalla se completan solo
	 * los vacíos —si alguien ya corrigió un color, volver a entrar no puede
	 * deshacérselo— y el botón de restablecer sí pisa todo, que es lo que se le
	 * está pidiendo.
	 */
	function coloresDetectados(pisando: boolean) {
		const deMiMarca = colorMode === 'brand';
		const paleta = deMiMarca ? {} : (marcaDeLaUrl?.palette || {});
		const sueltos: string[] = deMiMarca
			? (miMarca?.colors || [])
			: (Array.isArray(marcaDeLaUrl?.colors) ? marcaDeLaUrl.colors : []);
		setRolesDeColor((previo) => {
			const siguiente = { ...previo };
			ROLES_DE_COLOR.forEach((rol, i) => {
				if (siguiente[rol.id] && !pisando) return;
				const detectado = paleta[rol.desde] || sueltos[i];
				if (typeof detectado === 'string' && /^#[0-9a-f]{6}$/i.test(detectado)) siguiente[rol.id] = detectado.toUpperCase();
				else if (pisando) delete siguiente[rol.id];
			});
			return siguiente;
		});
	}

	useEffect(() => {
		if (phase !== 'confirmar') return;
		/**
		 * Las TRES primeras fotos vienen marcadas, que es como estaba en bb23858.
		 *
		 * Mandarlas todas se probó y las imágenes salieron peor: cada foto de más es
		 * una señal que compite con la referencia, y con diecisiete el ganador pesa
		 * una parte de diecisiete. Se completan solo si no hay elección previa, y el
		 * selector sigue estando para cambiarlas.
		 */
		setFotosElegidas((previo) => {
			if (previo.length) return previo;
			const elegido = importedProducts.find((item: any) => selectedProductIds.includes(item.id)) || importedProducts[0];
			const fotos = ((elegido as any)?.media || []).filter((m: any) => m.type !== 'video' && m.url);
			return fotos.slice(0, 3).map((foto: any, i: number) => foto.path || `upload:${i}`);
		});
		coloresDetectados(false);
		const letra = typoMode === 'brand' ? miMarca?.typography : marcaDeLaUrl?.typography;
		setTipografiaElegida((previo) => ({
			headings: previo.headings || String(letra?.headings || ''),
			body: previo.body || String(letra?.body || ''),
		}));
	}, [phase, marcaDeLaUrl, miMarca, colorMode, typoMode]);

	async function guardarAvatarCargado(): Promise<string> {
		// Con una foto alcanza para fijar la cara. El piso de cuatro dejaba afuera
		// al que tiene una sola buena foto suya, que es el caso más común.
		if (!avatarFiles.length) throw new Error('Subí al menos una foto de la persona.');
		if (!avatarConsent) throw new Error('Confirmá que tenés permiso para usar esas imágenes.');
		const avatarForm = new FormData();
		avatarForm.set('name', 'Avatar de esta generación');
		// La identidad la fijan las fotos, no el texto: lo que el usuario haya
		// escrito en "yo la describo" no se arrastra acá, porque cambiar de opción
		// no puede dejar colada la descripción del modo anterior en el prompt.
		avatarForm.set('description', 'Referencias visuales guardadas desde el flujo de generación.');
		avatarForm.set('consentConfirmed', 'true');
		avatarFiles.slice(0, 6).forEach((file) => avatarForm.append('images', file));
		const respuesta = await fetch('/api/creativos/avatars', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: avatarForm });
		const payload = await respuesta.json().catch(() => ({}));
		if (!respuesta.ok || !payload.avatar?.id) throw new Error(payload.error || 'No se pudo guardar el avatar.');
		return payload.avatar.id as string;
	}

	/**
	 * `directo` viene del flujo sin revisión: trae los ids recién importados porque
	 * el setState del scaneo todavía no se refleja en el mismo handler, y marca que
	 * no hay plan revisado que mandar.
	 */
	async function approveAndGenerate(directo?: { productIds: string[]; offering: 'product' | 'service' | 'catalog' }) {
		// Mismo cerrojo que el carrusel: el botón se deshabilita con `phase`, pero
		// entre dos clics muy seguidos ese estado todavía vale el valor viejo.
		if (enviando.current) return;
		enviando.current = true;
		setPhase('starting'); setError('');
		borrarBorrador();
		onGenerationRequested?.();
		try {
			const idsDeProducto = directo?.productIds ?? selectedProductIds;
			if (productMode === 'url' && idsDeProducto.length === 0) {
				throw new Error('Elegí al menos un producto para generar la imagen.');
			}
			const pathPrefixId = parseInt(ad.imagePath.split('/')[0], 10);
			const form = new FormData();
			form.set('templateId', String(!isNaN(pathPrefixId) ? pathPrefixId : 40));
			form.set('templateName', ad.name || 'Anuncio Ganador');
			form.set('referencePath', effectiveReferencePath);
			form.set('imageType', 'promotion');
			form.set('fidelity', '1');
			form.set('preset', 'Fiel al ganador');
			form.set('count', String(count));
			form.set('format', format);
			form.set('language', language);
			form.set('colorMode', colorMode);
			// Lo elegido en las decisiones y lo escrito a mano viajan juntos: son la
			// misma cosa para el prompt —qué quiere el anunciante— y separarlos en dos
			// canales sería abrirle un segundo camino a la generación.
			const pedido = [...Object.values(decisionElegida), indicaciones.trim()].filter(Boolean).join(' · ').slice(0, 600);
			if (pedido) form.set('brief', pedido);
			if (Object.values(rolesDeColor).some(Boolean)) form.set('rolesDeColor', JSON.stringify(rolesDeColor));
			if (fotosElegidas.length) form.set('fotosElegidas', JSON.stringify(fotosElegidas));
			// "Sin logo" es una decisión explícita y por eso pisa la regla por defecto
			// del prompt, que firma donde el ganador firma.
			if (sinLogo) { form.set('logoMode', 'nada'); form.set('includeLogo', '0'); }
			if (typoMode !== 'winner' && (tipografiaElegida.headings.trim() || tipografiaElegida.body.trim())) {
				form.set('tipografiaOverride', JSON.stringify(tipografiaElegida));
			}
			if (logoPropio) {
				// El backend solo adjunta el archivo cuando se pidió firmar con imagen:
				// haberlo subido ES ese pedido.
				form.set('logo', logoPropio);
				form.set('includeLogo', '1');
				form.set('logoMode', 'imagen');
			}
			if (Object.keys(paletteOverride).length) form.set('paletteOverride', JSON.stringify(paletteOverride));
			form.set('typoMode', typoMode);
			form.set('brandSource', brandSource);
			form.set('subjectMode', directo?.offering ?? detectedOffering);
			form.set('includeLogo', includeLogo ? '1' : '0');
			// Sin revisión no se manda ninguna de estas: son respuestas a preguntas que
			// ya no se hacen, y mandarlas con su valor por defecto sería peor que no
			// mandarlas. `logoMode: 'nada'` apagaría la firma en TODOS los avisos,
			// incluso en los que el ganador firma; sin el campo, el prompt decide
			// mirando la referencia, que es lo que queremos.
			form.set('personMode', personMode);
			if (personMode === 'described' && personaEscrita.trim()) form.set('avatarDescription', personaEscrita.trim());
			if (personMode === 'upload') form.set('avatarId', await guardarAvatarCargado());
			if (plan) form.set('plan', JSON.stringify(planRevisado()));
			if (!directo) {
				form.set('logoMode', logoMode);
				form.set('pressRowMode', pressRowMode);
				if (pressRowMode !== 'quitar') form.set('pressRowItems', pressRowItems.trim());
			}
			if ((productMode === 'url' || isService) && idsDeProducto.length) {
				idsDeProducto.forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			// Las fotos propias van siempre, venga el producto de una URL o escrito a
			// mano: son fotos más del mismo producto y se suman a las detectadas.
			if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));

			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación.');
			if (payload.async && payload.batchId && onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					// El título llevaba el nombre del ganador —"Nosotros vs Ellos (75)"—,
					// que es el nombre del archivo en la biblioteca y no le dice nada a
					// nadie. Lo que identifica a una imagen generada es de qué es.
					title: manualProductName.trim() || 'Creativo',
					referenceUrl,
					count,
				});
				onBack({ trasGenerar: true });
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación.');
			setPhase(directo ? 'confirmar' : 'review');
		} finally {
			enviando.current = false;
		}
	}

	/**
	 * Los textos agrupados por página del carrusel.
	 *
	 * El análisis ya devuelve en qué página va cada texto, pero la lista los
	 * mostraba todos seguidos: con un carrusel de diez páginas eran treinta
	 * textos sin ninguna referencia de a cuál imagen pertenecía cada uno. Se
	 * conserva el índice original de cada zona porque es el que usan la edición
	 * y el botón de rehacer.
	 */
	const zonesPorPagina = (() => {
		const mapa = new Map<number | null, Array<{ zone: any; index: number }>>();
		zones.forEach((zone: any, index: number) => {
			const pagina = Number.isInteger(Number(zone?.slide)) && Number(zone.slide) >= 1 ? Number(zone.slide) : null;
			mapa.set(pagina, [...(mapa.get(pagina) || []), { zone, index }]);
		});
		return [...mapa.entries()]
			.sort((a, b) => (a[0] ?? 9999) - (b[0] ?? 9999))
			.map(([pagina, items]) => ({ pagina, items }));
	})();

	/**
	 * Qué texto se está rehaciendo, si es que alguno.
	 *
	 * El botón disparaba la llamada y no cambiaba nada en pantalla hasta que el
	 * texto se reemplazaba solo, varios segundos después. Sin señal de que algo
	 * estaba pasando, lo natural es volver a tocarlo: se pedían dos reescrituras
	 * y ganaba la que llegaba última.
	 */
	/**
	 * Qué decisiones están con "otra…" abierta, para escribir la opción propia.
	 *
	 * Se guarda por índice y no dentro de la decisión: abrir el campo no es una
	 * elección todavía, y guardarlo con el resto lo mandaría al prompt en blanco.
	 */
	const [decisionAMano, setDecisionAMano] = useState<number[]>([]);
	/**
	 * Lo elegido en cada decisión, por índice.
	 *
	 * Antes bajaba al campo de texto libre y lo ensuciaba: quien quería escribir
	 * algo propio se encontraba el campo lleno de frases que no había escrito.
	 * Van por separado y se juntan recién al mandar.
	 */
	const [decisionElegida, setDecisionElegida] = useState<Record<number, string>>({});
	const [rehaciendo, setRehaciendo] = useState<number | null>(null);

	/** El producto elegido, para los textos que se reescriben desde una URL. */
	const productoImportado: any = importedProducts.find((item: any) => selectedProductIds.includes(item.id)) || importedProducts[0] || null;

	/**
	 * Cuántas filas necesita un texto para verse ENTERO.
	 *
	 * Con alto fijo la sugerencia quedaba cortada a la mitad y con flechitas de
	 * scroll: había que desplazar dentro de cada campo para leer lo que la IA
	 * propuso, que es justo lo que hay que poder revisar de un vistazo.
	 */
	function filasParaElTexto(texto?: string) {
		const contenido = texto || '';
		const porSaltos = contenido.split('\n').length;
		const porLargo = Math.ceil(contenido.length / 38);
		return Math.min(6, Math.max(2, porSaltos, porLargo));
	}

	async function regenerateCopy(index: number) {
		const zone = zones[index];
		if (!zone) return;
		if (rehaciendo !== null) return;
		setRehaciendo(index);
		try {
			const response = await fetch('/api/creativos/rewrite', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({
					original: zone.original,
					current: zone.replacement,
					messageRole: zone.messageRole,
					// Con una URL, `manualProductName` está vacío: el producto vino del
					// escaneo. Sin este respaldo, "Rehacer" reescribía el texto para un
					// "producto" genérico y sin un solo dato, que es peor que el original.
					productName: manualProductName || productoImportado?.name || 'producto',
					productFacts: manualProductFacts || [
						productoImportado?.description,
						productoImportado?.price_text && `${productoImportado.price_text} ${productoImportado.currency || ''}`,
					].filter(Boolean).join(' · '),
					language,
				}),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo reescribir el texto.');
			setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: payload.replacement } : item));
			// El largo del bloque es parte del diseño del ganador: si el texto nuevo se
			// pasa, la línea se reflowea y se corre todo lo de abajo. Se avisa en vez
			// de rechazarlo — una sugerencia imperfecta sirve más que un error.
			onToast?.(payload.seExcede
				? `Texto regenerado, pero mide ${payload.largo} caracteres y el original ${payload.largoOriginal}: puede no entrar igual.`
				: 'Texto regenerado con éxito.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo reescribir el texto.');
		} finally {
			setRehaciendo(null);
		}
	}

	async function regenerateAllCopies() {
		if (!zones.length) return;
		if (!window.confirm('¿Seguro que querés volver a escribir todos los textos con IA? Se perderán las ediciones manuales actuales.')) return;
		setError('');
		setPhase('planning');
		await requestPlan();
		onToast?.('Todos los textos fueron regenerados.');
	}

	// Carrusel completo: sale de la MISMA revisión que una imagen suelta (idioma,
	// identidad, colores, tipografía, logo, textos) — se resuelven los productos
	// (uno o uno por página) y se arrancan todas las páginas juntas, agrupadas bajo
	// el mismo batch_id que ya sabe trackear "Mis imágenes".
	async function approveAndGenerateCarousel() {
		if (enviando.current) return;
		enviando.current = true;
		setPhase('starting'); setError('');
		borrarBorrador();
		onGenerationRequested?.();
		let arrancado = false;
		try {
			let productIds: string[] = [];
			let offeringForSubmit: 'product' | 'service' | 'catalog' = detectedOffering;
			let isCatalogSubmit = false;
			if (productMode === 'url' || (isService && urls.some((url) => url.trim()))) {
				const list = urls.map((u) => u.trim()).filter(Boolean);
				if (carouselSameProduct) {
					const ids = await scanUrls([list[0]]);
					if (!ids.length) return;
					productIds = [ids[0]];
				} else {
					if (list.length < carouselSlides.length) {
						setError(`Necesitás ${carouselSlides.length} URLs, una por página (tenés ${list.length}).`);
						return;
					}
					const needed = list.slice(0, carouselSlides.length);
					const ids = await scanUrls(needed);
					if (ids.length !== needed.length) {
						setError('No pudimos analizar alguna de las URLs. Revisalas e intentá de nuevo.');
						return;
					}
					productIds = ids;
				}
			} else if (productMode === 'manual') {
				// Carga a mano: solo válida cuando es el mismo producto en todas las páginas.
				if (!uploadFiles.length) { setError('Subí al menos una foto del producto.'); return; }
				const productForm = new FormData();
				productForm.set('name', manualProductName.trim());
				productForm.set('description', manualProductFacts.trim());
				uploadFiles.slice(0, 5).forEach((file) => productForm.append('image', file));
				const productRes = await fetch('/api/creativos/products', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: productForm });
				// Sube hasta cinco fotos: si la función se pasa de tiempo, el 504 llega
				// como HTML y `.json()` reventaba antes de poder decir qué pasó.
				const productPayload = await leerRespuestaDeEscaneo(productRes);
				if (!productRes.ok || !productPayload.product?.id) throw new Error(productPayload.error || 'No se pudo guardar el producto.');
				productIds = [productPayload.product.id];
			}

			const carouselAvatarId = personMode === 'upload' ? await guardarAvatarCargado() : '';

			const pathPrefixId = parseInt(ad.imagePath.split('/')[0], 10);
			const response = await fetch('/api/creativos/carousel-start', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({
					referenceSlidePaths: paginasAGenerar,
					referenceName: ad.name || 'Carrusel ganador',
					templateId: !isNaN(pathPrefixId) ? pathPrefixId : 40,
					productIds,
					subjectMode: offeringForSubmit,
					productName: manualProductName.trim(),
					productDescription: manualProductFacts.trim(),
					avatarId: carouselAvatarId || null,
					personMode,
					avatarDescription: '',
					format, language, colorMode, typoMode, brandSource,
					// La corrección manual de la paleta no viajaba: los colores se podían
					// editar en la revisión y el carrusel se generaba igual con los
					// detectados. La imagen suelta sí la mandaba desde siempre.
					paletteOverride: Object.keys(paletteOverride).length ? paletteOverride : null,
					logoMode,
					logoSlideIndexes: logoMode === 'nada' ? [] : [...logoCarouselPages],
					// Sin revisión no hay plan que mandar: cada página la lee el worker
					// cuando la genera. Mandar objetos vacíos sería peor que no mandar
					// nada, porque el worker los tomaría por un análisis aprobado.
					approvedPlans: plan ? paginasAGenerar.map((ruta) => planRevisado(carouselSlides.indexOf(ruta) + 1)) : null,
					brief: indicaciones.trim() || undefined,
					// Los colores que el usuario dejó en la revisión, sean de la URL o de
					// Mi marca: sin esto el carrusel se generaba con los detectados.
					rolesDeColor: Object.values(rolesDeColor).some(Boolean) ? rolesDeColor : undefined,
					tipografiaOverride: (typoMode !== 'winner' && (tipografiaElegida.headings.trim() || tipografiaElegida.body.trim()))
						? tipografiaElegida : undefined,
				}),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación del carrusel.');

			if (onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					title: manualProductName.trim() ? `${manualProductName.trim()} · carrusel` : 'Carrusel',
					referenceUrl,
					count: payload.count,
				});
			}
			arrancado = true;
			onBack({ trasGenerar: true });
			void driveBatchWorkers((payload.generations || []).map((g: any) => g.id), token);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación del carrusel.');
		} finally {
			enviando.current = false;
			// Varias validaciones de acá adentro cortan con un `return` y su propio
			// mensaje, sin pasar por el catch. Sin esto la pantalla se quedaba con el
			// botón girando en "Generando" para siempre y había que recargar.
			if (!arrancado) setPhase('review');
		}
	}

	async function approveReviewedGeneration() {
		if (wantsFullCarousel) await approveAndGenerateCarousel();
		else await approveAndGenerate();
	}

	return (
		<div style={{ width: '100%' }}>
			<button onClick={() => onBack()} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '16px' }}>← Volver a la biblioteca</button>
			<div className="creation-flow-layout">

				{/* Referencia a la izquierda: en un carrusel se puede pasar de página
				    para verlas todas, y la que se mira es la que queda elegida
				    cuando el modo es "solo una página". */}
				<aside className="creation-flow-aside">
					<div style={{ position: 'relative' }}>
						<img key={previewSlidePath} src={previewUrl} alt={ad.name} style={{ width: '100%', borderRadius: '14px', boxShadow: '0 14px 40px rgba(25,23,29,0.16)', display: 'block' }} />
						{isCarouselAd && carouselSlides.length > 1 && (
							<>
								<button type="button" className="carousel-arrow carousel-arrow-prev" onClick={() => goToPreviewSlide(-1)} aria-label="Página anterior">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
								</button>
								<button type="button" className="carousel-arrow carousel-arrow-next" onClick={() => goToPreviewSlide(1)} aria-label="Página siguiente">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
								</button>
								<span style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 4, background: 'rgba(25,23,29,0.75)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
									{selectedSlideIndex + 1} / {carouselSlides.length}
								</span>
							</>
						)}
					</div>
					{/* Decía "Anuncio ganador: Nosotros vs Ellos (75)". Ese nombre es el
					    del archivo en la biblioteca —queda del scrapeo— y no significa
					    nada para quien lo está por usar. */}
					{isCarouselAd && carouselMode === 'single' && (
						<p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#744bde', fontWeight: 700 }}>✓ Vas a clonar esta página</p>
					)}
				</aside>

				<section className="creation-flow-main">
					<h1 style={{ margin: '0 0 5px', fontSize: '23px', color: '#19171d', letterSpacing: '-.02em' }}>Crear con este diseño</h1>
					<p style={{ margin: '0 0 18px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
						{wantsFullCarousel
							? `Se replica el carrusel completo (${carouselSlides.length} páginas) con tu producto. Analizamos cada página y antes de generar podés ajustar la identidad, los colores y los textos.`
							: 'Se replica la composición visual del ganador con tu producto. Elegís los colores, la tipografía y el formato, y el resto lo resuelve la IA.'}
					</p>

					{/* Misma barra de progreso que el generador por lote. */}
					<ol className="wiz-progress" aria-label="Progreso">
						{[
							{ n: 1, label: 'Tu producto', active: phase === 'setup' && formStep === 1, done: phase !== 'setup' || formStep > 1 },
							{ n: 2, label: 'Formato', active: phase === 'setup' && formStep === 2, done: phase !== 'setup' || formStep > 2 },
							{ n: 3, label: 'Estilo', active: phase === 'setup' && formStep === 3, done: phase !== 'setup' },
							{ n: 4, label: 'Revisar', active: phase === 'planning' || phase === 'confirmar' || phase === 'review' || phase === 'starting', done: false },
						].map((item) => (
							<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
								<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
								<span className="wiz-progress-label">{item.label}</span>
							</li>
						))}
					</ol>

					{/* Solo en 'setup': si ya está revisando, ofrecerle volver a un
					    borrador sería ofrecerle pisar lo que está haciendo ahora. */}
					{borradorGuardado && phase === 'setup' && (
						<div className="borrador-aviso">
							<div>
								<strong>{resumenDelBorrador(borradorGuardado).titulo}</strong>
								<small>{resumenDelBorrador(borradorGuardado).detalle}</small>
							</div>
							<div className="borrador-aviso-botones">
								<button type="button" className="borrador-retomar" onClick={() => retomarDelBorrador(borradorGuardado)}>Seguir donde estaba</button>
								<button type="button" className="borrador-descartar" onClick={() => { borrarBorrador(); setBorradorGuardado(null); }}>Empezar de cero</button>
							</div>
						</div>
					)}

					{/* `starting` sin plan es el flujo sin revisión: no hay pantalla de
				    revisión que mostrar, así que el formulario se queda con el botón
				    girando hasta que la generación arranca y se navega. Sin esto la
				    pantalla quedaba en blanco en el medio. */}
				{(phase === 'setup' || phase === 'planning') && <>
						{/* 1 · Tu producto / Servicio */}
						<div className="wiz-step" hidden={formStep !== 1}>
							<div className="wiz-body">
								{isCarouselAd && (
									<div style={{ marginBottom: '4px' }}>
										<label className="picker-label">Este ganador es un carrusel de {carouselSlides.length} páginas</label>
										<div className="wiz-tabs">
											{([
												['full', '🗂️', 'Carrusel completo', `Las ${carouselSlides.length} páginas`],
												['single', '🖼️', 'Solo una página', 'Elegís cuál'],
											] as const).map(([value, icon, text, hint]) => (
												<button key={value} type="button" className={`wiz-tab ${carouselMode === value ? 'active' : ''}`} onClick={() => setCarouselMode(value)}>
													<span className="wiz-tab-icon">{icon}</span>
													<span className="wiz-tab-label">{text}</span>
													<small>{hint}</small>
												</button>
											))}
										</div>

										{carouselMode === 'single' && (
											<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
												{carouselSlides.map((slide, index) => (
													<button
														key={slide}
														type="button"
														onClick={() => setSelectedSlideIndex(index)}
														title={`Página ${index + 1}`}
														style={{
															padding: 0, width: '64px', height: '64px', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
															border: selectedSlideIndex === index ? '2.5px solid #744bde' : '1.5px solid #e2dde9',
															background: '#f6f4f9',
														}}
													>
														<img src={referenceUrlFor(slide)} alt={`Página ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
													</button>
												))}
											</div>
										)}

										{carouselMode === 'full' && (
											<div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
												{([
													[true, '📦 Mismo producto en todas'],
													[false, '🎁 Producto distinto por página'],
												] as const).map(([value, text]) => (
													<button
														key={String(value)}
														type="button"
														onClick={() => { setCarouselSameProduct(value); if (!value) setProductMode('url'); }}
														style={{
															padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
															border: carouselSameProduct === value ? '2px solid #744bde' : '1px solid #e2dde9',
															background: carouselSameProduct === value ? '#f4f2f6' : '#fff',
															color: carouselSameProduct === value ? '#744bde' : '#3f3a48',
														}}
													>
														{text}
													</button>
												))}
											</div>
										)}
										<div style={{ height: '1px', background: '#eee6f2', margin: '16px 0' }} />
									</div>
								)}

								<label className="picker-label">¿Qué vas a promocionar?</label>
								<div className="wiz-tabs">
									{([
						['url', '🔗', 'Con URL', 'Detectamos qué ofrecés'],
										...(wantsFullCarousel && !carouselSameProduct ? [] : [['manual', '✍️', 'Cargar a mano', 'Cargás los datos'] as const]),
									] as const).map(([value, icon, text, hint]) => (
										<button key={value} type="button" className={`wiz-tab ${productMode === value ? 'active' : ''}`} onClick={() => setProductMode(value)}>
											<span className="wiz-tab-icon">{icon}</span>
											<span className="wiz-tab-label">{text}</span>
											<small>{hint}</small>
										</button>
									))}
								</div>
								{wantsFullCarousel && !carouselSameProduct && (
									<p className="wiz-hint">
										Necesitás {carouselSlides.length} URLs, una por página y en orden ({filledUrls}/{carouselSlides.length} cargadas). La carga a mano no está disponible para productos distintos por página.
									</p>
								)}

								{(productMode === 'url' || isService) && (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										{urls.map((u, i) => (
											<div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
												{variasUrls && (
													<span style={{ flexShrink: 0, width: '22px', fontSize: '12px', fontWeight: 800, color: '#8b8490', textAlign: 'center' }}>{i + 1}</span>
												)}
												<UrlInput
													value={u}
													onChange={(next) => setUrls((prev) => prev.map((x, j) => (j === i ? next : x)))}
													placeholder={wantsFullCarousel && !carouselSameProduct ? `URL del producto de la página ${i + 1}` : 'Pegá la URL de tu producto o servicio a analizar'}
													ariaLabel={`URL ${i + 1}`}
													style={{ flex: 1 }} />
												{urls.length > 1 && (
													<button type="button" aria-label="Quitar URL" onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
														style={{ width: '38px', height: '38px', borderRadius: '9px', border: '1px solid #e2dde9', background: '#fff', color: '#b0a8b8', cursor: 'pointer', fontSize: '17px', flexShrink: 0 }}>×</button>
												)}
											</div>
										))}
										{wantsFullCarousel && !carouselSameProduct && (
											<button type="button" onClick={() => setUrls((prev) => [...prev, ''])}
												style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: '9px', border: '1px dashed #cbb8f0', background: '#faf8ff', color: '#5b3fc4', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
												+ Agregar otra URL (otra página)
											</button>
										)}
										{isService && (
											<div className="wiz-fields" style={{ marginTop: '12px' }}>
												<input className="wiz-input" value={manualProductName} onChange={(e) => setManualProductName(e.target.value)} placeholder="Nombre del servicio, SaaS o marca..." />
												<textarea className="wiz-input" value={manualProductFacts} onChange={(e) => setManualProductFacts(e.target.value)} rows={3} placeholder="Qué hace, para quién es y qué resultado promete..." />
											</div>
										)}
									</div>
								)}

								{productMode === 'manual' && (
									<div className="wiz-fields">
										<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
											<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#716d79' }}>Fotos del producto:</span>
											<div className="image-uploader-box">
												<input type="file" accept="image/png,image/jpeg,image/webp" multiple id="creation-manual-imgs" className="hidden-file-input"
													onChange={(event) => {
														const files = event.target.files ? Array.from(event.target.files) : [];
														setUploadFiles((prev) => [...prev, ...files]);
														setUploadPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
														event.target.value = '';
													}} />
												<label htmlFor="creation-manual-imgs" className="uploader-label">
													<span>📸 Cargar fotos del producto (opcional · podés subir varias)</span>
												</label>
											</div>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', border: '1px dashed #cbb8f0', background: '#faf8ff', fontSize: '12.5px', fontWeight: 700, cursor: parsingDoc ? 'wait' : 'pointer', color: '#5b3fc4', width: 'fit-content', marginTop: '2px', opacity: parsingDoc ? 0.6 : 1 }}>
												{parsingDoc ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando archivo…</> : '📄 Subir PDF / Word / Excel'}
												<input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,application/pdf" style={{ display: 'none' }} disabled={parsingDoc}
													onChange={(event) => { void parseDoc(event.target.files?.[0] || null); event.target.value = ''; }} />
											</label>
											{uploadPreviews.length > 0 && (
												<div className="extra-previews-grid">
													{uploadPreviews.map((preview, idx) => (
														<div key={idx} className="preview-thumb">
															<img src={preview} alt="" />
															<button type="button" className="remove-img-btn" onClick={() => { setUploadFiles((prev) => prev.filter((_, j) => j !== idx)); setUploadPreviews((prev) => prev.filter((_, j) => j !== idx)); }}>✕</button>
														</div>
													))}
												</div>
											)}
										</div>
										<input className="wiz-input" value={manualProductName} onChange={(e) => setManualProductName(e.target.value)} placeholder="Nombre del servicio o producto..." />
										<textarea className="wiz-input" value={manualProductFacts} onChange={(e) => setManualProductFacts(e.target.value)} rows={3}
											placeholder="Descripción de tu producto, servicio, beneficios o características especiales..." />
									</div>
								)}
							</div>
						</div>

						{/* 2 · Formato */}
						<div className="wiz-step" hidden={formStep !== 2}>
							<div className="wiz-body">
								<label className="picker-label">Formato</label>
								<p className="batch-detail-help">Elegí dónde se va a publicar el anuncio.</p>
								<div className="batch-format-grid">
									{FORMAT_ITEMS.map((item) => (
										<button key={item.id} type="button" className={`batch-format-card ${format === item.id ? 'active' : ''}`} onClick={() => setFormat(item.id)} aria-pressed={format === item.id}>
											<span className={`batch-format-shape shape-${item.shape}`} aria-hidden="true"><i /></span>
											<span className="batch-format-copy"><strong>{item.text}</strong><small>{item.desc}</small></span>
											{format === item.id && <b aria-hidden="true">✓</b>}
										</button>
									))}
								</div>
							</div>
						</div>

						{/* 3 · Estilo (idioma, de quién es el anuncio, colores, tipografía, cantidad) */}
					<div className="wiz-step" hidden={formStep !== 3}>
						<div className="wiz-body">
							<div className="creation-language-select">
								<BatchSelect label="Idioma del anuncio" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
							</div>
							<div className="batch-brand-block">
									<span className="picker-label">¿Qué identidad querés usar?</span>
									<p className="batch-detail-help">Elegí de dónde tomar el nombre y el logo. Los colores y la tipografía se eligen por separado.</p>
									<div className="batch-brand-options">
										{BRAND_OPTIONS.map((option) => (
											<button key={option.value} type="button" className={`batch-brand-option ${brandSource === option.value ? 'active' : ''}`} onClick={() => { setBrandSource(option.value); if (option.value === 'none') { setLogoMode('nada'); setLogoCarouselPages(new Set()); } }} aria-pressed={brandSource === option.value}>
												<span className="batch-brand-icon" aria-hidden="true"><BrandOptionIcon icon={option.icon} /></span>
												<span><strong>{option.label}</strong><small>{option.hint}</small></span>
												{brandSource === option.value && <b aria-hidden="true">✓</b>}
											</button>
										))}
									</div>
								</div>

								{/* La pregunta del logo NO va acá: es la misma decisión que en una
								    imagen suelta y se toma después de analizar, cuando ya se sabe
								    si el ganador firma con un logo dibujado o escribiendo su
								    nombre. Acá se elegía a ciegas. */}

								<div className="batch-style-groups creation-style-source-groups">
									<div className="batch-style-group">
										<span className="picker-label">Colores</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={colorMode === option.value ? 'active' : ''} onClick={() => setColorMode(option.value as 'winner' | 'url' | 'brand')} aria-pressed={colorMode === option.value}>{option.label}</button>
											))}
										</div>
									</div>
									<div className="batch-style-group">
										<span className="picker-label">Tipografía</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={typoMode === option.value ? 'active' : ''} onClick={() => setTypoMode(option.value as 'winner' | 'url' | 'brand')} aria-pressed={typoMode === option.value}>{option.label}</button>
											))}
										</div>
									</div>
								</div>

								{wantsFullCarousel && (
									<p className="wiz-hint">Se generan las {carouselSlides.length} páginas del carrusel — la cantidad la define el diseño original.</p>
								)}
							</div>
						</div>

						{error && <p style={{ margin: '14px 0 0', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						{formStep === 1 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="url-batch-submit-btn wiz-continue-btn" onClick={() => { if (!step1Ready) { setError('Contanos qué vas a promocionar antes de continuar.'); return; } setError(''); setFormStep(2); }}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{formStep === 2 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(1)}>← Atrás</button>
								<button type="button" className="url-batch-submit-btn" onClick={() => setFormStep(3)}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{/* Un solo botón para las dos formas: primero se analiza, después se
						    revisa y recién ahí se gasta un crédito. El carrusel decía
						    "Generar N imágenes" y en realidad analizaba, así que prometía
						    un gasto que todavía no ocurría. */}
						{formStep === 3 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(2)} disabled={phase === 'planning'}>← Atrás</button>
								<div className="batch-continue-wrap">
									<button
										type="button"
										onClick={() => { if (!step1Ready) { setError('Contanos qué vas a promocionar antes de continuar.'); setFormStep(1); return; } void requestPlan(); }}
										disabled={phase === 'planning'}
										className="url-batch-submit-btn"
									>
										{phase === 'planning'
											? <><span className="studio-spinner small" aria-hidden="true" /> Leyendo tu web…</>
											: 'Continuar'}
									</button>
									{/* Decía "todavía no gastás créditos" porque después venía la
									    revisión. Ahora este click genera: prometerle lo otro a
									    alguien que está por gastar es mentirle. */}
									{phase === 'setup' && <span className="batch-credit-note">Todavía no gastás créditos</span>}
								</div>
							</div>
						)}
					</>}

					{/*
					  * Confirmar: se mira, no se edita.
					  *
					  * La revisión vieja pedía resolver una cosa por vez —qué decía cada
					  * texto, quién aparecía, con qué se firmaba— porque el prompt detallado
					  * necesitaba que alguien decidiera todo eso antes de dictárselo al
					  * motor. Con el clon libre esas respuestas ya no las lee nadie, pero
					  * quedaba algo que sí valía: ver qué se leyó de la URL antes de gastar
					  * un crédito. Eso es esta pantalla, y abajo lo único que se escribe.
					  */}
					{(phase === 'confirmar' || (phase === 'starting' && Boolean(confirmacion))) && (
						<div className="batch-detail-card" style={{ marginTop: '4px' }}>
							<h2 style={{ margin: '0 0 4px', fontSize: '17px', color: '#19171d' }}>Esto leímos de tu web</h2>

							{/*
							  * Lo que el análisis leyó del ganador, que hasta ahora se descartaba.
							  *
							  * La interpretación es SOLO para leer: el modelo tiene el ganador
							  * delante cuando genera, así que describírselo en palabras sería gastar
							  * atención en algo que está viendo. Sirve para que quien elige entienda
							  * qué está clonando antes de decidir.
							  *
							  * Las decisiones sí bajan al campo de indicaciones, que ya llega al
							  * prompt como intención y no como orden. Es el canal que ya está medido:
							  * no se abre uno nuevo.
							  */}
							{creativeDecisions.length > 0 && (
								<div className="creation-lectura">
									{creativeDecisions.map((decision, index) => {
										const opciones = (decision.options || []).slice(0, 3);
										if (!opciones.length) return null;
										const frase = (opcion: string) => `${decision.title ? `${decision.title}: ` : ''}${opcion}`;
										const aMano = decisionAMano.includes(index);
										return (
											<div key={`${decision.type || 'decision'}-${index}`} className="creation-decision">
												<span>{decision.question || decision.title}</span>
												<div className="creation-decision-opciones">
													{opciones.map((opcion) => {
														// Se guarda la frase con el título adelante, así que la
														// comparación tiene que ser contra lo MISMO que se guarda: con
														// `opcion` pelada nunca coincidía y el botón no se marcaba nunca.
														const puesta = decisionElegida[index] === frase(opcion);
														return (
															<button
																key={opcion}
																type="button"
																className={puesta ? 'active' : ''}
																disabled={phase === 'starting'}
																aria-pressed={puesta}
																// Una sola por decisión: son excluyentes, y dejar dos le pide
																// al modelo cosas que no pueden pasar juntas.
																onClick={() => setDecisionElegida((previo) => {
																	const siguiente = { ...previo };
																	if (puesta) delete siguiente[index];
																	else siguiente[index] = frase(opcion);
																	return siguiente;
																})}
															>
																{puesta ? '✓ ' : '+ '}{opcion}
															</button>
														);
													})}
													<button
														type="button"
														className={aMano ? 'active' : ''}
														disabled={phase === 'starting'}
														onClick={() => setDecisionAMano((previo) => (aMano ? previo.filter((i) => i !== index) : [...previo, index]))}
													>
														{aMano ? '× Otra' : 'Otra…'}
													</button>
												</div>
												{aMano && (
													<input
														type="text"
														className="creation-decision-propia"
														autoFocus
														maxLength={120}
														placeholder="Escribí lo tuyo y apretá Enter"
														disabled={phase === 'starting'}
														onKeyDown={(evento) => {
															if (evento.key !== 'Enter') return;
															const escrito = (evento.target as HTMLInputElement).value.trim();
															if (!escrito) return;
															setDecisionElegida((previo) => ({ ...previo, [index]: frase(escrito) }));
															setDecisionAMano((previo) => previo.filter((i) => i !== index));
														}}
													/>
												)}
											</div>
										);
									})}
									{/* Abajo de todo y opcional: lo que no entra en ninguna pregunta.
									    Antes las opciones elegidas se escribían acá y lo ensuciaban. */}
									<div className="creation-extra">
										<span>¿Algo más? <small>(opcional)</small></span>
										<input
											type="text"
											value={indicaciones}
											maxLength={300}
											disabled={phase === 'starting'}
											placeholder="Ej: que se vea el envío gratis"
											onChange={(evento) => setIndicaciones(evento.target.value)}
										/>
									</div>
								</div>
							)}

							{/* El ganador NO se repite acá: está en la columna de la izquierda,
							    a la vista, desde que se entró a esta pantalla. */}
							<div>
								<span className="picker-label">Tu producto</span>
								{importedProducts.filter((item) => confirmacion?.productIds.includes(item.id)).map((item) => {
									const fotos = (item.media || []).filter((m) => m.type !== 'video' && m.url);
									return (
										<div key={item.id}>
											<div className="creation-confirm-product">
												{(fotos[0]?.url || item.imageUrls?.[0]) && (
													<img src={fotos[0]?.url || item.imageUrls?.[0]} alt="" width={54} height={54} />
												)}
												<div>
													<strong>{item.name}</strong>
													{item.price_text && <small>{item.price_text}</small>}
												</div>
											</div>
											{/* Elegir UNA foto. Sin elegir van todas, que es el default medido;
											    pero cuando la galería tiene una buena y cinco regulares, mandar
											    solo la buena gana. Viaja por `fotosElegidas`, que el servidor ya
											    sabía recibir y reemplaza al default: faltaba dónde elegirla. */}
											{/* Cerrado por default: se usan TODAS las detectadas, que es lo que
											    mide mejor. El botón está para el caso en que el escaneo trajo
											    alguna que no va — no para pedirle a nadie que elija. */}
											{fotos.length > 1 && (
												<div className="creation-fotos-bloque">
													<button
														type="button"
														className="creation-fotos-abrir"
														disabled={phase === 'starting'}
														onClick={() => setEligiendoFotos((previo) => !previo)}
													>
														{fotosElegidas.length
															? `Se usan ${fotosElegidas.length} de ${fotos.length} fotos`
															: `Se usan las ${fotos.length} fotos detectadas`}
														<i aria-hidden="true">{eligiendoFotos ? '▴' : '▾'}</i>
													</button>
													{eligiendoFotos && (
														<>
															<div className="creation-fotos">
																{fotos.map((foto, i) => {
																	const clave = foto.path || `upload:${i}`;
																	// Sin elección explícita valen todas, así que vacío se
																	// dibuja con todas marcadas.
																	const elegida = !fotosElegidas.length || fotosElegidas.includes(clave);
																	return (
																		<button
																			key={clave}
																			type="button"
																			className={elegida ? 'active' : ''}
																			disabled={phase === 'starting'}
																			aria-pressed={elegida}
																			title={elegida ? 'Sacarla' : 'Usarla'}
																			onClick={() => setFotosElegidas((previo) => {
																				const actual = previo.length ? previo : fotos.map((f, n) => f.path || `upload:${n}`);
																				const siguiente = actual.includes(clave)
																					? actual.filter((c) => c !== clave)
																					: [...actual, clave];
																				// Nunca cero: sin una sola foto el motor dibuja el
																				// producto de memoria y sale parecido, no igual.
																				return siguiente.length ? siguiente : actual;
																			})}
																		>
																			<img src={foto.url} alt="" />
																		</button>
																	);
																})}
															</div>
															<div className="creation-fotos-pie">
																{/* Subir una propia cuando la tienda no publica ninguna que
																    sirva. Se suma a las detectadas: son fotos más del mismo
																    producto, no un producto distinto. */}
																<label className="creation-fotos-subir">
																	Subir una foto mía
																	<input
																		type="file"
																		accept="image/png,image/jpeg,image/webp,image/avif"
																		multiple
																		disabled={phase === 'starting'}
																		onChange={(evento) => {
																			const nuevos = Array.from(evento.target.files || []).slice(0, 4);
																			if (!nuevos.length) return;
																			setUploadFiles((previo) => [...previo, ...nuevos].slice(0, 6));
																			setUploadPreviews((previo) => [...previo, ...nuevos.map((f) => URL.createObjectURL(f))].slice(0, 6));
																			evento.target.value = '';
																		}}
																	/>
																</label>
																{fotosElegidas.length !== 1 && fotos.length > 1 && (
																	<button
																		type="button"
																		className="creation-fotos-todas"
																		onClick={() => setFotosElegidas([fotos[0].path || 'upload:0'])}
																	>
																		Dejar solo la primera
																	</button>
																)}
																{fotosElegidas.length > 0 && fotosElegidas.length < fotos.length && (
																	<button type="button" className="creation-fotos-todas" onClick={() => setFotosElegidas([])}>
																		Volver a usarlas todas
																	</button>
																)}
															</div>
															{uploadPreviews.length > 0 && (
																<div className="creation-fotos">
																	{uploadPreviews.map((vista, i) => (
																		<button
																			key={vista}
																			type="button"
																			className="active"
																			disabled={phase === 'starting'}
																			title="Sacar esta foto"
																			onClick={() => {
																				URL.revokeObjectURL(vista);
																				setUploadFiles((previo) => previo.filter((_, n) => n !== i));
																				setUploadPreviews((previo) => previo.filter((_, n) => n !== i));
																			}}
																		>
																			<img src={vista} alt="" />
																		</button>
																	))}
																</div>
															)}
														</>
													)}
												</div>
											)}
										</div>
									);
								})}
							</div>

							{/* Los colores de la web repartidos por función. Un hexadecimal
							    suelto no dice nada; saber que ese violeta es el acento y no el
							    fondo cambia el aviso entero. Se pueden corregir porque el
							    escaneo se equivoca, y van al prompt como dato, no como orden. */}
							{/* Con la identidad del ganador elegida estos bloques no cambian nada
							    del aviso: mostrarlos para "corregir" sería ofrecer un control que
							    no hace nada. */}
							<div className="creation-confirm-identity">
								{colorMode !== 'winner' && (
								<div style={{ gridColumn: '1 / -1' }}>
									{/* El botón va en la línea del título y no debajo del texto de
									    ayuda: ahí competía con el párrafo y quedaba flotando en el medio.
									    Y solo aparece si hay algo detectado que restablecer — si no,
									    sería un control que no hace nada. */}
									<div className="creation-color-encabezado">
										<span className="picker-label" style={{ margin: 0 }}>{colorMode === 'brand' ? 'Los colores de Mi marca' : 'Colores detectados en tu web'}</span>
									{/* Elegir "Mi marca" sin tener nada cargado dejaba seis casilleros
									    vacíos sin explicación. Se dice qué pasó y se aclara que se pueden
									    poner acá mismo: el aviso usa lo que quede en estos casilleros. */}
									{colorMode === 'brand' && !miMarca?.colors?.length && (
										<span className="creation-vacio">Mi marca no tiene colores guardados — poné los que quieras acá</span>
									)}
										{hayColoresDetectados && (
											<button type="button" className="creation-color-restablecer" disabled={phase === 'starting'} onClick={() => coloresDetectados(true)}>
												<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
													<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
												</svg>
												Restablecer
											</button>
										)}
									</div>
									<div className="creation-color-roles">
										{ROLES_DE_COLOR.map((rol) => (
											<button
												key={rol.id}
												type="button"
												className={`creation-color-role ${rolActivo === rol.id ? 'active' : ''}`}
												disabled={phase === 'starting'}
												aria-pressed={rolActivo === rol.id}
												onClick={() => setRolActivo((previo) => (previo === rol.id ? null : rol.id))}
											>
												<span>{rol.label}</span>
												<i style={{ background: rolesDeColor[rol.id] || 'transparent' }} aria-hidden="true" />
												<b>{rolesDeColor[rol.id] || 'sin detectar'}</b>
											</button>
										))}
									</div>

									{/* Se abre al tocar un color y se edita ahí mismo: escribiendo el
									    hexadecimal, o tocando uno de los treinta. El selector nativo
									    queda de tercera opción para un tono que no esté. */}
									{rolActivo && (
									<div className="creation-color-editor">
										<div className="creation-color-editor-head">
											<span>Editando <b>{ROLES_DE_COLOR.find((rol) => rol.id === rolActivo)?.label}</b></span>
											<input
												type="text"
												className="creation-hex-input"
												value={rolesDeColor[rolActivo] || ''}
												disabled={phase === 'starting'}
												maxLength={7}
												placeholder="#000000"
												aria-label="Código hexadecimal"
												onChange={(event) => {
													// Se tiran TODOS los numerales y se pone uno solo adelante. Pegar
													// "#ba3d39" en un campo que ya mostraba "#" daba "##ba3d3": el
													// numeral se contaba como carácter y el último dígito se perdía.
													// Así da igual pegarlo con numeral, sin numeral, o encima de otro.
													const soloHex = event.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6);
													setRolesDeColor((previo) => ({ ...previo, [rolActivo]: soloHex ? `#${soloHex.toUpperCase()}` : '' }));
												}}
												onBlur={() => setRolesDeColor((previo) => {
													// El atajo de tres dígitos que se usa en CSS: #f00 es #FF0000. Se
													// expande al salir y no mientras se escribe, para no pisar a alguien
													// que iba por el cuarto dígito.
													const valor = previo[rolActivo] || '';
													const corto = valor.match(/^#([0-9a-f]{3})$/i);
													if (!corto) return previo;
													const [r, g, b] = corto[1].split('');
													return { ...previo, [rolActivo]: `#${r}${r}${g}${g}${b}${b}`.toUpperCase() };
												})}
											/>
											<input
												type="color"
												value={/^#[0-9a-f]{6}$/i.test(rolesDeColor[rolActivo] || '') ? rolesDeColor[rolActivo] : '#ffffff'}
												disabled={phase === 'starting'}
												aria-label="Elegir otro color"
												onChange={(event) => setRolesDeColor((previo) => ({ ...previo, [rolActivo]: event.target.value.toUpperCase() }))}
											/>
										</div>
										<div className="creation-color-grid" role="group" aria-label="Colores para elegir">
											{COLORES_A_MANO.map((color) => (
												<button
													key={color}
													type="button"
													title={color}
													aria-label={color}
													className={rolesDeColor[rolActivo] === color ? 'active' : ''}
													disabled={phase === 'starting'}
													style={{ background: color }}
													onClick={() => setRolesDeColor((previo) => ({ ...previo, [rolActivo]: color }))}
												/>
											))}
											{/* El último cuadrado abre el selector del sistema: los treinta cubren
											    lo que usa una marca, pero el que necesita un tono exacto que no
											    está no tiene que irse a buscar el hexadecimal a otro lado. */}
											<label className="creation-color-propio" title="Elegir otro color">
												<input
													type="color"
													value={/^#[0-9a-f]{6}$/i.test(rolesDeColor[rolActivo] || '') ? rolesDeColor[rolActivo] : '#ffffff'}
													disabled={phase === 'starting'}
													aria-label="Elegir otro color"
													onChange={(event) => setRolesDeColor((previo) => ({ ...previo, [rolActivo]: event.target.value.toUpperCase() }))}
												/>
												<span aria-hidden="true">+</span>
											</label>
										</div>
										<button type="button" className="creation-color-listo" onClick={() => setRolActivo(null)}>Listo</button>
									</div>
									)}
								</div>
								)}
								{typoMode !== 'winner' && (
								<div style={{ gridColumn: '1 / -1' }}>
									<span className="picker-label">{typoMode === 'brand' ? 'La tipografía de Mi marca' : 'Tipografía detectada en tu web'}</span>
									{typoMode === 'brand' && !miMarca?.typography?.headings && !miMarca?.typography?.body && (
										<p className="creation-vacio" style={{ margin: '4px 0 0' }}>Mi marca no tiene tipografía guardada — elegila acá</p>
									)}
									<p className="batch-detail-help">
										{tipografiaDeLaUrl
											? 'Corregila si el escaneo devolvió el nombre interno de la fuente en vez del real.'
											: 'No se detectó ninguna. Escribí las que use tu marca.'}
									</p>
									<div className="creation-typo-fields">
										<SelectorDeFuente
											etiqueta="Títulos"
											valor={tipografiaElegida.headings}
											disabled={phase === 'starting'}
											onChange={(valor) => setTipografiaElegida((previo) => ({ ...previo, headings: valor }))}
										/>
										<SelectorDeFuente
											etiqueta="Textos"
											valor={tipografiaElegida.body}
											disabled={phase === 'starting'}
											onChange={(valor) => setTipografiaElegida((previo) => ({ ...previo, body: valor }))}
										/>
									</div>
								</div>
								)}
								{(logoDeLaUrl || logoPropioVista) && (
									<div>
										<span className="picker-label">Logo detectado</span>
										<img src={logoPropioVista || logoDeLaUrl} alt="Logo de la marca" className="creation-confirm-logo" />
										<div className="creation-logo-acciones">
											<label className="creation-logo-cambiar">
												{logoPropio ? 'Usar otro' : 'Cambiar'}
												<input
													type="file"
													accept="image/png,image/jpeg,image/webp,image/avif"
													disabled={phase === 'starting'}
													onChange={(event) => {
														const archivo = event.target.files?.[0] || null;
														if (!archivo) return;
														setLogoPropio(archivo);
														setLogoPropioVista((previo) => { if (previo) URL.revokeObjectURL(previo); return URL.createObjectURL(archivo); });
														event.target.value = '';
													}}
												/>
											</label>
											{logoPropio && (
												<button type="button" disabled={phase === 'starting'} onClick={() => {
													if (logoPropioVista) URL.revokeObjectURL(logoPropioVista);
													setLogoPropio(null); setLogoPropioVista('');
												}}>Volver al detectado</button>
											)}
											<button
												type="button"
												className={sinLogo ? 'active' : ''}
												disabled={phase === 'starting'}
												onClick={() => setSinLogo((previo) => !previo)}
											>
												{sinLogo ? '✓ Sin logo' : 'Sin logo'}
											</button>
										</div>
										<p className="batch-detail-help" style={{ margin: '6px 0 0' }}>
											{sinLogo
												? 'El aviso no lleva ninguna firma.'
												: logoPropio
													? 'El aviso va a dibujar este logo donde el ganador firma.'
													: 'Si subís uno, el aviso lo dibuja en vez de escribir el nombre de la marca.'}
										</p>
									</div>
								)}
								{colorMode === 'winner' && typoMode === 'winner' && (
									<p className="batch-detail-help" style={{ gridColumn: '1 / -1', margin: 0 }}>
										Este aviso usa los colores y la tipografía del ganador, así que acá no hay nada que corregir. Si querés los de tu web, volvé al paso de estilo.
									</p>
								)}
							</div>

							{wantsFullCarousel && carouselSlides.length > 1 && (
								<div style={{ marginTop: '18px' }}>
									<span className="picker-label">¿Qué páginas querés?</span>
									<p className="batch-detail-help">Tocá para sacar las que no te sirven. Cada una cuesta un crédito.</p>
									<div className="creation-paginas">
										{carouselSlides.map((ruta, indice) => {
											const elegida = !paginasElegidas.length || paginasElegidas.includes(indice);
											return (
												<button
													key={ruta}
													type="button"
													className={elegida ? 'active' : ''}
													disabled={phase === 'starting'}
													aria-pressed={elegida}
													onClick={() => setPaginasElegidas((previo) => {
														// Vacío quiere decir "todas": el primer clic tiene que materializar
														// esa lista antes de sacarle una, si no el primer destildado se pierde.
														const actual = previo.length ? previo : carouselSlides.map((_, i) => i);
														const siguiente = actual.includes(indice) ? actual.filter((i) => i !== indice) : [...actual, indice].sort((a, b) => a - b);
														return siguiente.length ? siguiente : actual;
													})}
												>
													{referenceUrlFor(ruta) && <img src={referenceUrlFor(ruta)} alt="" />}
													<b>{indice + 1}</b>
												</button>
											);
										})}
									</div>
								</div>
							)}

							{/* Quién aparece. Sin elegir nada lo decide la IA mirando el ganador,
							    que es lo que sale bien casi siempre; las otras dos reemplazan esa
							    frase del prompt en vez de sumarse a ella. */}
							<div style={{ marginTop: '18px' }}>
								<span className="picker-label">¿Querés que aparezca una persona?</span>
								<div className="logo-decision-options opciones-cortas" role="radiogroup" aria-label="Quién aparece en el aviso">
									{([
										{ id: 'ai', label: 'Que decida la IA' },
										{ id: 'described', label: 'Yo la describo' },
										{ id: 'upload', label: 'Con mis fotos' },
										{ id: 'none', label: 'Nadie' },
									] as Array<{ id: PersonMode; label: string }>).map((opcion) => (
										<button
											key={opcion.id}
											type="button" role="radio" aria-checked={personMode === opcion.id}
											className={personMode === opcion.id ? 'active' : ''}
											disabled={phase === 'starting'}
											onClick={() => setPersonMode(opcion.id)}
										>
											{opcion.label}
										</button>
									))}
								</div>
								{/* Con "que decida la IA", las tres opciones que el análisis armó
								    cruzando el ganador con el producto. Estaban abajo, mezcladas con el
								    fondo y el styling, cuando son la respuesta a ESTA pregunta. */}
								{personMode === 'ai' && (() => {
									const dePersona = creativeDecisions.find((d) => d.type === 'person' && (d.options || []).length);
									if (!dePersona) return null;
									const i = creativeDecisions.indexOf(dePersona);
									return (
										<div className="creation-persona-opciones">
											<span>{dePersona.question || '¿Cómo debería ser?'}</span>
											<div className="creation-decision-opciones">
												{(dePersona.options || []).slice(0, 3).map((opcion) => {
													const puesta = decisionElegida[i] === opcion;
													return (
														<button
															key={opcion}
															type="button"
															className={puesta ? 'active' : ''}
															disabled={phase === 'starting'}
															aria-pressed={puesta}
															onClick={() => setDecisionElegida((previo) => {
																const siguiente = { ...previo };
																if (puesta) delete siguiente[i];
																else siguiente[i] = opcion;
																return siguiente;
															})}
														>
															{puesta ? '✓ ' : '+ '}{opcion}
														</button>
													);
												})}
											</div>
										</div>
									);
								})()}
								{/* La cuarta: describirla con palabras. Va al mismo campo por el que
								    ya viajaba el avatar guardado su descripción. */}
								{personMode === 'described' && (
									<input
										type="text"
										className="creation-persona-propia"
										maxLength={200}
										autoFocus
										disabled={phase === 'starting'}
										placeholder="Ej: un hombre de unos 40, canoso, en ropa de trabajo"
										value={personaEscrita}
										onChange={(evento) => setPersonaEscrita(evento.target.value)}
									/>
								)}
								{personMode === 'upload' && cargaDeAvatar}
							</div>

							{/*
							  * Los textos del aviso, ya escritos y corregibles.
							  *
							  * El análisis del ganador siempre devolvió esta lista y siempre se
							  * descartó. Sin ella el motor improvisa el copy mientras dibuja, y ahí
							  * es donde sobrevivieron el disclaimer de la FDA, un "$20 OFF" que no
							  * era de nadie, un titular que quedó en inglés y los números del
							  * ganador transliterados a pesos.
							  *
							  * Medido: con la lista salieron los nueve textos de un us-vs-them
							  * palabra por palabra. Por eso tiene que ser editable — el aviso hereda
							  * sus errores con la misma fidelidad con la que hereda sus aciertos, y
							  * el análisis escribe cosas como "COMPRAR AHORA AHORA MISMO".
							  */}
							{zones.length > 0 && (
								<div style={{ marginTop: '18px' }}>
									<span className="picker-label">Lo que va a decir el aviso</span>
									<div className="creation-textos">
										{zones.map((zone, index) => (
											<div
												className="detected-copy-row"
												key={`${zone.where || 'texto'}-${index}`}
												title={`${zone.where || ''}${zone.messageRole ? ` · ${zone.messageRole}` : ''}`}
												style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(220px, 1.2fr)', gap: '12px', alignItems: 'start', padding: '10px 0', borderTop: index ? '1px solid #f0edf5' : 'none' }}
											>
												{/* Lo que decía el ganador, a la izquierda: es contexto para saber qué
												    bloque se está tocando, no algo editable. */}
												<div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
													<span style={{ fontSize: '12px', fontWeight: 600, color: '#8b8490', lineHeight: 1.35, fontStyle: 'italic' }}>
														{zone.original || 'Texto sin leer'}
													</span>
													{zone.messageRole && <span style={{ fontSize: '11px', color: '#744bde', fontWeight: 700 }}>{zone.messageRole}</span>}
												</div>
												<div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', minWidth: 0 }}>
													<textarea
														value={zone.replacement || ''}
														rows={filasParaElTexto(zone.replacement)}
														maxLength={300}
														disabled={phase === 'starting'}
														style={{ flex: 1, minWidth: 0, padding: '8px 11px', border: '1px solid #ece9f1', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', color: '#19171d', lineHeight: 1.4, resize: 'vertical' }}
														onChange={(event) => setZones((actual) => actual.map((item, i) => (
															i === index ? { ...item, replacement: event.target.value } : item
														)))}
													/>
													<button
														type="button"
														className="creation-texto-rehacer"
														disabled={rehaciendo !== null || phase === 'starting'}
														title="Que la IA lo escriba de nuevo"
														onClick={() => void regenerateCopy(index)}
													>
														{rehaciendo === index ? '…' : 'Rehacer'}
													</button>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							<section className="logo-decision" aria-label="Cuántas versiones generar" style={{ margin: '18px 0 0' }}>
								<div className="logo-decision-head">
									<strong>¿Cuántas versiones querés?</strong>
								</div>
								<div className="logo-decision-options opciones-cortas" role="radiogroup" aria-label="Cantidad de versiones">
									{[1, 2, 3, 4].map((cantidad) => (
										<button
											key={cantidad}
											type="button" role="radio" aria-checked={variantes === cantidad}
											className={variantes === cantidad ? 'active' : ''}
											onClick={() => setVariantes(cantidad)}
											disabled={phase === 'starting'}
										>
											{cantidad === 1 ? '1 imagen' : `${cantidad} imágenes`}
										</button>
									))}
								</div>
							</section>

							{error && <p style={{ margin: '14px 0 0', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

							<div className="wiz-actions" style={{ marginTop: '18px' }}>
								<button type="button" className="wiz-back-btn" disabled={phase === 'starting'} onClick={() => { setError(''); setPhase('setup'); }}>Volver</button>
								<button
									type="button"
									className="url-batch-submit-btn"
									disabled={phase === 'starting' || Boolean(faltaParaElAvatar)}
									onClick={() => {
										if (!confirmacion) return;
										if (wantsFullCarousel) void approveAndGenerateCarousel();
										else void approveAndGenerate(confirmacion);
									}}
								>
									{phase === 'starting'
										? <><span className="studio-spinner small" aria-hidden="true" /> Generando…</>
										: wantsFullCarousel
											? `Generar ${paginasAGenerar.length === carouselSlides.length ? 'el carrusel entero' : `${paginasAGenerar.length} página${paginasAGenerar.length > 1 ? 's' : ''}`} (${paginasAGenerar.length})`
											: `Generar ${count > 1 ? `${count} imágenes` : 'la imagen'}`}
								</button>
								{phase !== 'starting' && (
									<span className="batch-credit-note">Se descuenta{count > 1 ? 'n' : ''} {count} crédito{count > 1 ? 's' : ''}</span>
								)}
							</div>
						</div>
					)}

					{/* `confirmacion` distingue los dos caminos: la revisión larga es solo del
					    carrusel. Sin esa condición, al generar desde la pantalla corta el
					    `plan` ya existía y los bloques de la revisión aparecían medio segundo
					    debajo del botón antes de navegar. */}
					{(phase === 'review' || (phase === 'starting' && !confirmacion)) && plan && <>
						{productMode === 'url' && importedProducts.length > 0 && (
							<ProductAssetReview
								products={importedProducts}
								isCatalog={isCatalog}
								storeName={(importedProducts[0] as any)?.metadata?.store?.name}
								detectionReason={(importedProducts[0] as any)?.metadata?.store?.evidence}
								subject={alcanceDesde(detectedOffering)}
								detectedSubject={alcanceDesde((importedProducts[0] as any)?.metadata?.pageType)}
								onChangeSubject={setAlcanceOverride}
								selectedProductIds={selectedProductIds}
								onToggleProduct={(productId) => setSelectedProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])}
							/>
						)}
						{/* Los colores se muestran y se editan ACÁ, en la revisión.
						    Antes se pedían en el paso previo, cuando todavía no había
						    nada analizado: se decidía a ciegas sobre colores que después
						    podían no ser los detectados. Ahora se ven los reales y se
						    corrigen sobre la misma pantalla donde se aprueba. */}
						{revisionPalette && (
							<section className="review-palette" aria-label="Colores detectados">
								<div className="review-palette-head">
									<strong>{paletaEsDelGanador ? 'Colores del anuncio ganador' : 'Colores detectados'}</strong>
									<small>
										{paletaEsDelGanador
											? 'Los medimos sobre el anuncio ganador y son los que va a conservar tu imagen. Si alguno no es el que ves en la referencia, tocalo y corregilo.'
											: 'Los sacamos de la identidad elegida. Si alguno no es el de tu marca, tocalo y cambialo.'}
									</small>
								</div>
								<div className="palette-swatches">
									{(paletaEsDelGanador
										? [['background', 'Fondo'], ['text', 'Titular'], ['accent', 'Acento / botón'], ['secondary', 'Secundario']] as const
										: [['background', 'Fondo'], ['accent', 'Principal'], ['secondary', 'Secundario'], ['text', 'Texto']] as const
									).map(([role, roleLabel]) => {
										const value = paletteOverride[role] || revisionPalette[role] || '';
										if (!value) return null;
										const corregido = Boolean(paletteOverride[role]);
										return (
											<label key={role} className={`palette-swatch${corregido ? ' is-edited' : ''}`}>
												<input
													type="color"
													value={value}
													onChange={(event) => setPaletteOverride((prev) => ({ ...prev, [role]: event.target.value }))}
													aria-label={`Color ${roleLabel}`}
												/>
												<span>{roleLabel}</span>
												<em>{value}</em>
											</label>
										);
									})}
								</div>
								{Object.keys(paletteOverride).length > 0 && (
									<button type="button" className="palette-reset" onClick={() => setPaletteOverride({})}>
										Volver a los detectados
									</button>
								)}
							</section>
						)}
						{/* El logo se decide ACÁ, no antes.
						    La pregunta estaba en el paso de estilo, donde todavía no se
						    había analizado nada: había que elegir a ciegas si poner una
						    marca sin saber si el ganador tenía un lugar para ella. Recién
						    después del análisis se sabe, y se puede recomendar. */}
						{brandSource !== 'none' && (
							<section className="logo-decision" aria-label="Logo en el anuncio">
								<div className="logo-decision-head">
									<strong>¿Con qué firmamos el anuncio?</strong>
									<small>
										{ganadorTieneLogoDibujado || ganadorFirmaConElNombre
											? `${wantsFullCarousel ? 'El carrusel ganador firma' : 'El anuncio ganador firma'} ${ganadorTieneLogoDibujado ? 'con un logo dibujado' : 'con el nombre de su marca escrito'}${dondeFirmaElGanador ? ` ${dondeFirmaElGanador}` : ''}${descripcionDelLogo ? ` (${descripcionDelLogo})` : ''}. Ahí va lo que elijas acá, del mismo tamaño y en el mismo lugar.`
											: `${wantsFullCarousel ? 'Ninguna página del carrusel ganador muestra' : 'El anuncio ganador no muestra'} ninguna marca en ningún lado, así que no hay un lugar hecho para la tuya.`}
									</small>
								</div>
								{/* Tres opciones y no dos. El sí/no de antes tenía un solo "sí" y
								    era pegar el archivo, así que el caso más común —el ganador
								    firma escribiendo su nombre y el clon hace lo mismo con el
								    nombre del negocio— no se podía pedir: salía de casualidad,
								    solo cuando el analizador marcaba la marca como wordmark. */}
								<div className="logo-decision-options" role="radiogroup" aria-label="Con qué se firma el anuncio">
									<button
										type="button" role="radio" aria-checked={logoMode === 'texto'}
										className={logoMode === 'texto' ? 'active' : ''}
										onClick={() => { setLogoMode('texto'); if (wantsFullCarousel) setLogoCarouselPages(new Set(carouselSlides.map((_, indice) => indice))); }}
									>
										{nombreEnElBoton ? `Escribir «${nombreEnElBoton}»` : 'Escribir el nombre'}
										{(ganadorTieneLogoDibujado || ganadorFirmaConElNombre) && <em>recomendado</em>}
									</button>
									<button
										type="button" role="radio" aria-checked={logoMode === 'imagen'}
										// En un carrusel la firma arranca en TODAS las páginas y desde
										// las miniaturas de abajo se le saca a las que no la quieran.
										onClick={() => { setLogoMode('imagen'); if (wantsFullCarousel) setLogoCarouselPages(new Set(carouselSlides.map((_, indice) => indice))); }}
										className={logoMode === 'imagen' ? 'active' : ''}
									>
										Poner mi logo
									</button>
									<button
										type="button" role="radio" aria-checked={logoMode === 'nada'}
										className={logoMode === 'nada' ? 'active' : ''}
										onClick={() => setLogoMode('nada')}
									>
										Sin firma
										{!ganadorTieneLogoDibujado && !ganadorFirmaConElNombre && <em>recomendado</em>}
									</button>
								</div>
								{/* Qué pasa con cada opción, dicho para alguien que no sabe de
								    diseño y sobre todo DÓNDE va a terminar: era lo que sorprendía
								    al ver la imagen, porque no se sabía hasta que salía. */}
								<p className="logo-decision-consecuencia">
									{logoMode === 'texto'
										? (ganadorTieneLogoDibujado || ganadorFirmaConElNombre
											? `Vamos a escribir el nombre de tu negocio ${dondeFirmaElGanador || 'donde el ganador tiene su marca'}, con la tipografía y el tamaño del aviso. No se pega ningún archivo.`
											: `Vamos a escribir el nombre de tu negocio chico y discreto en un margen de ${wantsFullCarousel ? 'cada página elegida' : 'la imagen'}. El anuncio ganador no firma en ningún lado, así que es algo que le estamos agregando.`)
										: logoMode === 'imagen'
											? (ganadorTieneLogoDibujado || ganadorFirmaConElNombre
												? `Vamos a colocar el archivo del logo de tu marca ${dondeFirmaElGanador || 'donde el ganador tiene su marca'}, del mismo tamaño que el del anuncio ganador.`
												: `Vamos a colocar el archivo del logo de tu marca en un lugar nuevo de ${wantsFullCarousel ? 'cada página elegida' : 'la imagen'}: el anuncio ganador no firma en ningún lado, así que hay que abrirle un espacio que el diseño original no tenía.`)
											: (ganadorTieneLogoDibujado || ganadorFirmaConElNombre
												? `Donde el ganador firma no va a quedar nada: se saca el espacio y el diseño se cierra como si nunca hubiera tenido marca.`
												: `No se firma en ningún lado, igual que el anuncio ganador: ${wantsFullCarousel ? 'las imágenes salen' : 'la imagen sale'} tan limpia${wantsFullCarousel ? 's' : ''} como el original.`)}
								</p>
								{logoMode !== 'nada' && wantsFullCarousel && (
									<>
										<small className="batch-brand-note">Tocá una página para sacarle la firma — por defecto va en todas.</small>
										<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
											{carouselSlides.map((slide, index) => {
												const on = logoCarouselPages.has(index);
												return (
													<button
														key={slide}
														type="button"
														onClick={() => setLogoCarouselPages((prev) => {
															const next = new Set(prev);
															if (next.has(index)) next.delete(index); else next.add(index);
															return next;
														})}
														title={`Página ${index + 1} — ${on ? 'con logo' : 'sin logo'}`}
														style={{
															position: 'relative', padding: 0, width: '58px', height: '58px', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
															border: on ? '2.5px solid #744bde' : '1.5px solid #e2dde9',
															background: '#f6f4f9', opacity: on ? 1 : 0.5,
														}}
													>
														<img src={referenceUrlFor(slide)} alt={`Página ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
														<span style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '11px', lineHeight: 1, filter: on ? 'none' : 'grayscale(1)' }}>{on ? '🏷️' : '🚫'}</span>
													</button>
												);
											})}
										</div>
									</>
								)}
								{includeLogo && (
									hayLogoUsable ? (
										<div className="logo-decision-preview">
											{/* Sobre damero: casi todos los logos de marca son blancos con
											    fondo transparente y sobre blanco no se veía ninguno. */}
											<img src={logoQueSePondria} alt={`Logo traído de ${origenDelLogo}`} onError={() => setLogoRoto(true)} />
											<span>Este es el logo que trajimos de {origenDelLogo} y el que vamos a poner. Si no es el de tu marca, cambiá la identidad en el paso de estilo.</span>
										</div>
									) : (
										/* Elegir "con logo" sin tener archivo terminaba en un anuncio sin
										   logo y sin aviso: la salida tiene que estar acá mismo, no en una
										   pantalla a la que hay que ir a buscar. */
										<div className="logo-decision-preview-vacio">
											<p style={{ margin: 0 }}>
												{logoRoto
													? `Encontramos un logo en ${origenDelLogo} pero el archivo no se puede abrir, así que el anuncio va a salir sin él.`
													: `No encontramos ningún archivo de logo en ${origenDelLogo}, así que no hay nada para colocar.`}
												{' '}La salida natural es escribir el nombre: va en ese mismo lugar, con la tipografía del aviso, y para la mayoría de los casos queda mejor que un logo pegado.
											</p>
											<div className="logo-decision-salidas">
												<button type="button" onClick={() => setLogoMode('texto')}>Escribir el nombre</button>
												{brandSource !== 'mine' && <button type="button" onClick={() => setBrandSource('mine')}>Usar el logo de Mi marca</button>}
											</div>
										</div>
									)
								)}
							</section>
						)}

						{/* El fondo del aviso, en hexadecimal y corregible. Se medía en prosa
						    —"verde salvia suave"— y un nombre se re-interpreta al volver a
						    dibujar, así que el clon salía con otro verde. Es lo único de la
						    paleta que se arregla en un segundo y había que descubrir gastando
						    un crédito. */}
						{fondoDelAviso && (
							<div className="fondo-del-aviso">
								<label title="Tocá para cambiar el color de fondo">
									<input type="color" value={fondoDelAviso} onChange={(event) => setFondoDelAviso(event.target.value.toUpperCase())} />
									<i style={{ background: fondoDelAviso }} />
								</label>
								<div>
									<strong>Fondo del anuncio</strong>
									<small>El color que va a llevar la imagen. Tocá la muestra o escribí el código.</small>
						<input className="copy-hex" value={fondoDelAviso} spellCheck={false} aria-label="Fondo del anuncio en hexadecimal"
							onChange={(event) => setFondoDelAviso(hexEscrito(event.target.value))} />
								</div>
							</div>
						)}

						<div className="detected-copy-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
							<strong style={{ ...label, marginBottom: 0 }}>Textos detectados del anuncio</strong>
							<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
								{zones.length > 0 && <button type="button" onClick={regenerateAllCopies} disabled={rehaciendo !== null} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: rehaciendo !== null ? 'wait' : 'pointer', opacity: rehaciendo !== null ? 0.45 : 1 }}>✨ Rehacer todos</button>}
								<button type="button" onClick={() => setCopyMode('auto')} style={chip(copyMode === 'auto')}>✨ Automáticos</button>
								<button type="button" onClick={() => setCopyMode('edit')} style={chip(copyMode === 'edit')}>✏️ Editarlos yo</button>
							</div>
						</div>

						{zones.length > 0 ? (
							<div className="detected-copy-table" style={{ background: '#fff', border: '1px solid #eee9f2', borderRadius: '12px', marginBottom: '22px', overflow: 'hidden' }}>
								{/* En un carrusel los textos se agrupan por página. Salían todos
								    en una lista corrida y no había forma de saber cuál iba en
								    cuál imagen: con diez páginas eran treinta textos seguidos. */}
								{zonesPorPagina.map(({ pagina, items }) => (
									<div key={pagina ?? 'unica'}>
										{zonesPorPagina.length > 1 && (
											<div className="copy-slide-head">
												<span>{pagina ? `Imagen ${pagina}` : 'Sin página asignada'}</span>
												<small>{items.length} {items.length === 1 ? 'texto' : 'textos'}</small>
											</div>
										)}
										{items.map(({ zone, index }, posicion) => (
											<div className="detected-copy-row" key={index} title={`${zone.where || ''}${zone.messageRole ? ` · ${zone.messageRole}` : ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(220px, 1.2fr)', gap: '12px', alignItems: 'center', padding: '12px 14px', borderBottom: posicion < items.length - 1 ? '1px solid #f4f0f8' : 'none' }}>
												<div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
													<span style={{ fontSize: '12px', fontWeight: 600, color: '#8b8490', lineHeight: 1.35, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>“{zone.original || 'Texto detectado'}”</span>
													{zone.messageRole && <span style={{ fontSize: '11px', color: '#744bde', fontWeight: 700 }}>{zone.messageRole}</span>}
													{/* El color medido del ganador, en hexadecimal y como muestra. Antes
													    había que abrir la imagen y sacarlo con un cuentagotas para saber
													    con qué se iba a escribir cada bloque. */}
													{(zone.textColor || zone.boxColor) && (
														<span className="copy-colores">
														{zone.textColor && (
															<span className="copy-color">
																<label title="Color de la letra">
																	<input type="color" value={zone.textColor} onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, textColor: event.target.value.toUpperCase() } : item))} />
																	<i style={{ background: zone.textColor }} />
																</label>
																<input className="copy-hex" value={zone.textColor} spellCheck={false} aria-label="Color de la letra en hexadecimal"
																	onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, textColor: hexEscrito(event.target.value) } : item))} />
															</span>
														)}
														{zone.boxColor && (
															<span className="copy-color">
																<label title="Fondo de su cápsula">
																	<input type="color" value={zone.boxColor} onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, boxColor: event.target.value.toUpperCase() } : item))} />
																	<i style={{ background: zone.boxColor }} />
																</label>
																<input className="copy-hex" value={zone.boxColor} spellCheck={false} aria-label="Color del fondo en hexadecimal"
																	onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, boxColor: hexEscrito(event.target.value) } : item))} />
															</span>
														)}
														</span>
													)}
												</div>
												<div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
													{copyMode === 'edit' ? (
														<textarea value={zone.replacement || ''} rows={1} onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item))} style={{ flex: 1, minHeight: '38px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e6e0ee', background: '#faf8fc', fontSize: '13.5px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
													) : (
														<span style={{ flex: 1, fontSize: '13.5px', color: '#19171d', lineHeight: 1.4 }}>{zone.replacement || 'Sin reemplazo detectado'}</span>
													)}
													<button type="button" onClick={() => void regenerateCopy(index)} disabled={rehaciendo !== null} style={{ border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', padding: '6px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, cursor: rehaciendo !== null ? 'wait' : 'pointer', opacity: rehaciendo !== null && rehaciendo !== index ? 0.45 : 1, whiteSpace: 'nowrap' }} title="Rehacer este texto con IA">{rehaciendo === index ? <><span className="rehaciendo-spinner" aria-hidden="true" /> Rehaciendo…</> : '✨ Rehacer'}</button>
												</div>
											</div>
										))}
									</div>
								))}
							</div>
						) : (
							<div style={{ padding: '14px 16px', marginBottom: '18px', border: '1px solid #eee9f2', borderRadius: '12px', background: '#fcfbfe', color: '#716d79', fontSize: '13px' }}>No detectamos textos de publicación fuera del producto. Se conservarán únicamente los textos y detalles que ya pertenecen al producto real.</div>
						)}

						{/* Decisiones contextuales: no se limita a comparaciones.
						    También se abre cuando lo único que hay para decidir es de
						    quién es la cara: la carga de avatar vive adentro de este
						    bloque y sin esta condición quedaba sin puerta de entrada en
						    un ganador que muestra gente pero no dejó ninguna duda. */}
						{(creativeDecisions.length > 0 || personasVisibles.length > 0) && (
							<section className="creative-decisions-review" aria-label="Decisiones contextuales del anuncio" style={{ marginBottom: '18px', padding: '16px', border: '1px solid #e6ddf5', borderRadius: '12px', background: 'linear-gradient(135deg, #fcfaff, #fff)' }}>
								<div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
									<span aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: '#eee7ff', color: '#744bde', fontSize: '16px' }}>✦</span>
									<div>
										<strong style={label}>Decisiones para clonar mejor</strong>
										<p style={{ margin: '-4px 0 0', fontSize: '12px', lineHeight: 1.45, color: '#716d79' }}>La IA detectó elementos importantes del anuncio. Podés orientar cada uno o dejarlo vacío para que elija la opción más coherente.</p>
									</div>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{creativeDecisions.map((decision, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fff' }}>
											{/* Sin la descripción: explicaba el razonamiento de la IA
											    —"el producto original es un electrodoméstico, el tuyo es
											    software, necesitamos representarlo…"— y era un párrafo
											    entero para llegar a la misma pregunta que ya está abajo.
											    Del contexto queda solo dónde está el elemento, que es lo
											    único que ayuda a ubicarlo en el anuncio. */}
											<strong style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#3f3560', marginBottom: '5px' }}>
												<span>{creativeDecisionIcon(decision.type)} {decision.title || 'Elemento visual detectado'}</span>
												{/* De qué página del carrusel salió. Cada página aporta las
												    suyas, así que sin esto quedaban quince decisiones seguidas
												    sin saber a cuál imagen pertenecía cada una. */}
												{decision.slide && <em style={{ fontStyle: 'normal', fontSize: '11px', fontWeight: 700, color: '#744bde', background: '#eee7ff', padding: '2px 7px', borderRadius: '999px' }}>Imagen {decision.slide}</em>}
												{decision.where && <em style={{ fontStyle: 'normal', fontSize: '11px', fontWeight: 700, color: '#8b8490', background: '#f4f1f8', padding: '2px 7px', borderRadius: '999px' }}>{decision.where}</em>}
											</strong>
											<p style={{ margin: '0 0 8px', fontSize: '12.5px', lineHeight: 1.45, color: '#3f3560', fontWeight: 600 }}>{decision.question || `¿Cómo querés resolver ${decision.title?.toLowerCase() || 'este elemento'}?`}</p>
											{/* Tres respuestas listas para tocar. Escribir a mano era
											    el paso donde la gente se trababa o lo salteaba, y
											    saltearlo significa dejar la decisión al azar. */}
											<div className="decision-options">
												{(decision.options || []).map((opcion) => (
													<button
														key={opcion}
														type="button"
														className={decision.directive === opcion && !(index === indiceDecisionDePersona && personMode === 'upload') ? 'active' : ''}
														onClick={() => {
															// Elegir una opción escrita descarta las fotos: son dos
															// respuestas a la misma pregunta y sólo una puede valer.
															if (index === indiceDecisionDePersona && personMode === 'upload') setPersonMode(personModeSugerido === 'upload' ? 'ai' : personModeSugerido);
															setCreativeDecisions(creativeDecisions.map((current, decisionIndex) =>
																decisionIndex === index
																	? { ...current, directive: current.directive === opcion ? '' : opcion }
																	: current));
														}}
													>
														{opcion}
													</button>
												))}
												{/* Cargar fotos propias es una respuesta más a esta misma
												    pregunta. Estaba en una tarjeta aparte —"Quién pone la
												    cara"— justo debajo de esta, así que la pantalla
												    preguntaba dos veces por la persona del anuncio y las
												    dos respuestas podían contradecirse: elegías "una mujer
												    con estilo urbano" arriba y "usar mis fotos" abajo, y no
												    había forma de saber cuál mandaba. Acá está claro que es
												    una sola decisión y que elegir las fotos descarta las
												    otras opciones. */}
												{index === indiceDecisionDePersona && (
													<button
														type="button"
														className={personMode === 'upload' ? 'active' : ''}
														onClick={() => {
															// Las fotos mandan sobre cualquier descripción: dejar
															// escrita "un hombre joven casual" mientras se suben
															// fotos de otra persona es pedir dos cosas distintas.
															setPersonMode('upload');
															setCreativeDecisions(creativeDecisions.map((current, i) => i === index ? { ...current, directive: '' } : current));
														}}
													>
														📷 Usar mis fotos
													</button>
												)}
												<button
													type="button"
													className={`decision-write${escribiendo.has(index) ? ' active' : ''}`}
													onClick={() => setEscribiendo((actual) => {
														const siguiente = new Set(actual);
														if (siguiente.has(index)) siguiente.delete(index); else siguiente.add(index);
														return siguiente;
													})}
												>
													{escribiendo.has(index) ? 'Cerrar' : '✎ Escribir otra'}
												</button>
											</div>
											{index === indiceDecisionDePersona && personMode === 'upload' && cargaDeAvatar}
											{(escribiendo.has(index) || (decision.directive && !(decision.options || []).includes(decision.directive))) && (
												<input
													value={decision.directive || ''}
													onChange={(event) => setCreativeDecisions(creativeDecisions.map((current, decisionIndex) => decisionIndex === index ? { ...current, directive: event.target.value } : current))}
													placeholder={decision.defaultStrategy ? `Vacío = ${decision.defaultStrategy}` : 'Dejalo vacío para que la IA decida'}
													style={{ width: '100%', boxSizing: 'border-box', marginTop: '8px', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }}
												/>
											)}
										</div>
									))}
									{/* La fila de medios del ganador. Se pregunta en vez de decidirla a
									    ciegas: sacarla siempre deja afuera al negocio que SI tiene prensa
									    propia, y copiarla afirma una cobertura que no existe. Los logos del
									    ganador no se reproducen en ningun caso: son de otra empresa. */}
									{(plan as any)?.pressRow?.detected && (
										<div style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fff' }}>
											<strong style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#3f3560', marginBottom: '5px' }}>
												<span>📰 {(plan as any).pressRow.heading || 'Fila de medios'}</span>
											</strong>
											<p style={{ margin: '0 0 8px', fontSize: '12.5px', lineHeight: 1.45, color: '#3f3560', fontWeight: 600 }}>
												El ganador muestra {((plan as any).pressRow.outlets || []).join(', ') || 'logos de medios'}. Esos son de otra empresa y no se copian. ¿Tenés prensa o certificaciones propias?
											</p>
											<div className="decision-options">
												<button type="button" className={pressRowMode === 'quitar' ? 'active' : ''} onClick={() => setPressRowMode('quitar')}>No tengo · sacar el bloque</button>
												<button type="button" className={pressRowMode === 'texto' ? 'active' : ''} onClick={() => setPressRowMode('texto')}>Sí, escritos</button>
												<button type="button" className={pressRowMode === 'logos' ? 'active' : ''} onClick={() => setPressRowMode('logos')}>Sí, con sus logos</button>
											</div>
											{pressRowMode !== 'quitar' && (
												<input
													value={pressRowItems}
													onChange={(event) => setPressRowItems(event.target.value)}
													placeholder="Ej: La Nación, Infobae, Cámara de Comercio"
													style={{ width: '100%', boxSizing: 'border-box', marginTop: '8px', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }}
												/>
											)}
											{/* Lo que se dibuja acá lo afirma el anunciante, no la app: la
											    fila nunca se rellena sola ni se sugiere ningún medio. Por eso
											    el aviso de abajo dice quién se hace cargo — es la diferencia
											    entre mostrar una cobertura que existe e inventar una. */}
											<p style={{ margin: '8px 0 0', fontSize: '11.5px', lineHeight: 1.45, color: '#8b8490' }}>
												{pressRowMode === 'texto'
													? 'Van escritos con la tipografía del aviso, en el mismo lugar y tamaño que la fila del ganador.'
													: pressRowMode === 'logos'
														? 'Van con el logo de cada uno, en el mismo lugar y tamaño que la fila del ganador. Poné solo los que de verdad te cubrieron: lo que afirma el anuncio lo respondés vos, y Meta rechaza los avisos con respaldos falsos.'
														: 'Se saca la fila y su rótulo, y el diseño se cierra solo.'}
											</p>
										</div>
									)}
									{/* Acá vivía una tarjeta suelta, "Quién pone la cara", para cuando
									    el análisis veía gente pero no dejaba ninguna decisión de
									    persona. Aparecía de más: el analizador contaba como persona
									    una mano sosteniendo el producto, así que un aviso sin un solo
									    modelo abría igual preguntando quién pone la cara. Ahora la
									    opción de usar fotos propias vive únicamente dentro de la
									    decisión que pregunta por la persona, y esa decisión existe
									    sólo cuando hay alguien a quien castear de verdad. */}
								</div>
							</section>
						)}

						{/* Personas detectadas en el anuncio: fallback para análisis antiguos.
						    Con "sin persona" no se muestra: pedir cómo tiene que verse
						    alguien que ya se decidió que no va a aparecer es una pregunta
						    sin respuesta posible, y lo que se escribiera ahí no llegaría
						    al render. */}
						{personMode !== 'none' && people.length > 0 && creativeDecisions.length === 0 && (
							<div style={{ marginBottom: '18px' }}>
								<strong style={label}>👤 {people.length === 1 ? 'Persona en el anuncio' : 'Personas en el anuncio'}</strong>
								<p style={{ margin: '-4px 0 10px', fontSize: '12px', color: '#8b8490' }}>Detectamos {people.length === 1 ? 'una persona' : `${people.length} personas`}. Decinos cómo querés que se vea (o dejalo vacío para mantenerla parecida).</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{people.map((person, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fcfbfe' }}>
											<p style={{ margin: '0 0 7px', fontSize: '12.5px', color: '#5f5a67' }}>{person.description || person.where || 'Persona'}{person.role ? ` · ${person.role}` : ''}</p>
											<input value={person.directive || ''} onChange={(e) => setPeople(people.map((pp, i) => i === index ? { ...pp, directive: e.target.value } : pp))} placeholder="Ej: mujer 30 años, pelo castaño, sonriendo en cocina luminosa…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }} />
										</div>
									))}
								</div>
							</div>
						)}

						{comparisonDetected && creativeDecisions.length === 0 && (
							<section className="comparison-review" aria-label="Decisión sobre la comparación del anuncio">
								<div className="comparison-review-heading">
									<span className="comparison-review-icon" aria-hidden="true">⇄</span>
									<div>
										<strong>{comparisonTitle}</strong>
										<p>{comparisonInfo.summary || 'La composición parece contrastar tu producto con otra opción.'}</p>
									</div>
								</div>
								<p className="comparison-review-guidance">
									{comparisonInfo.confidence === 'low' && comparisonInfo.question
										? comparisonInfo.question
										: '¿Qué querés mostrar del otro lado? Podés aclararlo o dejarlo vacío: la IA va a elegir una alternativa coherente, de la misma categoría y sin marcas ajenas.'}
								</p>
								{comparisonInfo.confidence === 'low' && (
									<textarea
										className="comparison-guidance-input"
										value={comparisonGuidance}
										onChange={(event) => setComparisonGuidance(event.target.value)}
										placeholder="Respondé la duda de la IA o dejalo vacío para que decida"
										rows={2}
									/>
								)}
								{comparisons.length > 0 ? (
									<div className="comparison-list">
										{comparisons.map((item, index) => (
											<div key={index} className="comparison-item">
												<div className="comparison-item-copy">
													<strong>{comparisons.length === 1 ? 'La alternativa' : `Alternativa ${index + 1}`}</strong>
													<span>{item.description || item.role || item.where || 'Elemento que aparece del otro lado'}</span>
												</div>
												<input
													className="comparison-input"
													value={item.directive || ''}
													onChange={(event) => setComparisons(comparisons.map((current, itemIndex) => itemIndex === index ? { ...current, directive: event.target.value } : current))}
													placeholder="Dejalo vacío para que la IA decida"
												/>
											</div>
										))}
									</div>
								) : comparisonInfo.confidence !== 'low' ? (
									<textarea
										className="comparison-guidance-input"
										value={comparisonGuidance}
										onChange={(event) => setComparisonGuidance(event.target.value)}
										placeholder="Ej.: comparalo con un rack fijo que requiere agujerear la pared"
										rows={2}
									/>
								) : null}
							</section>
						)}

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						{/* Va pegado al botón a propósito: el botón dice cuántos créditos
						    sale, así que el número y su precio se leen de un vistazo. */}
						{!wantsFullCarousel && (
							<section className="logo-decision" aria-label="Cuántas versiones generar" style={{ marginBottom: '14px' }}>
								<div className="logo-decision-head">
									<strong>¿Cuántas versiones querés?</strong>
									<small>Se generan juntas con estas mismas decisiones, y elegís la que más te guste. Cada una sale distinta y cuesta un crédito.</small>
								</div>
								<div className="logo-decision-options opciones-cortas" role="radiogroup" aria-label="Cantidad de versiones">
									{[1, 2, 3, 4].map((cantidad) => (
										<button
											key={cantidad}
											type="button" role="radio" aria-checked={variantes === cantidad}
											className={variantes === cantidad ? 'active' : ''}
											onClick={() => setVariantes(cantidad)}
											disabled={phase === 'starting'}
										>
											{cantidad === 1 ? '1 imagen' : `${cantidad} imágenes`}
										</button>
									))}
								</div>
							</section>
						)}

						<div className="wiz-actions">
							<button type="button" className="wiz-back" onClick={() => { setPhase('setup'); setFormStep(3); }} disabled={phase === 'starting'}>← Ajustes</button>
							{/* No se puede aprobar con la carga de fotos a medias: el crédito se
						    cobra al arrancar y el error aparecía después, con la generación
						    ya paga y fallada. El motivo va escrito al lado del botón, no
						    solo en la tarjeta de la decisión, que puede haber quedado
						    scrolleada fuera de la pantalla. */}
						<button
								type="button"
								onClick={() => void approveReviewedGeneration()}
								disabled={phase === 'starting' || Boolean(faltaParaElAvatar)}
								title={faltaParaElAvatar || undefined}
								className="url-batch-submit-btn"
							>
								{phase === 'starting' ? <><span className="studio-spinner small" aria-hidden="true" /> Generando imagen…</> : faltaParaElAvatar ? <span>Falta una foto de la persona</span> : <span>Aprobar y generar ✓ · {count} {count === 1 ? 'crédito' : 'créditos'}</span>}
							</button>
						</div>
					</>}
				</section>
			</div>
		</div>
	);
}
