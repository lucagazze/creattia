// E2E contra PRODUCCIÓN: crea usuario de prueba, dispara una generación async
// del ganador Flings con el producto Double Shoulder y sigue el batch hasta el final.
// Uso: node --env-file=.env.local scripts/dev-test-e2e.mjs
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const APP = 'https://creattia.vercel.app';
const TEST_EMAIL = 'lucagazze-test@creattia.app';
const TEST_PASSWORD = 'creattia-e2e-2026!';
const OUT = 'C:/Users/lucag/AppData/Local/Temp/claude/c--Users-lucag--claude/cb479755-6686-449e-a4ae-4f1dc08e42b5/scratchpad/e2e-result.png';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 1. Usuario de prueba (email con "lucagazze" → admin, sin consumo de créditos)
const { error: createError } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true });
if (createError && !/already/i.test(createError.message)) throw createError;

// 2. Login
const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
	body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
});
const auth = await authRes.json();
if (!auth.access_token) throw new Error('login: ' + JSON.stringify(auth).slice(0, 200));
console.log('login ok');

// 3. Foto del producto
const photoRes = await fetch(`${SUPABASE_URL}/storage/v1/object/creative-assets/c9cff993-01d3-4523-b6ea-105d57d048d5/products/d7ddd6f4-413f-4e8c-883e-2234433578cc/primary.jpg`, {
	headers: { authorization: `Bearer ${SERVICE_KEY}` },
});
const photo = Buffer.from(await photoRes.arrayBuffer());
console.log('producto ok', photo.length, 'bytes');

// 4. Disparar generación
const form = new FormData();
form.set('templateId', '40');
form.set('templateName', 'Flings — Childhood Memories');
form.set('format', '1:1');
form.set('imageType', 'promotion');
form.set('referencePath', '40/1b76d7e89d46ac25.webp');
form.set('fidelity', '1');
form.set('preset', 'Fiel al ganador');
form.set('count', '1');
form.set('brandName', 'The Skirting Factory');
form.set('brief', 'PRODUCTO: Double Shoulder, piel de cuero premium de 7-8 oz (2.8-3.2mm) para talabartería, bolsos y cinturones. $38.50 USD.');
form.set('product', new Blob([photo], { type: 'image/jpeg' }), 'double-shoulder.jpg');

const started = Date.now();
const genRes = await fetch(`${APP}/api/creativos/generate`, {
	method: 'POST',
	headers: { authorization: `Bearer ${auth.access_token}`, origin: APP },
	body: form,
});
const payload = await genRes.json().catch(() => ({}));
const elapsedMs = Date.now() - started;
console.log(`respuesta en ${elapsedMs}ms → status ${genRes.status}:`, JSON.stringify(payload).slice(0, 300));
if (genRes.status !== 202 || !payload.batchId) throw new Error('no devolvió 202+batchId');

// 5. Polling del batch
for (let attempt = 0; attempt < 40; attempt += 1) {
	await new Promise((resolve) => setTimeout(resolve, 10_000));
	const { data } = await admin.from('creative_generations').select('id,status,error_code,output_path').eq('batch_id', payload.batchId);
	const row = data?.[0];
	console.log(`${(attempt + 1) * 10}s → ${row?.status}${row?.error_code ? ' · ' + row.error_code : ''}`);
	if (!row || row.status === 'processing') continue;
	if (row.status === 'failed') throw new Error('generación FAILED: ' + row.error_code);
	const imgRes = await fetch(`${SUPABASE_URL}/storage/v1/object/creative-assets/${row.output_path}`, { headers: { authorization: `Bearer ${SERVICE_KEY}` } });
	writeFileSync(OUT, Buffer.from(await imgRes.arrayBuffer()));
	console.log('COMPLETED →', OUT);
	process.exit(0);
}
throw new Error('timeout esperando el batch');
