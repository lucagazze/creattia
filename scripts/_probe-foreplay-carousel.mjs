/**
 * Probe: inspect Foreplay discovery API item shape for carousel format.
 * Not part of the pipeline — throwaway diagnostic.
 */
import { chromium } from 'playwright';
import https from 'https';
import { writeFile } from 'fs/promises';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';

function apiCall(pathAndQuery, token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.foreplay.co', path: pathAndQuery, method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.foreplay.co', Referer: 'https://app.foreplay.co/discovery' },
    }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, raw: d.slice(0, 500) }); } });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

async function login() {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

async function main() {
  console.log('login...');
  const token = await login();
  console.log('token:', token ? 'ok' : 'MISSING');
  if (!token) return;

  const out = {};
  const attempts = [
    ['carousel', '/ads/discovery?runTimeMin=31&orFormat[]=carousel&orNiche[]=Beauty&sort=desc&limit=10'],
    ['dco', '/ads/discovery?runTimeMin=31&orFormat[]=dco&orNiche[]=Beauty&sort=desc&limit=10'],
    ['no-format', '/ads/discovery?runTimeMin=31&orNiche[]=Beauty&sort=desc&limit=20'],
  ];
  for (const [label, path] of attempts) {
    const { status, json, raw, error } = await apiCall(path, token);
    console.log(`\n=== ${label} (status ${status}) ===`);
    if (error) { console.log('error:', error); continue; }
    if (!json) { console.log('raw:', raw); continue; }
    const items = json.results || json.data || (Array.isArray(json) ? json : []);
    console.log('item count:', items.length);
    const types = {};
    items.forEach(i => { const t = i.type || i.display_format || i.format || 'unknown'; types[t] = (types[t]||0)+1; });
    console.log('types breakdown:', types);
    out[label] = { status, count: items.length, types, sample: items.slice(0, 3) };
    await new Promise(r => setTimeout(r, 1200));
  }
  await writeFile('./scripts/_probe-output.json', JSON.stringify(out, null, 2));
  console.log('\nSaved to scripts/_probe-output.json');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
