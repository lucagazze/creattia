import os
import tempfile
import time
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright


def load_env(path: str):
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        if raw and not raw.startswith("#") and "=" in raw:
            key, value = raw.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(".env.local")
supabase_url = os.environ["PUBLIC_SUPABASE_URL"]
service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
email = f"video-ui-{int(time.time() * 1000)}@example.invalid"
password = "Creattia-Video-UI-Aa1!"
admin_headers = {"apikey": service_key, "authorization": f"Bearer {service_key}", "content-type": "application/json"}
created = requests.post(f"{supabase_url}/auth/v1/admin/users", headers=admin_headers, json={"email": email, "password": password, "email_confirm": True}, timeout=30)
created.raise_for_status()
user_id = created.json()["id"]

try:
    requests.patch(
        f"{supabase_url}/rest/v1/creative_profiles?user_id=eq.{user_id}",
        headers={**admin_headers, "prefer": "return=minimal"},
        json={"credits_remaining": 20, "brand_name": "Marca UI Creattia"},
        timeout=30,
    ).raise_for_status()
    manifest = requests.get(f"{supabase_url}/storage/v1/object/public/creative-videos/manifests/video-library.json", timeout=30).json()
    reference = next(item for item in manifest["items"] if item.get("name") == "Well You")
    poster_url = f"{supabase_url}/storage/v1/object/public/creative-videos/{reference['thumbnailPath']}"

    with tempfile.TemporaryDirectory(prefix="creattia-ui-") as directory:
        product_path = Path(directory) / "product.jpg"
        product_response = requests.get(poster_url, timeout=30)
        product_response.raise_for_status()
        product_path.write_bytes(product_response.content)

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            browser_errors = []
            page.on("pageerror", lambda error: browser_errors.append(str(error)))
            page.goto("http://localhost:4321/app")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name="Ingresar", exact=True).click()
            page.get_by_label("Correo electrónico").fill(email)
            page.get_by_role("button", name="Continuar", exact=True).click()
            page.get_by_label("Contraseña").fill(password)
            page.get_by_role("button", name="Ingresar", exact=True).click()
            page.get_by_text("Biblioteca de ganadores", exact=True).first.wait_for(timeout=20_000)
            page.get_by_text("Biblioteca de ganadores", exact=True).first.click()
            page.get_by_role("heading", name="Biblioteca de ganadores").wait_for(timeout=20_000)
            play_buttons = page.locator('[aria-label^="Reproducir video de"]')
            play_buttons.first.wait_for(timeout=30_000)
            video_count = play_buttons.count()
            assert video_count > 0, "La biblioteca debe renderizar videos ganadores"
            play_buttons.first.click()
            lightbox_video = page.locator(".ref-modal video")
            lightbox_video.wait_for(timeout=10_000)
            assert lightbox_video.get_attribute("controls") is not None
            page.get_by_role("button", name="Usar esta idea →").click()
            page.get_by_role("heading", name="Construí el video antes de generarlo.").wait_for(timeout=10_000)

            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(500)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El flujo no debe desbordar horizontalmente en mobile"
            page.get_by_placeholder("Nombre del producto").fill("Producto UI Creattia")
            page.get_by_placeholder("Ej: Creattia").fill("Marca UI Creattia")
            page.locator('.video-file-picker input[type="file"]').first.set_input_files(str(product_path))
            page.get_by_role("button", name="Continuar →").click()
            page.get_by_role("button", name="Sin personas", exact=False).click()
            page.get_by_role("button", name="Continuar →").click()
            duration_select = page.locator('select:has(option[value="30"])')
            assert "20 segundos" in duration_select.inner_text()
            assert "30 segundos" in duration_select.inner_text()
            duration_select.select_option("30")
            assert "12 créditos al generar" in page.locator(".video-creation-cost").inner_text()
            page.get_by_role("button", name="Adaptar el diálogo", exact=False).click()
            page.get_by_placeholder("Ej: nombrar a MiMarca, explicar que el sérum hidrata y cerrar con Compralo hoy").wait_for()
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El paso de producción no debe desbordar en mobile"

            page.set_viewport_size({"width": 1440, "height": 900})
            page.wait_for_timeout(300)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El flujo no debe desbordar en desktop"
            assert not browser_errors, f"Errores de navegador: {browser_errors}"
            print(f"video-ui: PASS; {video_count} videos visibles, player y wizard verificados en 390px/1440px")
            browser.close()
finally:
    requests.delete(f"{supabase_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=30)
