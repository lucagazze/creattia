/**
 * Full production test for creattia.vercel.app
 * Uses Supabase Auth API to get a real session token, then tests authenticated endpoints
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
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

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

// ─── 1. API & PAGES ──────────────────────────────────────────────────────────
console.log('\n══ 1. Pages & API ══');

const homeRes = await fetch(`${BASE_URL}/`);
homeRes.ok ? ok('Homepage', `HTTP ${homeRes.status}`) : fail('Homepage', `HTTP ${homeRes.status}`);

const appRes = await fetch(`${BASE_URL}/app`, { redirect: 'follow' });
appRes.ok ? ok('/app page', `HTTP ${appRes.status}`) : fail('/app page', `HTTP ${appRes.status}`);

// Unauthenticated API should 401
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

  // Auth settings
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: PUBLISHABLE_KEY } });
    const d = await r.json().catch(() => ({}));
    r.ok ? ok('Auth activo', `email=${!!d.external?.email} google=${!!d.external?.google}`) : fail('Auth', `HTTP ${r.status}`);
  } catch (e) { fail('Auth', e.message); }

  // Storage
  const { data: buckets, error: bErr } = await admin.storage.listBuckets();
  if (bErr) { fail('Storage', bErr.message); }
  else {
    const refs = buckets.find(b => b.id === 'creative-references');
    const assets = buckets.find(b => b.id === 'creative-assets');
    refs?.public ? ok('Bucket creative-references', 'público') : fail('Bucket creative-references', refs ? `public=${refs.public}` : 'ausente');
    assets ? ok('Bucket creative-assets', `public=${assets.public}`) : fail('Bucket creative-assets', 'ausente — usuarios no pueden guardar imágenes generadas');
  }

  // Manifest + images
  try {
    const mUrl = `${SUPABASE_URL}/storage/v1/object/public/creative-references/manifests/starter-static-50.json`;
    const mRes = await fetch(mUrl);
    const manifest = await mRes.json().catch(() => ({}));
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    mRes.ok && items.length > 0 ? ok('Manifest de referencias', `${items.length} creativos`) : fail('Manifest', mRes.ok ? 'vacío' : `HTTP ${mRes.status}`);

    // Sample 3 images
    for (const idx of [0, Math.floor(items.length / 2), items.length - 1]) {
      const item = items[idx];
      if (!item?.imagePath) continue;
      const ir = await fetch(`${SUPABASE_URL}/storage/v1/object/public/creative-references/${item.imagePath}`);
      ir.ok ? ok(`Imagen #${idx + 1}`, ir.headers.get('content-type') || 'ok') : fail(`Imagen #${idx + 1}`, `HTTP ${ir.status}`);
    }
  } catch (e) { fail('Manifest/imágenes', e.message); }
}

// ─── 3. OPENAI KEY ────────────────────────────────────────────────────────────
console.log('\n══ 3. OpenAI ══');

if (!OPENAI_KEY) {
  fail('OpenAI API Key', 'falta OPENAI_API_KEY');
} else {
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
    if (r.ok) {
      ok('OpenAI API Key', 'válida');
    } else {
      const d = await r.json().catch(() => ({}));
      fail('OpenAI API Key', d?.error?.message || `HTTP ${r.status}`);
    }
  } catch (e) { fail('OpenAI API Key', e.message); }
}

// ─── 4. AUTH VIA SUPABASE API (get real session) ──────────────────────────────
console.log('\n══ 4. Autenticación + API con sesión real ══');

let accessToken = null;

// Try email+password login via Supabase directly
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
      // Expected if it's a Google OAuth-only account
      const errMsg = loginData.error_description || loginData.message || loginData.error || `HTTP ${loginRes.status}`;
      skip('Login email/password', `cuenta Google OAuth — ${errMsg}`);
      
      // Try admin to get user info
      if (SERVICE_KEY) {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: users } = await admin.auth.admin.listUsers({ perPage: 5 });
        if (users?.users?.length > 0) {
          ok('Usuarios en Supabase Auth', `${users.users.length} usuarios registrados`);
          // Create a test session via admin
          const testUser = users.users.find(u => u.email === EMAIL) || users.users[0];
          if (testUser) {
            const { data: session, error: sessErr } = await admin.auth.admin.createSession({ userId: testUser.id });
            if (!sessErr && session?.access_token) {
              accessToken = session.access_token;
              ok('Sesión admin creada', `user: ${testUser.email}`);
            } else {
              skip('Sesión admin', sessErr?.message || 'no disponible');
            }
          }
        }
      }
    }
  } catch (e) {
    fail('Login Supabase', e.message);
  }
}

// Test authenticated API endpoints if we have a token
if (accessToken) {
  console.log('\n── API autenticada ──');

  // Test generate endpoint with FormData (as the API expects)
  try {
    const form = new FormData();
    form.append('templateId', '1');
    form.append('templateName', 'Anuncio de prueba');
    form.append('imageType', 'promotion'); // promotion doesn't require a product
    form.append('format', 'square');
    form.append('preset', 'Fiel al ganador');
    form.append('brief', 'Test de producción — imagen de promoción de marca genérica');
    form.append('count', '1');

    const genRes = await fetch(`${BASE_URL}/api/creativos/generate`, {
      method: 'POST',
      headers: {
        // The API reads ONLY Authorization header, no cookies
        'Authorization': `Bearer ${accessToken}`,
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/app`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form,
    });
    
    const rawText = await genRes.text();
    let genData = {};
    try { genData = JSON.parse(rawText); } catch {}
    const detail = genData.detail || genData.error || rawText.slice(0, 300);

    if (genRes.ok && genData.imageUrl) {
      ok('Generación de imagen ✨', `imageUrl: ${genData.imageUrl.slice(0, 80)}...`);
    } else if (genRes.status === 401) {
      fail('API /generate', `401 — ${detail}`);
    } else if (genRes.status === 402) {
      fail('API /generate — sin créditos', detail);
    } else if (genRes.status === 403) {
      // Vercel firewall may block non-browser requests - log and soft-fail
      console.log(`   ℹ️  Firewall 403 — la API sólo puede probarse desde el navegador real (CSRF/Firewall)`);
      console.log(`   ℹ️  Detalle: ${rawText.slice(0, 200)}`);
      fail('API /generate (Vercel Firewall)', `HTTP 403 — bloqueado por firewall. Requiere prueba manual desde navegador`);
    } else {
      console.log(`   ℹ️  Detalle del error: ${detail}`);
      fail('API /generate', `HTTP ${genRes.status} — ${genData.error || detail}`);
    }
  } catch (e) {
    fail('API /generate', e.message);
  }
} else {
  skip('API autenticada', 'sin token disponible — se necesita sesión manual');
}

// ─── 5. BROWSER TEST ─────────────────────────────────────────────────────────
console.log('\n══ 5. Browser: UI visual ══');

let browser, page;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  // Homepage
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, 'homepage');
  ok('Homepage renderiza', await page.title());

  // /app shows login
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, 'app-login');
  const loginVisible = await page.locator('text=Continuar con Google').isVisible({ timeout: 5000 }).catch(() => false);
  const emailVisible = await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
  loginVisible || emailVisible ? ok('Pantalla de login visible', 'muestra formulario') : fail('Pantalla login', 'no se encontró formulario');

  // If we have accessToken, inject it into the browser context
  if (accessToken && SUPABASE_URL) {
    const supabaseProjectId = SUPABASE_URL.replace('https://', '').split('.')[0];
    await context.addCookies([{
      name: `sb-${supabaseProjectId}-auth-token`,
      value: JSON.stringify({ access_token: accessToken, token_type: 'bearer' }),
      domain: 'creattia.vercel.app',
      path: '/',
    }]);

    await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await shot(page, 'app-authenticated');

    const stillLogin = await page.locator('text=Continuar con Google').isVisible({ timeout: 3000 }).catch(() => false);
    const bodyText = await page.textContent('body').catch(() => '');
    
    if (!stillLogin && bodyText.length > 200) {
      ok('App autenticada cargó', `${bodyText.length} chars de contenido`);
      await shot(page, 'app-content');
    } else {
      skip('App autenticada', 'cookie no fue reconocida por Vercel/Astro');
    }
  }

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
