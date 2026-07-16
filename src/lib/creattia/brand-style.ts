import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { normalizeExternalUrl, readLimited, safeExternalFetch } from './safe-fetch';

export type BrandStyle = {
	colors: string[];
	typography: { headings: string; body: string };
	logoUrl: string;
	styleSummary: string;
	brandPersonality: string;
	pagesScanned: string[];
	analyzedAt: string;
};

const INTERNAL_PAGE_PATTERNS = /(about|nosotros|sobre|quienes|historia|story|contact|contacto|servicios|services|faq|preguntas)/i;
const GENERIC_FONTS = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'inherit', 'initial', 'unset', 'cursive', 'fantasy', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'helvetica neue', 'roboto', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'times new roman', 'georgia', 'var'])

function compact(value: unknown, max = 1500) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function absoluteUrl(value: unknown, base: string) {
	try { return value ? new URL(String(value), base).toString() : ''; } catch { return ''; }
}

async function fetchHtml(url: string, maxBytes = 3_000_000) {
	const response = await safeExternalFetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
	if (!response.ok) throw new Error(`status ${response.status}`);
	return new TextDecoder().decode(await readLimited(response, maxBytes));
}

function extractColorsFromCss(css: string) {
	const counts = new Map<string, number>();
	for (const match of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
		let hex = match[1].toLowerCase();
		if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
		// Descartar casi-blancos y casi-negros: son fondo/texto, no identidad.
		const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
		const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
		if (luminance > 0.93 || luminance < 0.05) continue;
		counts.set(`#${hex}`, (counts.get(`#${hex}`) || 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex]) => hex);
}

function extractFontsFromCss(css: string) {
	const fonts = new Map<string, number>();
	for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
		const first = match[1].split(',')[0].replace(/["']/g, '').trim().toLowerCase();
		if (!first || first.startsWith('var(') || GENERIC_FONTS.has(first)) continue;
		fonts.set(first, (fonts.get(first) || 0) + 1);
	}
	return [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
}

function extractGoogleFonts($: cheerio.CheerioAPI) {
	const families: string[] = [];
	$('link[href*="fonts.googleapis.com"]').each((_i, el) => {
		const href = String($(el).attr('href') || '');
		for (const match of href.matchAll(/family=([^&:@"']+)/gi)) {
			families.push(decodeURIComponent(match[1]).replace(/\+/g, ' ').trim());
		}
	});
	return [...new Set(families)].slice(0, 4);
}

function findLogoUrl($: cheerio.CheerioAPI, base: string) {
	const candidates = [
		$('img[class*="logo" i]').attr('src'),
		$('a[class*="logo" i] img').attr('src'),
		$('[class*="brand" i] img').first().attr('src'),
		$('header img').first().attr('src'),
		$('img[alt*="logo" i]').attr('src'),
		$('meta[property="og:logo"]').attr('content'),
		$('link[rel="apple-touch-icon"]').attr('href'),
		$('link[rel="icon"]').attr('href'),
	];
	for (const candidate of candidates) {
		const url = absoluteUrl(candidate, base);
		if (url) return url;
	}
	return '';
}

// Junta señales crudas del sitio: home + hasta 3 páginas internas + CSS.
async function collectBrandSignals(websiteUrl: string) {
	const url = normalizeExternalUrl(websiteUrl);
	const html = await fetchHtml(url);
	const $ = cheerio.load(html);
	const origin = new URL(url).origin;

	// Páginas internas relevantes (nosotros, contacto, servicios...)
	const internalLinks = new Map<string, string>();
	$('a[href]').each((_i, el) => {
		const href = absoluteUrl($(el).attr('href'), url);
		if (!href || !href.startsWith(origin)) return;
		const path = new URL(href).pathname;
		if (INTERNAL_PAGE_PATTERNS.test(path) && !internalLinks.has(path)) internalLinks.set(path, href.split('#')[0]);
	});
	const extraPages = [...internalLinks.values()].slice(0, 3);

	// CSS: <style> inline + hasta 2 hojas externas
	let cssText = $('style').toArray().map((el) => $(el).text()).join('\n');
	const sheetUrls = $('link[rel="stylesheet"][href]').toArray()
		.map((el) => absoluteUrl($(el).attr('href'), url)).filter(Boolean).slice(0, 2);
	for (const sheetUrl of sheetUrls) {
		try {
			const response = await safeExternalFetch(sheetUrl, { headers: { accept: 'text/css,*/*' } });
			if (response.ok) cssText += '\n' + new TextDecoder().decode(await readLimited(response, 400_000));
		} catch { /* hoja inaccesible, seguimos con lo que hay */ }
	}

	const pages: Array<{ url: string; title: string; text: string }> = [{
		url,
		title: compact($('title').text(), 180),
		text: compact($('main').text() || $('body').text(), 1500),
	}];
	for (const pageUrl of extraPages) {
		try {
			const pageHtml = await fetchHtml(pageUrl, 2_000_000);
			const $page = cheerio.load(pageHtml);
			pages.push({
				url: pageUrl,
				title: compact($page('title').text() || $page('h1').first().text(), 180),
				text: compact($page('main').text() || $page('body').text(), 1500),
			});
		} catch { /* página caída, no bloquea */ }
	}

	return {
		origin,
		siteName: compact($('meta[property="og:site_name"]').attr('content') || $('title').text(), 180),
		description: compact($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'), 800),
		themeColor: compact($('meta[name="theme-color"]').attr('content'), 20),
		logoUrl: findLogoUrl($, url),
		cssColors: extractColorsFromCss(cssText),
		cssFonts: extractFontsFromCss(cssText),
		googleFonts: extractGoogleFonts($),
		pages,
	};
}

// Sintetiza las señales con el modelo de análisis. Sin API key devuelve
// lo extraído en crudo, que ya es útil para el prompt de generación.
export async function analyzeBrandStyle(websiteUrl: string, apiKey?: string): Promise<BrandStyle> {
	const signals = await collectBrandSignals(websiteUrl);
	const fallback: BrandStyle = {
		colors: [...new Set([signals.themeColor, ...signals.cssColors].filter(Boolean))].slice(0, 5),
		typography: {
			headings: signals.googleFonts[0] || signals.cssFonts[0] || '',
			body: signals.googleFonts[1] || signals.cssFonts[1] || signals.cssFonts[0] || '',
		},
		logoUrl: signals.logoUrl,
		styleSummary: compact(signals.description, 400),
		brandPersonality: '',
		pagesScanned: signals.pages.map((page) => page.url),
		analyzedAt: new Date().toISOString(),
	};
	if (!apiKey) return fallback;

	try {
		const client = new OpenAI({ apiKey });
		const model = (typeof import.meta.env !== 'undefined' && import.meta.env.OPENAI_ANALYSIS_MODEL) || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
		const content: any[] = [
			{ type: 'text', text: `Signals scraped from the brand's website (home + internal pages):\n${JSON.stringify({
				siteName: signals.siteName, description: signals.description, themeColor: signals.themeColor,
				cssColors: signals.cssColors, cssFonts: signals.cssFonts, googleFonts: signals.googleFonts,
				pages: signals.pages,
			})}` },
		];
		if (signals.logoUrl) content.push({ type: 'text', text: 'Brand logo:' }, { type: 'image_url', image_url: { url: signals.logoUrl } });

		const response = await client.chat.completions.create({
			model,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content: `You are a brand designer. From the scraped signals of a real brand website, produce STRICT JSON:
{
  "colors": ["#hex primary first, max 5 — real brand identity colors only, not framework defaults"],
  "typography": { "headings": "font family used for headings", "body": "font family used for body text" },
  "styleSummary": "2-3 sentences describing the brand's visual aesthetic (minimal/bold/premium/playful, photography style, layout feel) in Spanish",
  "brandPersonality": "1-2 sentences on tone and personality in Spanish",
  "language": "en|es — main language of the site content"
}
Use ONLY the provided signals. If unsure about a color/font, omit it rather than invent it.`,
				},
				{ role: 'user', content },
			],
		});
		const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
		return {
			colors: Array.isArray(parsed.colors) && parsed.colors.length ? parsed.colors.slice(0, 5) : fallback.colors,
			typography: {
				headings: compact(parsed.typography?.headings, 80) || fallback.typography.headings,
				body: compact(parsed.typography?.body, 80) || fallback.typography.body,
			},
			logoUrl: signals.logoUrl,
			styleSummary: compact(parsed.styleSummary, 600) || fallback.styleSummary,
			brandPersonality: compact(parsed.brandPersonality, 400),
			pagesScanned: signals.pages.map((page) => page.url),
			analyzedAt: new Date().toISOString(),
		};
	} catch (error) {
		console.error('Brand style AI synthesis failed, using raw signals:', error);
		return fallback;
	}
}

// Persiste el estilo en el perfil: brand_style siempre; colores y logo
// solo si el usuario no los cargó ya (no pisar datos manuales).
export async function persistBrandStyle(admin: any, userId: string, style: BrandStyle) {
	const { data: profile } = await admin.from('creative_profiles')
		.select('brand_colors,logo_path').eq('user_id', userId).maybeSingle();

	const update: Record<string, unknown> = {
		brand_style: style,
		updated_at: new Date().toISOString(),
	};
	if (style.colors.length && !(Array.isArray(profile?.brand_colors) && profile.brand_colors.length)) {
		update.brand_colors = style.colors;
	}

	if (style.logoUrl && !profile?.logo_path) {
		try {
			const response = await safeExternalFetch(style.logoUrl, { headers: { accept: 'image/*' } });
			if (response.ok) {
				const bytes = await readLimited(response, 2_000_000);
				if (bytes.length) {
					// Normalizar SIEMPRE a PNG: la API de imágenes de OpenAI rechaza
					// WebP extendido, SVG, ICO, etc. Si sharp no puede decodificarlo,
					// se omite el logo y el estilo sigue siendo válido.
					const sharp = (await import('sharp')).default;
					const png = await sharp(Buffer.from(bytes)).png().toBuffer();
					const path = `${userId}/brand/logo.png`;
					const { error: uploadError } = await admin.storage.from('creative-assets')
						.upload(path, png, { contentType: 'image/png', upsert: true });
					if (!uploadError) update.logo_path = path;
				}
			}
		} catch { /* logo inaccesible o ilegible: el estilo sigue siendo válido */ }
	}

	await admin.from('creative_profiles').upsert({ user_id: userId, ...update }, { onConflict: 'user_id' });
}
