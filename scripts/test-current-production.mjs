import { createClient } from '@supabase/supabase-js';

const APP = 'https://www.creattia.app';
const PRODUCT_URL = 'https://dege.com.ar/productos/rack-de-tv-movil-ch31-16zw5/';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE_KEY) {
	throw new Error('Faltan las variables locales de Supabase para ejecutar la prueba.');
}

const stamp = Date.now();
const email = `codex-production-check-${stamp}@example.com`;
const password = `Creattia-${stamp}-Test!`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
let userId = '';
let accessToken = '';
let subscriptionCreated = false;
let batchId = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, init = {}) {
	const response = await fetch(`${APP}${path}`, {
		...init,
		headers: {
			...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
			...(init.headers || {}),
		},
	});
	const text = await response.text();
	let payload = {};
	try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text.slice(0, 300) }; }
	return { response, payload };
}

async function waitForProfile() {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const result = await admin.from('creative_profiles').select('user_id,credits_remaining').eq('user_id', userId).maybeSingle();
		if (result.data) return result.data;
		await sleep(500);
	}
	throw new Error('El perfil de prueba no fue creado por el trigger.');
}

async function cleanup() {
	if (!userId) return;
	if (subscriptionCreated && accessToken) {
		await api('/api/creativos/subscribe', { method: 'DELETE' }).catch(() => null);
	}

	const generationRows = await admin.from('creative_generations').select('output_path').eq('user_id', userId);
	const productRows = await admin.from('creative_product_images').select('storage_path').eq('user_id', userId);
	const productMainRows = await admin.from('creative_products').select('image_path').eq('user_id', userId);
	const paths = [...new Set([
		...(generationRows.data || []).map((row) => row.output_path),
		...(productRows.data || []).map((row) => row.storage_path),
		...(productMainRows.data || []).map((row) => row.image_path),
	].filter(Boolean))];
	if (paths.length) await admin.storage.from('creative-assets').remove(paths);
	await admin.auth.admin.deleteUser(userId);
}

try {
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error || !created.data.user) throw created.error || new Error('No se pudo crear el usuario de prueba.');
	userId = created.data.user.id;
	const profile = await waitForProfile();
	if (Number(profile.credits_remaining) < 1) throw new Error('La cuenta nueva no recibió su crédito gratuito.');

	const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});
	const auth = await login.json();
	if (!login.ok || !auth.access_token) throw new Error(`Login falló (${login.status}).`);
	accessToken = auth.access_token;
	console.log('AUTH_OK');

	const pricing = await api('/api/creativos/buy-credits');
	if (!pricing.response.ok) throw new Error(`Configuración de créditos falló (${pricing.response.status}).`);
	if (pricing.payload.unitPrice !== 0.3 || pricing.payload.maxCredits !== 1000 || !pricing.payload.configured) {
		throw new Error(`Configuración de créditos inesperada: ${JSON.stringify(pricing.payload)}`);
	}
	console.log('CREDITS_CONFIG_OK unit=0.30 max=1000');

	const creditCheckout = await api('/api/creativos/buy-credits', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ quantity: 7 }),
	});
	if (!creditCheckout.response.ok || !/^https:\/\//.test(String(creditCheckout.payload.checkoutUrl || ''))) {
		throw new Error(`Checkout de créditos falló (${creditCheckout.response.status}): ${JSON.stringify(creditCheckout.payload)}`);
	}
	console.log('CREDITS_CHECKOUT_OK quantity=7 total=2.10');

	const subscription = await api('/api/creativos/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ planCode: 'creator', billingCycle: 'monthly' }),
	});
	if (!subscription.response.ok || !/^https:\/\//.test(String(subscription.payload.checkoutUrl || ''))) {
		throw new Error(`Checkout mensual falló (${subscription.response.status}): ${JSON.stringify(subscription.payload)}`);
	}
	subscriptionCreated = true;
	console.log('SUBSCRIPTION_CHECKOUT_OK');

	const imported = await api('/api/creativos/products', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url: PRODUCT_URL }),
	});
	if (imported.response.status === 403) throw new Error('La importación todavía respondió 403.');
	if (!imported.response.ok || !imported.payload.importedIds?.[0]) {
		throw new Error(`Importación falló (${imported.response.status}): ${JSON.stringify(imported.payload).slice(0, 500)}`);
	}
	const productId = imported.payload.importedIds[0];
	const importedProduct = imported.payload.products?.[0];
	const imageCount = Array.isArray(importedProduct?.media) ? importedProduct.media.filter((item) => item.type !== 'video').length : 0;
	if (imageCount < 2) throw new Error(`La URL importó solo ${imageCount} imagen(es) del producto.`);
	console.log(`PRODUCT_IMPORT_OK status=${imported.response.status} images=${imageCount}`);

	const form = new FormData();
	form.set('templateId', '40');
	form.set('templateName', 'Anuncio ganador de prueba');
	form.set('format', 'square');
	form.set('imageType', 'promotion');
	form.set('referencePath', '40/1b76d7e89d46ac25.webp');
	form.set('fidelity', '1');
	form.set('preset', 'Fiel al ganador');
	form.set('count', '1');
	form.set('quality', 'flash');
	form.set('language', 'es');
	form.set('brandSource', 'url');
	form.set('colorMode', 'url');
	form.set('typoMode', 'url');
	form.set('includeLogo', '1');
	form.set('productIds', productId);
	form.set('brief', 'Crear un anuncio claro y profesional del rack móvil, respetando exactamente el producto importado.');

	const generated = await api('/api/creativos/generate', { method: 'POST', body: form });
	if (generated.response.status !== 202 || !generated.payload.batchId) {
		throw new Error(`Inicio de generación falló (${generated.response.status}): ${JSON.stringify(generated.payload).slice(0, 500)}`);
	}
	batchId = generated.payload.batchId;
	console.log('GENERATION_ACCEPTED');

	let completed = null;
	for (let attempt = 0; attempt < 60; attempt += 1) {
		await sleep(5_000);
		const result = await admin.from('creative_generations')
			.select('id,status,error_code,output_path').eq('user_id', userId).eq('batch_id', batchId);
		const row = result.data?.[0];
		if (!row || row.status === 'processing') continue;
		if (row.status === 'failed') throw new Error(`Generación falló: ${row.error_code || 'sin código'}`);
		completed = row;
		break;
	}
	if (!completed?.output_path) throw new Error('La generación no terminó dentro de 5 minutos.');
	const image = await admin.storage.from('creative-assets').download(completed.output_path);
	if (image.error || !image.data || image.data.size < 10_000) throw new Error('La imagen final no se pudo descargar o está vacía.');
	console.log(`GENERATION_COMPLETED bytes=${image.data.size}`);

	const cancellation = await api('/api/creativos/subscribe', { method: 'DELETE' });
	if (!cancellation.response.ok || cancellation.payload.status !== 'cancelled') {
		throw new Error(`Limpieza de suscripción falló (${cancellation.response.status}).`);
	}
	subscriptionCreated = false;
	console.log('SUBSCRIPTION_CLEANUP_OK');
	console.log('PRODUCTION_E2E_OK');
} finally {
	await cleanup();
	console.log('TEST_DATA_CLEANED');
}
