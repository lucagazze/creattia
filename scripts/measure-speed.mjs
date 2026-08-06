// Mide lo que tarda la app en ser USABLE, no lo que tarda el servidor en
// responder: cuándo aparece el primer contenido y cuándo se puede tocar algo.
// Uso: node --env-file=.env.deploy scripts/measure-speed.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.argv[2] || 'https://creattia.vercel.app';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email: 'lucagazze-test@creattia.app', password: 'creattia-e2e-2026!', email_confirm: true }).catch(() => {});
const session = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST', headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
	body: JSON.stringify({ email: 'lucagazze-test@creattia.app', password: 'creattia-e2e-2026!' }),
})).json();
const ref = new URL(SUPABASE_URL).hostname.split('.')[0];

const browser = await chromium.launch();

for (const perfil of [
	{ nombre: 'escritorio', viewport: { width: 1440, height: 900 }, red: null },
	{ nombre: 'móvil 4G', viewport: { width: 390, height: 844 }, red: { download: 4_000_000 / 8, upload: 1_000_000 / 8, latency: 70 } },
]) {
	const ctx = await browser.newContext({ viewport: perfil.viewport });
	await ctx.addInitScript(([r, v]) => window.localStorage.setItem(`sb-${r}-auth-token`, v), [ref, JSON.stringify(session)]);
	const page = await ctx.newPage();

	if (perfil.red) {
		const cdp = await ctx.newCDPSession(page);
		await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: perfil.red.latency, downloadThroughput: perfil.red.download, uploadThroughput: perfil.red.upload });
	}

	const pesos = { total: 0, js: 0, css: 0, img: 0, fuente: 0 };
	page.on('response', async (res) => {
		try {
			const buf = await res.body().catch(() => null);
			if (!buf) return;
			const tipo = res.request().resourceType();
			pesos.total += buf.length;
			if (tipo === 'script') pesos.js += buf.length;
			else if (tipo === 'stylesheet') pesos.css += buf.length;
			else if (tipo === 'image') pesos.img += buf.length;
			else if (tipo === 'font') pesos.fuente += buf.length;
		} catch { /* respuesta sin cuerpo accesible */ }
	});

	const inicio = Date.now();
	await page.goto(`${APP}/app`, { waitUntil: 'domcontentloaded', timeout: 90000 });
	// Cuándo hay algo real en pantalla, no un esqueleto.
	let usable = null;
	try {
		await page.locator('.studio-nav button').first().waitFor({ state: 'visible', timeout: 60000 });
		usable = Date.now() - inicio;
	} catch { /* no llegó */ }

	const peticiones = await page.evaluate(() => {
		// Qué se pide antes de que la app sea usable, y cuánto tarda cada una.
		return performance.getEntriesByType('resource')
			.filter((r) => /supabase\.co|\/api\//.test(r.name))
			.map((r) => ({ url: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 58), inicio: Math.round(r.startTime), ms: Math.round(r.duration) }))
			.sort((a, b) => a.inicio - b.inicio)
			.slice(0, 10);
	});

	const m = await page.evaluate(() => {
		const nav = performance.getEntriesByType('navigation')[0];
		const fcp = performance.getEntriesByName('first-contentful-paint')[0];
		return {
			html: nav ? Math.round(nav.responseEnd - nav.requestStart) : null,
			domListo: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
			cargado: nav ? Math.round(nav.loadEventEnd) : null,
			primerPintado: fcp ? Math.round(fcp.startTime) : null,
		};
	});

	const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
	console.log(`\n── ${perfil.nombre}`);
	console.log(`   HTML del servidor      ${m.html} ms`);
	console.log(`   primer pintado         ${m.primerPintado} ms`);
	console.log(`   DOM listo              ${m.domListo} ms`);
	console.log(`   menú tocable           ${usable === null ? 'NO LLEGÓ' : usable + ' ms'}`);
	if (peticiones.length) {
		console.log('   esperando a:');
		for (const r of peticiones) console.log(`      +${String(r.inicio).padStart(5)}ms  ${String(r.ms).padStart(5)}ms  ${r.url}`);
	}
	console.log(`   descargado             ${kb(pesos.total)}  (js ${kb(pesos.js)} · css ${kb(pesos.css)} · img ${kb(pesos.img)} · fuentes ${kb(pesos.fuente)})`);
	await ctx.close();
}

await browser.close();
