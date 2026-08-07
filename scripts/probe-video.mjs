// Genera el PRIMER video de la app y sigue el pipeline hasta el final.
//
// El sistema de video está completo —biblioteca de 2.211 ganadores, análisis del
// ganador, plan creativo, diálogos, segmentado y unión— pero nunca se ejecutó ni
// una vez. Esto no busca calidad todavía: busca saber si sobrevive de punta a
// punta, y en qué paso se rompe si se rompe.
//
// Se pide el mínimo, 4 segundos, que es un solo tramo y el gasto más chico.
//
//   node --env-file=.env.deploy scripts/probe-video.mjs [segundos]
import { createClient } from '@supabase/supabase-js';

const APP = 'https://www.creattia.app';
const SEGUNDOS = process.argv[2] || '4';
// El pipeline exige un producto real con foto: sin eso ni analiza.
const PRODUCTO = process.env.VIDEO_PRODUCT_ID || 'fb00723d-0877-46fc-8345-fff1a8156d31';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'lucagazze-test@creattia.app';
const PASSWORD = 'creattia-e2e-2026!';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const session = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST', headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})).json();
if (!session.access_token) throw new Error('login: ' + JSON.stringify(session).slice(0, 200));
const auth = { authorization: `Bearer ${session.access_token}`, origin: APP };

// Un ganador de la biblioteca de video, del ángulo más poblado.
const { data: manifestFile } = await admin.storage.from('creative-videos').download('manifests/video-library.json');
const biblioteca = JSON.parse(await manifestFile.text());
const items = biblioteca.items || biblioteca;
const ganador = items.find((item) => item.videoPath && item.thumbnailPath && /^hero\//.test(item.videoPath)) || items[0];
console.log(`ganador: ${ganador.name} — ${ganador.videoPath}`);

const firmar = async (ruta) => (await admin.storage.from('creative-videos').createSignedUrl(ruta, 3600)).data?.signedUrl;
const videoUrl = await firmar(ganador.videoPath);
const posterUrl = await firmar(ganador.thumbnailPath);

// 1. El plan creativo: analiza el ganador y propone el guion.
console.log('\n[1/3] analizando el ganador y armando el plan…');
const planForm = new FormData();
planForm.set('referenceVideoUrl', videoUrl);
planForm.set('referencePosterUrl', posterUrl);
planForm.set('productId', PRODUCTO);
planForm.set('productName', 'Creattia');
planForm.set('productDescription', 'Herramienta de IA que clona anuncios ganadores con tu producto.');
planForm.set('language', 'es');
const planRes = await fetch(`${APP}/api/creativos/video-plan`, { method: 'POST', headers: auth, body: planForm });
const plan = await planRes.json().catch(() => ({}));
if (!planRes.ok) {
	console.error(`   ✗ el plan falló (${planRes.status}): ${JSON.stringify(plan).slice(0, 300)}`);
	process.exit(1);
}
console.log(`   ✓ hook: ${String(plan.hook || plan.creativeSuggestions?.hookIdea || '—').slice(0, 90)}`);
console.log(`   ✓ escenas propuestas: ${(plan.scenePlan || []).length}`);

// 2. Disparar la generación.
console.log(`\n[2/3] generando ${SEGUNDOS}s…`);
const form = new FormData();
form.set('referenceVideoUrl', videoUrl);
form.set('referencePosterUrl', posterUrl);
form.set('productId', PRODUCTO);
form.set('productName', 'Creattia');
form.set('productDescription', 'Herramienta de IA que clona anuncios ganadores con tu producto.');
form.set('duration', SEGUNDOS);
form.set('size', '720x1280');
form.set('language', 'es');
form.set('avatarMode', 'none');
form.set('speechMode', 'none');
for (const [clave, valor] of Object.entries(plan.creativeSuggestions || {})) {
	if (typeof valor === 'string' && valor) form.set(clave, valor.slice(0, 700));
}
const inicio = Date.now();
const startRes = await fetch(`${APP}/api/creativos/video-start`, { method: 'POST', headers: auth, body: form });
const arranque = await startRes.json().catch(() => ({}));
if (!startRes.ok) {
	console.error(`   ✗ no arrancó (${startRes.status}): ${JSON.stringify(arranque).slice(0, 400)}`);
	process.exit(1);
}
const videoId = arranque.videoId || arranque.id;
console.log(`   ✓ arrancó, id ${videoId}`);

// 3. Seguirlo hasta que termine.
console.log('\n[3/3] esperando…');
let ultimo = '';
for (let intento = 0; intento < 90; intento += 1) {
	await new Promise((r) => setTimeout(r, 8000));
	const { data: fila } = await admin.from('creative_video_generations')
		.select('status,error_code,output_path,duration_seconds').eq('id', videoId).maybeSingle();
	if (!fila) continue;
	if (fila.status !== ultimo) { ultimo = fila.status; process.stdout.write(`\n   ${fila.status}`); }
	else process.stdout.write('.');
	if (fila.status === 'completed' && fila.output_path) {
		const { data: firmada } = await admin.storage.from('creative-video-outputs').createSignedUrl(fila.output_path, 60 * 60 * 24 * 7);
		console.log(`\n\n✓ LISTO en ${Math.round((Date.now() - inicio) / 1000)}s`);
		console.log(`  ${firmada?.signedUrl || fila.output_path}`);
		process.exit(0);
	}
	if (fila.status === 'failed') {
		console.log(`\n\n✗ FALLÓ: ${fila.error_code || 'sin detalle'}`);
		process.exit(1);
	}
}
console.log('\n\n⏱ no terminó en 12 minutos');
