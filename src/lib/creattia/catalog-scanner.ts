import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { normalizeExternalUrl, readLimited, safeExternalFetch } from './safe-fetch';

export type ScannedProduct = {
	externalId: string;
	name: string;
	description: string;
	priceText: string;
	currency: string;
	productUrl: string;
	imageUrl: string;
	imageUrls: string[];
	metadata: Record<string, unknown>;
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

function compact(value: unknown, max = 1500) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function absoluteUrl(value: unknown, base: string) {
	try { return value ? new URL(String(value), base).toString() : ''; } catch { return ''; }
}

function imageUrls(values: unknown[], base: string, limit = 6) {
	const urls = values.flatMap((value) => {
		if (Array.isArray(value)) return value;
		if (value && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			return [record.url, record.contentUrl, record.src];
		}
		return [value];
	}).map((value) => absoluteUrl(value, base)).filter(Boolean);
	return [...new Set(urls)].slice(0, limit);
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
	const currentProduct = products.find((product) => product.productUrl && samePageUrl(product.productUrl, canonical || url))
		|| (products.length === 1 ? products[0] : undefined);
	if (currentProduct && pageGallery.length) {
		currentProduct.imageUrls = [...new Set([...(currentProduct.imageUrls || []), ...pageGallery])].slice(0, 6);
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
export async function extractProductPageWithAI(rawUrl: string, apiKey: string): Promise<ScannedProduct> {
	const url = normalizeExternalUrl(rawUrl);

	// 1. Fetch the page HTML
	const response = await safeExternalFetch(url, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent': 'Mozilla/5.0 (compatible; CreattiaBot/1.0)',
		},
	});
	if (!response.ok) throw new Error(`El sitio respondió con estado ${response.status}.`);
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

	// 3. Collect product images (OG first, then DOM images in product sections)
	const productImages: string[] = [];
	const addImage = (src: unknown) => {
		const abs = absoluteUrl(src, base);
		if (abs && !productImages.includes(abs) && !/\/(icon|logo|sprite|avatar|favicon|pixel|tracking)/i.test(abs)) {
			productImages.push(abs);
		}
	};
	addImage($('meta[property="og:image"]').attr('content'));
	addImage($('meta[name="twitter:image"]').attr('content'));
	// Check JSON-LD for product images
	$('script[type="application/ld+json"]').each((_i, el) => {
		try {
			const data = JSON.parse($(el).text());
			const walk = (node: any) => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) { node.forEach(walk); return; }
				if (node['@type'] && String(node['@type']).toLowerCase() === 'product') {
					const imgs = imageUrls([node.image], base, 6);
					imgs.forEach(addImage);
				}
				Object.values(node).forEach(walk);
			};
			walk(data);
		} catch { /* malformed */ }
	});
	// DOM images in likely product containers
	$('main img, [class*="product"] img, [class*="gallery"] img, [class*="swiper"] img, [class*="slider"] img, [id*="product"] img').each((_i, el) => {
		addImage($(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original'));
	});
	// Deduplicate and limit
	const finalImages = [...new Set(productImages)].slice(0, 8);

	// 4. Extract clean text content (remove chrome, keep product content)
	$('script, style, noscript, nav, footer, header, aside, [class*="breadcrumb"], [class*="cookie"], [class*="popup"], [class*="modal"], [class*="cart"], [class*="related"], [class*="recommend"]').remove();
	const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 7000);

	// 5. Build AI prompt with page text + top images
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
  "targetAudience": "descripción del público objetivo del producto"
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

	let extracted: any = {};
	try {
		const aiResponse = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			messages,
			response_format: { type: 'json_object' },
			max_tokens: 1000,
		});
		extracted = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
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
		].filter(Boolean).join('\n\n'),
		1600,
	);

	return {
		externalId: base,
		name,
		description,
		priceText: compact(extracted.price || '', 60),
		currency: compact(extracted.currency || '', 12),
		productUrl: base,
		imageUrl: finalImages[0] || '',
		imageUrls: finalImages,
		metadata: {
			brand: compact(extracted.brand || '', 120),
			category: compact(extracted.category || '', 100),
			aiExtracted: true,
			sourceUrl: url,
		},
	};
}

