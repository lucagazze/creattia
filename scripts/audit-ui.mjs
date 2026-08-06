// Auditoría visual: recorre la app logueada y saca capturas en móvil y escritorio.
// Además mide desbordes horizontales y textos que se cortan, que es lo que no se
// ve leyendo el CSS. Uso: node --env-file=.env.local scripts/audit-ui.mjs [baseUrl]
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = process.env.AUDIT_OUT || '/tmp/creattia-audit';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// La clave publishable no siempre está en el entorno local; para el endpoint de
// auth alcanza con cualquier clave válida del proyecto.
const PUBLISHABLE = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || SERVICE_KEY;
const EMAIL = 'lucagazze-test@creattia.app';
const PASSWORD = 'creattia-e2e-2026!';

const VIEWPORTS = [
	{ name: 'movil', width: 390, height: 844, isMobile: true },
	{ name: 'tablet', width: 820, height: 1180, isMobile: false },
	{ name: 'escritorio', width: 1440, height: 900, isMobile: false },
];

// La app no cambia de URL al navegar: se recorre tocando el menú, igual que un
// usuario. En móvil el menú está detrás del botón hamburguesa.
const SCREENS = [
	{ slug: 'inicio', label: 'Inicio' },
	{ slug: 'ganadores', label: 'Biblioteca de ganadores' },
	{ slug: 'guardados', label: 'Anuncios guardados' },
	{ slug: 'mis-imagenes', label: 'Mis imágenes' },
	// Fuera del menú principal: viven en el pie de la barra lateral.
	{ slug: 'marca', label: 'Mi marca', selector: '.studio-brand-nav-btn' },
	{ slug: 'planes', label: 'Ver planes', selector: '.studio-plan-card footer button' },
];

mkdirSync(OUT, { recursive: true });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }).catch(() => {});

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await res.json();
if (!session.access_token) throw new Error('login: ' + JSON.stringify(session).slice(0, 200));
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

const browser = await chromium.launch();
const problemas = [];

for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		deviceScaleFactor: 2,
		isMobile: vp.isMobile,
		hasTouch: vp.isMobile,
	});
	// Sembrar la sesión de Supabase antes de que cargue la app.
	await context.addInitScript(([ref, value]) => {
		window.localStorage.setItem(`sb-${ref}-auth-token`, value);
	}, [projectRef, JSON.stringify(session)]);

	const page = await context.newPage();

	await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(6000);

	for (const screen of SCREENS) {
		try {
			// El menú se pliega desde 900px, no solo en móvil: se intenta siempre.
			const burger = page.locator('.studio-menu-button, [aria-label="Abrir menú"]').first();
			if (await burger.isVisible().catch(() => false)) { await burger.click(); await page.waitForTimeout(700); }
			const destino = screen.selector
				? page.locator(screen.selector).first()
				: page.locator(`.studio-nav button:has-text("${screen.label}")`).first();
			await destino.click({ timeout: 15000 });
			await page.waitForTimeout(4000);
			// El menú móvil queda abierto tapando el encabezado y falsea la
			// captura: se cierra antes de mirar nada.
			const cerrar = page.locator('.studio-close-menu, .studio-mobile-scrim.is-open').first();
			if (await cerrar.isVisible().catch(() => false)) { await cerrar.click({ force: true }); await page.waitForTimeout(700); }
		} catch (error) {
			console.log(`✗ ${vp.name}/${screen.slug}: no se pudo abrir (${String(error).slice(0, 80)})`);
			continue;
		}

		// Lo que una captura no cuenta: desbordes y solapamientos reales.
		const diag = await page.evaluate(() => {
			const doc = document.documentElement;
			const out = { scrollX: doc.scrollWidth - doc.clientWidth, anchos: [], chicos: [], toques: [] };
			for (const el of document.querySelectorAll('body *')) {
				const r = el.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) continue;
				const cs = getComputedStyle(el);
				if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
				const id = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`;
				if (r.right > doc.clientWidth + 1 && el.children.length === 0) out.anchos.push({ id, right: Math.round(r.right) });
				const size = parseFloat(cs.fontSize);
				if (size && size < 11 && el.textContent?.trim() && el.children.length === 0) out.chicos.push({ id, size: +size.toFixed(1) });
				if (/^(button|a)$/i.test(el.tagName) && (r.height < 32 || r.width < 32) && el.textContent?.trim()) {
					out.toques.push({ id, w: Math.round(r.width), h: Math.round(r.height) });
				}
			}
			const uniq = (list) => Object.values(list.reduce((acc, item) => ({ ...acc, [item.id]: item }), {})).slice(0, 10);
			out.anchos = uniq(out.anchos); out.chicos = uniq(out.chicos); out.toques = uniq(out.toques);
			return out;
		});

		if (diag.scrollX > 0 || diag.anchos.length || diag.chicos.length || diag.toques.length) {
			problemas.push({ pantalla: screen.slug, vista: vp.name, ...diag });
		}

		await page.screenshot({ path: `${OUT}/${vp.name}-${screen.slug}.png`, fullPage: true });
		console.log(`✓ ${vp.name}/${screen.slug}${diag.scrollX > 0 ? `  ⚠ scroll horizontal +${diag.scrollX}px` : ''}`);
	}
	await context.close();
}

await browser.close();

console.log('\n════ PROBLEMAS ════');
for (const p of problemas) {
	console.log(`\n▸ ${p.vista} / ${p.pantalla}`);
	if (p.scrollX > 0) console.log(`   SCROLL HORIZONTAL: +${p.scrollX}px`);
	if (p.anchos.length) console.log(`   se salen: ${p.anchos.map((a) => `${a.id}(${a.right})`).join(', ')}`);
	if (p.chicos.length) console.log(`   texto <11px: ${p.chicos.map((a) => `${a.id}(${a.size})`).join(', ')}`);
	if (p.toques.length) console.log(`   táctil chico: ${p.toques.map((a) => `${a.id}(${a.w}×${a.h})`).join(', ')}`);
}
console.log(`\nCapturas en ${OUT}`);
