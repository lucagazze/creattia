/**
 * scrape-foreplay-v3.mjs — Direct API mode
 * 
 * Login via browser → extract auth token → call Foreplay's API directly
 * with pagination to fetch 1000 ads efficiently.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import https from 'https';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────
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
  'contenido': 40, 'preguntas': 40, 'multimedia': 40,
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
        const redirectUrl = res.headers.location;
        if (redirectUrl) return downloadImage(redirectUrl, destPath).then(resolve).catch(reject);
        reject(new Error('Redirect without location'));
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

async function fetchWithToken(url, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Origin': 'https://app.foreplay.co',
        'Referer': 'https://app.foreplay.co/discovery',
        ...extraHeaders
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.status || res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: null, raw: data.slice(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('API timeout')); });
    req.end();
  });
}

async function main() {
  console.log('=== Foreplay Scraper v3 - Direct API Mode ===');

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

  // ── Browser login to get auth token ─────────────────────────────────────────
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Capture the auth token from real API requests
  page.on('request', (request) => {
    const auth = request.headers()['authorization'];
    if (auth && auth.startsWith('Bearer ') && request.url().includes('foreplay')) {
      authToken = auth.replace('Bearer ', '');
      // Capture all headers from a real request for later
      if (!capturedHeaders['cookie']) {
        capturedHeaders = { ...request.headers() };
      }
    }
  });

  // Also intercept responses to get sample data structure
  let sampleResponse = null;
  page.on('response', async (response) => {
    if (response.url().includes('api.foreplay.co/ads') && !sampleResponse) {
      try {
        sampleResponse = await response.json();
        console.log('\n📡 Sample API response structure:', JSON.stringify(Object.keys(sampleResponse)).slice(0, 200));
        if (sampleResponse?.data?.length > 0) {
          console.log('  Sample ad keys:', JSON.stringify(Object.keys(sampleResponse.data[0])).slice(0, 300));
        } else if (Array.isArray(sampleResponse) && sampleResponse.length > 0) {
          console.log('  Sample ad keys (array):', JSON.stringify(Object.keys(sampleResponse[0])).slice(0, 300));
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
    await page.waitForTimeout(6000);

    if (!page.url().includes('discovery')) {
      await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    console.log('✅ At:', page.url());
    await page.waitForTimeout(5000); // Give time for API calls to fire and capture token

    // Click "Add Filter" → Format → Image + Carousel to trigger data loading
    console.log('\n2️⃣  Activating filters to load ads...');
    
    // Try clicking "Add Filter"
    const addFilter = page.locator('button:has-text("Add Filter")').first();
    await addFilter.click().catch(() => {});
    await page.waitForTimeout(2000);

    // Click Format option
    await page.locator('text=Format').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    
    // Click Image checkbox
    await page.getByRole('checkbox', { name: /image/i }).first().click().catch(async () => {
      await page.locator('label:has-text("Image")').first().click().catch(() => {});
    });
    await page.waitForTimeout(500);
    
    // Click Apply/Done
    await page.locator('button:has-text("Apply"), button:has-text("Done"), button:has-text("Save")').first().click().catch(() => {});
    await page.waitForTimeout(3000);

    // Scroll a bit to trigger more loads and capture the token
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(3000);

    if (!authToken) {
      console.log('⚠️  No auth token captured yet, trying to find it in localStorage/cookies...');
      // Try to get from localStorage
      authToken = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const val = localStorage.getItem(key);
          if (val && (key.includes('token') || key.includes('auth') || key.includes('jwt'))) {
            return val;
          }
        }
        return null;
      });
      if (authToken && authToken.startsWith('{')) {
        try { authToken = JSON.parse(authToken)?.access_token || authToken; } catch {}
      }
    }

    console.log(`🔑 Auth token: ${authToken ? authToken.slice(0, 40) + '...' : 'NOT FOUND'}`);

    await browser.close();

    if (!authToken) {
      console.log('❌ Could not get auth token. Exiting.');
      return;
    }

    // ── Now call the API directly ──────────────────────────────────────────────
    console.log('\n3️⃣  Fetching ads via API...');
    
    const allAds = [];
    let page_num = 1;
    let hasMore = true;
    const PAGE_SIZE = 20;

    while (allAds.length < TARGET_ADS && hasMore && page_num <= 60) {
      // Try multiple API endpoint patterns Foreplay might use
      const endpoints = [
        `https://api.foreplay.co/ads/discovery?sort=desc&page=${page_num}&limit=${PAGE_SIZE}&format=image,carousel`,
        `https://api.foreplay.co/ads/discovery?sort=desc&offset=${(page_num-1)*PAGE_SIZE}&limit=${PAGE_SIZE}`,
        `https://api.foreplay.co/ads?sort=desc&page=${page_num}&limit=${PAGE_SIZE}`,
      ];

      let found = false;
      for (const endpoint of endpoints) {
        const result = await fetchWithToken(endpoint, authToken, capturedHeaders);
        
        if (result.data === null) {
          console.log(`  Page ${page_num}: API returned non-JSON (status ${result.status}):`, result.raw?.slice(0, 100));
          continue;
        }
        
        const items = result.data?.data || result.data?.ads || result.data?.results || 
                      result.data?.items || (Array.isArray(result.data) ? result.data : null);
        
        if (!items || items.length === 0) {
          console.log(`  Page ${page_num}: No items (status ${result.status})`);
          if (result.status === 200) hasMore = false;
          continue;
        }

        console.log(`  Page ${page_num}: ${items.length} ads (total: ${allAds.length + items.length})`);
        
        for (const item of items) {
          // Extract image from different possible structures
          const imageUrl = item.adUrl || item.imageUrl || item.ad_url || item.url ||
                          item.creative?.imageUrl || item.creative?.url ||
                          item.thumbnail || item.thumbnailUrl ||
                          item.media?.[0]?.url || item.media?.[0]?.src ||
                          item.preview?.url || item.previewUrl;

          const brandName = item.advertiserName || item.brand || item.pageName || 
                           item.page_name || item.account?.name || item.brandName || '';
          const styleLabel = item.style || item.adStyle || item.ad_style || 
                            item.category || item.tags?.[0] || '';
          const daysActive = item.daysActive || item.days_active || item.duration || 0;
          const isCarousel = item.type === 'carousel' || item.format === 'carousel' || 
                            (item.media?.length > 1);
          
          // Only include items with valid image URLs
          if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) continue;

          allAds.push({ imageUrl, brandName, styleLabel, daysActive, isCarousel });
        }

        found = true;
        if (items.length < PAGE_SIZE) hasMore = false;
        break; // endpoint worked
      }

      if (!found) break;
      page_num++;
      await new Promise(r => setTimeout(r, 800)); // Rate limit
    }

    console.log(`\n4️⃣  Processing ${allAds.length} ads...`);

    // ── Build manifest items and download ─────────────────────────────────────
    const toSave = [];
    let downloaded = 0, failed = 0, skipped = 0;

    for (const ad of allAds) {
      const category = classifyByStyle(ad.styleLabel);
      const templateId = CATEGORY_TEMPLATE_MAP[category] || 40;
      const imageHash = hashFromUrl(ad.imageUrl);
      const ext = ad.imageUrl.match(/\.(png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
      const imagePath = `${templateId}/${imageHash}.${ext}`;

      if (existingPaths.has(imagePath)) { skipped++; continue; }

      const subDir = resolve(IMAGES_DIR, String(templateId));
      await mkdir(subDir, { recursive: true });
      const localPath = resolve(IMAGES_DIR, String(templateId), `${imageHash}.${ext}`);

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
          },
        });
        downloaded++;
        if (downloaded % 50 === 0) console.log(`  ⬇️  ${downloaded} downloaded...`);
      } catch (err) {
        failed++;
        if (failed <= 10) console.warn(`  ⚠️  ${ad.brandName}: ${err.message.slice(0, 60)}`);
      }
    }

    console.log(`\n✅ New: ${downloaded}, Skipped (existing): ${skipped}, Failed: ${failed}`);

    if (toSave.length > 0) {
      const updatedManifest = { ...existingManifest, items: [...existingManifest.items, ...toSave] };
      await writeFile(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));
      console.log(`📄 Manifest: ${updatedManifest.items.length} total ads (+${toSave.length} new)`);
    } else {
      // Print a sample of what we got to debug
      if (allAds.length > 0) {
        console.log('Sample ad:', JSON.stringify(allAds[0]).slice(0, 300));
      }
      console.log('📄 No new ads saved.');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
    await browser.close().catch(() => {});
  }

  console.log('\n🏁 Done!');
}

main().catch(console.error);
