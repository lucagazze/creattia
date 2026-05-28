"""
Generate WebP screenshots for all email templates in the library.
Usage: python scripts/gen_email_screenshots.py
Requires: playwright (pip install playwright && playwright install chromium)
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE   = Path(__file__).parent.parent
EMAILS = BASE / "public" / "email-library"
OUT    = EMAILS / "screenshots"
OUT.mkdir(exist_ok=True)

async def screenshot_email(page, html_file: Path, out_path: Path):
    url = html_file.as_uri()
    await page.goto(url, wait_until="networkidle", timeout=20000)
    # Let images load
    await page.wait_for_timeout(1500)
    # Measure full height
    height = await page.evaluate("() => document.documentElement.scrollHeight")
    await page.set_viewport_size({"width": 600, "height": max(height, 400)})
    await page.wait_for_timeout(300)
    # Save as PNG first, then convert to webp via pillow (playwright only supports png/jpeg natively)
    tmp = out_path.with_suffix(".png")
    await page.screenshot(path=str(tmp), type="png", full_page=False, clip={"x": 0, "y": 0, "width": 600, "height": max(height, 400)})
    from PIL import Image
    img = Image.open(tmp)
    img.save(str(out_path), "webp", quality=88)
    tmp.unlink()
    print(f"  OK  {out_path.name}")

async def main(target: str | None = None):
    with open(EMAILS / "emails.json", encoding="utf-8") as f:
        emails = json.load(f)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page    = await browser.new_page()
        await page.set_viewport_size({"width": 600, "height": 800})

        for entry in emails:
            fname = entry["file"]
            if target and fname != target:
                continue
            html_path = EMAILS / fname
            if not html_path.exists():
                print(f"  SKIP {fname} (file not found)")
                continue
            out = OUT / fname.replace(".html", ".webp")
            print(f"  Screenshotting {fname}...")
            try:
                await screenshot_email(page, html_path, out)
            except Exception as e:
                print(f"  ERR  {fname}: {e}")

        await browser.close()
    print(f"\nDone. Screenshots in {OUT}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(main(target))
