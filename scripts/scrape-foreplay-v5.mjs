/**
 * scrape-foreplay-v5.mjs — Production ready
 * 
 * KNOWN API STRUCTURE (from v4 sample):
 * item keys: ad_id, avatar, brandId, createdAt, description, display_format,
 *            last_checked, likes, live, name, niches, publisher_platform,
 *            thumbnail, type, video, id, brand_enriched, spyder_brand
 * 
 * Fields to use:
 *   thumbnail  → image URL  (e.g. "https://r2.foreplay.co/...")
 *   name       → brand name
 *   niches     → array of style tags (e.g. ["Testimonial", "UGC"])
 *   type       → "image" | "video" | "carousel"
 *   live       → boolean, still active
 *   last_checked / createdAt → for "run time" approximation
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import https from 'https';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const EMAIL    = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';
const TARGET_ADS  = 1000;
const OUTPUT_DIR  = resolve('./public/scraped_ads');
const IMAGES_DIR  = resolve('./public/scraped_ads/images');
const MANIFEST_PATH = resolve('./public/scraped_ads/manifest.json');

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let admin = null;
if (supabaseUrl && serviceRoleKey) {
  console.log(`🔌 Initializing Supabase client: ${supabaseUrl}`);
  admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
} else {
  console.log('⚠️ Supabase credentials not found. Script will run in LOCAL-ONLY mode.');
}

// niches values → internal category
const NICHE_MAP = {
  'before and after'  : 'antes-despues',
  'facts and stats'   : 'estadisticas',
  'features'          : 'caracteristicas',
  'benefits'          : 'caracteristicas',
  'holiday'           : 'mas-vendidos',
  'seasonal'          : 'mas-vendidos',
  'media'             : 'notas',
  'press'             : 'notas',
  'promotion'         : 'mas-vendidos',
  'discount'          : 'mas-vendidos',
  'reasons why'       : 'top-razones',
  'testimonial'       : 'testimonios',
  'review'            : 'testimonios',
  'us vs them'        : 'vs',
  'versus'            : 'vs',
  'ugc'               : 'testimonios',
  'user generated'    : 'testimonios',
  'problem'           : 'problema-solucion',
  'solution'          : 'problema-solucion',
  'social proof'      : 'testimonios',
  'unboxing'          : 'contenido',
  'tutorial'          : 'caracteristicas',
  'faq'               : 'preguntas',
};

const CATEGORY_TEMPLATE = {
  'antes-despues'    : 40, 'estadisticas'  : 40, 'caracteristicas': 40,
  'mas-vendidos'     : 13, 'notas'         : 40, 'top-razones'    : 40,
  'testimonios'      : 1,  'vs'            : 23, 'problema-solucion': 40,
  'contenido'        : 40, 'preguntas'     : 40,
};

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

function classifyNiches(niches = []) {
  const labels = (Array.isArray(niches) ? niches : [String(niches)]).map(n => n.toLowerCase());
  for (const label of labels) {
    for (const [key, cat] of Object.entries(NICHE_MAP)) {
      if (label.includes(key)) return cat;
    }
  }
  return 'caracteristicas';
}

function extractAd(item) {
  let imageUrl = item.thumbnail || item.image || item.adUrl || item.imageUrl || item.url || '';
  const brandName = item.name || item.advertiserName || item.brand || '';
  const niches = item.niches || item.tags || [];
  const styleLabel = Array.isArray(niches) ? niches.join(', ') : String(niches || '');
  
  const isCarousel = item.type === 'carousel' || item.display_format === 'carousel' || 
                     item.type === 'dco' || item.isCarousel || (item.cards && item.cards.length > 1);
  const isVideo = item.type === 'video' || item.video;
  const daysActive = item.daysActive || item.days_active || 0;

  let carouselUrls = [];
  if (item.cards && item.cards.length > 0) {
    carouselUrls = item.cards.map(c => c.image || c.thumbnail || c.video_thumbnail).filter(Boolean);
    if (!imageUrl && carouselUrls.length > 0) {
      imageUrl = carouselUrls[0];
    }
  }
  
  return { imageUrl, brandName, niches, styleLabel, isCarousel, isVideo, daysActive: Number(daysActive), carouselUrls };
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return true;
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://app.foreplay.co/',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        const loc = res.headers.location;
        if (loc) return downloadImage(loc, destPath).then(resolve).catch(reject);
        return reject(new Error('Redirect no location'));
      }
      if (res.statusCode !== 200) { return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function apiCall(path, token, extraHeaders, retries = 3) {
  const urlObj = new URL(`https://api.foreplay.co${path}`);
  return new Promise(async (resolve, reject) => {
    const attempt = async (attemptsLeft) => {
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
          ...extraHeaders,
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', async () => {
          if (res.statusCode === 429) {
            if (attemptsLeft > 0) {
              const wait = (retries - attemptsLeft + 1) * 10000; // 10s, 20s, 30s
              console.log(`    ⏳ Rate limited (429). Waiting ${wait/1000}s before retry...`);
              await new Promise(r => setTimeout(r, wait));
              return attempt(attemptsLeft - 1);
            }
            return resolve({ status: 429, json: null });
          }
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, json: null, raw: data.slice(0, 300) }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    };
    await attempt(retries);
  });
}

async function main() {
  console.log('=== Foreplay Scraper v5 — Production ===');

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  let existingManifest = { version: 1, collection: 'scraped-ads-library', items: [] };
  try {
    existingManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    console.log(`📦 Existing manifest: ${existingManifest.items.length} ads`);
  } catch { console.log('📦 Starting fresh'); }

  const existingPaths = new Set(existingManifest.items.map(i => i.imagePath));
  const needed = 100; // Scrape exactly 100 ads for this run
  console.log(`🎯 Need to scrape ${needed} new ads`);

  if (needed <= 0) {
    console.log('✅ Already at target!');
    return;
  }

  let authToken = null;
  let extraHeaders = {};

  // ── PHASE 1: Browser login + token capture ─────────────────────────────────
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let apiPathname = '/ads/discovery';
  let queryParamsFromBrowser = null;
  page.on('request', req => {
    const url = req.url();
    if (url.includes('foreplay.co/ads') || url.includes('api.foreplay.co')) {
      console.log(`  🌐 Captured API request: ${url}`);
      if ((url.includes('/ads/discovery') || url.includes('/ads/shuffledDiscovery')) && 
          (url.includes('runTime') || url.includes('Format') || url.includes('Niche') || url.includes('runTimeMin'))) {
        try {
          const u = new URL(url);
          queryParamsFromBrowser = u.search;
          apiPathname = u.pathname;
          console.log('  🎯 Found active filter query params from browser:', queryParamsFromBrowser);
        } catch (e) {
          // ignore
        }
      }
    }
    const auth = req.headers()['authorization'];
    if (auth?.startsWith('Bearer ') && url.includes('foreplay')) {
      authToken = auth.slice(7);
      const h = req.headers();
      // Capture workspace / team headers
      Object.entries(h).forEach(([k, v]) => {
        if (['x-workspace-id','x-team-id','x-user-id','x-org-id'].includes(k)) {
          extraHeaders[k] = v;
        }
      });
    }
  });

  try {
    // Login
    console.log('\n1️⃣  Logging in...');
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.waitForTimeout(300);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);

    console.log('\n2️⃣  Applying Filters via UI Clicks...');
    await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 1. Click Add Filter
    await page.locator('button:has-text("Add Filter")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 1.5 Click Niche
    await page.locator('button:has-text("Niche")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Click "Beauty"
    await page.locator('button:has-text("Beauty"), li:has-text("Beauty"), span:has-text("Beauty")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Click Apply in Niche Submenu
    await page.locator('.filter-list-container button:has-text("Apply"), button:has-text("Apply")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check if parent menu closed, if so, reopen
    let parentBtn = page.locator('button:has-text("Format")').first();
    let isParentVisible = await parentBtn.isVisible().catch(() => false);
    if (!isParentVisible) {
      await page.locator('button:has-text("Add Filter")').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 2. Click Format
    await page.locator('button:has-text("Format")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 3. Click Image
    await page.locator('button:has-text("Image")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    // 4. Click Carousel
    await page.locator('button:has-text("Carousel")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    // 5. Click Apply in Format Submenu
    await page.locator('.filter-list-container button:has-text("Apply"), button:has-text("Apply")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check if parent menu closed, if so, reopen
    const runTimeBtn = page.locator('button:has-text("Run Time")').first();
    const isRunTimeVisible = await runTimeBtn.isVisible().catch(() => false);
    if (!isRunTimeVisible) {
      await page.locator('button:has-text("Add Filter")').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 6. Click Run Time
    await page.locator('button:has-text("Run Time")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 7. Click Over 3 months
    await page.locator('button:has-text("Over 3 months"), button:has-text("3 months")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 8. Click Apply in Run Time Submenu
    await page.locator('.filter-list-container button:has-text("Apply"), button:has-text("Apply")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 9. Click Apply in the Parent Menu to confirm all filters
    await page.locator('button:has-text("Apply")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // 10. Click Shuffle to turn it off (it is blue/active by default)
    console.log('Turning Shuffle OFF...');
    await page.locator('button:has-text("Shuffle")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Scroll to load content and capture API calls
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*')).filter(el => {
          const styles = window.getComputedStyle(el);
          return (
            (styles.overflowY === 'auto' || styles.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight
          );
        });
        els.forEach(el => {
          el.scrollTo(0, el.scrollHeight);
        });
        window.scrollBy(0, 1500);
      });
      await page.waitForTimeout(2500);
    }

    console.log(`🔑 Token captured: ${authToken ? 'yes (' + authToken.slice(0, 30) + '...)' : 'NO'}`);
    console.log(`📤 Extra headers: ${JSON.stringify(extraHeaders)}`);
    await page.screenshot({ path: '/Users/lucagazze/.gemini/antigravity-ide/brain/ed942490-7de1-4927-bccd-78799536631b/scraper_final.png' }).catch(e => console.log('Screenshot failed:', e.message));
    await browser.close();

    if (!authToken) {
      console.log('❌ No token. Exiting.');
      return;
    }

    // ── PHASE 2: Direct API pagination ────────────────────────────────────────
    console.log('\n3️⃣  Fetching ads via API (cursor pagination)...');

    const allAds = [];
    const collectedPaths = new Set();
    let cursor = null;
    let pageNum = 0;
    let rateLimitHits = 0;
    const MAX_RATE_LIMIT_HITS = 3;

    while (allAds.length < needed && rateLimitHits < MAX_RATE_LIMIT_HITS) {
      const params = new URLSearchParams(queryParamsFromBrowser || '');
      params.delete('next');
      params.delete('nextPage');
      params.delete('next_page');
      
      params.set('limit', '50');
      if (cursor) {
        params.set('next', typeof cursor === 'object' ? JSON.stringify(cursor) : String(cursor));
      }
      params.set('sort', 'desc');

      const result = await apiCall(`${apiPathname}?${params}`, authToken, extraHeaders);

      if (result.status === 429) {
        rateLimitHits++;
        console.log(`  Rate limit hit #${rateLimitHits}`);
        if (rateLimitHits >= MAX_RATE_LIMIT_HITS) break;
        continue;
      }

      if (result.status !== 200 || !result.json) {
        console.log(`  Page ${pageNum}: status=${result.status}`);
        break;
      }

      const items = result.json.results || result.json.data || (Array.isArray(result.json) ? result.json : []);
      const nextCursor = result.json.nextPage || result.json.next_page || null;

      if (items?.length > 0) {
        console.log(`📋 Page ${pageNum} first item ID: ${items[0].id || items[0].ad_id}, nextPage cursor: ${nextCursor}`);
      }

      if (pageNum === 0) {
        console.log('📋 API Response keys:', Object.keys(result.json));
        const sampleArr = items;
        console.log(`📋 Sample array length: ${sampleArr.length}`);
        if (sampleArr.length > 0) {
          console.log('📋 First item keys:', Object.keys(sampleArr[0]));
          console.log('📋 First item sample:', JSON.stringify(sampleArr[0], null, 2).slice(0, 500));
        }
      }

      if (!items?.length) {
        console.log(`  Page ${pageNum}: no more items`);
        break;
      }

      let addedThisPage = 0;
      let skippedVideo = 0;
      let skippedNoUrl = 0;
      let skippedExisting = 0;

      for (const item of items) {
        const ad = extractAd(item);
        if (pageNum === 0 && items.indexOf(item) === 0) {
          console.log('📋 First item extraction preview:', {
            brandName: ad.brandName,
            imageUrl: ad.imageUrl,
            isVideo: ad.isVideo,
            isCarousel: ad.isCarousel,
            rawType: item.type,
            rawVideo: item.video,
            rawThumbnail: item.thumbnail
          });
        }
        // Skip videos
        if (ad.isVideo) {
          skippedVideo++;
          continue;
        }
        if (!ad.imageUrl || !ad.imageUrl.startsWith('http')) {
          skippedNoUrl++;
          continue;
        }

        const category = classifyNiches(ad.niches);
        const templateId = CATEGORY_TEMPLATE[category] || 40;
        const imageHash = hashUrl(ad.imageUrl);
        const ext = ad.imageUrl.match(/\.(png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
        const imagePath = `${templateId}/${imageHash}.${ext}`;

        if (existingPaths.has(imagePath) || collectedPaths.has(imagePath)) {
          skippedExisting++;
          continue;
        }

        collectedPaths.add(imagePath);
        allAds.push({ ...ad, category, templateId, imageHash, ext, imagePath });
        addedThisPage++;

        if (allAds.length >= needed) {
          break;
        }
      }

      if (pageNum % 10 === 0 || addedThisPage > 0) {
        console.log(`  Page ${pageNum}: added ${addedThisPage} (skipped: ${skippedVideo} videos, ${skippedNoUrl} no-url, ${skippedExisting} existing) → total ${allAds.length} ads`);
      }

      if (allAds.length >= needed) {
        console.log(`🎯 Reached target: collected ${allAds.length} new unique ads.`);
        break;
      }

      cursor = nextCursor;
      pageNum++;

      if (!cursor) {
        console.log(`  No more pages after page ${pageNum}`);
        break;
      }

      // Careful rate limiting — 1-2s between requests
      await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`\n4️⃣  Collected ${allAds.length} image ads. Downloading images...`);

    // ── PHASE 3: Download images ───────────────────────────────────────────────
    const toSave = [];
    let downloaded = 0, failed = 0, skipped = 0;

    for (const ad of allAds) {
      const { category, templateId, imageHash, ext, imagePath } = ad;

      const subDir = resolve(IMAGES_DIR, String(templateId));
      await mkdir(subDir, { recursive: true });

      try {
        const localDest = resolve(subDir, `${imageHash}.${ext}`);
        await downloadImage(ad.imageUrl, localDest);
        existingPaths.add(imagePath); // prevent duplicates within this run
        
        let carouselImages = [];
        if (ad.isCarousel && ad.carouselUrls && ad.carouselUrls.length > 0) {
          const slidesToDownload = ad.carouselUrls.slice(0, 10);
          for (let i = 0; i < slidesToDownload.length; i++) {
            const slideUrl = slidesToDownload[i];
            const slideHash = hashUrl(slideUrl);
            const slideExt = slideUrl.match(/\.(png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
            const slidePath = `${templateId}/${slideHash}.${slideExt}`;
            const slideDest = resolve(subDir, `${slideHash}.${slideExt}`);
            
            try {
              await downloadImage(slideUrl, slideDest);
              carouselImages.push(slidePath);
              
              if (admin) {
                const slideBytes = fs.readFileSync(slideDest);
                const slideMime = slideExt === 'png' ? 'image/png' : slideExt === 'webp' ? 'image/webp' : 'image/jpeg';
                await admin.storage.from('creative-references').upload(slidePath, slideBytes, {
                  contentType: slideMime,
                  upsert: true
                });
              }
            } catch (slideErr) {
              // skip
            }
          }
        }

        // If Supabase is configured, upload to Storage and save to the database!
        if (admin) {
          const bytes = fs.readFileSync(localDest);
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          
          // 1. Upload image to Storage
          const { error: uploadError } = await admin.storage.from('creative-references').upload(imagePath, bytes, {
            contentType: mime,
            upsert: true
          });
          
          if (uploadError) {
            console.error(`  ❌ Storage upload error for ${ad.brandName}: ${uploadError.message}`);
          }
          
          // 2. Insert or update record in database
          const row = {
            template_id: templateId,
            name: (ad.brandName || 'Foreplay Ad').slice(0, 180),
            image_path: imagePath,
            prompt_notes: String(ad.styleLabel || '').slice(0, 2000),
            sort_order: existingManifest.items.length + toSave.length + 10,
            is_active: true,
            source_url: ad.imageUrl,
            source_platform: 'foreplay',
            rights_status: 'public_domain',
            license_notes: 'Scraped from Foreplay',
            category_group: 'producto',
            category_branch: 'presentar',
            category_leaf: category,
            metadata: {
              scrapedAt: new Date().toISOString(),
              source: 'foreplay',
              mediaType: ad.isCarousel ? 'carousel' : 'static_image',
              foreplayNiches: ad.niches,
              daysActive: String(ad.daysActive || ''),
              carouselImages: carouselImages.length > 0 ? carouselImages : undefined
            },
            updated_at: new Date().toISOString()
          };

          const { data: existingRecord, error: findError } = await admin.from('creative_references')
            .select('id')
            .eq('template_id', templateId)
            .eq('image_path', imagePath)
            .maybeSingle();

          if (!findError) {
            const query = existingRecord
              ? admin.from('creative_references').update(row).eq('id', existingRecord.id)
              : admin.from('creative_references').insert(row);
            const { error: saveError } = await query;
            if (saveError) {
              console.error(`  ❌ DB save error: ${saveError.message}`);
            }
          }
        }

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
          tags: [...(Array.isArray(ad.niches) ? ad.niches : [ad.styleLabel]), ad.isCarousel ? 'Carrusel' : 'Imagen'].filter(Boolean),
          metadata: {
            scrapedAt: new Date().toISOString(),
            source: 'foreplay',
            mediaType: ad.isCarousel ? 'carousel' : 'static_image',
            foreplayNiches: ad.niches,
            daysActive: String(ad.daysActive || ''),
            carouselImages: carouselImages.length > 0 ? carouselImages : undefined
          },
        });
        downloaded++;
        if (downloaded % 50 === 0) console.log(`  ⬇️  ${downloaded} downloaded/imported...`);
      } catch (err) {
        failed++;
        if (failed <= 5) console.warn(`  ⚠️  ${err.message.slice(0, 70)}`);
      }
    }

    console.log(`\n✅ Downloaded: ${downloaded}, Skipped (existing): ${skipped}, Failed: ${failed}`);

    if (toSave.length > 0) {
      const seen = new Set();
      const cleanItems = [];
      const combined = [...existingManifest.items, ...toSave];
      for (const item of combined) {
        if (!item.imagePath) continue;
        if (seen.has(item.imagePath)) continue;
        seen.add(item.imagePath);
        cleanItems.push(item);
      }

      const updatedManifest = {
        ...existingManifest,
        items: cleanItems,
      };
      await writeFile(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));
      console.log(`📄 Manifest: ${updatedManifest.items.length} total (+${toSave.length} new, unique: ${cleanItems.length})`);

      // Upload updated manifest file to Supabase Storage
      if (admin) {
        try {
          console.log('Subiendo manifiesto starter-static-50.json a Storage...');
          const buffer = Buffer.from(JSON.stringify(updatedManifest, null, 2));
          const { error: manifestError } = await admin.storage.from('creative-references').upload('manifests/starter-static-50.json', buffer, {
            contentType: 'application/json',
            upsert: true
          });
          if (manifestError) throw manifestError;
          console.log('Manifiesto starter-static-50.json subido con éxito al Storage.');
        } catch (err) {
          console.error('Error al subir el manifiesto remoto a Storage:', err.message);
        }
      }
    } else {
      console.log('📄 No new ads saved (all already existed or no valid images found).');
    }

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack?.split('\n').slice(0, 4).join('\n'));
    await browser.close().catch(() => {});
  }

  console.log('\n🏁 Done!');
}

main().catch(console.error);
