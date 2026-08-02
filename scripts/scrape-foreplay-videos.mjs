/**
 * scrape-foreplay-videos.mjs — Videos ganadores por nicho, sección aparte.
 * Filtros: solo video (orFormat[]=video) · corriendo +30 días (runTimeMin=31) ·
 * piso de likes real · por nicho (orNiche[]=X).
 * Descarga el .mp4 + thumbnail, sube a un bucket propio (creative-videos),
 * separado de la biblioteca de imágenes/carruseles (creative-references).
 *
 * Uso: node --env-file=.env.local scripts/scrape-foreplay-videos.mjs
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
const PER_NICHE = Number(process.env.FP_PER || 20);
const POOL_PER_NICHE = Number(process.env.FP_POOL || 70);
const RUNTIME_MIN = Number(process.env.FP_RUNTIME || 31);
const MIN_LIKES = Number(process.env.FP_MIN_LIKES || 100);
const MAX_DURATION = Number(process.env.FP_MAX_DURATION || 90); // seg — descarta videos larguísimos
const VIDEOS_DIR = resolve('./public/scraped_videos');
const MANIFEST_PATH = resolve('./public/scraped_videos/manifest.json');
const BUCKET = 'creative-videos';
const BATCH = 'foreplay-videos-v1';

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

function classifyStyle(item) {
  const t = `${item.description || ''} ${item.name || ''} ${item.headline || ''}`.toLowerCase();
  if (/\bvs\b|versus|better than|compared to|instead of/.test(t)) return 'competencia';
  if (/review|testimonial|customer|clients?|\bsays\b|loved?|obsessed|⭐|★|rated|"[^"]{6,}"/.test(t)) return 'resenas';
  if (/myth|truth|\bfact|did you know|stop believing/.test(t)) return 'mitos';
  if (/limited|hurry|expires?|last chance|today only|ends? (soon|tonight)|selling out|almost gone/.test(t)) return 'urgencia';
  if (/free shipping|envío gratis|envio gratis|free delivery/.test(t)) return 'envio';
  if (/guarantee|warranty|money[- ]?back|refund|risk[- ]?free|\b\d+[- ]day/.test(t)) return 'garantia';
  if (/%|\boff\b|\bsale\b|discount|save \$|\bdeal\b|price|\$\d/.test(t)) return 'precio';
  if (/step|how to|3 reasons|checklist|things you|ingredients|features|benefits/.test(t)) return 'caracteristicas';
  return 'hero';
}

const toSeconds = (n) => { n = Number(n) || 0; return n > 1e12 ? Math.floor(n / 1000) : n; };
function daysActive(item) {
  const started = toSeconds(item.startedRunning);
  const checked = toSeconds(item.last_checked?._seconds) || Math.floor(Date.now() / 1000);
  if (!started) return 0;
  return Math.max(0, Math.round((checked - started) / 86400));
}

function score(item) {
  const likes = Number(item.likes) || 0;
  const days = item._days;
  const liveBoost = item.live ? 1.15 : 1.0;
  let lf;
  if (days < 30) lf = 0.7;
  else if (days <= 400) lf = 1.0;
  else if (days <= 900) lf = 0.9;
  else lf = 0.78;
  return Math.log1p(likes) * lf * liveBoost;
}

function downloadFile(url, destPath) {
  if (fs.existsSync(destPath)) return Promise.resolve(true);
  return new Promise((res, rej) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://app.foreplay.co/' } }, (r) => {
      if (r.statusCode === 301 || r.statusCode === 302) { file.close(); return r.headers.location ? downloadFile(r.headers.location, destPath).then(res).catch(rej) : rej(new Error('redirect')); }
      if (r.statusCode !== 200) { file.close(); return rej(new Error(`HTTP ${r.statusCode}`)); }
      r.pipe(file); file.on('finish', () => { file.close(); res(true); });
    });
    req.on('error', (e) => { fs.unlink(destPath, () => {}); rej(e); });
    req.setTimeout(60000, () => { req.destroy(); rej(new Error('timeout')); });
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
  await page.waitForTimeout(5000);
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
    params.append('orFormat[]', 'video');
    params.append('orNiche[]', niche);
    params.set('sort', 'desc');
    params.set('limit', '50');
    if (cursor) params.set('next', JSON.stringify(cursor));
    const { status, json } = await apiCall(`/ads/discovery?${params}`, token);
    if (status !== 200 || !json) { console.log(`   ${niche}: status ${status}, corto`); break; }
    const items = json.results || json.data || (Array.isArray(json) ? json : []);
    if (!items.length) break;
    for (const it of items) {
      if (it.type !== 'video' || !it.video || !it.video.startsWith('http')) continue;
      if (it.video_duration && it.video_duration > MAX_DURATION) continue;
      const likes = Number(it.likes) || 0;
      if (likes < MIN_LIKES && !it.live) continue;
      if (seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      const withDays = { ...it, _days: daysActive(it) };
      withDays._score = score(withDays);
      collected.push(withDays);
    }
    const last = items[items.length - 1];
    cursor = [last.createdAt, last.id];
    await new Promise(r => setTimeout(r, 1100));
  }
  collected.sort((a, b) => b._score - a._score);
  return collected;
}

function nicheLabelOf(n) {
  const map = { 'Beauty': 'Belleza', 'Health/Wellness': 'Salud y Bienestar', 'Fashion': 'Moda', 'Food/Drink': 'Comida y Bebida', 'Home/Garden': 'Hogar y Jardín', 'Sports/Outdoors': 'Deporte', 'Pets': 'Mascotas', 'Accessories': 'Accesorios', 'Jewelry/Watches': 'Joyería', 'Kids/Baby': 'Niños y Bebés', 'Tech': 'Tecnología', 'Automotive': 'Automotor', 'Travel': 'Viajes', 'Finance': 'Finanzas', 'Education': 'Educación', 'App/Software': 'Apps', 'Medical': 'Médico', 'Service Business': 'Servicios', 'Business/Professional': 'Negocios', 'Real Estate': 'Inmobiliaria' };
  return map[n] || n;
}

async function main() {
  console.log('=== Foreplay Videos — sección aparte, mejores por nicho ===');
  await fs.promises.mkdir(VIDEOS_DIR, { recursive: true });

  let manifest = { version: 1, collection: 'video-library', items: [] };
  try {
    const { data } = await admin.storage.from(BUCKET).download('manifests/video-library.json');
    if (data) manifest = JSON.parse(await data.text());
    console.log(`📦 Manifest actual: ${manifest.items.length} videos`);
  } catch { console.log('📦 Empiezo de cero'); }

  if (!process.env.FP_KEEP) {
    const beforeDrop = manifest.items.length;
    manifest.items = manifest.items.filter((i) => i.metadata?.batch !== BATCH);
    if (beforeDrop !== manifest.items.length) console.log(`   ♻️ quité ${beforeDrop - manifest.items.length} de una corrida previa`);
  }
  const existingPaths = new Set(manifest.items.map(i => i.videoPath));

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
      const hash = crypto.createHash('md5').update(ad.video).digest('hex').slice(0, 16);
      const videoPath = `${category}/${hash}.mp4`;
      if (existingPaths.has(videoPath)) continue;

      const subDir = resolve(VIDEOS_DIR, category);
      await fs.promises.mkdir(subDir, { recursive: true });
      const videoDest = resolve(subDir, `${hash}.mp4`);
      try { await downloadFile(ad.video, videoDest); } catch (e) { console.log(`   ⚠️ video falló (${ad.name}): ${e.message}`); continue; }

      let thumbPath = null;
      if (ad.thumbnail) {
        try {
          const thumbExt = ad.thumbnail.match(/\.(png|webp)(\?|$)/i)?.[1] || 'jpg';
          const thumbDest = resolve(subDir, `${hash}.${thumbExt}`);
          await downloadFile(ad.thumbnail, thumbDest);
          const tBytes = fs.readFileSync(thumbDest);
          const tMime = thumbExt === 'png' ? 'image/png' : thumbExt === 'webp' ? 'image/webp' : 'image/jpeg';
          thumbPath = `${category}/${hash}.${thumbExt}`;
          const { error: tErr } = await admin.storage.from(BUCKET).upload(thumbPath, tBytes, { contentType: tMime, upsert: true });
          if (tErr) thumbPath = null;
        } catch { thumbPath = null; }
      }

      const vBytes = fs.readFileSync(videoDest);
      const { error: vErr } = await admin.storage.from(BUCKET).upload(videoPath, vBytes, { contentType: 'video/mp4', upsert: true });
      if (vErr) { console.log(`   ❌ storage ${ad.name}: ${vErr.message}`); continue; }
      existingPaths.add(videoPath);

      const domain = (ad.link_url || '').replace(/^https?:\/\//, '').split('/')[0];
      const metadata = {
        scrapedAt: new Date().toISOString(), source: 'foreplay', batch: BATCH,
        foreplayNiches: Array.isArray(ad.niches) ? ad.niches : [],
        categories: Array.isArray(ad.categories) ? ad.categories : [],
        daysActive: String(ad._days), likes: Number(ad.likes) || 0, live: !!ad.live,
        domain, cta: ad.cta_title || ad.cta_type || '', durationSec: ad.video_duration || null,
        productCategory: ad.productCategory || '', brandIndustry: ad.brand_industry || '',
        headline: ad.headline || '',
      };

      const nicheLabels = (Array.isArray(ad.niches) ? ad.niches : []).map(nicheLabelOf);
      const item = {
        name: ad.name || 'Foreplay Video', videoPath, thumbnailPath: thumbPath,
        promptNotes: String(ad.description || ad.headline || '').slice(0, 400),
        category, tags: [...nicheLabels, category, 'Video'].filter(Boolean), metadata,
      };
      manifest.items.push(item);
      added.push(item);
      saved++;
      if (saved >= PER_NICHE) break;
    }
    perNicheCount[niche] = saved;
    process.stdout.write(`   → guardados ${saved} nuevos\n`);
  }

  const seen = new Set();
  manifest.items = manifest.items.filter(i => i.videoPath && !seen.has(i.videoPath) && seen.add(i.videoPath));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  const buf = Buffer.from(JSON.stringify(manifest, null, 2));
  const { error: mErr } = await admin.storage.from(BUCKET).upload('manifests/video-library.json', buf, { contentType: 'application/json', upsert: true });
  console.log(mErr ? `❌ manifest storage: ${mErr.message}` : '📄 Manifest subido a Storage');

  console.log('\n===== RESUMEN =====');
  for (const [n, c] of Object.entries(perNicheCount)) console.log(`  ${n}: +${c}`);
  console.log(`  TOTAL nuevos: ${added.length} · Manifest final: ${manifest.items.length}`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
