import { chromium } from 'playwright';

const EMAIL = 'lucagazze10@gmail.com';
const PASSWORD = 'Lucagazze2000-';

async function main() {
  console.log('=== Inspecting Foreplay Filter Dropdowns ===');
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
    await page.waitForTimeout(5000);

    // 1. Click Add Filter
    console.log('Clicking Add Filter...');
    await page.locator('button:has-text("Add Filter")').first().click();
    await page.waitForTimeout(2000);

    // Dump popup HTML
    const popupHtml = await page.evaluate(() => {
      // Find visible menus/dialogs/dropdowns
      const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [data-testid], .dropdown, .popover, .menu');
      return Array.from(menus).map(m => m.outerHTML).join('\n---\n');
    });
    console.log('=== POPUP HTML ===');
    console.log(popupHtml.slice(0, 4000));
    console.log('==================');

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

main().catch(console.error);
