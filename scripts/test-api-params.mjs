import { chromium } from 'playwright';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';
const BASE_PATH = '/Users/lucagazze/.gemini/antigravity-ide/brain/ed942490-7de1-4927-bccd-78799536631b';

async function main() {
  console.log('=== Testing Correct Filter Apply Flow ===');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('request', req => {
    const url = req.url();
    if (url.includes('api.foreplay.co/ads/discovery')) {
      console.log('🎯 Captured Discovery Request:', url);
    }
  });

  try {
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);

    await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // 1. Click Add Filter
    console.log('Clicking Add Filter...');
    await page.locator('button:has-text("Add Filter")').first().click();
    await page.waitForTimeout(1500);

    // 2. Click Format
    console.log('Clicking Format...');
    await page.locator('button:has-text("Format")').first().click();
    await page.waitForTimeout(1500);

    // 3. Click Image
    console.log('Clicking Image...');
    await page.locator('button:has-text("Image")').first().click();
    await page.waitForTimeout(800);

    // 4. Click Carousel
    console.log('Clicking Carousel...');
    await page.locator('button:has-text("Carousel")').first().click();
    await page.waitForTimeout(800);

    // 5. Click Apply in Format Submenu
    console.log('Clicking Apply (Format)...');
    await page.locator('.filter-list-container button:has-text("Apply"), button:has-text("Apply")').first().click();
    await page.waitForTimeout(2000);

    // After format apply, are we back at parent? If so, click Run Time. If not, open Add Filter.
    const runTimeBtn = page.locator('button:has-text("Run Time")').first();
    const isRunTimeVisible = await runTimeBtn.isVisible().catch(() => false);
    console.log('Is Run Time visible on page?', isRunTimeVisible);

    if (!isRunTimeVisible) {
      console.log('Opening Add Filter again...');
      await page.locator('button:has-text("Add Filter")').first().click();
      await page.waitForTimeout(1500);
    }

    // 6. Click Run Time
    console.log('Clicking Run Time...');
    await page.locator('button:has-text("Run Time")').first().click();
    await page.waitForTimeout(1500);

    // 7. Click Over 3 months
    console.log('Clicking Over 3 months...');
    await page.locator('button:has-text("Over 3 months"), button:has-text("3 months")').first().click();
    await page.waitForTimeout(1000);

    // 8. Click Apply in Run Time Submenu
    console.log('Clicking Apply (Run Time)...');
    await page.locator('.filter-list-container button:has-text("Apply"), button:has-text("Apply")').first().click();
    await page.waitForTimeout(2000);

    // 9. Click Apply in the Parent Menu to confirm all filters
    console.log('Clicking Apply on Parent Menu...');
    await page.locator('button:has-text("Apply")').first().click();
    await page.waitForTimeout(4000);

    console.log('Scrolling to trigger API calls...');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${BASE_PATH}/shot_final_applied.png` });
    console.log('Saved final screenshot to shot_final_applied.png');

  } catch (e) {
    console.error('Error during clicks:', e.message);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

main().catch(console.error);
