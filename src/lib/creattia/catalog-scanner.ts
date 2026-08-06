import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { normalizeExternalUrl, readLimited, safeExternalFetch } from './safe-fetch';

/**
 * Qué clase de página se analizó.
 *
 * - `product`: una ficha de producto concreta.
 * - `service`: una landing de servicio, SaaS, curso o suscripción.
 * - `catalog`: la home de la tienda o una categoría, donde no hay UN producto
 *   sino varios. Antes caía en `product` y el scanner inventaba un "producto 1"
 *   que en realidad era la tienda entera, con todas las fotos mezcladas.
 */
export type PageType = 'product' | 'service' | 'catalog';

export type ScannedProduct = {
	externalId: string;
	/** Qué se está vendiendo, detectado por la IA al leer la página. */
	offeringType?: 'product' | 'service';
	name: string;
	description: string;
	priceText: string;
	currency: string;
	productUrl: string;
	imageUrl: string;
	imageUrls: string[];
	/** Videos found in the product page/gallery. Kept optional for legacy scanners. */
	videoUrls?: string[];
	metadata: Record<string, unknown>;
};

/** Lo que devuelve analizar una URL: el tipo de página y lo que se encontró. */
export type ScannedPage = {
	pageType: PageType;
	/** Uno para una ficha; varios cuando la página es un catálogo. */
	products: ScannedProduct[];
	/** El negocio dueño de la página, para cuando el anuncio habla de la tienda. */
	store: { name: string; description: string; evidence: string };
	sourceUrl: string;
};

export type ScannedSource = {
	url: string;
	title: string;
	description: string;
	imageUrl: string;
	colors: string[];
	products: ScannedProduct[];
	metadata: Record<string, unknown>;
};

const PRODUCT_IMAGE_LIMIT = 24;

function compact(value: unknown, max = 1500) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function absoluteUrl(value: unknown, base: string) {
	try { return value ? new URL(String(value), base).toString() : ''; } catch { return ''; }
}

function imageUrls(values: unknown[], base: string, limit = 24) {
	const urls = values.flatMap((value) => {
		if (Array.isArray(value)) return value;
		if (value && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			return [record.url, record.contentUrl, record.src];
		}
		return [value];
	}).map((value) => absoluteUrl(value, base)).filter(Boolean)
		.filter((url) => looksLikeProductPhoto(url as string))
		.map((url) => upgradeImageSize(url as string));
	return [...new Set(urls)].slice(0, limit);
}

/**
 * Descarta lo que no es una foto de producto: logos, iconos, banners de pago,
 * sellos y sprites. Frávega, por ejemplo, publica su propio logo como og:image,
 * así que sin este filtro el "producto" terminaba siendo el logo de la tienda.
 */
const NOT_A_PRODUCT_PHOTO = /(logo|isologo|favicon|sprite|icon|placeholder|banner|badge|seal|payment|mercadopago|visa|mastercard|whatsapp|arrow|chevron|avatar)/i;

function looksLikeProductPhoto(url: string) {
	if (!url) return false;
	if (NOT_A_PRODUCT_PHOTO.test(url)) return false;
	if (/\.svg($|\?)/i.test(url)) return false;
	return true;
}

/**
 * Sube la resolución de las miniaturas de los CDN más comunes. Las tiendas
 * suelen servir versiones de 300px en el listado, y una foto de 300px hace que
 * el producto salga borroso en el anuncio final.
 */
function upgradeImageSize(url: string) {
	return url
		.replace(/\/f\d{2,4}\//, '/f1200/')            // images.fravega.com/f300/
		.replace(/(\/\d{2,4}x\d{2,4})\//, '/1200x1200/') // cdn genéricos con /300x300/
		.replace(/([?&])width=\d+/i, '$1width=1200')
		.replace(/_\d{2,3}x\d{2,3}(\.[a-z]{3,4})/i, '_1200x1200$1'); // shopify _300x300.jpg
}

/**
 * Muchas tiendas modernas son SPA: el HTML casi no trae <img> y las fotos viven
 * dentro del JSON que hidrata la página (__NEXT_DATA__, __NUXT__, apolloState).
 * Acá se barre ese JSON buscando URLs de imagen del propio CDN del sitio.
 */
function imagesFromEmbeddedJson(html: string, base: string, limit = 24) {
	const found: string[] = [];
	const blocks = html.match(/<script[^>]*>[\s\S]{0,400000}?<\/script>/gi) || [];
	for (const block of blocks) {
		if (!/__NEXT_DATA__|__NUXT__|apolloState|"image"|"images"|"media"/i.test(block)) continue;
		const urls = block.match(/https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s\\]*)?/gi) || [];
		for (const raw of urls) {
			// El JSON embebido escapa las barras como / o \/.
			const clean = raw.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
			if (!looksLikeProductPhoto(clean)) continue;
			found.push(upgradeImageSize(clean));
			if (found.length >= limit * 3) break;
		}
	}
	// Las que más se repiten suelen ser las del producto; se conserva el orden.
	return [...new Set(found)].slice(0, limit);
}

function videosFromEmbeddedJson(html: string, limit = 12) {
	const found: string[] = [];
	const blocks = html.match(/<script[^>]*>[\s\S]{0,400000}?<\/script>/gi) || [];
	for (const block of blocks) {
		if (!/video|media|mp4|webm|m4v/i.test(block)) continue;
		const urls = block.match(/https?:\/\/[^"'\s\\]+\.(?:mp4|webm|mov|m4v)(?:\?[^"'\s\\]*)?/gi) || [];
		for (const raw of urls) {
			const clean = raw.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
			if (!found.includes(clean)) found.push(clean);
			if (found.length >= limit * 2) break;
		}
	}
	return [...new Set(found)].slice(0, limit);
}

function samePageUrl(left: string, right: string) {
	try {
		const a = new URL(left); const b = new URL(right);
		return a.hostname === b.hostname && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
	} catch { return false; }
}

function productFromJsonLd(value: Record<string, any>, base: string, index: number): ScannedProduct | null {
	const type = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
	if (!type.some((item: unknown) => String(item).toLowerCase() === 'product')) return null;
	const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers || {};
	const productImages = imageUrls([value.image], base);
	const name = compact(value.name, 180);
	if (!name) return null;
	const productUrl = absoluteUrl(value.url || offer.url, base);
	return {
		externalId: compact(value.sku || value.productID || value['@id'] || productUrl || `${name}-${index}`, 240),
		name,
		description: compact(value.description, 1600),
		priceText: compact(offer.price || offer.lowPrice || '', 60),
		currency: compact(offer.priceCurrency || '', 12),
		productUrl,
		imageUrl: productImages[0] || '',
		imageUrls: productImages,
		metadata: { availability: compact(offer.availability, 120), brand: compact(value.brand?.name || value.brand, 100) },
	};
}

function walkJsonLd(value: unknown, base: string, products: ScannedProduct[]) {
	if (Array.isArray(value)) return value.forEach((item) => walkJsonLd(item, base, products));
	if (!value || typeof value !== 'object') return;
	const record = value as Record<string, any>;
	const product = productFromJsonLd(record, base, products.length);
	if (product) products.push(product);
	if (record['@graph']) walkJsonLd(record['@graph'], base, products);
	if (record.itemListElement) walkJsonLd(record.itemListElement, base, products);
	if (record.item) walkJsonLd(record.item, base, products);
}

function dedupe(products: ScannedProduct[]) {
	const seen = new Set<string>();
	return products.filter((product) => {
		const key = product.externalId || product.productUrl || product.name.toLowerCase();
		if (!product.name || seen.has(key)) return false;
		seen.add(key);
		return true;
	}).slice(0, 60);
}

function wooPrice(prices: any) {
	const raw = Number(prices?.price);
	if (!Number.isFinite(raw)) return compact(prices?.price, 60);
	const minor = Number.isInteger(prices?.currency_minor_unit) ? prices.currency_minor_unit : 2;
	return String(raw / (10 ** minor));
}

async function scanShopify(origin: string) {
	try {
		const response = await safeExternalFetch(`${origin}/products.json?limit=60`, { headers: { accept: 'application/json' } });
		if (!response.ok || !response.headers.get('content-type')?.includes('json')) return [];
		const payload = JSON.parse(new TextDecoder().decode(await readLimited(response, 4_000_000)));
		if (!Array.isArray(payload.products)) return [];
		return payload.products.map((product: any, index: number): ScannedProduct => {
			const variant = product.variants?.[0] || {};
			const productImages = imageUrls([product.image, product.images], origin);
			return {
				externalId: compact(product.id || product.handle || index, 240),
				name: compact(product.title, 180),
				description: compact(cheerio.load(product.body_html || '').text(), 1600),
				priceText: compact(variant.price, 60),
				currency: '',
				productUrl: `${origin}/products/${product.handle}`,
				imageUrl: productImages[0] || '',
				imageUrls: productImages,
				metadata: { vendor: compact(product.vendor, 120), productType: compact(product.product_type, 120), tags: product.tags || [] },
			};
		});
	} catch { return []; }
}

async function scanWooCommerce(origin: string) {
	try {
		const response = await safeExternalFetch(`${origin}/wp-json/wc/store/v1/products?per_page=60`, { headers: { accept: 'application/json' } });
		if (!response.ok || !response.headers.get('content-type')?.includes('json')) return [];
		const payload = JSON.parse(new TextDecoder().decode(await readLimited(response, 5_000_000)));
		if (!Array.isArray(payload)) return [];
		return payload.map((product: any, index: number): ScannedProduct => {
			const productImages = imageUrls([product.images], origin);
			return {
				externalId: compact(product.id || product.sku || index, 240),
				name: compact(product.name, 180),
				description: compact(cheerio.load(product.short_description || product.description || '').text(), 1600),
				priceText: compact(wooPrice(product.prices) || product.price_html, 60),
				currency: compact(product.prices?.currency_code, 12),
				productUrl: absoluteUrl(product.permalink, origin),
				imageUrl: productImages[0] || '',
				imageUrls: productImages,
				metadata: { sku: compact(product.sku, 120), categories: product.categories || [] },
			};
		});
	} catch { return []; }
}

async function scanTiendanube(origin: string) {
	try {
		// Tiendanube stores expose /productos.json (similar to Shopify)
		const response = await safeExternalFetch(`${origin}/productos.json?per_page=60`, { headers: { accept: 'application/json' } });
		if (!response.ok || !response.headers.get('content-type')?.includes('json')) return [];
		const payload = JSON.parse(new TextDecoder().decode(await readLimited(response, 4_000_000)));
		const items = Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : [];
		if (!items.length) return [];
		return items.map((product: any, index: number): ScannedProduct => {
			const variant = product.variants?.[0] || {};
			const priceRaw = variant.price || product.price || '';
			const productImages = imageUrls(
				[product.images, product.image].flat().filter(Boolean),
				origin,
			);
			const name = compact(
				(typeof product.name === 'object' ? Object.values(product.name)[0] : product.name) || '',
				180,
			);
			const description = compact(
				(typeof product.description === 'object'
					? Object.values(product.description)[0]
					: product.description) || '',
				1600,
			);
			return {
				externalId: compact(product.id || product.handle || index, 240),
				name: name || `Producto ${index + 1}`,
				description: cheerio.load(description || '').text(),
				priceText: compact(priceRaw, 60),
				currency: compact(product.currency || variant.currency || '', 12),
				productUrl: `${origin}/${product.canonical_url || product.handle || product.id}`,
				imageUrl: productImages[0] || '',
				imageUrls: productImages,
				metadata: { brand: compact(product.brand, 120), tags: product.tags || [] },
			};
		});
	} catch { return []; }
}

async function scanMercadoLibreItem(rawUrl: string): Promise<ScannedProduct | null> {
	try {
		// Extract item ID from ML URL patterns:
		// https://www.mercadolibre.com.ar/p/MLA123, https://articulo.mercadolibre.com.ar/MLA-123
		const mlMatch = rawUrl.match(/\b(ML[A-Z]-?\d+)\b/i);
		if (!mlMatch) return null;
		const itemId = mlMatch[1].replace('-', '');
		const apiUrl = `https://api.mercadolibre.com/items/${itemId}`;
		const response = await safeExternalFetch(apiUrl, { headers: { accept: 'application/json' } });
		if (!response.ok) return null;
		const item = JSON.parse(new TextDecoder().decode(await readLimited(response, 2_000_000)));
		if (!item?.title) return null;
		const pics = (item.pictures || []).map((p: any) => absoluteUrl(p.secure_url || p.url, apiUrl)).filter(Boolean);
		return {
			externalId: compact(item.id, 240),
			name: compact(item.title, 180),
			description: compact(item.subtitle || '', 1600),
			priceText: item.price ? String(item.price) : '',
			currency: compact(item.currency_id || '', 12),
			productUrl: item.permalink || rawUrl,
			imageUrl: pics[0] || '',
			imageUrls: pics.slice(0, 6),
			metadata: { condition: item.condition, categoryId: item.category_id, sellerId: item.seller_id },
		};
	} catch { return null; }
}

export async function scanWebsite(rawUrl: string): Promise<ScannedSource> {
	const url = normalizeExternalUrl(rawUrl);
	const response = await safeExternalFetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
	if (!response.ok) throw new Error(`El sitio respondió con estado ${response.status}.`);
	const contentType = (response.headers.get('content-type') || '').toLowerCase();
	if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
		throw new Error('La URL no apunta a una página web compatible.');
	}
	const html = new TextDecoder().decode(await readLimited(response, 4_000_000));
	const $ = cheerio.load(html);
	const canonical = absoluteUrl($('link[rel="canonical"]').attr('href') || response.url || url, url);
	const origin = new URL(canonical || url).origin;
	const products: ScannedProduct[] = [];

	$('script[type="application/ld+json"]').each((_index, element) => {
		try { walkJsonLd(JSON.parse($(element).text()), canonical || url, products); } catch { /* malformed merchant data */ }
	});

	const mlProduct = await scanMercadoLibreItem(url);
	if (mlProduct) products.push(mlProduct);

	const [shopify, woo, tiendanube] = await Promise.all([
		scanShopify(origin), scanWooCommerce(origin), scanTiendanube(origin),
	]);
	products.push(...shopify, ...woo, ...tiendanube);

	if (products.length < 6) {
		$('a[href]').each((index, element) => {
			if (products.length >= 60) return;
			const href = absoluteUrl($(element).attr('href'), canonical || url);
			const image = $(element).find('img').first();
			const name = compact(image.attr('alt') || $(element).find('[class*="title"],h2,h3').first().text(), 180);
			if (!name || !/\/(products?|tienda|shop)\//i.test(href)) return;
			const fallbackImages = imageUrls([
				image.attr('src'), image.attr('data-src'), image.attr('data-lazy-src'), image.attr('srcset')?.split(',').pop()?.trim().split(/\s+/)[0],
			], canonical || url);
			products.push({
				externalId: compact(href || `${name}-${index}`, 240), name, description: '', priceText: compact($(element).find('[class*="price"],.amount').first().text(), 60),
				currency: '', productUrl: href, imageUrl: fallbackImages[0] || '', imageUrls: fallbackImages, metadata: {},
			});
		});
	}

	// Product pages often expose their remaining gallery only in the DOM. Merge it
	// into the matching structured product so a URL import keeps useful angles.
	const pageGallery = imageUrls([
		$('meta[property="og:image"]').attr('content'),
		$('meta[name="twitter:image"]').attr('content'),
		...$('main img, [class*="product"] img, [class*="gallery"] img').toArray().flatMap((element) => {
			const image = $(element);
			return [image.attr('src'), image.attr('data-src'), image.attr('data-lazy-src')];
		}),
	], canonical || url);
	// Las tiendas hechas con Next/Nuxt casi no traen <img> en el HTML: las fotos
	// están dentro del JSON que hidrata la página. Sin esto, en Frávega el único
	// "producto" que se encontraba era el logo de la tienda publicado como
	// og:image, y la generación se cortaba por falta de foto.
	const embeddedGallery = imagesFromEmbeddedJson(html, canonical || url);
	const gallery = [...new Set([...pageGallery, ...embeddedGallery])];
	const currentProduct = products.find((product) => product.productUrl && samePageUrl(product.productUrl, canonical || url))
		|| (products.length === 1 ? products[0] : undefined);
	if (currentProduct && gallery.length) {
		currentProduct.imageUrls = [...new Set([...(currentProduct.imageUrls || []), ...gallery])].slice(0, PRODUCT_IMAGE_LIMIT);
		currentProduct.imageUrl = currentProduct.imageUrls[0] || currentProduct.imageUrl;
	}

	return {
		url: canonical || url,
		title: compact($('meta[property="og:site_name"]').attr('content') || $('title').text(), 180),
		description: compact($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'), 1200),
		imageUrl: absoluteUrl($('meta[property="og:image"]').attr('content'), canonical || url),
		colors: [compact($('meta[name="theme-color"]').attr('content'), 20)].filter(Boolean),
		products: dedupe(products),
		metadata: { generator: compact($('meta[name="generator"]').attr('content'), 100), productCount: dedupe(products).length },
	};
}

export async function scanInstagram(rawUrl: string): Promise<ScannedSource> {
	const url = normalizeExternalUrl(rawUrl, 'instagram');
	const response = await safeExternalFetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
	if (!response.ok) throw new Error(`Instagram respondió con estado ${response.status}.`);
	const html = new TextDecoder().decode(await readLimited(response, 3_000_000));
	const $ = cheerio.load(html);
	return {
		url,
		title: compact($('meta[property="og:title"]').attr('content') || $('title').text(), 180),
		description: compact($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'), 1200),
		imageUrl: absoluteUrl($('meta[property="og:image"]').attr('content'), url),
		colors: [], products: [], metadata: { publicMetadataAvailable: Boolean($('meta[property="og:title"]').attr('content')) },
	};
}

export async function analyzeCatalogWithAI(input: { sources: ScannedSource[]; products: ScannedProduct[]; apiKey?: string; endUserId?: string }) {
	const fallback = {
		brandSummary: compact(input.sources.map((source) => `${source.title}. ${source.description}`).join(' '), 1800),
		brandVoice: 'Claro, directo y coherente con el contenido público de la marca.',
		targetAudience: 'Personas interesadas en los productos y beneficios publicados por la marca.',
		productInsights: input.products.map((product) => ({ externalId: product.externalId, description: product.description, category: '', keywords: [] as string[] })),
	};
	if (!input.apiKey) return { ...fallback, mode: 'metadata' as const };

	try {
		const client = new OpenAI({ apiKey: input.apiKey });
		const catalogContent: any[] = [{ type: 'input_text', text: JSON.stringify({
			sources: input.sources.map(({ title, description, url, metadata }) => ({ title, description, url, metadata })),
			products: input.products.slice(0, 60).map(({ externalId, name, description, priceText, currency, metadata }) => ({ externalId, name, description, priceText, currency, metadata })),
		}) }];
		for (const product of input.products.filter((item) => item.imageUrl).slice(0, 8)) {
			catalogContent.push({ type: 'input_text', text: `Imagen pública del producto ${product.externalId}: ${product.name}` });
			catalogContent.push({ type: 'input_image', image_url: product.imageUrl, detail: 'low' });
		}
		const model = (typeof import.meta.env !== 'undefined' && import.meta.env.OPENAI_ANALYSIS_MODEL) || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini';
		const response = await client.responses.create({
			model,
			reasoning: { effort: 'none' },
			...(input.endUserId ? { safety_identifier: createHash('sha256').update(input.endUserId).digest('hex') } : {}),
			input: [
				{ role: 'system', content: 'Analizá información pública de una tienda para preparar anuncios honestos. No inventes atributos, precios, beneficios, audiencia ni claims. Respondé solamente con el esquema solicitado y en español.' },
				{ role: 'user', content: catalogContent },
			],
			text: { format: {
				type: 'json_schema', name: 'brand_catalog_analysis', strict: true,
				schema: {
					type: 'object', additionalProperties: false,
					properties: {
						brandSummary: { type: 'string' }, brandVoice: { type: 'string' }, targetAudience: { type: 'string' },
						productInsights: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
							externalId: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } },
						}, required: ['externalId', 'description', 'category', 'keywords'] } },
					}, required: ['brandSummary', 'brandVoice', 'targetAudience', 'productInsights'],
				},
			} },
			max_output_tokens: 8000,
		});
		return { ...JSON.parse(response.output_text), mode: 'ai' as const };
	} catch (error) {
		console.error('Error during analyzeCatalogWithAI, falling back to metadata:', error);
		return { ...fallback, mode: 'metadata' as const };
	}
}

/**
 * AI-first product extractor: fetches a product page, extracts all visible text and images,
 * and uses GPT-4o-mini (with vision) to understand and structure the product information.
 * Works with any e-commerce platform without relying on platform-specific APIs.
 */
/**
 * Analiza una URL y devuelve QUÉ es esa página además de qué hay en ella.
 *
 * Devolvía siempre un solo producto: con la home de una tienda inventaba un
 * "producto 1" que era el negocio entero, con todas las fotos mezcladas. Ahora
 * distingue ficha de producto, landing de servicio y catálogo, y en el catálogo
 * separa los productos que encuentra.
 */
export async function extractProductPageWithAI(rawUrl: string, apiKey: string): Promise<ScannedPage> {
	const url = normalizeExternalUrl(rawUrl);

	// 1. Fetch the page HTML.
	// Shopify y Cloudflare tiran 429 con facilidad (y castigan más a los
	// user-agents de bot), así que se reintenta respetando Retry-After. Sin esto
	// un 429 pasajero hacía fracasar todo el lote.
	let response: Response | null = null;
	let lastStatus = 0;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		response = await safeExternalFetch(url, {
			headers: {
				accept: 'text/html,application/xhtml+xml',
				'accept-language': 'es-AR,es;q=0.9,en;q=0.8',
				'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
			},
		});
		if (response.ok) break;
		lastStatus = response.status;
		const retryable = response.status === 429 || response.status >= 500;
		if (!retryable || attempt === 2) break;
		const retryAfter = Number(response.headers.get('retry-after'));
		const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
			? Math.min(retryAfter * 1000, 8000)
			: 1200 * (attempt + 1);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
	if (!response || !response.ok) {
		if (lastStatus === 429) {
			throw new Error('El sitio del producto está limitando las consultas (429). Esperá un minuto y volvé a intentar.');
		}
		throw new Error(`El sitio respondió con estado ${lastStatus || response?.status || 0}.`);
	}
	const contentType = (response.headers.get('content-type') || '').toLowerCase();
	if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
		throw new Error('La URL no apunta a una página web compatible.');
	}

	const html = new TextDecoder().decode(await readLimited(response, 4_000_000));
	const $ = cheerio.load(html);
	const canonical = absoluteUrl($('link[rel="canonical"]').attr('href') || response.url || url, url);
	const base = canonical || url;

	// 2. Extract meta info
	const pageTitle = compact(
		$('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text(),
		200,
	);
	const pageDesc = compact(
		$('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
		1000,
	);

	// 3. Collect product images. Structured data and an explicit product gallery
	// are trusted first; broad page selectors are deliberately filtered so
	// recommendation cards do not become part of the main product gallery.
	const productImages: string[] = [];
	const galleryImages: string[] = [];
	const addImage = (src: unknown) => {
		const abs = absoluteUrl(src, base);
		if (abs && !productImages.includes(abs) && !/\/(icon|logo|sprite|avatar|favicon|pixel|tracking)/i.test(abs)) {
			productImages.push(abs);
		}
	};
	const relatedContainer = /(related|recommend|upsell|cross[-_ ]?sell|similar|you[-_ ]?may|also[-_ ]?bought|collection|product[-_ ]?(grid|card|recommendation))/i;
	const isLikelyRelatedImage = (element: any) => $(element).parents().addBack().toArray().some((node: any) => {
		const id = node?.attribs?.id || '';
		const className = node?.attribs?.class || '';
		return relatedContainer.test(`${id} ${className}`);
	});
	const bestImageSource = (element: any) => {
		const image = $(element);
		const srcset = image.attr('data-srcset') || image.attr('srcset') || '';
		const candidates = srcset
			.split(',')
			.map((part: string) => part.trim().split(/\s+/)[0])
			.filter(Boolean);
		return candidates[candidates.length - 1]
			|| image.attr('data-src')
			|| image.attr('data-lazy-src')
			|| image.attr('data-original')
			|| image.attr('src')
			|| '';
	};
	const addGalleryImage = (element: any) => {
		if (isLikelyRelatedImage(element)) return;
		const src = bestImageSource(element);
		const abs = absoluteUrl(src, base);
		if (abs && !galleryImages.includes(abs) && looksLikeProductPhoto(abs)) galleryImages.push(upgradeImageSize(abs));
	};
	addImage($('meta[property="og:image"]').attr('content'));
	addImage($('meta[name="twitter:image"]').attr('content'));
	// Check JSON-LD only for the product represented by this URL. Product pages
	// often publish the main product plus every recommendation as Product nodes;
	// walking all of them is what previously mixed related products into the
	// selected product gallery.
	const structuredProducts: any[] = [];
	$('script[type="application/ld+json"]').each((_i, el) => {
		try {
			const data = JSON.parse($(el).text());
			const collectProducts = (node: any) => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) { node.forEach(collectProducts); return; }
				const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
				if (types.some((type: unknown) => String(type).toLowerCase() === 'product')) structuredProducts.push(node);
				Object.values(node).forEach(collectProducts);
			};
			collectProducts(data);
		} catch { /* malformed */ }
	});
	const normalizedPageTitle = pageTitle.toLowerCase();
	const currentStructuredProduct = structuredProducts.find((product) => {
		const productUrl = absoluteUrl(product.url || product['@id'] || product.offers?.url, base);
		const productName = compact(product.name, 180).toLowerCase();
		return (productUrl && samePageUrl(productUrl, base))
			|| (productName && (normalizedPageTitle.includes(productName) || productName.includes(normalizedPageTitle)));
	}) || structuredProducts[0];
	if (currentStructuredProduct) imageUrls([currentStructuredProduct.image], base, PRODUCT_IMAGE_LIMIT).forEach(addImage);
	// Explicit gallery/media selectors are much more reliable than every image
	// inside <main>, which often also contains “productos relacionados”.
	('.product-images-slider img, .product-images-thumbs img, [class*="product-images"] img, [data-product-media] img, [data-gallery] img, [class*="product-gallery"] img, [class*="product__media"] img, [class*="product-media"] img, [class*="product-detail"] img, main [class*="gallery"] img, main [class*="swiper"] img, main [class*="slider"] img, [id*="product-gallery"] img').split(',').forEach((selector) => {
		$(selector.trim()).each((_i, el) => addGalleryImage(el));
	});
	// Fallback for shops without named gallery containers: still exclude the
	// recommendation/card regions before accepting page images.
	if (galleryImages.length < 2) {
		$('main img, [class*="product"] img, [class*="gallery"] img, [class*="swiper"] img, [class*="slider"] img, [id*="product"] img').each((_i, el) => addGalleryImage(el));
	}
	// Deduplicate and limit to a compact, useful gallery.
	// Último recurso: las tiendas SPA (Next/Nuxt) no publican las fotos en el HTML
	// sino dentro del JSON que hidrata la página. Sin esto, en Frávega no se
	// encontraba ninguna foto y la generación se cortaba antes de empezar.
	const finalImages = [...new Set([
		...productImages,
		...galleryImages,
		...(productImages.length || galleryImages.length ? [] : imagesFromEmbeddedJson(html, base, 6)),
	])].slice(0, PRODUCT_IMAGE_LIMIT);

	// Videos suelen vivir como <video><source>, en reproductores embebidos o en
	// JSON de hidrataciÃ³n. No se mandan al modelo como referencia visual, pero sÃ­
	// se conservan para que el usuario pueda revisarlos antes de generar.
	const productVideos: string[] = [];
	const addVideo = (src: unknown) => {
		const abs = absoluteUrl(src, base);
		if (abs && !productVideos.includes(abs)) productVideos.push(abs);
	};
	$('main video, main video source, [class*="product"] video, [class*="product"] video source, [class*="gallery"] video, [class*="gallery"] video source, [class*="swiper"] video source, [class*="slider"] video source').each((_i, el) => {
		addVideo($(el).attr('src') || $(el).attr('data-src'));
	});
	if (!productVideos.length) $('video source, video').each((_i, el) => addVideo($(el).attr('src') || $(el).attr('data-src')));
	productVideos.push(...videosFromEmbeddedJson(html));
	const finalVideos = [...new Set(productVideos.map((src) => absoluteUrl(src, base)).filter(Boolean))].slice(0, 12);

	// 4. Extract clean text content (remove chrome, keep product content)
	$('script, style, noscript, nav, footer, header, aside, [class*="breadcrumb"], [class*="cookie"], [class*="popup"], [class*="modal"], [class*="cart"], [class*="related"], [class*="recommend"]').remove();
	const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 7000);

	// 5. Build AI prompt with page text
	const groqApiKey = (typeof import.meta.env !== 'undefined' && import.meta.env.GROQ_API_KEY) || process.env.GROQ_API_KEY;

	let extracted: any = {};
	try {
		if (groqApiKey) {
			const client = new OpenAI({
				apiKey: groqApiKey,
				baseURL: 'https://api.groq.com/openai/v1',
			});
			const aiResponse = await client.chat.completions.create({
				model: 'llama-3.3-70b-versatile',
				messages: [
					{
						role: 'user',
						content: `Analizá esta página de producto y extraé la información del ítem que se vende. Usá únicamente lo que está en el contenido de la página, no inventes nada.

URL: ${base}
Título: ${pageTitle}
Meta descripción: ${pageDesc}

Texto completo de la página:
---
${bodyText}
---

Respondé SOLO con JSON válido con esta estructura exacta:
{
  "name": "nombre exacto del producto tal como aparece en la página",
  "description": "descripción detallada con todos los detalles relevantes: beneficios, características, materiales, ingredientes, especificaciones técnicas, etc. Incluí todo lo que pueda ayudar a hacer un anuncio efectivo.",
  "price": "precio exacto con símbolo de moneda tal como aparece (ej: $15.990 o USD 29.99) o null si no aparece",
  "currency": "código de moneda (ARS, USD, EUR, etc.) o null",
  "brand": "marca o nombre de la empresa vendedora",
  "category": "categoría del producto (ej: skincare, calzado, suplementos, etc.)",
  "keyBenefits": ["beneficio 1", "beneficio 2", "beneficio 3"],
  "targetAudience": "descripción del público objetivo del producto",
  "orientationDetails": "si tiene frente, dorso o laterales: qué estampas, bordados, etiquetas o detalles pertenecen a cada lado; usá la ficha técnica y las fotos, o null si no está verificado",
  "pageType": "\"product\" si la página es la ficha de UN producto concreto; \"service\" si ofrece un servicio, software, SaaS, curso, suscripción o consultoría; \"catalog\" si es la home de la tienda, una categoría o un listado donde se muestran VARIOS productos distintos y ninguno es el protagonista.",
  "pageTypeEvidence": "en una frase, qué te hizo decidir ese pageType (ej: 'tiene botón de agregar al carrito y peso de envío', 'ofrece planes mensuales de software', 'es una grilla con 20 productos y ningún precio principal')",
  "storeName": "nombre del negocio o la tienda dueña de la página",
  "storeDescription": "qué vende el negocio en general, en una o dos frases. Importante cuando pageType es catalog, porque el anuncio va a hablar de la tienda y no de un producto.",
  "catalogProducts": "SOLO si pageType es catalog: array de hasta 8 objetos {name, description, priceText} con los productos DISTINTOS que se ven en la página. Si no es catalog, array vacío []."
}`,
					}
				],
				response_format: { type: 'json_object' },
				max_tokens: 1000,
			});
			extracted = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
		} else {
			const client = new OpenAI({ apiKey });
			const messages: any[] = [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `Analizá esta página de producto y extraé la información del ítem que se vende. Usá únicamente lo que está en el contenido de la página, no inventes nada.

URL: ${base}
Título: ${pageTitle}
Meta descripción: ${pageDesc}

Texto completo de la página:
---
${bodyText}
---

Respondé SOLO con JSON válido con esta estructura exacta:
{
  "name": "nombre exacto del producto tal como aparece en la página",
  "description": "descripción detallada con todos los detalles relevantes: beneficios, características, materiales, ingredientes, especificaciones técnicas, etc. Incluí todo lo que pueda ayudar a hacer un anuncio efectivo.",
  "price": "precio exacto con símbolo de moneda tal como aparece (ej: $15.990 o USD 29.99) o null si no aparece",
  "currency": "código de moneda (ARS, USD, EUR, etc.) o null",
  "brand": "marca o nombre de la empresa vendedora",
  "category": "categoría del producto (ej: skincare, calzado, suplementos, etc.)",
  "keyBenefits": ["beneficio 1", "beneficio 2", "beneficio 3"],
  "targetAudience": "descripción del público objetivo del producto",
  "orientationDetails": "si tiene frente, dorso o laterales: qué estampas, bordados, etiquetas o detalles pertenecen a cada lado; usá la ficha técnica y las fotos, o null si no está verificado",
  "pageType": "\"product\" si la página es la ficha de UN producto concreto; \"service\" si ofrece un servicio, software, SaaS, curso, suscripción o consultoría; \"catalog\" si es la home de la tienda, una categoría o un listado donde se muestran VARIOS productos distintos y ninguno es el protagonista.",
  "pageTypeEvidence": "en una frase, qué te hizo decidir ese pageType (ej: 'tiene botón de agregar al carrito y peso de envío', 'ofrece planes mensuales de software', 'es una grilla con 20 productos y ningún precio principal')",
  "storeName": "nombre del negocio o la tienda dueña de la página",
  "storeDescription": "qué vende el negocio en general, en una o dos frases. Importante cuando pageType es catalog, porque el anuncio va a hablar de la tienda y no de un producto.",
  "catalogProducts": "SOLO si pageType es catalog: array de hasta 8 objetos {name, description, priceText} con los productos DISTINTOS que se ven en la página. Si no es catalog, array vacío []."
}`,
						},
						// Attach main image for visual context if available
						...(finalImages[0]
							? [{ type: 'image_url', image_url: { url: finalImages[0], detail: 'low' as const } }]
							: []),
						// Attach a couple more product images if available
						...(finalImages[1]
							? [{ type: 'image_url', image_url: { url: finalImages[1], detail: 'low' as const } }]
							: []),
					],
				},
			];
			const aiResponse = await client.chat.completions.create({
				model: 'gpt-4o-mini',
				messages,
				response_format: { type: 'json_object' },
				max_tokens: 1000,
			});
			extracted = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
		}
	} catch (err) {
		// If AI fails, fall back to meta info so we always return something
		console.error('extractProductPageWithAI: AI step failed, using meta fallback:', err);
	}

	const name = compact(extracted.name || pageTitle || new URL(url).hostname, 180);
	const description = compact(
		[
			extracted.description,
			extracted.keyBenefits?.length ? `Beneficios: ${extracted.keyBenefits.join(' · ')}` : '',
			extracted.targetAudience ? `Para: ${extracted.targetAudience}` : '',
			extracted.orientationDetails ? `Orientación del producto: ${extracted.orientationDetails}` : '',
		].filter(Boolean).join('\n\n'),
		1600,
	);

	const pageType: PageType = extracted.pageType === 'catalog' ? 'catalog'
		: extracted.pageType === 'service' ? 'service'
		: 'product';
	const store = {
		name: compact(extracted.storeName || extracted.brand || new URL(url).hostname.replace(/^www\./, ''), 120),
		description: compact(extracted.storeDescription || '', 600),
		evidence: compact(extracted.pageTypeEvidence || '', 200),
	};

	const baseMetadata = {
		brand: compact(extracted.brand || '', 120),
		category: compact(extracted.category || '', 100),
		pageType,
		offeringType: pageType === 'service' ? 'service' : 'product',
		offeringEvidence: store.evidence,
		store,
		aiExtracted: true,
		sourceUrl: url,
	};

	const mainProduct: ScannedProduct = {
		externalId: base,
		name,
		description,
		priceText: compact(extracted.price || '', 60),
		currency: compact(extracted.currency || '', 12),
		offeringType: pageType === 'service' ? 'service' : 'product',
		productUrl: base,
		imageUrl: finalImages[0] || '',
		imageUrls: finalImages,
		videoUrls: finalVideos,
		metadata: baseMetadata,
	};

	// En una página de catálogo no hay UN producto: se devuelve uno por cada
	// producto distinto que la IA reconoció, repartiendo las fotos encontradas.
	// Antes todo esto entraba como un único "producto 1" con las fotos mezcladas.
	const catalogItems: any[] = Array.isArray(extracted.catalogProducts) ? extracted.catalogProducts.slice(0, 8) : [];
	if (pageType === 'catalog' && catalogItems.length) {
		const products = catalogItems
			.map((item, index): ScannedProduct | null => {
				const itemName = compact(item?.name || '', 180);
				if (!itemName) return null;
				return {
					externalId: `${base}#${index + 1}`,
					name: itemName,
					description: compact(item?.description || '', 1200),
					priceText: compact(item?.priceText || '', 60),
					currency: compact(extracted.currency || '', 12),
					offeringType: 'product' as const,
					productUrl: base,
					// Una foto por producto cuando alcanzan; si no, la principal.
					imageUrl: finalImages[index] || finalImages[0] || '',
					imageUrls: finalImages[index] ? [finalImages[index]] : finalImages.slice(0, 1),
					videoUrls: [],
					metadata: { ...baseMetadata, catalogIndex: index + 1, fromCatalog: true },
				};
			})
			.filter((item): item is ScannedProduct => Boolean(item));
		if (products.length) return { pageType, products, store, sourceUrl: url };
	}

	return { pageType, products: [mainProduct], store, sourceUrl: url };
}
