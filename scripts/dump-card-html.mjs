import { chromium } from 'playwright';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';

async function main() {
  console.log('=== Dumping Foreplay Card HTML ===');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto('https://app.foreplay.co/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);

    await page.goto('https://app.foreplay.co/discovery', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // Get outer HTML of the first card
    const cardHtml = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="ad-card"], .ad-card, [class*="card"], [class*="Card"]');
      return card ? card.outerHTML : 'No card found';
    });

    console.log('=== CARD HTML ===');
    console.log(cardHtml.slice(0, 3000));
    console.log('=================');

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

main().catch(console.error);
