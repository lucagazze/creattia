import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { normalizeExternalUrl, readLimited, safeExternalFetch } from './safe-fetch';
import { errorDeEstado } from './errores-de-escaneo';

export type BrandStyle = {
	colors: string[];
	palette?: BrandPalette;
	typography: { headings: string; body: string };
	logoUrl: string;
	styleSummary: string;
	brandPersonality: string;
	brandVoice?: string;
	buttonStyle?: string;
	pagesScanned: string[];
	analyzedAt: string;
};

export type BrandPalette = {
	background: string;
	text: string;
	accent: string;
	secondary?: string;
	source?: 'scraped' | 'ai' | 'fallback';
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
	// El techo de este escaneo es más corto que el de un producto suelto: se leen
	// la home, dos hojas de estilo y hasta tres páginas internas, todo en serie, y
	// el endpoint que lo llama se corta a los 120 s. Con el techo por defecto una
	// sola tienda pesada agotaba la función entera.
	const response = await safeExternalFetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } }, 10_000, 16_000);
	if (!response.ok) throw errorDeEstado(response.status, url);
	return new TextDecoder().decode(await readLimited(response, maxBytes));
}

function extractColorsFromCss(css: string) {
	const counts = new Map<string, number>();
	const add = (value: string, weight = 1) => {
		let hex = value.toLowerCase();
		if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
		const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
		if ([r, g, b].some((channel) => Number.isNaN(channel))) return;
		const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
		if (luminance > 0.96 || luminance < 0.035) return;
		counts.set(`#${hex}`, (counts.get(`#${hex}`) || 0) + weight);
	};
	for (const match of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
		add(match[1], 1);
	}
	for (const match of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
		const hex = [match[1], match[2], match[3]].map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, '0')).join('');
		add(hex, 1);
	}
	// Las identidades modernas suelen vivir en variables CSS: darle más peso a
	// las variables declaradas que a los colores de componentes secundarios.
	for (const match of css.matchAll(/--(?:brand|primary|secondary|accent|color)[\w-]*\s*:\s*#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(match[1], 4);
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex]) => hex);
}

function normalizeCssColor(value: string) {
	const raw = value.trim().toLowerCase();
	if (!raw || /^(transparent|inherit|initial|unset|currentcolor|none)$/i.test(raw)) return '';
	const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
	if (hex) return `#${hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]}`;
	const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
	if (!rgb) return '';
	return `#${[rgb[1], rgb[2], rgb[3]].map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, '0')).join('')}`;
}

function firstCssRoleColor(css: string, property: string) {
	const values: string[] = [];
	const pattern = new RegExp(`(?:^|[;{])\\s*(?:${property})\\s*:\\s*(#[0-9a-f]{3,6}\\b|rgba?\\([^;}{]+\\))`, 'gi');
	for (const match of css.matchAll(pattern)) {
		const color = normalizeCssColor(match[1]);
		if (color && !values.includes(color)) values.push(color);
	}
	return values;
}

function extractSemanticPalette(css: string, themeColor: string): BrandPalette {
	const backgrounds = firstCssRoleColor(css, 'background(?:-color)?');
	const textColors = firstCssRoleColor(css, 'color');
	const accents = [
		themeColor,
		...firstCssRoleColor(css, 'border-color'),
		...firstCssRoleColor(css, 'background(?:-color)?'),
	].map(normalizeCssColor).filter(Boolean);
	const dedupe = (values: string[]) => [...new Set(values)];
	const cleanBackground = dedupe(backgrounds)[0] || '#ffffff';
	const cleanText = dedupe(textColors).find((color) => color !== cleanBackground) || '#19171d';
	const cleanAccent = dedupe(accents).find((color) => color !== cleanBackground && color !== cleanText) || '#744bde';
	const secondary = dedupe([...firstCssRoleColor(css, 'border-color'), ...firstCssRoleColor(css, 'background(?:-color)?')])
		.find((color) => color !== cleanBackground && color !== cleanText && color !== cleanAccent);
	return { background: cleanBackground, text: cleanText, accent: cleanAccent, secondary, source: 'scraped' };
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
	const candidates: Array<{ value: string; score: number }> = [];
	const sourceOf = (el: any) => {
		const node = $(el);
		const srcset = String(node.attr('srcset') || node.attr('data-srcset') || '').split(',')[0]?.trim().split(/\s+/)[0];
		return String(node.attr('src') || node.attr('data-src') || node.attr('data-lazy-src') || srcset || '');
	};
	const add = (value: unknown, score: number) => {
		const url = absoluteUrl(value, base);
		if (!url || /data:image|tracking|pixel|placeholder|spacer/i.test(url)) return;
		candidates.push({ value: url, score });
	};
	$('meta[property="og:logo"], meta[name="logo"], meta[itemprop="logo"]').each((_i, el) => add($(el).attr('content'), 120));
	$('header a[href], nav a[href], [role="banner"] a[href]').each((_i, el) => {
		const href = String($(el).attr('href') || '');
		let isHomeLink = /^\/?(home)?(?:[?#].*)?$/i.test(href);
		try {
			const target = new URL(href, base);
			isHomeLink = isHomeLink || (target.origin === new URL(base).origin && target.pathname.replace(/\/+$/, '') === '');
		} catch { /* href relativo invÃ¡lido: se evalÃºa por la expresiÃ³n anterior */ }
		$(el).find('img, source').each((_j, image) => add(sourceOf(image), isHomeLink ? 115 : 90));
	});
	$('[data-logo], img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i], [class*="brand" i] img').each((_i, el) => add(sourceOf(el), 110));
	$('header img, nav img, [role="banner"] img').each((_i, el) => add(sourceOf(el), 95));
	$('link[rel~="apple-touch-icon" i], link[rel~="mask-icon" i], link[rel~="icon" i], link[rel="shortcut icon" i]').each((_i, el) => add($(el).attr('href'), 75));
	// El favicon es el último recurso: nunca debe ganar frente al logo del navbar.
	$('link[href*="favicon" i]').each((_i, el) => add($(el).attr('href'), 65));
	return [...new Map(candidates.sort((a, b) => b.score - a.score).map((item) => [item.value, item])).values()][0]?.value || '';
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
			const response = await safeExternalFetch(sheetUrl, { headers: { accept: 'text/css,*/*' } }, 8_000, 10_000);
			if (response.ok) cssText += '\n' + new TextDecoder().decode(await readLimited(response, 400_000));
		} catch { /* hoja inaccesible, seguimos con lo que hay */ }
	}

	const pages: Array<{ url: string; title: string; text: string }> = [{
		url,
		title: compact($('title').text(), 180),
		text: compact($('main').text() || $('body').text(), 1500),
	}];
	// Las páginas internas son un extra: aportan tono de voz, no la identidad
	// visual. Si la home y las hojas de estilo ya se comieron el presupuesto, se
	// devuelve lo que hay en vez de arrastrar la función hasta que Vercel la mate.
	const venceElRastreo = Date.now() + 15_000;
	for (const pageUrl of extraPages) {
		if (Date.now() > venceElRastreo) break;
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
		palette: extractSemanticPalette(cssText, compact($('meta[name="theme-color"]').attr('content'), 20)),
		pages,
	};
}

// Sintetiza las señales con el modelo de análisis. Sin API key devuelve
// lo extraído en crudo, que ya es útil para el prompt de generación.
export async function analyzeBrandStyle(websiteUrl: string, keys?: string | { openAIKey?: string; googleKey?: string }): Promise<BrandStyle> {
	const openAIKey = typeof keys === 'string' ? keys : keys?.openAIKey;
	const googleKey = typeof keys === 'string' ? undefined : keys?.googleKey;
	const signals = await collectBrandSignals(websiteUrl);
	const fallback: BrandStyle = {
		colors: [...new Set([signals.themeColor, ...signals.cssColors].filter(Boolean))].slice(0, 5),
		palette: signals.palette,
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
	if (!openAIKey && !googleKey) return fallback;

	const parseResult = (parsed: any): BrandStyle => ({
		// Las señales directas del CSS/tema son la fuente de verdad para la paleta;
		// el modelo puede describir el estilo, pero no debe reemplazar los hex reales
		// por una paleta inventada a partir de una lectura visual incompleta.
		colors: [...new Set([...fallback.colors, ...(Array.isArray(parsed.colors) ? parsed.colors : [])])].slice(0, 5),
		palette: {
			...fallback.palette,
			...(parsed.palette && typeof parsed.palette === 'object' ? parsed.palette : {}),
			source: fallback.palette?.source || 'scraped',
		},
		typography: {
			headings: compact(parsed.typography?.headings, 80) || fallback.typography.headings,
			body: compact(parsed.typography?.body, 80) || fallback.typography.body,
		},
		logoUrl: signals.logoUrl,
		styleSummary: compact(parsed.styleSummary, 600) || fallback.styleSummary,
		brandPersonality: compact(parsed.brandPersonality, 400),
		brandVoice: compact(parsed.brandVoice, 400),
		buttonStyle: compact(parsed.buttonStyle, 300),
		pagesScanned: signals.pages.map((page) => page.url),
		analyzedAt: new Date().toISOString(),
	});

	const systemPrompt = buildSynthesisPrompt();
	const userContent = `Signals scraped from the brand's website (home + internal pages):
${JSON.stringify({
		siteName: signals.siteName, description: signals.description, themeColor: signals.themeColor,
		cssColors: signals.cssColors, cssFonts: signals.cssFonts, googleFonts: signals.googleFonts,
		palette: signals.palette,
		pages: signals.pages,
	})}`;

	if (googleKey) {
		try {
			const model = (typeof import.meta.env !== 'undefined' && import.meta.env.GEMINI_ANALYSIS_MODEL) || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
			const parts: any[] = [{ text: `${systemPrompt}

${userContent}` }];
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } }),
			});
			const data: any = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(`Gemini ${response.status}`);
			const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '{}');
			if (parsed && (parsed.colors || parsed.styleSummary)) return parseResult(parsed);
		} catch (geminiError) {
			console.error('Gemini brand synthesis failed, trying OpenAI:', geminiError);
		}
	}

	if (openAIKey) {
		try {
			const client = new OpenAI({ apiKey: openAIKey });
			const model = (typeof import.meta.env !== 'undefined' && import.meta.env.OPENAI_ANALYSIS_MODEL) || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
			const content: any[] = [{ type: 'text', text: userContent }];
			if (signals.logoUrl) content.push({ type: 'text', text: 'Brand logo:' }, { type: 'image_url', image_url: { url: signals.logoUrl } });
			const response = await client.chat.completions.create({
				model,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content },
				],
			});
			const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
			return parseResult(parsed);
		} catch (error) {
			console.error('Brand style AI synthesis failed, using raw signals:', error);
		}
	}
	return fallback;
}

function buildSynthesisPrompt() {
	return `You are a brand designer. From the scraped signals of a real brand website, produce STRICT JSON:
{
  "colors": ["#hex primary first, max 5 — real brand identity colors only, not framework defaults"],
  "palette": { "background": "#hex", "text": "#hex", "accent": "#hex", "secondary": "#hex" },
  "typography": { "headings": "font family used for headings", "body": "font family used for body text" },
  "styleSummary": "2-3 sentences describing the brand's visual aesthetic (minimal/bold/premium/playful, photography style, layout feel) in Spanish",
  "brandPersonality": "1-2 sentences on tone and personality in Spanish",
  "brandVoice": "how the brand speaks: tone, register, typical phrasing style (in Spanish)",
  "buttonStyle": "how the brand's CTAs/buttons look: shape (rounded/pill/square), fill, color, label style (in Spanish)",
  "language": "en|es — main language of the site content"
}
Use ONLY the provided signals. If unsure about a color/font, omit it rather than invent it.`;
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
