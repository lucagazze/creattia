import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const results = [];

function record(name, ok, detail = '') {
	results.push({ name, ok, detail });
}

function configured(name) {
	return Boolean(String(process.env[name] || '').trim());
}

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
	console.error('Faltan las variables de Supabase. Revisá .env sin compartir sus valores.');
	process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

try {
	const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } });
	const payload = await response.json().catch(() => ({}));
	record('Supabase Auth', response.ok, response.ok ? `email ${payload.external?.email ? 'activo' : 'inactivo'} · Google ${payload.external?.google ? 'activo' : 'inactivo'}` : `HTTP ${response.status}`);
} catch (error) {
	record('Supabase Auth', false, error instanceof Error ? error.message : 'sin respuesta');
}

for (const [table, expected] of [['creative_templates', 50], ['creative_references', 50]]) {
	const probe = await admin.from(table).select('id').limit(1);
	if (probe.error) {
		record(table, false, probe.error.message);
		continue;
	}
	const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true });
	record(table, !error && Number(count) >= expected, error?.message || `${count || 0} filas`);
}

const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
if (bucketError) {
	record('Storage', false, bucketError.message);
} else {
	const assets = buckets.find((bucket) => bucket.id === 'creative-assets');
	const references = buckets.find((bucket) => bucket.id === 'creative-references');
	record('Storage privado de usuarios', Boolean(assets && !assets.public), assets ? `public=${assets.public}` : 'bucket ausente');
	record('Storage editorial', Boolean(references?.public), references ? `public=${references.public}` : 'bucket ausente');
}

try {
	const manifestUrl = `${supabaseUrl}/storage/v1/object/public/creative-references/manifests/starter-static-50.json`;
	const response = await fetch(manifestUrl);
	const manifest = await response.json().catch(() => ({}));
	const items = Array.isArray(manifest.items) ? manifest.items : [];
	const staticOnly = items.every((item) => item.metadata?.mediaType === 'static_image');
	record('Biblioteca de referencias', response.ok && items.length === 50 && staticOnly, `${items.length} imágenes estáticas`);
	for (const index of [0, 24, 49]) {
		const item = items[index];
		if (!item?.imagePath) continue;
		const image = await fetch(`${supabaseUrl}/storage/v1/object/public/creative-references/${item.imagePath}`);
		record(`Referencia ${index + 1}`, image.ok, image.ok ? image.headers.get('content-type') || 'imagen' : `HTTP ${image.status}`);
	}
} catch (error) {
	record('Biblioteca de referencias', false, error instanceof Error ? error.message : 'sin respuesta');
}

record('Generación con OpenAI', configured('OPENAI_API_KEY'), configured('OPENAI_API_KEY') ? `modelo ${process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'}` : 'falta OPENAI_API_KEY');
const billingVariables = ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_PLAN_CREATOR_ID', 'MERCADO_PAGO_PLAN_PRO_ID', 'MERCADO_PAGO_PLAN_SCALE_ID', 'MERCADO_PAGO_WEBHOOK_SECRET'];
const missingBilling = billingVariables.filter((name) => !configured(name));
record('Suscripciones con Mercado Pago', missingBilling.length === 0, missingBilling.length ? `faltan ${missingBilling.join(', ')}` : 'configurado');

for (const result of results) console.log(`${result.ok ? 'OK' : 'FALTA'} · ${result.name}${result.detail ? ` · ${result.detail}` : ''}`);
const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} verificaciones correctas.`);
if (failures.length) process.exitCode = 1;
