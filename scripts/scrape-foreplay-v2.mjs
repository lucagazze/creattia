/**
 * scrape-foreplay-v2.mjs — Foreplay scraper with robust DOM inspection
 * 
 * Rewritten to use a DOM-capture approach: 
 * Instead of guessing class names, we intercept network requests 
 * to capture the API responses that Foreplay uses to load ads.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir, readFile } from 'fs/promises';
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

// Foreplay style categories → our internal categories
const STYLE_CATEGORY_MAP = {
  'Before and After': 'antes-despues',
  'Facts and Stats': 'estadisticas',
  'Features and Benefits': 'caracteristicas',
  'Holiday': 'mas-vendidos',
  'Seasonal': 'mas-vendidos',
  'Media and Press': 'notas',
  'Promotion': 'mas-vendidos',
  'Discount': 'mas-vendidos',
  'Reasons why': 'top-razones',
  'Reasons Why': 'top-razones',
  'Testimonial': 'testimonios',
  'Review': 'testimonios',
  'Us vs Them': 'vs',
  'User Generated': 'testimonios',
  'UGC': 'testimonios',
  'Problem Solution': 'problema-solucion',
  'Social Proof': 'testimonios',
  'Unboxing': 'contenido',
  'Tutorial': 'caracteristicas',
  'FAQ': 'preguntas',
};

const CATEGORY_TEMPLATE_MAP = {
  'antes-despues': 40,
  'estadisticas': 40,
  'caracteristicas': 40,
  'mas-vendidos': 13,
  'notas': 40,
  'top-razones': 40,
  'testimonios': 1,
  'vs': 23,
  'problema-solucion': 40,
  'contenido': 40,
  'preguntas': 40,
};

function hashFromUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

function classifyByStyle(styleLabel = '') {
  const lower = styleLabel.toLowerCase();
  for (const [key, cat] of Object.entries(STYLE_CATEGORY_MAP)) {
    if (lower.includes(key.toLowerCase())) return cat;
  }
  return 'caracteristicas';
}

async function downloadImage(url, destPath) {
  // Skip if already exists
  if (fs.existsSync(destPath)) return true;
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  console.log('=== Foreplay Scraper v2 - Network Intercept Mode ===');
  
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  // Load existing manifest
  let existingManifest = { version: 1, collection: 'scraped-ads-library', items: [] };
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    existingManifest = JSON.parse(raw);
    console.log(`📦 Existing manifest: ${existingManifest.items.length} ads`);
  } catch {
    console.log('📦 No existing manifest, starting fresh');
  }

  const capturedAds = []; // Ads captured from API intercepts
  const capturedImageUrls = new Set();

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // ── Intercept API calls from Foreplay ──────────────────────────────────────
  page.on('response', async (response) => {
    const url = response.url();
    // Foreplay's API calls for ad discovery
    if (!url.includes('foreplay') && !url.includes('api.') && !url.includes('/ads') && !url.includes('/discovery') && !url.includes('/search')) return;
    if (response.status() !== 200) return;
    
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;

    try {
      const json = await response.json().catch(() => null);
      if (!json) return;
      
      // Look for arrays of ad objects in the response
      const items = json.data || json.ads || json.results || json.items || 
                    (Array.isArray(json) ? json : null);
      
      if (!Array.isArray(items) || items.length === 0) return;
      
      console.log(`📡 API: ${url.slice(0, 80)} → ${items.length} items`);
      
      for (const item of items) {
        // Extract image URL from various possible fields
        const imageUrl = item.adUrl || item.imageUrl || item.ad_url || 
                        item.creative?.url || item.thumbnail || item.image ||
                        item.previewUrl || item.preview_url ||
                        (item.media && (item.media[0]?.url || item.media[0]?.src));
        
        if (!imageUrl || capturedImageUrls.has(imageUrl)) continue;
        capturedImageUrls.add(imageUrl);
        
        // Extract metadata
        const brandName = item.advertiserName || item.brand || item.page_name || 
                         item.pageName || item.account?.name || '';
        const styleLabel = item.style || item.category || item.ad_style || 
                          item.tags?.[0] || '';
        const daysActive = item.daysActive || item.days_active || item.duration || '';
        const isCarousel = item.type === 'carousel' || item.format === 'carousel' ||
                          (item.media && item.media.length > 1);
        
        const category = classifyByStyle(styleLabel);
        const templateId = CATEGORY_TEMPLATE_MAP[category] || 40;
        const imageHash = hashFromUrl(imageUrl);
        const ext = imageUrl.includes('.png') ? 'png' : imageUrl.includes('.webp') ? 'webp' : 'jpg';
        const imagePath = `${templateId}/${imageHash}.${ext}`;
        
        capturedAds.push({
          templateId,
          name: brandName || 'Ad',
          imagePath,
          remoteImageUrl: imageUrl,
          promptNotes: styleLabel || '',
          sortOrder: existingManifest.items.length + capturedAds.length + 10,
          rightsStatus: 'public_domain',
          categoryGroup: 'producto',
          categoryBranch: 'presentar',
          categoryLeaf: category,
          category,
          tags: [styleLabel, isCarousel ? 'Carrusel' : 'Imagen'].filter(Boolean),
          metadata: {
            scrapedAt: new Date().toISOString(),
            source: 'foreplay',
            mediaType: isCarousel ? 'carousel' : 'static_image',
            foreplayStyle: styleLabel,
            daysActive: String(daysActive),
          },
        });
      }
      
      console.log(`  ✓ Total captured: ${capturedAds.length}`);
    } catch (err) {
      // ignore
    }
  });

  try {
    // ── Login ──────────────────────────────────────────────────────────────────
    console.log('\n1️⃣  Logging in...');
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill(EMAIL);
    await page.waitForTimeout(500);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(PASSWORD);
    await page.waitForTimeout(500);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    if (!page.url().includes('discovery')) {
      await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    console.log('✅ Logged in! URL:', page.url());
    await page.waitForTimeout(5000);

    // ── Apply Filters via URL params ───────────────────────────────────────────
    // Foreplay supports URL-based filtering. Try adding filter params to the URL.
    console.log('\n2️⃣  Navigating to Discovery with filters...');
    
    // Try URL-based filter approach
    const filterUrl = 'https://app.foreplay.co/discovery?format[]=image&format[]=carousel&runTime=over90';
    await page.goto(filterUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Also try clicking filters manually as backup
    // Look for any filter-related buttons
    const allButtons = await page.locator('button').allTextContents();
    console.log('  Visible buttons:', allButtons.slice(0, 15).join(' | '));

    // ── Scroll and collect ─────────────────────────────────────────────────────
    console.log('\n3️⃣  Starting collection via scroll...');
    
    let scrollAttempts = 0;
    const maxScrolls = 300;

    while (capturedAds.length < TARGET_ADS && scrollAttempts < maxScrolls) {
      // Also try direct DOM extraction as fallback
      if (capturedAds.length === 0 && scrollAttempts % 5 === 0) {
        // Dump the page HTML to understand the structure
        const html = await page.content();
        const imgSrcs = [...html.matchAll(/src="(https:\/\/[^"]*(?:cdn|fbcdn|fb\.com|foreplay)[^"]*\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/gi)].map(m => m[1]);
        console.log(`  Found ${imgSrcs.length} image URLs in HTML`);
        
        if (imgSrcs.length > 0 && scrollAttempts === 0) {
          console.log('  Sample image URL:', imgSrcs[0]);
        }

        // Try evaluating a comprehensive DOM extraction
        const domAds = await page.evaluate(() => {
          const results = [];
          
          // Strategy 1: Find all images that look like ad creatives (large CDN images)
          const allImgs = document.querySelectorAll('img');
          const adImgs = Array.from(allImgs).filter(img => {
            const src = img.src || '';
            const naturalW = img.naturalWidth;
            const naturalH = img.naturalHeight;
            return src.length > 50 && (
              src.includes('cdn') || src.includes('fbcdn') || 
              src.includes('b-cdn') || src.includes('cloudfront')
            ) && !src.includes('logo') && !src.includes('avatar') && 
              !src.includes('profile') && naturalW > 200;
          });
          
          for (const img of adImgs) {
            // Find the containing card
            let card = img.parentElement;
            let depth = 0;
            while (card && depth < 8) {
              const style = window.getComputedStyle(card);
              if (style.position === 'relative' || card.tagName === 'LI' || card.tagName === 'ARTICLE') break;
              card = card.parentElement;
              depth++;
            }
            
            const brandEl = card?.querySelector('p, span, h2, h3, h4, [class*="name"], [class*="brand"], [class*="advertiser"]');
            const tagEl = card?.querySelector('[class*="tag"], [class*="style"], [class*="label"], [class*="badge"]');
            
            results.push({
              imageUrl: img.src,
              brandName: brandEl?.textContent?.trim()?.slice(0, 100) || '',
              styleLabel: tagEl?.textContent?.trim() || '',
              cardText: card?.textContent?.trim()?.slice(0, 200) || '',
            });
          }
          
          return results;
        });

        if (domAds.length > 0) {
          console.log(`  DOM extraction found ${domAds.length} images, sample: ${domAds[0]?.imageUrl?.slice(0, 60)}`);
          
          for (const ad of domAds) {
            if (!ad.imageUrl || capturedAds.find(c => c.remoteImageUrl === ad.imageUrl)) continue;
            
            const category = classifyByStyle(ad.styleLabel);
            const templateId = CATEGORY_TEMPLATE_MAP[category] || 40;
            const imageHash = hashFromUrl(ad.imageUrl);
            const ext = ad.imageUrl.includes('.png') ? 'png' : ad.imageUrl.includes('.webp') ? 'webp' : 'jpg';
            const imagePath = `${templateId}/${imageHash}.${ext}`;
            
            capturedAds.push({
              templateId,
              name: ad.brandName || 'Foreplay Ad',
              imagePath,
              remoteImageUrl: ad.imageUrl,
              promptNotes: ad.styleLabel || '',
              sortOrder: existingManifest.items.length + capturedAds.length + 10,
              rightsStatus: 'public_domain',
              categoryGroup: 'producto',
              categoryBranch: 'presentar',
              categoryLeaf: category,
              category,
              tags: [ad.styleLabel, 'Imagen'].filter(Boolean),
              metadata: {
                scrapedAt: new Date().toISOString(),
                source: 'foreplay',
                mediaType: 'static_image',
                foreplayStyle: ad.styleLabel,
                cardText: ad.cardText,
              },
            });
          }
          console.log(`  ✓ Total from DOM: ${capturedAds.length}`);
        }
      }

      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(2500);
      scrollAttempts++;
      
      if (scrollAttempts % 10 === 0) {
        console.log(`  Scroll ${scrollAttempts}/${maxScrolls} — Total ads: ${capturedAds.length}`);
      }
    }

    console.log(`\n4️⃣  Collection complete: ${capturedAds.length} ads. Downloading images...`);

    // ── Download images ────────────────────────────────────────────────────────
    let downloaded = 0, failed = 0;
    const toSave = [];

    // Filter out duplicates with existing manifest
    const existingPaths = new Set(existingManifest.items.map(i => i.imagePath));

    for (const ad of capturedAds) {
      if (existingPaths.has(ad.imagePath)) continue;
      if (!ad.remoteImageUrl) { failed++; continue; }

      const subDir = resolve(IMAGES_DIR, String(ad.templateId));
      await mkdir(subDir, { recursive: true });

      const imageName = ad.imagePath.split('/')[1];
      const localPath = resolve(IMAGES_DIR, String(ad.templateId), imageName);

      try {
        await downloadImage(ad.remoteImageUrl, localPath);
        const saveItem = { ...ad };
        delete saveItem.remoteImageUrl;
        toSave.push(saveItem);
        downloaded++;
        if (downloaded % 25 === 0) console.log(`  ⬇️  ${downloaded} downloaded...`);
      } catch (err) {
        failed++;
        if (failed <= 5) console.warn(`  ⚠️  ${ad.name}: ${err.message}`);
      }
    }

    console.log(`\n✅ Downloaded: ${downloaded}, Skipped (already exist): ${existingPaths.size}, Failed: ${failed}`);

    // ── Update manifest ────────────────────────────────────────────────────────
    if (toSave.length > 0) {
      const updatedManifest = {
        ...existingManifest,
        items: [...existingManifest.items, ...toSave],
      };
      await writeFile(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));
      console.log(`📄 Manifest updated: ${updatedManifest.items.length} total ads (+${toSave.length} new)`);
    } else {
      console.log('📄 No new ads to save.');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Done!');
  }
}

main().catch(console.error);
