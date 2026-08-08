import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)); });

const t0 = Date.now();
const resp = await page.goto('https://www.creattia.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
const titulo = await page.title();
const meta = await page.evaluate(() => ({
	canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
	ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
	h1: document.querySelector('h1')?.textContent?.trim().slice(0, 70),
	jsonLd: !!document.querySelector('script[type="application/ld+json"]'),
}));
const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
console.log(JSON.stringify({
	http: resp?.status(), ms: Date.now() - t0, titulo, ...meta, scrollHorizontal: hscroll,
	errores: [...new Set(errores)].slice(0, 4),
}, null, 1));

// La imagen social, pedida desde el navegador
const og = await page.evaluate(async () => {
	const r = await fetch('/images/creattia/og-image.png', { method: 'GET' });
	return { status: r.status, tipo: r.headers.get('content-type') };
});
console.log('og-image:', JSON.stringify(og));
const robots = await page.evaluate(async () => (await fetch('/robots.txt')).text());
console.log('robots:\n' + robots.trim());
const sitemap = await page.evaluate(async () => (await fetch('/sitemap-0.xml')).text());
console.log('sitemap:', (sitemap.match(/<loc>[^<]*<\/loc>/g) || []).join(' '));
await browser.close();
