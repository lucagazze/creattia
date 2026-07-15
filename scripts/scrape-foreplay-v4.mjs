/**
 * scrape-foreplay-v4.mjs — Cursor-based API pagination + Run Time filter
 * 
 * API structure: { results: [...], nextPage: "cursor_string" }
 * Pagination: pass ?nextPage=cursor to get the next batch
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import https from 'https';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';
const TARGET_ADS = 1000;
const OUTPUT_DIR = resolve('./public/scraped_ads');
const IMAGES_DIR = resolve('./public/scraped_ads/images');
const MANIFEST_PATH = resolve('./public/scraped_ads/manifest.json');

const STYLE_CATEGORY_MAP = {
  'before and after': 'antes-despues',
  'facts and stats': 'estadisticas',
  'features': 'caracteristicas',
  'benefits': 'caracteristicas',
  'holiday': 'mas-vendidos',
  'seasonal': 'mas-vendidos',
  'media': 'notas',
  'press': 'notas',
  'promotion': 'mas-vendidos',
  'discount': 'mas-vendidos',
  'reasons why': 'top-razones',
  'testimonial': 'testimonios',
  'review': 'testimonios',
  'us vs them': 'vs',
  'versus': 'vs',
  'ugc': 'testimonios',
  'user generated': 'testimonios',
  'problem': 'problema-solucion',
  'solution': 'problema-solucion',
  'social proof': 'testimonios',
  'unboxing': 'contenido',
  'tutorial': 'caracteristicas',
  'faq': 'preguntas',
};

const CATEGORY_TEMPLATE_MAP = {
  'antes-despues': 40, 'estadisticas': 40, 'caracteristicas': 40,
  'mas-vendidos': 13, 'notas': 40, 'top-razones': 40,
  'testimonios': 1, 'vs': 23, 'problema-solucion': 40,
  'contenido': 40, 'preguntas': 40,
};

function hashFromUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

function classifyByStyle(styleLabel = '') {
  const lower = styleLabel.toLowerCase();
  for (const [key, cat] of Object.entries(STYLE_CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  return 'caracteristicas';
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return true;
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://app.foreplay.co/'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        const loc = res.headers.location;
        if (loc) return downloadImage(loc, destPath).then(resolve).catch(reject);
        reject(new Error('Redirect no location'));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

function makeApiRequest(path, token, capturedHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://api.foreplay.co${path}`);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Origin': 'https://app.foreplay.co',
        'Referer': 'https://app.foreplay.co/discovery',
        // Forward any important headers captured from the browser
        ...(capturedHeaders['cookie'] ? { 'Cookie': capturedHeaders['cookie'] } : {}),
        ...(capturedHeaders['x-workspace-id'] ? { 'x-workspace-id': capturedHeaders['x-workspace-id'] } : {}),
        ...(capturedHeaders['x-team-id'] ? { 'x-team-id': capturedHeaders['x-team-id'] } : {}),
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data.slice(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('API timeout')); });
    req.end();
  });
}

function extractAdFromItem(item) {
  // Try every possible field combination Foreplay might use
  const imageUrl =
    item.adUrl || item.imageUrl || item.ad_url || item.url ||
    item.creative?.imageUrl || item.creative?.url ||
    item.thumbnail || item.thumbnailUrl || item.thumbnail_url ||
    item.media?.[0]?.url || item.media?.[0]?.src || item.media?.[0]?.imageUrl ||
    item.preview?.url || item.previewUrl || item.preview_url ||
    item.images?.[0] || item.image;

  const brandName =
    item.advertiserName || item.brand || item.pageName ||
    item.page_name || item.account?.name || item.brandName ||
    item.advertiser?.name || item.page?.name || '';

  const styleLabel =
    item.style || item.adStyle || item.ad_style ||
    item.category || item.tags?.[0] || item.format_style || '';

  const daysActive = item.daysActive || item.days_active || item.duration || 0;
  const isCarousel =
    item.type === 'carousel' || item.format === 'carousel' ||
    (item.media?.length > 1) || item.isCarousel;

  return { imageUrl, brandName, styleLabel, daysActive: Number(daysActive), isCarousel };
}

async function main() {
  console.log('=== Foreplay Scraper v4 — Cursor Pagination + Run Time Filter ===');

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  let existingManifest = { version: 1, collection: 'scraped-ads-library', items: [] };
  try {
    existingManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    console.log(`📦 Existing manifest: ${existingManifest.items.length} ads`);
  } catch { console.log('📦 Starting fresh'); }

  const existingPaths = new Set(existingManifest.items.map(i => i.imagePath));

  let authToken = null;
  let capturedHeaders = {};
  let sampleItem = null;

  // ── Browser login ─────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Capture auth + all relevant headers
  page.on('request', (req) => {
    const auth = req.headers()['authorization'];
    if (auth?.startsWith('Bearer ') && req.url().includes('foreplay')) {
      authToken = auth.slice(7);
      const h = req.headers();
      capturedHeaders = {
        ...capturedHeaders,
        ...(h['cookie'] ? { cookie: h['cookie'] } : {}),
        ...(h['x-workspace-id'] ? { 'x-workspace-id': h['x-workspace-id'] } : {}),
        ...(h['x-team-id'] ? { 'x-team-id': h['x-team-id'] } : {}),
        ...(h['x-user-id'] ? { 'x-user-id': h['x-user-id'] } : {}),
      };
    }
  });

  // Capture sample API response to understand item structure
  page.on('response', async (res) => {
    if (res.url().includes('api.foreplay.co/ads') && !sampleItem) {
      try {
        const json = await res.json();
        const items = json.results || json.data || json.ads || (Array.isArray(json) ? json : null);
        if (items?.length > 0) {
          sampleItem = items[0];
          console.log('\n📋 Sample item keys:', Object.keys(sampleItem).join(', '));
          const extracted = extractAdFromItem(sampleItem);
          console.log('📋 Extracted image URL:', extracted.imageUrl?.slice(0, 80));
          console.log('📋 Brand:', extracted.brandName);
          console.log('📋 Style:', extracted.styleLabel);
        }
      } catch {}
    }
  });

  try {
    console.log('\n1️⃣  Logging in...');
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.waitForTimeout(300);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(7000);

    if (!page.url().includes('discovery')) {
      await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    console.log('✅ Logged in at:', page.url());
    await page.waitForTimeout(5000); // Wait for API calls to fire and capture token

    // ── Apply Run Time > 3 months filter ─────────────────────────────────────
    console.log('\n2️⃣  Applying Run Time > 3 months filter...');
    
    // Print all visible buttons for debugging
    const buttons = await page.locator('button').allTextContents();
    console.log('  Available buttons:', buttons.filter(b => b.trim()).slice(0, 20).join(' | '));
    
    // Try clicking "Add Filter" button  
    const addFilterBtn = page.locator('button:has-text("Add Filter"), button:has-text("Filters"), button:has-text("Filter")').first();
    const addFilterVisible = await addFilterBtn.isVisible().catch(() => false);
    if (addFilterVisible) {
      await addFilterBtn.click();
      await page.waitForTimeout(2000);
      console.log('  ✓ Clicked filter button');
      
      // Look for "Run Time" option in the filter dropdown
      const runTimeOption = page.locator('text="Run Time", text="Runtime", [data-value="runTime"], [data-filter="runTime"]').first();
      const runTimeVisible = await runTimeOption.isVisible().catch(() => false);
      if (runTimeVisible) {
        await runTimeOption.click();
        await page.waitForTimeout(1500);
        console.log('  ✓ Clicked Run Time');
        
        // Look for "Over 3 months" option (or similar)
        const over3mo = page.locator('text="Over 3 Months", text="3+ Months", text="90+ days", text=">90", text="over90"').first();
        const over3moVisible = await over3mo.isVisible().catch(() => false);
        if (over3moVisible) {
          await over3mo.click();
          await page.waitForTimeout(1500);
          console.log('  ✓ Selected Over 3 Months');
          
          // Click Apply
          const applyBtn = page.locator('button:has-text("Apply"), button:has-text("Done"), button:has-text("Save")').first();
          await applyBtn.click().catch(() => {});
          await page.waitForTimeout(3000);
          console.log('  ✓ Applied filter');
        } else {
          // Try to screenshot what we see in the filter
          console.log('  Could not find "Over 3 months" option, taking screenshot...');
          await page.screenshot({ path: '/tmp/foreplay-filter.png' });
          console.log('  Screenshot saved to /tmp/foreplay-filter.png');
        }
      } else {
        console.log('  Could not find Run Time option — will use URL param approach');
        // Close the filter dropdown
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('  Add Filter button not found');
    }

    // Scroll to trigger more API calls and capture token if not yet captured
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(2000);
    }

    if (!authToken) {
      console.log('⚠️  Auth token not yet captured, checking localStorage...');
      authToken = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const val = localStorage.getItem(key) || '';
          if (val.startsWith('eyJ')) return val;
          try {
            const parsed = JSON.parse(val);
            if (parsed?.access_token) return parsed.access_token;
          } catch {}
        }
        return null;
      });
    }

    console.log(`🔑 Token: ${authToken ? authToken.slice(0, 40) + '...' : 'NOT FOUND'}`);
    console.log(`📤 Extra headers: ${Object.keys(capturedHeaders).join(', ')}`);
    await browser.close();

    if (!authToken) {
      console.log('❌ No auth token. Cannot proceed.');
      return;
    }

    // ── API pagination with cursor ─────────────────────────────────────────
    console.log('\n3️⃣  Fetching ads via API with cursor pagination...');
    
    const allAds = [];
    let cursor = null;
    let pageNum = 0;
    let hasMore = true;
    
    // Try different API endpoint patterns
    const baseEndpoints = [
      '/ads/discovery',
      '/ads',
      '/discovery/ads',
    ];
    
    // Test which endpoint works
    let workingEndpoint = null;
    for (const ep of baseEndpoints) {
      const testResult = await makeApiRequest(`${ep}?sort=desc&limit=10`, authToken, capturedHeaders);
      console.log(`  Testing ${ep}: status=${testResult.status}, keys=${testResult.json ? Object.keys(testResult.json).join(',') : 'null'}`);
      if (testResult.status === 200 && testResult.json) {
        const items = testResult.json.results || testResult.json.data || testResult.json.ads || (Array.isArray(testResult.json) ? testResult.json : null);
        if (items?.length > 0) {
          workingEndpoint = ep;
          cursor = testResult.json.nextPage || testResult.json.next_page || testResult.json.cursor || null;
          console.log(`  ✓ Working endpoint: ${ep}, got ${items.length} items, nextPage=${cursor ? 'yes' : 'no'}`);
          
          // Sample item structure
          if (!sampleItem) {
            sampleItem = items[0];
            console.log('  Sample keys:', Object.keys(sampleItem).join(', '));
          }
          
          for (const item of items) {
            const ad = extractAdFromItem(item);
            if (ad.imageUrl) allAds.push(ad);
          }
          break;
        }
      }
    }
    
    if (!workingEndpoint) {
      console.log('❌ No working API endpoint found.');
      if (sampleItem) console.log('  Last sample:', JSON.stringify(sampleItem).slice(0, 500));
      return;
    }
    
    // Now paginate using nextPage cursor
    while (allAds.length < TARGET_ADS && hasMore) {
      const params = new URLSearchParams({ sort: 'desc', limit: '20' });
      if (cursor) params.set('nextPage', cursor);
      // Add Run Time filter param (try multiple names)
      params.set('runTime', 'over90');
      params.set('run_time', 'over90');
      
      const result = await makeApiRequest(`${workingEndpoint}?${params}`, authToken, capturedHeaders);
      
      if (result.status !== 200 || !result.json) {
        console.log(`  Page ${pageNum}: status=${result.status}, raw=${result.raw?.slice(0, 100)}`);
        break;
      }
      
      const items = result.json.results || result.json.data || result.json.ads || (Array.isArray(result.json) ? result.json : []);
      const nextCursor = result.json.nextPage || result.json.next_page || result.json.cursor || null;
      
      if (!items || items.length === 0) {
        hasMore = false;
        console.log(`  Page ${pageNum}: no more items`);
        break;
      }
      
      for (const item of items) {
        const ad = extractAdFromItem(item);
        if (ad.imageUrl) allAds.push(ad);
      }
      
      pageNum++;
      cursor = nextCursor;
      hasMore = Boolean(cursor);
      
      if (pageNum % 5 === 0 || allAds.length % 50 === 0) {
        console.log(`  Page ${pageNum}: ${items.length} items → total ${allAds.length} ads`);
      }
      
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log(`\n4️⃣  Collected ${allAds.length} ads. Downloading images...`);

    // ── Download and build manifest ────────────────────────────────────────
    const toSave = [];
    let downloaded = 0, failed = 0, skipped = 0;

    for (const ad of allAds) {
      if (!ad.imageUrl || !ad.imageUrl.startsWith('http')) { skipped++; continue; }

      const category = classifyByStyle(ad.styleLabel);
      const templateId = CATEGORY_TEMPLATE_MAP[category] || 40;
      const imageHash = hashFromUrl(ad.imageUrl);
      const ext = ad.imageUrl.match(/\.(png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
      const imagePath = `${templateId}/${imageHash}.${ext}`;

      if (existingPaths.has(imagePath)) { skipped++; continue; }

      const subDir = resolve(IMAGES_DIR, String(templateId));
      await mkdir(subDir, { recursive: true });
      const localPath = resolve(subDir, `${imageHash}.${ext}`);

      try {
        await downloadImage(ad.imageUrl, localPath);
        toSave.push({
          templateId,
          name: ad.brandName || 'Foreplay Ad',
          imagePath,
          promptNotes: ad.styleLabel,
          sortOrder: existingManifest.items.length + toSave.length + 10,
          rightsStatus: 'public_domain',
          categoryGroup: 'producto',
          categoryBranch: 'presentar',
          categoryLeaf: category,
          category,
          tags: [ad.styleLabel, ad.isCarousel ? 'Carrusel' : 'Imagen'].filter(Boolean),
          metadata: {
            scrapedAt: new Date().toISOString(),
            source: 'foreplay',
            mediaType: ad.isCarousel ? 'carousel' : 'static_image',
            foreplayStyle: ad.styleLabel,
            daysActive: String(ad.daysActive || ''),
            runTime: ad.daysActive >= 90 ? 'over90' : ad.daysActive ? `${ad.daysActive}d` : '',
          },
        });
        downloaded++;
        if (downloaded % 50 === 0) console.log(`  ⬇️  ${downloaded} downloaded...`);
      } catch (err) {
        failed++;
        if (failed <= 5) console.warn(`  ⚠️  Failed: ${err.message.slice(0, 60)}`);
      }
    }

    console.log(`\n✅ Downloaded: ${downloaded}, Already existed: ${skipped}, Failed: ${failed}`);

    if (toSave.length > 0) {
      // Also deduplicate against existing
      const existingPathsFull = new Set(existingManifest.items.map(i => i.imagePath));
      const uniqueToSave = toSave.filter(i => !existingPathsFull.has(i.imagePath));
      
      const updatedManifest = { ...existingManifest, items: [...existingManifest.items, ...uniqueToSave] };
      await writeFile(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));
      console.log(`📄 Manifest updated: ${updatedManifest.items.length} total (+${uniqueToSave.length} new)`);
    } else {
      console.log('📄 No new ads to save.');
      if (sampleItem) {
        const extracted = extractAdFromItem(sampleItem);
        console.log('  Sample extracted:', JSON.stringify(extracted));
      }
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack?.split('\n').slice(0, 5).join('\n'));
    await browser.close().catch(() => {});
  }

  console.log('\n🏁 Done!');
}

main().catch(console.error);
