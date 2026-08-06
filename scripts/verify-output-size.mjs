// Comprueba con qué resolución sale de verdad una imagen cuadrada.
//
// El cuadrado se generaba a 1024x1024 por una tabla de tamaños duplicada dentro
// del motor, mientras el resto de los formatos ya iba a 1536. Este script genera
// una y mide los píxeles del archivo guardado, que es la única prueba real.
//
// Uso: node --env-file=.env.deploy scripts/verify-output-size.mjs
import { createClient } from '@supabase/supabase-js';

const APP = process.argv[2] || 'https://www.creattia.app';
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

// Una de las referencias del preview gratuito: sirve con cualquier plan, así que
// la prueba no depende de que la cuenta tenga suscripción activa.
const RUTA_LIBRE = '40/2fb666571bf2802e.png';
const { data: manifestFile } = await admin.storage.from('creative-references').download('manifests/starter-static-50.json');
const manifest = JSON.parse(await manifestFile.text());
const item = (manifest.items || []).find((entry) => entry.imagePath === RUTA_LIBRE)
	|| { imagePath: RUTA_LIBRE, name: 'Preview gratuito', templateId: 40 };
console.log(`referencia: ${item.name} — ${item.imagePath}`);

const form = new FormData();
form.set('templateId', String(item.templateId || 1));
form.set('templateName', item.name || 'Prueba de resolución');
form.set('referencePath', item.imagePath);
form.set('format', '1:1');            // el formato que estaba saliendo a 1024
form.set('imageType', 'promotion');
form.set('subjectMode', 'service');   // sin foto de producto, para no depender de una
form.set('productName', 'Creattia');
form.set('productFacts', 'Herramienta de IA que clona anuncios ganadores con tu producto.');
form.set('brandName', 'Creattia');
form.set('language', 'es');
form.set('fidelity', '1');
form.set('preset', 'Prueba de resolución');
form.set('count', '1');

console.log('generando…');
const inicio = Date.now();
const res = await fetch(`${APP}/api/creativos/generate`, {
	method: 'POST',
	headers: { authorization: `Bearer ${session.access_token}`, origin: APP },
	body: form,
});
const payload = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(`generate ${res.status}: ${JSON.stringify(payload).slice(0, 400)}`);
const batchId = payload.batchId;
console.log(`lote ${batchId} — esperando…`);

let salida = null;
for (let intento = 0; intento < 60; intento += 1) {
	await new Promise((r) => setTimeout(r, 5000));
	const { data } = await admin.from('creative_generations')
		.select('id,status,output_path,error_code,settings_snapshot')
		.eq('batch_id', batchId);
	const fila = (data || [])[0];
	if (!fila) continue;
	if (fila.status === 'completed' && fila.output_path) { salida = fila; break; }
	if (fila.status === 'failed') throw new Error(`falló: ${fila.error_code || 'sin detalle'}`);
	process.stdout.write('.');
}
console.log('');
if (!salida) throw new Error('no terminó a tiempo');

const { data: blob } = await admin.storage.from('creative-assets').download(salida.output_path);
const buffer = Buffer.from(await blob.arrayBuffer());
const sharp = (await import('sharp')).default;
const meta = await sharp(buffer).metadata();

console.log(`\ntiempo:     ${Math.round((Date.now() - inicio) / 1000)}s`);
console.log(`archivo:    ${(buffer.length / 1024).toFixed(0)} KB (${meta.format})`);
console.log(`RESOLUCIÓN: ${meta.width}x${meta.height}`);
console.log(meta.width === 1536 ? '✓ sale a 1536 — el arreglo funciona' : `✗ sigue saliendo a ${meta.width}`);

const { data: firmada } = await admin.storage.from('creative-assets').createSignedUrl(salida.output_path, 3600);
console.log(`\nverla: ${firmada?.signedUrl || salida.output_path}`);
