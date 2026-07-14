import * as cheerio from 'cheerio';
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

function productFromJsonLd(value: Record<string, any>, base: string, index: number): ScannedProduct | null {
	const type = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
	if (!type.some((item: unknown) => String(item).toLowerCase() === 'product')) return null;
	const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers || {};
	const imageValue = Array.isArray(value.image) ? value.image[0] : value.image?.url || value.image;
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
		imageUrl: absoluteUrl(imageValue, base),
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
			return {
				externalId: compact(product.id || product.handle || index, 240),
				name: compact(product.title, 180),
				description: compact(cheerio.load(product.body_html || '').text(), 1600),
				priceText: compact(variant.price, 60),
				currency: '',
				productUrl: `${origin}/products/${product.handle}`,
				imageUrl: absoluteUrl(product.image?.src || product.images?.[0]?.src, origin),
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
		return payload.map((product: any, index: number): ScannedProduct => ({
			externalId: compact(product.id || product.sku || index, 240),
			name: compact(product.name, 180),
			description: compact(cheerio.load(product.short_description || product.description || '').text(), 1600),
			priceText: compact(wooPrice(product.prices) || product.price_html, 60),
			currency: compact(product.prices?.currency_code, 12),
			productUrl: absoluteUrl(product.permalink, origin),
			imageUrl: absoluteUrl(product.images?.[0]?.src, origin),
			metadata: { sku: compact(product.sku, 120), categories: product.categories || [] },
		}));
	} catch { return []; }
}

export async function scanWebsite(rawUrl: string): Promise<ScannedSource> {
	const url = normalizeExternalUrl(rawUrl);
	const response = await safeExternalFetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
	if (!response.ok) throw new Error(`El sitio respondió con estado ${response.status}.`);
	const html = new TextDecoder().decode(await readLimited(response, 4_000_000));
	const $ = cheerio.load(html);
	const canonical = absoluteUrl($('link[rel="canonical"]').attr('href') || response.url || url, url);
	const origin = new URL(canonical || url).origin;
	const products: ScannedProduct[] = [];

	$('script[type="application/ld+json"]').each((_index, element) => {
		try { walkJsonLd(JSON.parse($(element).text()), canonical || url, products); } catch { /* malformed merchant data */ }
	});

	const [shopify, woo] = await Promise.all([scanShopify(origin), scanWooCommerce(origin)]);
	products.push(...shopify, ...woo);

	if (products.length < 6) {
		$('a[href]').each((index, element) => {
			if (products.length >= 60) return;
			const href = absoluteUrl($(element).attr('href'), canonical || url);
			const image = $(element).find('img').first();
			const name = compact(image.attr('alt') || $(element).find('[class*="title"],h2,h3').first().text(), 180);
			if (!name || !/\/(products?|tienda|shop)\//i.test(href)) return;
			products.push({
				externalId: compact(href || `${name}-${index}`, 240), name, description: '', priceText: compact($(element).find('[class*="price"],.amount').first().text(), 60),
				currency: '', productUrl: href, imageUrl: absoluteUrl(image.attr('src') || image.attr('data-src'), canonical || url), metadata: {},
			});
		});
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

export async function analyzeCatalogWithAI(input: { sources: ScannedSource[]; products: ScannedProduct[]; apiKey?: string }) {
	const fallback = {
		brandSummary: compact(input.sources.map((source) => `${source.title}. ${source.description}`).join(' '), 1800),
		brandVoice: 'Claro, directo y coherente con el contenido público de la marca.',
		targetAudience: 'Personas interesadas en los productos y beneficios publicados por la marca.',
		productInsights: input.products.map((product) => ({ externalId: product.externalId, description: product.description, category: '', keywords: [] as string[] })),
	};
	if (!input.apiKey) return { ...fallback, mode: 'metadata' as const };

	const client = new OpenAI({ apiKey: input.apiKey });
	const catalogContent: any[] = [{ type: 'input_text', text: JSON.stringify({
		sources: input.sources.map(({ title, description, url, metadata }) => ({ title, description, url, metadata })),
		products: input.products.slice(0, 60).map(({ externalId, name, description, priceText, currency, metadata }) => ({ externalId, name, description, priceText, currency, metadata })),
	}) }];
	for (const product of input.products.filter((item) => item.imageUrl).slice(0, 8)) {
		catalogContent.push({ type: 'input_text', text: `Imagen pública del producto ${product.externalId}: ${product.name}` });
		catalogContent.push({ type: 'input_image', image_url: product.imageUrl, detail: 'low' });
	}
	const response = await client.responses.create({
		model: import.meta.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4-mini',
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
	try { return { ...JSON.parse(response.output_text), mode: 'ai' as const }; } catch { return { ...fallback, mode: 'metadata' as const }; }
}
