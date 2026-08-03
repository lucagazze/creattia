import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { verifyVideoBuffer } from '../src/lib/creattia/video-media.ts';

if (process.env.CONFIRM_PAID_VIDEO_TEST !== '1') throw new Error('Set CONFIRM_PAID_VIDEO_TEST=1 to run the paid video test.');

const baseUrl = process.env.CREATTIA_TEST_URL || 'http://localhost:4321';
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(supabaseUrl && publishableKey && serviceRoleKey, 'Supabase test environment is incomplete');

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `video-e2e-${Date.now()}@example.invalid`;
const password = `Creattia-${crypto.randomUUID()}-Aa1!`;
let userId = '';
let jobId = '';
let outputPath = '';

function authHeaders(token) {
	return { authorization: `Bearer ${token}` };
}

async function postForm(path, token, form) {
	const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { ...authHeaders(token), origin: baseUrl }, body: form });
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`${path} (${response.status}): ${payload.error || JSON.stringify(payload)}`);
	return payload;
}

try {
	const manifestUrl = `${supabaseUrl}/storage/v1/object/public/creative-videos/manifests/video-library.json`;
	const manifest = await fetch(manifestUrl).then((response) => {
		if (!response.ok) throw new Error(`Video manifest returned ${response.status}`);
		return response.json();
	});
	const reference = (manifest.items || []).find((item) => item.name === 'Well You' && item.videoPath && item.thumbnailPath)
		|| (manifest.items || []).find((item) => item.videoPath && item.thumbnailPath);
	assert.ok(reference, 'At least one winner video is required');
	const referenceVideoUrl = `${supabaseUrl}/storage/v1/object/public/creative-videos/${reference.videoPath}`;
	const referencePosterUrl = `${supabaseUrl}/storage/v1/object/public/creative-videos/${reference.thumbnailPath}`;
	const productImageResponse = await fetch(referencePosterUrl);
	assert.equal(productImageResponse.ok, true, 'Product reference image must download');
	const productImageBytes = await productImageResponse.arrayBuffer();
	const productImageType = productImageResponse.headers.get('content-type')?.split(';')[0] || 'image/jpeg';

	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Creattia Video E2E' } });
	if (created.error || !created.data.user) throw created.error || new Error('Test user was not created');
	userId = created.data.user.id;
	const profileUpdate = await admin.from('creative_profiles').update({ credits_remaining: 20, brand_name: 'Marca Prueba Creattia' }).eq('user_id', userId);
	if (profileUpdate.error) throw profileUpdate.error;
	const signedIn = await browser.auth.signInWithPassword({ email, password });
	if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error('Test user did not sign in');
	const token = signedIn.data.session.access_token;

	const fillCommon = (form) => {
		form.set('referenceVideoUrl', referenceVideoUrl);
		form.set('referencePosterUrl', referencePosterUrl);
		form.set('referenceScript', reference.promptNotes || 'Una persona presenta el producto y explica su beneficio.');
		form.set('referenceDuration', String(reference.metadata?.durationSec || 8));
		form.set('productName', 'Producto Demo Creattia');
		form.set('productFacts', 'Producto de demostración para una rutina simple. Usar solamente la información provista.');
		form.set('brandName', 'Marca Prueba Creattia');
		form.set('objective', 'Conversión');
		form.set('audience', 'Personas interesadas en una rutina diaria simple');
		form.set('benefit', 'Hace más simple la rutina diaria');
		form.set('proof', 'Usar solamente la información provista');
		form.set('offer', '');
		form.set('cta', 'Conocelo hoy');
		form.set('tone', 'UGC natural');
		form.set('language', 'Español rioplatense');
		form.set('duration', '4');
		form.set('size', '720x1280');
		form.set('audioDirection', 'Música suave y voz clara');
		form.set('voiceover', 'Sin voz en off adicional');
		form.set('captions', 'Marca, beneficio y CTA breves');
		form.set('peopleDirection', 'Creadora adulta original, distinta de la referencia');
		form.set('avatarMode', 'none');
		form.set('referenceMode', 'Equilibrado');
		form.set('preserveDirection', 'Conservar el propósito del hook y el ritmo');
		form.set('changeDirection', 'Cambiar persona, producto, marca, palabras, encuadres y locación');
		form.set('productUsage', 'Mostrar el envase claramente');
		form.set('mustAvoid', 'Resultados garantizados y marcas ajenas');
		form.set('speechMode', 'adapt');
		form.set('dialogueInstructions', 'Nombrar Marca Prueba Creattia y Producto Demo Creattia; cerrar con Conocelo hoy.');
		form.append('productImages', new Blob([productImageBytes], { type: productImageType }), 'product-reference.jpg');
	};

	const planForm = new FormData();
	fillCommon(planForm);
	console.log('e2e: analyzing full winner video and creating dialogue plan');
	const planned = await postForm('/api/creativos/video-plan', token, planForm);
	assert.ok(planned.plan?.hook, 'Plan must include a hook');
	assert.ok(Array.isArray(planned.plan?.scenes) && planned.plan.scenes.length, 'Plan must include scenes');
	assert.ok(Array.isArray(planned.plan?.dialogueLines), 'Plan must include editable dialogue lines');
	assert.ok(planned.analysis && typeof planned.analysis === 'object', 'Plan must include reference analysis');

	const startForm = new FormData();
	fillCommon(startForm);
	startForm.set('model', 'gemini-omni-flash-preview');
	startForm.set('videoPlan', JSON.stringify(planned.plan));
	console.log(`e2e: dialogue lines=${planned.plan.dialogueLines.length}; starting one paid 4-second generation`);
	const started = await postForm('/api/creativos/video-start', token, startForm);
	jobId = started.job?.id;
	assert.ok(jobId, 'Video start must persist a job');
	assert.equal(started.creditCost, 4);

	const deadline = Date.now() + 15 * 60_000;
	let lastStatus = '';
	let result;
	while (Date.now() < deadline) {
		const response = await fetch(`${baseUrl}/api/creativos/video-status?id=${encodeURIComponent(jobId)}`, { headers: authHeaders(token) });
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(`video-status (${response.status}): ${payload.error || JSON.stringify(payload)}`);
		const current = `${payload.status}:${payload.progress || 0}`;
		if (current !== lastStatus) console.log(`e2e: ${current}`);
		lastStatus = current;
		if (payload.status === 'failed') throw new Error(payload.error || 'Paid generation failed');
		if (payload.videoUrl) { result = payload; break; }
		await new Promise((resolve) => setTimeout(resolve, 12_000));
	}
	assert.ok(result?.videoUrl, 'Generated video must complete within 15 minutes');
	const generatedResponse = await fetch(result.videoUrl);
	assert.equal(generatedResponse.ok, true, 'Signed generated video URL must download');
	const generated = Buffer.from(await generatedResponse.arrayBuffer());
	assert.ok(generated.length > 10_000, 'Generated MP4 must contain video data');
	assert.equal(await verifyVideoBuffer(generated, { requireAudio: true }), true);
	if (process.env.CREATTIA_TEST_OUTPUT) {
		await mkdir(dirname(process.env.CREATTIA_TEST_OUTPUT), { recursive: true });
		await writeFile(process.env.CREATTIA_TEST_OUTPUT, generated);
		console.log(`e2e: saved preview to ${process.env.CREATTIA_TEST_OUTPUT}`);
	}

	const stored = await admin.from('creative_video_generations').select('status,progress,output_path,settings_snapshot').eq('id', jobId).single();
	if (stored.error) throw stored.error;
	assert.equal(stored.data.status, 'completed');
	assert.equal(stored.data.progress, 100);
	assert.equal(stored.data.settings_snapshot?.segmentJobs?.length, 1);
	outputPath = stored.data.output_path;
	console.log(`e2e: PASS; final MP4 verified (${generated.length} bytes)`);
} finally {
	if (outputPath) await admin.storage.from('creative-video-outputs').remove([outputPath]).catch(() => undefined);
	if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
	console.log('e2e: temporary user, row and output cleaned up');
}
