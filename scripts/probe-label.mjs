// Sonda puntual: ¿el "?" de "presentaci?n" está en el texto o es la fuente?
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email: 'lucagazze-test@creattia.app', password: 'creattia-e2e-2026!', email_confirm: true }).catch(() => {});
const session = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST', headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
	body: JSON.stringify({ email: 'lucagazze-test@creattia.app', password: 'creattia-e2e-2026!' }),
})).json();
const ref = new URL(SUPABASE_URL).hostname.split('.')[0];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(([r, v]) => window.localStorage.setItem(`sb-${r}-auth-token`, v), [ref, JSON.stringify(session)]);
const page = await ctx.newPage();
const fallos = [];
page.on('requestfailed', (r) => fallos.push(`${r.url()} → ${r.failure()?.errorText}`));
await page.goto('https://creattia.vercel.app/app', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const info = await page.evaluate(() => {
	const chicos = new Map();
	for (const el of document.querySelectorAll('button, a')) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		if (!(el.textContent || '').trim()) continue;
		if (r.height >= 36) continue;
		const cadena = [el, el.parentElement, el.parentElement?.parentElement]
			.filter(Boolean)
			.map((n) => n.tagName.toLowerCase() + (n.className ? '.' + n.className.toString().trim().split(/\s+/).join('.') : ''))
			.reverse().join(' > ');
		if (!chicos.has(cadena)) chicos.set(cadena, { alto: Math.round(r.height), texto: (el.textContent || '').trim().slice(0, 22) });
	}
	return [...chicos.entries()].map(([sel, v]) => ({ sel, ...v }));
});

for (const item of info) console.log(`${String(item.alto).padStart(3)}px  "${item.texto}"\n       ${item.sel}`);
console.log('PEDIDOS FALLIDOS:', fallos.length ? fallos.slice(0, 10) : 'ninguno');
await browser.close();
