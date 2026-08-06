// Verifica que los TEXTOS sugeridos cambien según de qué habla el anuncio.
//
// Usa /api/creativos/plan, que devuelve el análisis —el paso que escribe el
// copy— sin renderizar ninguna imagen: lo que se discutía era el texto, y el
// render cuesta plata sin agregar información. Corre contra el sitio desplegado
// porque las claves de los modelos viven ahí.
//
// Uso: node --env-file=.env.deploy scripts/verify-subject-copy.mjs [baseUrl]
import { createClient } from '@supabase/supabase-js';

const APP = process.argv[2] || 'https://creattia.vercel.app';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'lucagazze-test@creattia.app';
const PASSWORD = 'creattia-e2e-2026!';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }).catch(() => {});
const session = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST', headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})).json();
if (!session.access_token) throw new Error('login: ' + JSON.stringify(session).slice(0, 200));

// Un ganador con texto visible, para poder comparar los reemplazos.
const { data: manifestFile } = await admin.storage.from('creative-references').download('manifests/starter-static-50.json');
const manifest = JSON.parse(await manifestFile.text());
const item = (manifest.items || []).find((entry) => /^1\//.test(entry.imagePath || '')) || manifest.items[0];
console.log(`referencia: ${item.name} — ${item.imagePath}`);

const casos = [
	{
		titulo: 'TIENDA (catalog)',
		subjectMode: 'catalog',
		productName: 'The Skirting Factory',
		productFacts: 'Tienda de cueros y talabartería. Vende cinturones, bolsos, planchas de cuero vacuno curtido vegetal y herrajes.',
	},
	{
		titulo: 'PRODUCTO (product)',
		subjectMode: 'product',
		productName: 'Double Shoulder de cuero vegetal',
		productFacts: 'Plancha de cuero vacuno curtido vegetal, 7-8 oz (2.8-3.2 mm), para cinturones y bolsos. USD 38.50.',
	},
];

for (const caso of casos) {
	const form = new FormData();
	form.set('referencePath', item.imagePath);
	form.set('subjectMode', caso.subjectMode);
	form.set('productName', caso.productName);
	form.set('productFacts', caso.productFacts);
	form.set('brandSource', 'none');
	form.set('language', 'es');

	const res = await fetch(`${APP}/api/creativos/plan`, {
		method: 'POST',
		headers: { authorization: `Bearer ${session.access_token}`, origin: APP },
		body: form,
	});
	const payload = await res.json().catch(() => ({}));

	console.log(`\n════ ${caso.titulo} ════`);
	if (!res.ok) { console.log('  error HTTP', res.status, JSON.stringify(payload).slice(0, 200)); continue; }
	const a = payload.analysis || {};
	console.log(`  sujeto devuelto: ${a.subjectType}`);
	console.log(`  titular:     ${a.adCopy?.headline || '—'}`);
	console.log(`  descripción: ${a.adCopy?.description || '—'}`);
	console.log(`  CTA:         ${a.adCopy?.cta || '—'}`);
	console.log(`  cuerpo:      ${(a.adCopy?.primaryText || '—').slice(0, 220)}`);
	console.log('  reemplazos en la imagen:');
	for (const zona of (a.textZones || []).slice(0, 6)) {
		console.log(`    · "${(zona.original || '').slice(0, 45)}" → "${(zona.replacement || '').slice(0, 60)}"`);
	}
}
