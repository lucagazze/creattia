import { chromium } from 'playwright';

const VISTAS = [
	{ nombre: 'movil-390', width: 390, height: 844 },
	{ nombre: 'tablet-768', width: 768, height: 1024 },
	{ nombre: 'escritorio-1280', width: 1280, height: 800 },
];
const PAGINAS = ['/', '/blog', '/sobre-nosotros', '/terminos', '/privacidad', '/app/'];
const BASE = 'https://www.creattia.app';

const browser = await chromium.launch();
const problemas = [];
for (const vista of VISTAS) {
	const ctx = await browser.newContext({ viewport: { width: vista.width, height: vista.height }, deviceScaleFactor: 2 });
	for (const ruta of PAGINAS) {
		const page = await ctx.newPage();
		const errores = [];
		page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
		page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)); });
		try {
			const r = await page.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 60000 });
			await page.waitForTimeout(3500);
			// Scroll completo: las secciones que cargan al entrar en pantalla solo
			// desbordan cuando efectivamente se dibujan.
			await page.evaluate(async () => {
				for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight) {
					window.scrollTo(0, y);
					await new Promise((r) => setTimeout(r, 220));
				}
			});
			await page.waitForTimeout(600);
			const desborde = await page.evaluate(() => {
				const doc = document.documentElement;
				if (doc.scrollWidth <= doc.clientWidth + 1) return null;
				// Qué elemento se pasa del ancho, para poder arreglarlo
				const culpables = [...document.querySelectorAll('*')]
					.map((el) => ({ el, r: el.getBoundingClientRect() }))
					.filter(({ r }) => r.width > 0 && r.right > doc.clientWidth + 2)
					.slice(0, 3)
					.map(({ el, r }) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} (hasta ${Math.round(r.right)}px)`);
				return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, culpables };
			});
			const linea = `${ruta} @ ${vista.nombre}: ${r?.status()}`;
			if (desborde) problemas.push(`${linea} — DESBORDE ${desborde.scrollWidth}>${desborde.clientWidth}px: ${desborde.culpables.join(' | ')}`);
			for (const e of [...new Set(errores)].slice(0, 2)) problemas.push(`${linea} — error: ${e}`);
			console.log(`${linea} ${desborde ? 'DESBORDA' : 'ok'} ${errores.length ? `(${errores.length} errores)` : ''}`);
		} catch (err) {
			problemas.push(`${ruta} @ ${vista.nombre} — no cargó: ${String(err).slice(0, 120)}`);
		}
		await page.close();
	}
	await ctx.close();
}
await browser.close();
console.log('\n=== PROBLEMAS ===');
console.log(problemas.length ? problemas.join('\n') : 'ninguno');
