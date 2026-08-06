import type { PageType } from './catalog-scanner';

/**
 * Qué clase de página es, deducido de la URL sola.
 *
 * La clasificación la hacía únicamente el modelo leyendo el contenido, y con la
 * home de una tienda seguía saliendo "un producto": entre 40 productos elegía
 * el primero y lo trataba como protagonista. La URL trae señales mucho más
 * duras que el texto —`/products/algo` es una ficha, `/` o `/collections/` es un
 * listado— y cuando esas señales son claras mandan sobre el modelo.
 *
 * Se devuelve también la confianza, para no pisar al modelo cuando la URL no
 * dice nada (un dominio propio sin estructura reconocible).
 */

/** Segmentos que en la práctica siempre cuelgan de UNA ficha de producto. */
const PRODUCT_SEGMENTS = ['products', 'product', 'producto', 'productos', 'item', 'items', 'p', 'dp', 'ip', 'articulo', 'produto'];

/** Segmentos de listado: categorías, colecciones, la tienda entera. */
const CATALOG_SEGMENTS = [
	'collections', 'collection', 'coleccion', 'colecciones', 'categoria', 'categorias', 'category', 'categories',
	'shop', 'store', 'tienda', 'catalogo', 'catalog', 'productos-todos', 'all', 'c', 'browse', 'search', 'buscar',
];

/** Segmentos de una landing de servicio o software. */
const SERVICE_SEGMENTS = ['pricing', 'precios', 'planes', 'plans', 'servicios', 'services', 'features', 'demo', 'app', 'software'];

export type UrlVerdict = {
	pageType: PageType | null;
	/** 'alta' cuando la ruta es inequívoca; 'baja' cuando solo se intuye. */
	confidence: 'alta' | 'media' | 'baja';
	reason: string;
};

export function pageTypeFromUrl(rawUrl: string): UrlVerdict {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { pageType: null, confidence: 'baja', reason: 'la URL no se pudo leer' };
	}

	const segments = url.pathname.split('/').map((part) => part.trim().toLowerCase()).filter(Boolean);

	// La raíz es la home, pero eso NO alcanza para decidir: puede ser una tienda
	// con decenas de productos o la landing de un producto único (una marca que
	// vende una sola cosa). Quien puede distinguirlas es el modelo, que ve el
	// contenido, así que acá se sugiere sin imponer.
	if (!segments.length) {
		return { pageType: 'catalog', confidence: 'media', reason: 'es la página principal del sitio' };
	}

	// `/products/algo` es una ficha; `/products` a secas es el listado.
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const hasChild = index < segments.length - 1;
		if (PRODUCT_SEGMENTS.includes(segment)) {
			return hasChild
				? { pageType: 'product', confidence: 'alta', reason: `la ruta apunta a una ficha (/${segment}/${segments[index + 1]})` }
				: { pageType: 'catalog', confidence: 'alta', reason: `la ruta es el listado /${segment}` };
		}
		if (CATALOG_SEGMENTS.includes(segment)) {
			return { pageType: 'catalog', confidence: 'alta', reason: `la ruta es un listado (/${segment})` };
		}
		if (SERVICE_SEGMENTS.includes(segment)) {
			return { pageType: 'service', confidence: 'media', reason: `la ruta sugiere un servicio (/${segment})` };
		}
	}

	// Un único segmento largo con guiones suele ser el slug de un producto.
	if (segments.length === 1 && segments[0].includes('-') && segments[0].length > 12) {
		return { pageType: 'product', confidence: 'media', reason: 'la ruta parece el nombre de un producto' };
	}

	return { pageType: null, confidence: 'baja', reason: 'la URL no da señales claras' };
}

/**
 * Combina lo que dice la URL con lo que leyó el modelo.
 *
 * Una señal fuerte de la URL gana: el modelo se confunde mirando una home llena
 * de productos, pero `/` no admite interpretación. Con señales débiles, manda el
 * modelo, que sí vio el contenido.
 */
export function resolvePageType(
	fromUrl: UrlVerdict,
	fromModel: PageType | null | undefined,
	/** Cuántos productos DISTINTOS reconoció el modelo en la página. */
	productsFound = 0,
): { pageType: PageType; reason: string } {
	// Un "catálogo" con un solo producto no es un catálogo: es la landing de ese
	// producto. Pasa en las marcas que venden una sola cosa, donde la home es la
	// ficha. Sin esto, el anuncio hablaba de "la tienda" teniendo un único ítem.
	if (fromModel === 'catalog' && productsFound === 1) {
		return { pageType: 'product', reason: 'la página gira alrededor de un solo producto' };
	}
	if (fromUrl.pageType && fromUrl.confidence === 'alta' && fromUrl.pageType !== fromModel) {
		return { pageType: fromUrl.pageType, reason: `${fromUrl.reason} (la ruta pesa más que el contenido)` };
	}
	if (fromModel) return { pageType: fromModel, reason: 'según el contenido de la página' };
	if (fromUrl.pageType) return { pageType: fromUrl.pageType, reason: fromUrl.reason };
	return { pageType: 'product', reason: 'sin señales claras, se asume una ficha' };
}
