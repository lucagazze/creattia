/**
 * Full production test for creattia.vercel.app
 * Tests: pages, Supabase, Fal.ai generation, URL product scanning
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://creattia.vercel.app';
const EMAIL = process.env.TEST_EMAIL || 'lucagazze1@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Lucagazze2000-';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FAL_KEY = process.env.FAL_KEY;

const results = [];
const screenshots = [];
const SHOTS_DIR = '/tmp/creattia-test-screenshots';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

function ok(name, detail = '') {
  results.push({ pass: true, name, detail });
  console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail = '') {
  results.push({ pass: false, name, detail });
  console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`);
}

function skip(name, detail = '') {
  console.log(`⏭️  ${name}${detail ? ' — ' + detail : ''}`);
}

async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push({ name, file });
  console.log(`   📸 ${name}: ${file}`);
}

// ─── 1. PAGES & API ──────────────────────────────────────────────────────────
console.log('\n══ 1. Pages & API ══');

const homeRes = await fetch(`${BASE_URL}/`);
homeRes.ok ? ok('Homepage', `HTTP ${homeRes.status}`) : fail('Homepage', `HTTP ${homeRes.status}`);

const appRes = await fetch(`${BASE_URL}/app`, { redirect: 'follow' });
appRes.ok ? ok('/app page', `HTTP ${appRes.status}`) : fail('/app page', `HTTP ${appRes.status}`);

const unauthedRes = await fetch(`${BASE_URL}/api/creativos/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'test' }),
});
unauthedRes.status === 401 ? ok('API /generate sin sesión → 401', 'correcto') : fail('API /generate sin sesión', `HTTP ${unauthedRes.status}`);

// ─── 2. SUPABASE ──────────────────────────────────────────────────────────────
console.log('\n══ 2. Supabase ══');

if (!SUPABASE_URL || !SERVICE_KEY) {
  fail('Config Supabase', 'faltan variables');
} else {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: PUBLISHABLE_KEY } });
    const d = await r.json().catch(() => ({}));
    r.ok ? ok('Auth activo', `email=${!!d.external?.email} google=${!!d.external?.google}`) : fail('Auth', `HTTP ${r.status}`);
  } catch (e) { fail('Auth', e.message); }

  const { data: buckets, error: bErr } = await admin.storage.listBuckets();
  if (bErr) { fail('Storage', bErr.message); }
  else {
    const refs = buckets.find(b => b.id === 'creative-references');
    const assets = buckets.find(b => b.id === 'creative-assets');
    refs?.public ? ok('Bucket creative-references', 'público') : fail('Bucket creative-references', refs ? `public=${refs.public}` : 'ausente');
    assets ? ok('Bucket creative-assets', `public=${assets.public}`) : fail('Bucket creative-assets', 'ausente');
  }

  try {
    const mUrl = `${SUPABASE_URL}/storage/v1/object/public/creative-references/manifests/starter-static-50.json`;
    const mRes = await fetch(mUrl);
    const manifest = await mRes.json().catch(() => ({}));
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    mRes.ok && items.length > 0 ? ok('Manifest de referencias', `${items.length} creativos`) : fail('Manifest', mRes.ok ? 'vacío' : `HTTP ${mRes.status}`);
    for (const idx of [0, Math.floor(items.length / 2), items.length - 1]) {
      const item = items[idx];
      if (!item?.imagePath) continue;
      const ir = await fetch(`${SUPABASE_URL}/storage/v1/object/public/creative-references/${item.imagePath}`);
      ir.ok ? ok(`Imagen #${idx + 1}`, ir.headers.get('content-type') || 'ok') : fail(`Imagen #${idx + 1}`, `HTTP ${ir.status}`);
    }
  } catch (e) { fail('Manifest/imágenes', e.message); }
}

// ─── 3. FAL.AI KEY ─────────────────────────────────────────────────────────
console.log('\n══ 3. Fal.ai (Flux) ══');

if (!FAL_KEY) {
  fail('Fal.ai API Key', 'falta FAL_KEY');
} else {
  try {
    // Test Fal.ai key by calling the models/list or a simple health endpoint
    const testRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a simple red square on white background for testing',
        num_images: 1,
        width: 256,
        height: 256,
        output_format: 'png',
      }),
    });
    if (testRes.ok) {
      const data = await testRes.json();
      const imgUrl = data?.images?.[0]?.url;
      ok('Fal.ai Flux Schnell genera imagen ✨', imgUrl ? `imageUrl: ${imgUrl.slice(0, 60)}...` : 'ok (sin url)');
    } else {
      const errText = await testRes.text().catch(() => '');
      fail('Fal.ai API', `HTTP ${testRes.status} — ${errText.slice(0, 150)}`);
    }
  } catch (e) { fail('Fal.ai API', e.message); }
}

// ─── 4. AUTH + AUTHENTICATED API ─────────────────────────────────────────────
console.log('\n══ 4. Autenticación + API con sesión real ══');

let accessToken = null;

if (SUPABASE_URL && PUBLISHABLE_KEY) {
  try {
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (loginRes.ok && loginData.access_token) {
      accessToken = loginData.access_token;
      ok('Login con email/password', `usuario: ${loginData.user?.email}`);
    } else {
      const errMsg = loginData.error_description || loginData.message || loginData.error || `HTTP ${loginRes.status}`;
      skip('Login email/password', errMsg);
      if (SERVICE_KEY) {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: users } = await admin.auth.admin.listUsers({ perPage: 5 });
        if (users?.users?.length > 0) {
          const testUser = users.users.find(u => u.email === EMAIL) || users.users[0];
          if (testUser) {
            const { data: session, error: sessErr } = await admin.auth.admin.createSession({ userId: testUser.id });
            if (!sessErr && session?.access_token) {
              accessToken = session.access_token;
              ok('Sesión admin creada', `user: ${testUser.email}`);
            }
          }
        }
      }
    }
  } catch (e) { fail('Login Supabase', e.message); }
}

const browserHeaders = {
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/app`,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'es-AR,es;q=0.9',
};

if (accessToken) {
  console.log('\n── API autenticada ──');

  // Test: generate image via Creattia API (should now use Flux)
  try {
    const form = new FormData();
    form.append('templateId', '1');
    form.append('templateName', 'Anuncio de prueba');
    form.append('imageType', 'promotion');
    form.append('format', 'square');
    form.append('preset', 'Fiel al ganador');
    form.append('brief', 'Test de producción — imagen de promoción de marca genérica');
    form.append('count', '1');

    const genRes = await fetch(`${BASE_URL}/api/creativos/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, ...browserHeaders },
      body: form,
    });

    const rawText = await genRes.text();
    let genData = {};
    try { genData = JSON.parse(rawText); } catch {}
    const detail = genData.detail || genData.error || rawText.slice(0, 300);

    if (genRes.ok && genData.imageUrl) {
      ok('Generación de imagen vía Creattia API ✨', `imageUrl: ${String(genData.imageUrl).slice(0, 80)}...`);
    } else {
      console.log(`   ℹ️  Detalle del error: ${detail}`);
      fail('API /generate', `HTTP ${genRes.status} — ${genData.error || detail}`);
    }
  } catch (e) { fail('API /generate', e.message); }

  // Test: URL product scanning with a real Argentine e-commerce product page
  console.log('\n── Scanning de URL de producto ──');
  try {
    const testProductUrl = 'https://www.samsung.com/ar/smartphones/galaxy-s/';
    const scanRes = await fetch(`${BASE_URL}/api/creativos/products`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...browserHeaders,
      },
      body: JSON.stringify({ url: testProductUrl }),
    });
    const scanData = await scanRes.json().catch(() => ({}));

    if ((scanRes.ok || scanRes.status === 201) && scanData.importedIds?.length) {
      ok('Scanning de URL de producto ✨', `importó ${scanData.importedIds.length} producto(s) — ID: ${scanData.importedIds[0]}`);
    } else if (scanRes.status === 422) {
      fail('Scanning de URL', `422 — no encontró datos: ${JSON.stringify(scanData.errors || scanData)}`);
    } else {
      fail('Scanning de URL', `HTTP ${scanRes.status} — ${JSON.stringify(scanData).slice(0, 200)}`);
    }
  } catch (e) { fail('Scanning de URL', e.message); }

} else {
  skip('API autenticada', 'sin token disponible');
}

// ─── 5. BROWSER ──────────────────────────────────────────────────────────────
console.log('\n══ 5. Browser: UI visual ══');

let browser, page;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, 'homepage');
  ok('Homepage renderiza', await page.title());

  await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, 'app-login');
  const loginVisible = await page.locator('text=Continuar con Google').isVisible({ timeout: 5000 }).catch(() => false);
  const emailVisible = await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
  loginVisible || emailVisible ? ok('Pantalla de login visible', 'muestra formulario') : fail('Pantalla login', 'no se encontró formulario');

} catch (e) {
  fail('Browser', e.message);
  if (page) await shot(page, 'error').catch(() => {});
} finally {
  if (browser) await browser.close();
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;

console.log(`\n🏁 RESULTADO FINAL: ${passed}✅ / ${failed}❌ de ${results.length} checks\n`);

if (failed > 0) {
  console.log('❌ Problemas encontrados:');
  results.filter(r => !r.pass).forEach(r => console.log(`   • ${r.name}: ${r.detail}`));
}

console.log('\n📸 Screenshots en: /tmp/creattia-test-screenshots/');
screenshots.forEach(s => console.log(`   ${s.name}: ${s.file}`));

process.exitCode = failed > 0 ? 1 : 0;
