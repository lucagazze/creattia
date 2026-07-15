/**
 * scrape-foreplay.mjs
 * 
 * Scraper for Foreplay Discovery using Playwright.
 * Logs in with user credentials, applies filters (Image + Carousel, Run Time > 90 days),
 * and downloads ads with their category (Style), brand name, and image URLs.
 * 
 * Usage:
 *   node --env-file-if-exists=.env scripts/scrape-foreplay.mjs
 * 
 * Requirements:
 *   - FOREPLAY_EMAIL and FOREPLAY_PASSWORD env vars (or hardcoded below for local use)
 *   - Playwright installed: npm install playwright
 *   - Chromium: npx playwright install chromium
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────
const EMAIL = process.env.FOREPLAY_EMAIL || 'lucagazze10@gmail.com';
const PASSWORD = process.env.FOREPLAY_PASSWORD || 'Lucagazze2000-';
const TARGET_ADS = 1000;
const OUTPUT_DIR = resolve('./public/scraped_ads');
const IMAGES_DIR = resolve('./public/scraped_ads/images');
const MANIFEST_PATH = resolve('./public/scraped_ads/manifest.json');

// Foreplay style categories → our internal categories
const STYLE_CATEGORY_MAP = {
  'Before and After': 'antes-despues',
  'Facts and Stats': 'estadisticas',
  'Features and Benefits': 'caracteristicas',
  'Holiday - Seasonal': 'mas-vendidos',
  'Media and Press': 'notas',
  'Promotion and Disco': 'mas-vendidos',
  'Promotion and Discount': 'mas-vendidos',
  'Reasons why': 'top-razones',
  'Reasons Why': 'top-razones',
  'Testimonial - Review': 'testimonios',
  'Testimonial': 'testimonios',
  'Us vs Them': 'vs',
  'Beta Image Ads Only': 'caracteristicas',
  'User Generated Content': 'testimonios',
  'UGC': 'testimonios',
  'Product Demo': 'caracteristicas',
  'Lifestyle': 'caracteristicas',
  'Problem Solution': 'problema-solucion',
  'Social Proof': 'testimonios',
  'Unboxing': 'contenido',
  'Tutorial': 'caracteristicas',
  'FAQ': 'preguntas',
};

// Template IDs mapping by category (used in manifest)
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
  'multimedia': 40,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
}

function hashFromUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function classifyByStyle(styleLabel = '') {
  for (const [key, cat] of Object.entries(STYLE_CATEGORY_MAP)) {
    if (styleLabel.toLowerCase().includes(key.toLowerCase())) {
      return cat;
    }
  }
  return 'caracteristicas';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Foreplay Scraper - Creattia ===');
  console.log(`Target: ${TARGET_ADS} ads`);
  
  // Prepare output dirs
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  // Load existing manifest to avoid duplicates
  let existingManifest = { version: 1, collection: 'scraped-ads-library', items: [] };
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    existingManifest = JSON.parse(raw);
    console.log(`📦 Existing manifest: ${existingManifest.items.length} ads`);
  } catch {
    console.log('📦 No existing manifest, starting fresh');
  }
  const existingPaths = new Set(existingManifest.items.map(i => i.imagePath));

  const browser = await chromium.launch({ 
    headless: false, // Keep visible so you can see what's happening
    slowMo: 200,
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  const newAds = [];

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    console.log('\n1️⃣  Logging in to Foreplay...');
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    
    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await emailInput.fill(EMAIL);
    
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(PASSWORD);
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first();
    await submitBtn.click();
    
    // Wait for redirect or URL change
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    if (!currentUrl.includes('discovery')) {
      console.log('Current URL:', currentUrl, '- waiting more...');
      await page.waitForURL('**/*', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    console.log('✅ Logged in! URL:', page.url());
    await page.waitForTimeout(4000);

    // ── Apply Filters ───────────────────────────────────────────────────────
    console.log('\n2️⃣  Applying filters: Image + Carousel, Run Time > 90 days...');
    
    await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    console.log('  Page title:', await page.title());
    console.log('  Current URL:', page.url());
    
    // Click "Add Filter" button
    const addFilterBtn = page.locator('button:has-text("Add Filter"), [data-testid="add-filter"]').first();
    await addFilterBtn.click().catch(() => console.log('Could not find Add Filter button'));
    await page.waitForTimeout(1500);
    
    // Select Format filter
    const formatOption = page.locator('text=Format').first();
    await formatOption.click().catch(() => console.log('Could not click Format'));
    await page.waitForTimeout(1000);
    
    // Select Image and Carousel
    await page.locator('text=Image').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('text=Carousel').first().click().catch(() => {});
    await page.waitForTimeout(500);
    
    // Click Done or Apply
    await page.locator('button:has-text("Done"), button:has-text("Apply"), button:has-text("Save")').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    
    // Now set Run Time filter
    const runTimeBtn = page.locator('button:has-text("Run Time"), text=Run Time').first();
    await runTimeBtn.click().catch(() => console.log('Could not click Run Time'));
    await page.waitForTimeout(1000);
    
    // Select "Over 90 days"
    await page.locator('text=Over 90 days, text=90 days, text=3 months').first().click().catch(() => console.log('Could not find 90 days option'));
    await page.waitForTimeout(1500);
    
    console.log('✅ Filters applied (or attempted)');
    await page.waitForTimeout(2000);

    // ── Scrape Ads ──────────────────────────────────────────────────────────
    console.log('\n3️⃣  Starting ad collection...');
    let scrollAttempts = 0;
    const maxScrollAttempts = 200;
    const seenAdIds = new Set();

    while (newAds.length < TARGET_ADS && scrollAttempts < maxScrollAttempts) {
      // Get all ad cards currently visible
      const adCards = await page.locator('[data-testid="ad-card"], .ad-card, [class*="AdCard"], [class*="ad-card"]').all();
      
      if (adCards.length === 0) {
        // Try a more generic selector
        const genericCards = await page.locator('[class*="card"]:has(img)').all();
        console.log(`  Found ${genericCards.length} generic cards on attempt ${scrollAttempts}`);
      }

      // Extract data from cards visible in the DOM
      const adsOnPage = await page.evaluate(() => {
        const results = [];
        
        // Try multiple selectors for Foreplay's card structure
        const cards = document.querySelectorAll(
          '[data-testid="ad-card"], .ad-card, [class*="AdCard"], [class*="adCard"]'
        );
        
        cards.forEach((card) => {
          try {
            // Brand name
            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], [class*="advertiser"], h3, h4');
            const brandName = brandEl?.textContent?.trim() || '';
            
            // Days active
            const daysEl = card.querySelector('[class*="days"], [class*="Days"], [class*="duration"]');
            const daysText = daysEl?.textContent?.trim() || '';
            
            // Image
            const imgEl = card.querySelector('img[src*="cdn"], img[src*="fbcdn"], img[src*="facebook"], img:not([src*="logo"]):not([src*="avatar"]):not([src*="profile"])');
            const imageUrl = imgEl?.src || '';
            
            // Logo/avatar
            const logoEl = card.querySelector('img[src*="logo"], img[src*="avatar"], img[src*="profile"], [class*="logo"] img, [class*="avatar"] img');
            const logoUrl = logoEl?.src || '';
            
            // Category/Style tag
            const styleEl = card.querySelector('[class*="style"], [class*="Style"], [class*="tag"], [class*="Tag"], [class*="category"]');
            const styleLabel = styleEl?.textContent?.trim() || '';
            
            // Media type (check for carousel indicators)
            const isCarousel = !!card.querySelector('[class*="carousel"], [class*="slider"], [aria-label*="carousel"]') || 
                               card.querySelectorAll('img[src*="cdn"], img[src*="fbcdn"]').length > 1;
            
            // Ad ID (from data attributes or URL)
            const adLink = card.querySelector('a[href*="/ad/"], a[href*="/creative/"]');
            const adId = card.dataset?.id || card.dataset?.adId || 
                        adLink?.href?.split('/').pop() || 
                        imageUrl ? btoa(imageUrl).slice(0, 16) : Math.random().toString(36).slice(2, 16);
            
            if (brandName || imageUrl) {
              results.push({
                adId: String(adId),
                brandName,
                imageUrl,
                logoUrl,
                styleLabel,
                daysText,
                isCarousel,
              });
            }
          } catch (e) {
            // Skip card on error
          }
        });
        
        return results;
      });

      // Add new ads we haven't seen
      for (const ad of adsOnPage) {
        if (!ad.imageUrl || seenAdIds.has(ad.adId)) continue;
        seenAdIds.add(ad.adId);
        
        const category = classifyByStyle(ad.styleLabel);
        const templateId = CATEGORY_TEMPLATE_MAP[category] || 40;
        const imageHash = hashFromUrl(ad.imageUrl);
        const ext = 'jpg';
        const localFileName = `${templateId}/${imageHash}.${ext}`;
        
        if (existingPaths.has(localFileName)) continue;

        newAds.push({
          templateId,
          name: ad.brandName || 'Ad',
          imagePath: localFileName,
          remoteImageUrl: ad.imageUrl,
          promptNotes: ad.styleLabel ? `${ad.styleLabel}. ${ad.daysText}` : ad.daysText,
          sortOrder: existingManifest.items.length + newAds.length + 10,
          rightsStatus: 'public_domain',
          categoryGroup: 'producto',
          categoryBranch: 'presentar',
          categoryLeaf: category,
          category,
          tags: [ad.styleLabel, ad.isCarousel ? 'Carrusel' : 'Imagen'].filter(Boolean),
          metadata: {
            scrapedAt: new Date().toISOString(),
            source: 'foreplay',
            logoUrl: ad.logoUrl,
            mediaType: ad.isCarousel ? 'carousel' : 'static_image',
            foreplayStyle: ad.styleLabel,
            daysActive: ad.daysText,
          },
        });
      }

      console.log(`  📊 Collected ${newAds.length}/${TARGET_ADS} ads (scroll ${scrollAttempts})`);
      
      if (newAds.length >= TARGET_ADS) break;

      // Scroll down to load more
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(2000);
      scrollAttempts++;
    }

    console.log(`\n4️⃣  Collected ${newAds.length} new ads. Downloading images...`);

    // ── Download Images ─────────────────────────────────────────────────────
    let downloaded = 0;
    let failed = 0;
    const toSave = [];

    for (const ad of newAds) {
      if (!ad.remoteImageUrl) {
        failed++;
        continue;
      }
      
      // Ensure subdirectory exists
      const subDir = resolve(IMAGES_DIR, String(ad.templateId));
      await mkdir(subDir, { recursive: true });
      
      const imageName = ad.imagePath.split('/')[1]; // e.g. "abc123.jpg"
      const localPath = resolve(IMAGES_DIR, String(ad.templateId), imageName);
      
      try {
        await downloadImage(ad.remoteImageUrl, localPath);
        // Update imagePath to use the images subdirectory for local serving
        const saveItem = { ...ad };
        delete saveItem.remoteImageUrl;
        toSave.push(saveItem);
        downloaded++;
        
        if (downloaded % 50 === 0) {
          console.log(`  ⬇️  Downloaded ${downloaded}/${newAds.length}...`);
        }
      } catch (err) {
        failed++;
        console.warn(`  ⚠️  Failed to download ${ad.name}: ${err.message}`);
      }
    }

    console.log(`\n✅ Downloaded: ${downloaded}, Failed: ${failed}`);

    // ── Update Manifest ─────────────────────────────────────────────────────
    const updatedManifest = {
      ...existingManifest,
      items: [...existingManifest.items, ...toSave],
    };
    
    await writeFile(MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2));
    console.log(`\n📄 Manifest updated: ${updatedManifest.items.length} total ads`);
    console.log(`📁 Images saved to: ${IMAGES_DIR}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
    console.log('\n🏁 Done!');
  }
}

main().catch(console.error);
