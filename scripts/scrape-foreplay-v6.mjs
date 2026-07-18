/**
 * scrape-foreplay-v6.mjs — Estáticos ganadores por nicho.
 * Filtros: solo imágenes (orFormat[]=image) · corriendo +30 días (runTimeMin=31) · por nicho (orNiche[]=X).
 * Trae los N con más días activos por nicho (los más probados), los sube a Supabase + DB + manifest.
 *
 * Uso: node --env-file=.env.local scripts/scrape-foreplay-v6.mjs
 */
import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';
const PER_NICHE = Number(process.env.FP_PER || 30);
const POOL_PER_NICHE = Number(process.env.FP_POOL || 80); // candidatos antes de quedarnos con los mejores
const RUNTIME_MIN = Number(process.env.FP_RUNTIME || 31); // días mínimos corriendo
const IMAGES_DIR = resolve('./public/scraped_ads/images');
const MANIFEST_PATH = resolve('./public/scraped_ads/manifest.json');

// Nichos DTC relevantes (nombres exactos de Foreplay). Se puede editar esta lista.
const ALL_NICHES = [
  'Beauty', 'Health/Wellness', 'Fashion', 'Food/Drink', 'Home/Garden',
  'Sports/Outdoors', 'Pets', 'Accessories', 'Jewelry/Watches', 'Kids/Baby',
  'Tech', 'Automotive', 'Travel', 'Finance', 'Education',
  'App/Software', 'Medical', 'Service Business', 'Business/Professional', 'Real Estate',
];
const NICHES = process.env.FP_NICHES ? process.env.FP_NICHES.split(',') : ALL_NICHES;

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = (supabaseUrl && serviceRoleKey)
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
if (!admin) { console.log('⚠️ Sin credenciales Supabase — abortando.'); process.exit(1); }

const CATEGORY_TEMPLATE = { hero: 40, caracteristicas: 40, precio: 13, resenas: 1, mitos: 40, urgencia: 15, envio: 18, competencia: 23, garantia: 21 };

const hashUrl = (u) => crypto.createHash('md5').update(u).digest('hex').slice(0, 16);

// Clasifica el estilo del anuncio por el texto (para la categoría de la app)
function classifyStyle(item) {
  const t = `${item.description || ''} ${item.name || ''} ${item.link_text || ''}`.toLowerCase();
  if (/\bvs\b|versus|better than|compared to|instead of/.test(t)) return 'competencia';
  if (/review|testimonial|customer|clients?|\bsays\b|loved?|obsessed|⭐|★|rated|"[^"]{6,}"/.test(t)) return 'resenas';
  if (/myth|truth|\bfact|did you know|stop believing/.test(t)) return 'mitos';
  if (/limited|hurry|expires?|last chance|today only|ends? (soon|tonight)|selling out|almost gone/.test(t)) return 'urgencia';
  if (/free shipping|envío gratis|envio gratis|free delivery/.test(t)) return 'envio';
  if (/guarantee|warranty|money[- ]?back|refund|risk[- ]?free|\b\d+[- ]day/.test(t)) return 'garantia';
  if (/%|\boff\b|\bsale\b|discount|save \$|\bdeal\b|price|\$\d/.test(t)) return 'precio';
  return 'hero';
}

const toSeconds = (n) => { n = Number(n) || 0; return n > 1e12 ? Math.floor(n / 1000) : n; };
function daysActive(item) {
  const started = toSeconds(item.startedRunning);
  const checked = toSeconds(item.last_checked?._seconds) || Math.floor(Date.now() / 1000);
  if (!started) return 0;
  return Math.max(0, Math.round((checked - started) / 86400));
}

// Score de "ganador de verdad": los guardados en Foreplay (likes) son la señal principal
// de que el anuncio funciona; la antigüedad ayuda pero NO se premia a los eternos feos.
function score(item) {
  const likes = Number(item.likes) || 0;
  const days = item._days;
  const liveBoost = item.live ? 1.15 : 1.0;    // sigue corriendo hoy → mejor
  let lf;                                       // factor de antigüedad (sweet spot 30-400 días)
  if (days < 30) lf = 0.7;
  else if (days <= 400) lf = 1.0;
  else if (days <= 900) lf = 0.9;
  else lf = 0.78;                               // viejísimo: penalización leve, no lo elimina
  return Math.log1p(likes) * lf * liveBoost;
}

function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return Promise.resolve(true);
  return new Promise((res, rej) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://app.foreplay.co/' } }, (r) => {
      if (r.statusCode === 301 || r.statusCode === 302) { file.close(); return r.headers.location ? downloadImage(r.headers.location, destPath).then(res).catch(rej) : rej(new Error('redirect')); }
      if (r.statusCode !== 200) { file.close(); return rej(new Error(`HTTP ${r.statusCode}`)); }
      r.pipe(file); file.on('finish', () => { file.close(); res(true); });
    });
    req.on('error', (e) => { fs.unlink(destPath, () => {}); rej(e); });
    req.setTimeout(20000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}

function apiCall(pathAndQuery, token, retries = 4) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      const req = https.request({
        hostname: 'api.foreplay.co', path: pathAndQuery, method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.foreplay.co', Referer: 'https://app.foreplay.co/discovery' },
      }, (res) => {
        let d = ''; res.on('data', (c) => d += c);
        res.on('end', async () => {
          if (res.statusCode === 429 && left > 0) { const w = (retries - left + 1) * 8000; console.log(`   ⏳ 429, espero ${w / 1000}s`); await new Promise(r => setTimeout(r, w)); return attempt(left - 1); }
          try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, json: null }); }
        });
      });
      req.on('error', () => resolve({ status: 0, json: null }));
      req.setTimeout(25000, () => { req.destroy(); resolve({ status: 0, json: null }); });
      req.end();
    };
    attempt(retries);
  });
}

async function login() {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();
  let token = null;
  page.on('request', (req) => { const a = req.headers()['authorization']; if (a?.startsWith('Bearer ') && req.url().includes('foreplay')) token = a.slice(7); });
  await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.locator('input[placeholder*="email" i]').first().fill(EMAIL);
  await page.locator('input[placeholder*="password" i]').first().fill(PASSWORD);
  await page.locator('button:has-text("Sign In")').first().click().catch(() => page.keyboard.press('Enter'));
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000); // deja que dispare la API con el token
  await browser.close();
  return token;
}

async function fetchNiche(niche, token) {
  const collected = [];
  const seenIds = new Set();
  let cursor = null;
  for (let pageNum = 0; pageNum < 12 && collected.length < POOL_PER_NICHE; pageNum++) {
    const params = new URLSearchParams();
    params.set('runTimeMin', String(RUNTIME_MIN));
    params.append('orFormat[]', 'image');
    params.append('orNiche[]', niche);
    params.set('sort', 'desc');
    params.set('limit', '50');
    if (cursor) params.set('next', JSON.stringify(cursor));
    const { status, json } = await apiCall(`/ads/discovery?${params}`, token);
    if (status !== 200 || !json) { console.log(`   ${niche}: status ${status}, corto`); break; }
    const items = json.results || json.data || (Array.isArray(json) ? json : []);
    if (!items.length) break;
    if (process.env.FP_DEBUG && pageNum < 2) {
      for (const s of items.slice(0, 6)) {
        console.log(`   DBG name=${(s.name||'').slice(0,14)} type=${s.type} live=${s.live} days=${daysActive(s)} likes=${s.likes} same=${s.sameCreativeCount} rel=${Array.isArray(s.relatedAds)?s.relatedAds.length:s.relatedAds}`);
      }
    }
    for (const it of items) {
      if (it.type === 'video' || it.video) continue;       // estáticos: sin video (image + dco sí)
      const url = it.image || it.thumbnail;
      if (!url || !url.startsWith('http') || seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      const withDays = { ...it, _days: daysActive(it), _url: url };
      withDays._score = score(withDays);
      collected.push(withDays);
    }
    const last = items[items.length - 1];
    cursor = [last.createdAt, last.id];
    await new Promise(r => setTimeout(r, 1100));
  }
  collected.sort((a, b) => b._score - a._score);          // mejores primero (likes + escalado)
  return collected;                                        // pool completo ordenado (el main toma los PER_NICHE nuevos)
}

async function main() {
  console.log('=== Foreplay v6 — estáticos ganadores por nicho ===');
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });

  let manifest = { version: 1, collection: 'scraped-ads-library', items: [] };
  // Arranca del manifest de producción (para no perder los 682 existentes)
  try {
    const { data } = await admin.storage.from('creative-references').download('manifests/starter-static-50.json');
    if (data) manifest = JSON.parse(await data.text());
    console.log(`📦 Manifest actual: ${manifest.items.length} anuncios`);
  } catch { console.log('📦 Empiezo de cero'); }
  // Idempotencia: por defecto re-rankea limpio; con FP_KEEP la corrida es ADITIVA (no borra lo previo).
  if (!process.env.FP_KEEP) {
    const beforeDrop = manifest.items.length;
    manifest.items = manifest.items.filter((i) => i.metadata?.batch !== 'foreplay-v6');
    if (beforeDrop !== manifest.items.length) console.log(`   ♻️ quité ${beforeDrop - manifest.items.length} de una corrida previa`);
    await admin.from('creative_references').delete().eq('metadata->>batch', 'foreplay-v6');
  }
  const existingPaths = new Set(manifest.items.map(i => i.imagePath));

  console.log('🔑 Login...');
  const token = await login();
  if (!token) { console.log('❌ Sin token'); return; }
  console.log('   token ok');

  const added = [];
  const perNicheCount = {};
  for (const niche of NICHES) {
    process.stdout.write(`\n🎯 ${niche} ... `);
    const top = await fetchNiche(niche, token);
    process.stdout.write(`${top.length} candidatos (likes: ${top[0]?.likes || 0}→${top[top.length - 1]?.likes || 0} · días: ${top[0]?._days || 0}/${top[top.length - 1]?._days || 0})\n`);
    if (process.env.FP_DRY) { perNicheCount[niche] = 0; continue; }
    let saved = 0;
    for (const ad of top) {
      const category = classifyStyle(ad);
      const templateId = CATEGORY_TEMPLATE[category] || 40;
      const hash = hashUrl(ad._url);
      const ext = ad._url.match(/\.(png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
      const imagePath = `${templateId}/${hash}.${ext}`;
      if (existingPaths.has(imagePath)) continue;

      const subDir = resolve(IMAGES_DIR, String(templateId));
      await fs.promises.mkdir(subDir, { recursive: true });
      const dest = resolve(subDir, `${hash}.${ext}`);
      try { await downloadImage(ad._url, dest); } catch (e) { continue; }
      existingPaths.add(imagePath);

      const bytes = fs.readFileSync(dest);
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const { error: upErr } = await admin.storage.from('creative-references').upload(imagePath, bytes, { contentType: mime, upsert: true });
      if (upErr) { console.log(`   ❌ storage ${ad.name}: ${upErr.message}`); continue; }

      const metadata = { scrapedAt: new Date().toISOString(), source: 'foreplay', batch: 'foreplay-v6', mediaType: 'static_image', foreplayNiches: [niche], daysActive: String(ad._days), likes: Number(ad.likes) || 0, live: !!ad.live, domain: (ad.link_url || '').replace(/^https?:\/\//, '').split('/')[0] };
      const row = {
        template_id: templateId, name: (ad.name || 'Foreplay Ad').slice(0, 180), image_path: imagePath,
        prompt_notes: String(ad.description || '').slice(0, 2000), sort_order: manifest.items.length + added.length + 10,
        is_active: true, source_url: ad._url, source_platform: 'foreplay', rights_status: 'public_domain',
        license_notes: 'Scraped from Foreplay', category_group: 'producto', category_branch: 'presentar',
        category_leaf: category, metadata, updated_at: new Date().toISOString(),
      };
      const { data: existing } = await admin.from('creative_references').select('id').eq('template_id', templateId).eq('image_path', imagePath).maybeSingle();
      const q = existing ? admin.from('creative_references').update(row).eq('id', existing.id) : admin.from('creative_references').insert(row);
      const { error: dbErr } = await q;
      if (dbErr) { console.log(`   ❌ db: ${dbErr.message}`); continue; }

      const item = {
        templateId, name: ad.name || 'Foreplay Ad', imagePath, promptNotes: String(ad.description || '').slice(0, 400),
        sortOrder: manifest.items.length + added.length + 10, rightsStatus: 'public_domain',
        categoryGroup: 'producto', categoryBranch: 'presentar', categoryLeaf: category, category,
        tags: [nicheLabelOf(niche), category].filter(Boolean), metadata,
      };
      manifest.items.push(item);
      added.push(item);
      saved++;
      if (saved >= PER_NICHE) break;   // ya juntamos los N nuevos de este nicho
    }
    perNicheCount[niche] = saved;
    process.stdout.write(`   → guardados ${saved} nuevos\n`);
  }

  // Dedupe manifest y subir
  const seen = new Set();
  manifest.items = manifest.items.filter(i => i.imagePath && !seen.has(i.imagePath) && seen.add(i.imagePath));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  const buf = Buffer.from(JSON.stringify(manifest, null, 2));
  const { error: mErr } = await admin.storage.from('creative-references').upload('manifests/starter-static-50.json', buf, { contentType: 'application/json', upsert: true });
  console.log(mErr ? `❌ manifest storage: ${mErr.message}` : '📄 Manifest subido a Storage');

  console.log('\n===== RESUMEN =====');
  for (const [n, c] of Object.entries(perNicheCount)) console.log(`  ${n}: +${c}`);
  console.log(`  TOTAL nuevos: ${added.length} · Manifest final: ${manifest.items.length}`);
}

function nicheLabelOf(n) {
  const map = { 'Beauty': 'Belleza', 'Health/Wellness': 'Salud y Bienestar', 'Fashion': 'Moda', 'Food/Drink': 'Comida y Bebida', 'Home/Garden': 'Hogar y Jardín', 'Sports/Outdoors': 'Deporte', 'Pets': 'Mascotas', 'Accessories': 'Accesorios', 'Jewelry/Watches': 'Joyería', 'Kids/Baby': 'Niños y Bebés', 'Tech': 'Tecnología', 'Automotive': 'Automotor', 'Travel': 'Viajes', 'Finance': 'Finanzas', 'Education': 'Educación', 'App/Software': 'Apps', 'Medical': 'Médico', 'Service Business': 'Servicios', 'Business/Professional': 'Negocios', 'Real Estate': 'Inmobiliaria' };
  return map[n] || n;
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
