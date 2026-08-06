/**
 * Diagnóstico de la generación de imágenes.
 *
 * Responde "¿por qué no puedo generar?" probando de verdad cada pieza contra la
 * configuración real, en el mismo orden en que las usa la app. No imprime
 * ninguna credencial.
 *
 *   node --env-file=.env scripts/diagnose-generation.mjs
 *
 * Sale con código 1 si algo que la generación necesita está roto.
 */
import { createClient } from '@supabase/supabase-js';

const checks = [];
const record = (name, ok, detail = '') => {
	checks.push({ name, ok, detail });
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const env = (name) => process.env[name] || '';

console.log('\nCreattia · diagnóstico de generación\n');

// ── 1. Variables ─────────────────────────────────────────────────────────────
const supabaseUrl = env('PUBLIC_SUPABASE_URL');
const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
const openAIKey = env('OPENAI_API_KEY');
const googleKey = env('GOOGLE_AI_API_KEY');

record('PUBLIC_SUPABASE_URL', Boolean(supabaseUrl));
record('SUPABASE_SERVICE_ROLE_KEY', Boolean(serviceRoleKey));
record('Al menos un motor de imagen', Boolean(openAIKey || googleKey),
	openAIKey && googleKey ? 'OpenAI + Gemini' : openAIKey ? 'solo OpenAI' : googleKey ? 'solo Gemini' : 'ninguno configurado');

if (!supabaseUrl || !serviceRoleKey) {
	console.log('\nSin Supabase no se puede seguir.\n');
	process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

// ── 2. Funciones de base que usa cada generación ─────────────────────────────
// Se llaman con un usuario que no existe: interesa si la función ESTÁ, no su
// resultado. Un 42883/PGRST202 significa migración sin aplicar.
const NOBODY = '00000000-0000-4000-8000-000000000000';
const rpcs = [
	['reserve_creative_credits', { p_user_id: NOBODY, p_amount: 1 }, true],
	['refund_creative_credits', { p_user_id: NOBODY, p_amount: 0 }, true],
	['check_rate_limit', { p_user_id: NOBODY, p_event_key: 'diagnostico', p_max_count: 1, p_window_seconds: 60 }, false],
	['add_purchased_credits', { p_user_id: NOBODY, p_amount: 1 }, false],
];
for (const [name, args, required] of rpcs) {
	const { error } = await admin.rpc(name, args);
	const missing = error && (error.code === '42883' || error.code === 'PGRST202'
		|| /could not find the function|does not exist/i.test(error.message || ''));
	if (missing) {
		record(`RPC ${name}`, !required, required
			? 'NO EXISTE — la generación no puede cobrar créditos. Aplicá las migraciones.'
			: 'no existe (aplicá las migraciones; sin ella no hay tope de uso)');
	} else {
		record(`RPC ${name}`, true, 'disponible');
	}
}

// ── 3. Biblioteca de ganadores ───────────────────────────────────────────────
const MANIFEST = 'manifests/starter-static-50.json';
const { data: manifestFile, error: manifestError } = await admin.storage
	.from('creative-references').download(MANIFEST);
let winners = [];
if (manifestError || !manifestFile) {
	record('Manifiesto de ganadores', false, manifestError?.message || 'no se pudo descargar');
} else {
	try {
		const parsed = JSON.parse(await manifestFile.text());
		winners = (Array.isArray(parsed) ? parsed : parsed.items || []).filter((item) => item.imagePath);
		record('Manifiesto de ganadores', winners.length > 0, `${winners.length} referencias`);
	} catch (error) {
		record('Manifiesto de ganadores', false, `JSON inválido: ${error.message}`);
	}
}

if (winners.length) {
	const sample = winners[0].imagePath;
	const { error } = await admin.storage.from('creative-references').download(sample);
	record('Descarga de una referencia', !error, error ? error.message : sample);
}

// ── 4. Motores de imagen ─────────────────────────────────────────────────────
// Una imagen mínima real: es la única forma de saber si la clave, el modelo y
// la cuota están bien. Cuesta centavos.
const prompt = 'A plain flat light grey square. No text.';

if (openAIKey) {
	const model = env('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
	try {
		const response = await fetch('https://api.openai.com/v1/images/generations', {
			method: 'POST',
			headers: { authorization: `Bearer ${openAIKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'low', n: 1 }),
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			record(`OpenAI (${model})`, false, `${response.status}: ${(payload.error?.message || '').slice(0, 160)}`);
		} else {
			record(`OpenAI (${model})`, Boolean(payload.data?.[0]?.b64_json || payload.data?.[0]?.url), 'genera imágenes');
		}
	} catch (error) {
		record(`OpenAI (${model})`, false, error.message);
	}
}

if (googleKey) {
	const model = env('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image';
	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
				}),
			},
		);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			record(`Gemini (${model})`, false, `${response.status}: ${JSON.stringify(payload.error || {}).slice(0, 160)}`);
		} else {
			const part = payload.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data || item.inline_data?.data);
			record(`Gemini (${model})`, Boolean(part), part ? 'genera imágenes' : `sin imagen (${payload.candidates?.[0]?.finishReason || 'sin candidatos'})`);
		}
	} catch (error) {
		record(`Gemini (${model})`, false, error.message);
	}
}

// ── 5. Últimas generaciones fallidas ─────────────────────────────────────────
// Si la app ya falló, el motivo real quedó guardado acá.
const { data: failures } = await admin.from('creative_generations')
	.select('id,created_at,error_code')
	.eq('status', 'failed')
	.order('created_at', { ascending: false })
	.limit(5);

if (failures?.length) {
	console.log('\nÚltimas generaciones fallidas (el motivo real):');
	for (const row of failures) {
		console.log(`  · ${row.created_at?.slice(0, 19)} — ${row.error_code || 'sin detalle'}`);
	}
}

const broken = checks.filter((check) => !check.ok);
console.log(`\n${checks.length - broken.length}/${checks.length} comprobaciones OK.`);
if (broken.length) {
	console.log('\nHay que resolver:');
	for (const check of broken) console.log(`  ✗ ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
	process.exit(1);
}
console.log('La generación tiene todo lo que necesita.\n');
