// Audita la landing en los anchos de teléfono reales.
//
// Las pasadas anteriores solo miraron /app: la landing nunca se revisó, y ahí
// aparecieron desbordes que obligan a arrastrar la pantalla de costado. Se
// prueban varios anchos porque el problema aparece o no según el teléfono —de
// ahí que dos personas vean cosas distintas—.
//
//   node scripts/audit-landing.mjs [url]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4321';

// Los anchos que existen de verdad, del más angosto al más ancho.
const ANCHOS = [
	{ nombre: 'iPhone SE', ancho: 320 },
	{ nombre: 'Android chico', ancho: 360 },
	{ nombre: 'iPhone mini', ancho: 375 },
	{ nombre: 'iPhone 14/15', ancho: 390 },
	{ nombre: 'iPhone Plus', ancho: 414 },
	{ nombre: 'iPhone Pro Max', ancho: 430 },
];

const browser = await chromium.launch();
let problemas = 0;

for (const perfil of ANCHOS) {
	const ctx = await browser.newContext({
		viewport: { width: perfil.ancho, height: 844 },
		deviceScaleFactor: 2, isMobile: true, hasTouch: true,
	});
	const page = await ctx.newPage();
	await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(2500);
	// Hasta el fondo: muchas secciones cargan al entrar en pantalla.
	await page.evaluate(async () => {
		for (let y = 0; y < document.body.scrollHeight; y += 600) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 60));
		}
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(1200);

	const diag = await page.evaluate(() => {
		const doc = document.documentElement;
		const limite = doc.clientWidth;
		const culpables = [];
		for (const el of document.querySelectorAll('body *')) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			const cs = getComputedStyle(el);
			if (cs.visibility === 'hidden' || cs.display === 'none') continue;
			// Lo que se sale por la derecha o empieza antes del borde izquierdo.
			const excedeDerecha = Math.round(r.right - limite);
			if (excedeDerecha > 1 || r.left < -1) {
				culpables.push({
					sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : ''),
					exceso: excedeDerecha > 1 ? excedeDerecha : Math.round(r.left),
					ancho: Math.round(r.width),
					texto: (el.textContent || '').trim().slice(0, 40),
				});
			}
		}
		// Solo los que de verdad empujan: los hijos heredan el desborde del padre.
		const unicos = new Map();
		for (const c of culpables) if (!unicos.has(c.sel)) unicos.set(c.sel, c);
		return {
			scrollX: doc.scrollWidth - limite,
			anchoDocumento: doc.scrollWidth,
			limite,
			culpables: [...unicos.values()].sort((a, b) => Math.abs(b.exceso) - Math.abs(a.exceso)).slice(0, 8),
		};
	});

	const roto = diag.scrollX > 0;
	if (roto) problemas += 1;
	console.log(`\n${roto ? '✗' : '✓'} ${perfil.nombre.padEnd(16)} ${perfil.ancho}px  ${roto ? `→ la página mide ${diag.anchoDocumento}px, se sale ${diag.scrollX}px` : 'sin desborde'}`);
	if (roto) {
		for (const c of diag.culpables) {
			console.log(`     ${String(c.exceso).padStart(5)}px  ${c.sel.padEnd(34)} (ancho ${c.ancho}) ${c.texto ? '“' + c.texto + '”' : ''}`);
		}
	}
	await ctx.close();
}

await browser.close();
console.log(`\n${problemas ? `${problemas} de ${ANCHOS.length} anchos con desborde` : 'Ningún ancho se desborda'}\n`);
