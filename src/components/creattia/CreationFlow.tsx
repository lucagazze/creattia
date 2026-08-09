import { useReferenceUrls } from '../../lib/creattia/reference-urls';
import { subjectModeDesde, alcanceDesde, personModeRecomendado, type Alcance, type PersonMode } from '../../lib/creattia/generation-pipeline';
import UrlInput from './UrlInput';
import React, { useState, useEffect, useRef } from 'react';
import { BatchSelect, LANGUAGE_OPTIONS, STYLE_OPTIONS, BRAND_OPTIONS, BrandOptionIcon, driveBatchWorkers } from './UrlBatchSection';
import ProductAssetReview, { type ProductReviewItem } from './ProductAssetReview';
import { leerRespuestaDeEscaneo } from '../../lib/creattia/errores-de-escaneo';

// ─────────────────────────────────────────────────────────────────────────────
// Página completa de creación fiel al ganador (reemplaza el modal). Mismo
// wizard paso a paso que el generador por lote (UrlBatchSection): un tema por
// pantalla, con la misma barra de progreso, tabs, pills y botones.
// Pasos: 1) producto  2) formato  3) estilo visual → analizar referencia → generar.
// ─────────────────────────────────────────────────────────────────────────────

// Formatos visuales del paso 2, mismos valores que ya entiende el backend de
// generación individual (distintos de los alias del lote, pero mismo diseño).
const FORMAT_ITEMS = [
	{ id: 'original', text: 'Original', desc: 'Igual al ganador', shape: 'original' },
	{ id: '1:1', text: '1:1', desc: 'Feed', shape: 'square' },
	{ id: '3:4', text: '3:4', desc: 'Vertical', shape: 'portrait' },
	{ id: '9:16', text: '9:16', desc: 'Historia', shape: 'story' },
	{ id: '4:3', text: '4:3', desc: 'Horizontal', shape: 'landscape' },
	{ id: '16:9', text: '16:9', desc: 'Panorámico', shape: 'wide' },
];

export default function CreationFlow({ ad, session, onToast, onGenerationStarted, onGenerationRequested, onBack }: {
	ad: any;
	session: any;
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
	const [includeLogo, setIncludeLogo] = useState(false);
	// Carrusel completo: en cuáles páginas va el logo. Solo se mira cuando
	// `includeLogo` está prendido; al prenderlo arrancan todas.
	const [logoCarouselPages, setLogoCarouselPages] = useState<Set<number>>(new Set());
	const count = wantsFullCarousel ? carouselSlides.length : 1;
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
	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting'>('setup');
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
	const revisionPalette: Record<string, string> | null = (() => {
		if (colorMode === 'winner') return null;
		return (plan as any)?.brandPalette
			|| (importedProducts[0] as any)?.metadata?.brandFromUrl?.palette
			|| null;
	})();
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
	useEffect(() => {
		if (phase !== 'review' || brandSource !== 'mine' || !token) return;
		let cancelado = false;
		void fetch('/api/creativos/brands', { headers: { authorization: `Bearer ${token}` } })
			.then((response) => response.ok ? response.json() : null)
			.then((payload) => {
				if (cancelado) return;
				setLogoDeMiMarca(typeof payload?.profileLogoUrl === 'string' ? payload.profileLogoUrl : '');
			})
			.catch(() => { /* sin miniatura se sigue pudiendo elegir */ });
		return () => { cancelado = true; };
	}, [phase, brandSource, token]);
	/** El archivo concreto que se pegaría si se elige "con logo". */
	const logoQueSePondria = brandSource === 'mine' ? logoDeMiMarca : brandSource === 'url' ? logoDeLaUrl : '';
	const origenDelLogo = brandSource === 'mine' ? 'Mi marca' : 'la URL';
	/**
	 * El link del logo existe pero la imagen no carga. Pasa con logos detectados
	 * en webs ajenas: el archivo se movió o el sitio no lo sirve afuera. Sin esto
	 * quedaba el ícono de imagen rota justo donde había que confiar en lo que se
	 * iba a poner en el anuncio.
	 */
	const [logoRoto, setLogoRoto] = useState(false);
	useEffect(() => { setLogoRoto(false); }, [logoQueSePondria]);

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
	const [creativeDecisions, setCreativeDecisions] = useState<Array<{ slide?: number; type?: string; title?: string; where?: string; description?: string; question?: string; defaultStrategy?: string; options?: string[]; confidence?: string; directive?: string }>>([]);
	/** Qué decisiones tienen abierto el campo para escribir una respuesta propia. */
	const [escribiendo, setEscribiendo] = useState<Set<number>>(new Set());
	const [comparisonGuidance, setComparisonGuidance] = useState('');
	const [error, setError] = useState('');
	const chip = (active: boolean) => ({
		padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
		border: active ? '2px solid #744bde' : '1px solid #e2dde9', background: active ? '#f4f2f6' : '#fff', color: active ? '#744bde' : '#3f3a48',
	} as const);

	const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '9px', letterSpacing: '.01em' } as const;
	// Carrusel completo con productos distintos: 1 URL por página, en orden.
	// El resto de los casos (mismo producto, o solo una página) piden 1 solo.
	const urlsNeeded = wantsFullCarousel && !carouselSameProduct ? carouselSlides.length : 1;
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
				if (productMode === 'url' && !productIds.length) { setPhase('setup'); return; }
				// setState no se refleja en este mismo handler: se relee del producto.
				const scanned = importedProducts.find((item: any) => productIds.includes(item.id));
				const scannedType = (scanned as any)?.metadata?.pageType;
				if (scannedType === 'service' || scannedType === 'catalog') offeringForSubmit = scannedType;
				// De un catálogo se importan varios productos: entran todos como
				// referencia para que el anuncio muestre una selección de la tienda.
				if (scannedType === 'catalog' && productIds.length > 1) isCatalogSubmit = true;
			}
			const form = new FormData();
			form.set('referencePath', effectiveReferencePath);
			if (wantsFullCarousel) form.set('referencePaths', JSON.stringify(carouselSlides));
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
			setComparisons(Array.isArray(analysis.comparisonItems) ? analysis.comparisonItems.map((c: any) => ({ ...c, directive: '' })) : []);
			setCreativeDecisions(Array.isArray(analysis.creativeDecisions) ? analysis.creativeDecisions.map((decision: any) => ({ ...decision, directive: '' })) : []);
			setComparisonGuidance('');
			setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo analizar la referencia.');
			setPhase('setup');
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
		avatarFiles.slice(0, 12).forEach((file) => avatarForm.append('images', file));
		const respuesta = await fetch('/api/creativos/avatars', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: avatarForm });
		const payload = await respuesta.json().catch(() => ({}));
		if (!respuesta.ok || !payload.avatar?.id) throw new Error(payload.error || 'No se pudo guardar el avatar.');
		return payload.avatar.id as string;
	}

	async function approveAndGenerate() {
		// Mismo cerrojo que el carrusel: el botón se deshabilita con `phase`, pero
		// entre dos clics muy seguidos ese estado todavía vale el valor viejo.
		if (enviando.current) return;
		enviando.current = true;
		setPhase('starting'); setError('');
		onGenerationRequested?.();
		try {
			if (productMode === 'url' && selectedProductIds.length === 0) {
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
			if (Object.keys(paletteOverride).length) form.set('paletteOverride', JSON.stringify(paletteOverride));
			form.set('typoMode', typoMode);
			form.set('brandSource', brandSource);
			form.set('subjectMode', detectedOffering);
			form.set('includeLogo', includeLogo ? '1' : '0');
			if ((productMode === 'url' || isService) && selectedProductIds.length) {
				selectedProductIds.forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			form.set('personMode', personMode);
			if (personMode === 'upload') form.set('avatarId', await guardarAvatarCargado());
			form.set('plan', JSON.stringify(planRevisado()));

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
			setPhase('review');
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
	const [rehaciendo, setRehaciendo] = useState<number | null>(null);

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
					productName: manualProductName || 'producto',
					productFacts: manualProductFacts,
					language,
				}),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo reescribir el texto.');
			setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: payload.replacement } : item));
			onToast?.('Texto regenerado con éxito.');
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
					referenceSlidePaths: carouselSlides,
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
					logoSlideIndexes: includeLogo ? [...logoCarouselPages] : [],
					// Un análisis por página, en el orden de las páginas.
					approvedPlans: carouselSlides.map((_, indice) => planRevisado(indice + 1)),
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
							: 'Se replica la composición visual del ganador con tu producto. Antes de generar podés ajustar la identidad y las personas.'}
					</p>

					{/* Misma barra de progreso que el generador por lote. */}
					<ol className="wiz-progress" aria-label="Progreso">
						{[
							{ n: 1, label: 'Tu producto', active: phase === 'setup' && formStep === 1, done: phase !== 'setup' || formStep > 1 },
							{ n: 2, label: 'Formato', active: phase === 'setup' && formStep === 2, done: phase !== 'setup' || formStep > 2 },
							{ n: 3, label: 'Estilo', active: phase === 'setup' && formStep === 3, done: phase !== 'setup' },
							{ n: 4, label: 'Revisar', active: phase === 'planning' || phase === 'review' || phase === 'starting', done: false },
						].map((item) => (
							<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
								<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
								<span className="wiz-progress-label">{item.label}</span>
							</li>
						))}
					</ol>

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
												{wantsFullCarousel && !carouselSameProduct && (
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
										{!(wantsFullCarousel && carouselSameProduct) && (
											<button type="button" onClick={() => setUrls((prev) => [...prev, ''])}
												style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: '9px', border: '1px dashed #cbb8f0', background: '#faf8ff', color: '#5b3fc4', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
												+ Agregar otra URL {wantsFullCarousel && !carouselSameProduct ? '(otra página)' : '(otro producto)'}
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
											<button key={option.value} type="button" className={`batch-brand-option ${brandSource === option.value ? 'active' : ''}`} onClick={() => { setBrandSource(option.value); if (option.value === 'none') { setIncludeLogo(false); setLogoCarouselPages(new Set()); } }} aria-pressed={brandSource === option.value}>
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
											? <><span className="studio-spinner small" aria-hidden="true" /> {wantsFullCarousel ? `Analizando las ${carouselSlides.length} páginas…` : 'Analizando referencia…'}</>
											: wantsFullCarousel ? `Analizar las ${carouselSlides.length} páginas` : 'Analizar referencia'}
									</button>
									{phase !== 'planning' && <span className="batch-credit-note">Todavía no gastás créditos</span>}
								</div>
							</div>
						)}
					</>}

					{(phase === 'review' || phase === 'starting') && plan && <>
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
									<strong>Colores detectados</strong>
									<small>Los sacamos de la identidad elegida. Si alguno no es el de tu marca, tocalo y cambialo.</small>
								</div>
								<div className="palette-swatches">
									{([['background', 'Fondo'], ['accent', 'Principal'], ['secondary', 'Secundario'], ['text', 'Texto']] as const).map(([role, roleLabel]) => {
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
									<strong>¿Incluir tu logo?</strong>
									<small>
										{ganadorTieneLogoDibujado
											? `${wantsFullCarousel ? 'El carrusel ganador firma' : 'El anuncio ganador firma'} con un logo dibujado${descripcionDelLogo ? ` (${descripcionDelLogo})` : ''}: tu logo entra en ese mismo lugar, sin agregarle nada nuevo al diseño.`
											: ganadorFirmaConElNombre
												? `${wantsFullCarousel ? 'El carrusel ganador firma' : 'El anuncio ganador firma'} con el nombre de su marca escrito${descripcionDelLogo ? ` (${descripcionDelLogo})` : ''}, no con un logo dibujado. En ese mismo lugar va a ir escrito el nombre de tu negocio, pongas o no el logo.`
												: `${wantsFullCarousel ? 'Ninguna página del carrusel ganador muestra' : 'El anuncio ganador no muestra'} ninguna marca en ningún lado.`}
									</small>
								</div>
								<div className="logo-decision-options" role="radiogroup" aria-label="Incluir logo">
									<button
										type="button" role="radio" aria-checked={includeLogo}
										// En un carrusel el logo arranca en TODAS las páginas y desde
										// las miniaturas de abajo se le saca a las que no lo quieran.
										onClick={() => { setIncludeLogo(true); if (wantsFullCarousel) setLogoCarouselPages(new Set(carouselSlides.map((_, indice) => indice))); }}
										className={includeLogo ? 'active' : ''}
									>
										Con logo de {origenDelLogo}
										{ganadorTieneLogoDibujado && <em>recomendado</em>}
									</button>
									<button
										type="button" role="radio" aria-checked={!includeLogo}
										className={!includeLogo ? 'active' : ''}
										onClick={() => setIncludeLogo(false)}
									>
										Sin logo
										{!ganadorTieneLogoDibujado && <em>recomendado</em>}
									</button>
								</div>
								{/* Qué pasa con cada opción, dicho para alguien que no sabe de
								    diseño: lo que hay que entender es dónde va a terminar el
								    archivo del logo, que es lo que sorprendía al ver la imagen. */}
								<p className="logo-decision-consecuencia">
									{includeLogo
										? (ganadorTieneLogoDibujado
											? `Vamos a colocar el archivo del logo de tu marca en ${wantsFullCarousel ? 'las páginas elegidas' : 'la imagen'}, en el mismo lugar y del mismo tamaño que el logo del anuncio ganador.`
											: `Vamos a colocar el archivo del logo de tu marca en un lugar nuevo de ${wantsFullCarousel ? 'cada página elegida' : 'la imagen'}: el anuncio ganador no tiene ningún logo dibujado, así que hay que abrirle un espacio que el diseño original no tenía.`)
										: (ganadorFirmaConElNombre || ganadorTieneLogoDibujado
											? 'No se coloca ningún archivo de logo. Donde el anuncio ganador tiene su marca va a ir escrito el nombre de tu negocio, con la tipografía del aviso.'
											: `No se coloca ningún archivo de logo, y como el anuncio ganador tampoco muestra una marca, ${wantsFullCarousel ? 'las imágenes salen' : 'la imagen sale'} igual de limpia${wantsFullCarousel ? 's' : ''} que el original.`)}
								</p>
								{includeLogo && wantsFullCarousel && (
									<>
										<small className="batch-brand-note">Tocá una página para sacarle el logo — por defecto va en todas.</small>
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
									logoQueSePondria && !logoRoto ? (
										<div className="logo-decision-preview">
											<img src={logoQueSePondria} alt={`Logo de ${origenDelLogo}`} onError={() => setLogoRoto(true)} />
											<span>Este es el logo que vamos a poner. Si no es el de tu marca, cambiá la identidad en el paso de estilo.</span>
										</div>
									) : (
										<p className="logo-decision-preview-vacio">
											{logoRoto
												? `Encontramos un logo en ${origenDelLogo} pero el archivo no se puede abrir, así que lo más probable es que el anuncio salga sin él.`
												: `No encontramos ningún archivo de logo en ${origenDelLogo}, así que no vamos a poder colocarlo.`}
											{' '}{brandSource === 'mine' ? 'Subí tu logo en Mi marca' : 'Probá con la identidad de Mi marca'} o generá sin logo.
										</p>
									)
								)}
							</section>
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
														className={decision.directive === opcion ? 'active' : ''}
														onClick={() => setCreativeDecisions(creativeDecisions.map((current, decisionIndex) =>
															decisionIndex === index
																? { ...current, directive: current.directive === opcion ? '' : opcion }
																: current))}
													>
														{opcion}
													</button>
												))}
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
									{/* De quién es la cara: una decisión más de este mismo bloque.
									    Antes esto vivía arriba, en "¿Querés mostrar una persona?",
									    con cuatro opciones —sin persona, que la IA elija, yo la
									    describo, cargar avatar—, y dos centímetros más abajo la IA
									    preguntaba acá el tipo de modelo, el estilo de foto y quién
									    usa el producto. Era la misma decisión dos veces, y con dos
									    respuestas que podían contradecirse entre sí. Las tres
									    primeras opciones ya se contestan escribiendo en las
									    decisiones de arriba; la única que no se puede escribir es
									    "usá ESTA cara", y es la que quedó. Sin elegirla, manda la
									    recomendación que salió del análisis: la IA elige si el
									    ganador muestra gente, nadie si no muestra. */}
									{personasVisibles.length > 0 && (
										<div style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fff' }}>
											<strong style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#3f3560', marginBottom: '5px' }}>
												<span>👤 Quién pone la cara</span>
											</strong>
											<p style={{ margin: '0 0 8px', fontSize: '12.5px', lineHeight: 1.45, color: '#3f3560', fontWeight: 600 }}>
												{personasVisibles.length === 1 ? 'El ganador muestra una persona' : `El ganador muestra ${personasVisibles.length} personas`}. ¿La elige la IA o usás fotos tuyas?
											</p>
											<div className="decision-options">
												<button
													type="button"
													className={personMode !== 'upload' ? 'active' : ''}
													onClick={() => setPersonMode(personModeSugerido === 'upload' ? 'ai' : personModeSugerido)}
												>
													Que la IA elija
												</button>
												<button
													type="button"
													className={personMode === 'upload' ? 'active' : ''}
													onClick={() => setPersonMode('upload')}
												>
													Usar mis fotos
												</button>
											</div>
											{personMode === 'upload' && (
												<div style={{ marginTop: '10px' }}>
													<input type="file" id="creation-avatar-files" accept="image/png,image/jpeg,image/webp" multiple className="hidden-file-input" onChange={(event) => {
														const files = event.target.files ? Array.from(event.target.files).slice(0, 12) : [];
														setAvatarFiles(files); setAvatarPreviews(files.map((file) => URL.createObjectURL(file))); event.target.value = '';
													}} />
													{/* Pedía cuatro como mínimo y era un cerrojo, no un consejo:
													    el que tenía una sola foto buena de su cara no podía usar
													    la función. Con una alcanza para fijar la identidad; que
													    dos o tres la sostengan mejor entre creativos es
													    información útil, no un requisito. */}
													<label htmlFor="creation-avatar-files" className="uploader-label" style={{ display: 'inline-flex', width: 'auto' }}>Subir fotos de la persona</label>
													<p style={{ margin: '8px 0 0', fontSize: '12px', color: '#716d79', lineHeight: 1.45 }}>Con una foto alcanza. Con dos o tres, tomadas de ángulos distintos, la cara sale más parecida de un creativo a otro.</p>
													{avatarPreviews.length > 0 && <div className="extra-previews-grid" style={{ marginTop: '10px' }}>{avatarPreviews.map((preview) => <div className="preview-thumb" key={preview}><img src={preview} alt="Referencia de avatar" /></div>)}</div>}
													<label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '10px', fontSize: '12px', color: '#5f5a67' }}><input type="checkbox" checked={avatarConsent} onChange={(event) => setAvatarConsent(event.target.checked)} /> Confirmo que tengo permiso para usar estas imágenes.</label>
												</div>
											)}
										</div>
									)}
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

						<div className="wiz-actions">
							<button type="button" className="wiz-back" onClick={() => { setPhase('setup'); setFormStep(3); }} disabled={phase === 'starting'}>← Ajustes</button>
							<button
								type="button"
								onClick={() => void approveReviewedGeneration()}
								disabled={phase === 'starting'}
								className="url-batch-submit-btn"
							>
								{phase === 'starting' ? <><span className="studio-spinner small" aria-hidden="true" /> Generando imagen…</> : <span>Aprobar y generar ✓ · {count} {count === 1 ? 'crédito' : 'créditos'}</span>}
							</button>
						</div>
					</>}
				</section>
			</div>
		</div>
	);
}
