import json
import os
import re
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

fake_analysis = {
    "hook": "Una creadora muestra el problema en el primer segundo y promete una solución simple.",
    "pacing": "Cortes rápidos al inicio, demostración central y cierre claro.",
    "camera": "Primeros planos UGC, cámara en mano estable y detalle del producto.",
    "hasSpeakingPerson": True,
    "dialoguePurpose": "Convertir el problema en una recomendación creíble y cerrar con una acción.",
}
fake_suggestions = {
    "concept": "Una creadora abre con el problema, demuestra la textura de Hydra 10 y cierra con una recomendacion directa.",
    "referenceMode": "Idea + guion adaptado",
    "objective": "UGC / Testimonial",
    "audience": "Personas de 25 a 40 con piel sensible",
    "benefit": "Hidratacion ligera sin sensacion grasa",
    "proof": "Mostrar la textura y la aplicacion real del producto",
    "offer": "Sin oferta especifica: enfocar el beneficio principal.",
    "cta": "Conoce Hydra 10",
    "tone": "UGC natural",
    "preserveDirection": "Conservar el hook, el ritmo y la progresion del ganador.",
    "changeDirection": "Crear persona, escenas, palabras y locacion originales para Hydra 10.",
    "castingMode": "custom",
    "creatorAge": "25 a 40 anos",
    "creatorStyle": "Natural, cercana y realista, con luz de ventana.",
    "peopleDirection": "Usuaria real de skincare que habla a camara.",
    "productUsage": "Mostrar el envase y la textura en primer plano.",
    "mustAvoid": "No prometer resultados medicos ni copiar a la persona del ganador.",
    "language": "Español rioplatense",
    "speechMode": "adapt",
    "dialogueInstructions": "Nombrar Hydra 10, explicar el beneficio y cerrar con Conocelo hoy.",
    "voiceoverMode": "none",
    "voiceover": "Voz natural, calida y creible.",
    "musicMode": "music",
    "audioDirection": "Beat moderno suave con efectos sincronizados.",
    "captionMode": "dynamic",
    "captions": "Hook, beneficio y CTA en textos breves.",
    "formatMode": "vertical",
    "durationSeconds": 13,
    "durationReason": "La demostracion y el dialogo necesitan 13 segundos.",
    "audienceReason": "Reconoce el problema y valora una demostracion real.",
    "audienceAlternatives": [
        {"name": "Rutinas simples", "ageRange": "25 a 40 años", "insight": "Busca una solucion facil.", "angle": "Problema y demostracion."},
        {"name": "Compradores informados", "ageRange": "30 a 50 años", "insight": "Compara textura y uso.", "angle": "Prueba visual verificable."},
    ],
    "objections": "Dudas sobre textura, uso y resultados.",
    "hookIdea": "Mostrar la incomodidad y resolverla en el primer segundo.",
    "performanceDirection": "Conversacional, con pausas y gestos pequeños.",
    "realismDirection": "Piel, manos, contacto y movimientos naturales sin deformaciones.",
}
fake_analysis["creativeSuggestions"] = fake_suggestions

fake_plan = {
    "hook": "¿Tu piel queda tirante después de lavarla? Mirá esto.",
    "objective": "Conversión",
    "audience": "Personas con piel sensible",
    "coreMessage": "Hydra 10 hidrata con una textura liviana y fácil de incorporar.",
    "visualStyle": "UGC realista, luz natural y producto siempre fiel a las fotos.",
    "voiceover": "Voz cálida y natural.",
    "captions": "Hook, beneficio y CTA en textos breves.",
    "audio": "Beat moderno suave con efectos sincronizados.",
    "cta": "Conocé Hydra 10",
    "scenes": [
        "0–3s: Hook a cámara, problema visible y producto entrando en cuadro.",
        "3–8s: Demostración de textura y aplicación con primer plano del envase.",
        "8–10s: Resultado, marca y CTA final.",
    ],
    "speechMode": "adapt",
    "hasSpokenDialogue": True,
    "dialogueLines": [
        {"start": 0.5, "end": 4, "speaker": "Creadora", "line": "Si tu piel queda tirante, Hydra 10 puede simplificar tu rutina.", "delivery": "Natural, cercana y mirando a cámara."}
    ],
}

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
            page.route(
                "**/api/creativos/video-suggestions",
                lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "source": "ai", "analysis": fake_analysis, "suggestions": fake_suggestions})),
            )
            page.route(
                "**/api/creativos/video-plan",
                lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "analysis": fake_analysis, "plan": fake_plan})),
            )
            page.goto("http://localhost:4321/app")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name="Ingresar", exact=True).click()
            page.get_by_label("Correo electrónico").fill(email)
            page.get_by_role("button", name="Continuar", exact=True).click()
            page.get_by_label("Contraseña").fill(password)
            page.get_by_role("button", name="Ingresar", exact=True).click()
            page.get_by_text("Biblioteca de ganadores", exact=True).first.wait_for(timeout=20_000)

            page.set_viewport_size({"width": 390, "height": 844})
            selected_count = page.locator("button.picker-pill.active")
            selected_count.wait_for()
            assert selected_count.evaluate("el => getComputedStyle(el).backgroundColor") != "rgb(25, 23, 29)", "La cantidad seleccionada no debe usar fondo negro"
            count_screenshot_path = os.environ.get("CREATTIA_COUNT_UI_SCREENSHOT", "").strip()
            if count_screenshot_path:
                Path(count_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=count_screenshot_path, full_page=False)
            page.get_by_role("button", name="Continuar", exact=True).click()
            search_cta = page.locator('button[type="submit"].url-batch-submit-btn')
            search_cta.wait_for()
            assert search_cta.inner_text().replace("\n", " ").strip() == "Buscar 10 anuncios Gratis"
            assert search_cta.evaluate("el => el.scrollWidth <= el.clientWidth + 1"), "El CTA debe entrar en una sola línea"
            batch_screenshot_path = os.environ.get("CREATTIA_BATCH_UI_SCREENSHOT", "").strip()
            if batch_screenshot_path:
                Path(batch_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=batch_screenshot_path, full_page=False)
            page.set_viewport_size({"width": 1440, "height": 900})

            page.get_by_text("Biblioteca de ganadores", exact=True).first.click()
            page.get_by_role("heading", name="Biblioteca de ganadores").wait_for(timeout=20_000)
            duration_trigger = page.locator(".duration-filter .niche-dd-trigger")
            duration_trigger.wait_for(timeout=10_000)
            page.wait_for_function(
                "() => Number(document.querySelector('.duration-filter .niche-dd-badge')?.textContent || 0) > 0",
                timeout=30_000,
            )
            page.evaluate("window.scrollTo(0, 180)")
            duration_trigger.click()
            duration_items = page.locator(".duration-filter .niche-dd-item")
            selected_duration_item = None
            selected_duration_label = ""
            for index in range(1, duration_items.count()):
                item = duration_items.nth(index)
                count_text = item.locator(".niche-dd-count").inner_text().strip()
                if count_text.isdigit() and int(count_text) > 0:
                    selected_duration_item = item
                    selected_duration_label = item.locator(".niche-dd-name").inner_text().strip()
                    break
            assert selected_duration_item and selected_duration_label, "Debe existir al menos un rango de duración con videos"
            filter_scroll_before = page.evaluate("window.scrollY")
            selected_duration_item.evaluate(
                "el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.click(); }"
            )
            page.locator(".library-active-filters").get_by_text(selected_duration_label, exact=False).wait_for(timeout=10_000)
            page.wait_for_timeout(500)
            filter_scroll_after = page.evaluate("window.scrollY")
            assert abs(filter_scroll_after - filter_scroll_before) <= 3, (
                f"Aplicar un filtro no debe mover la posición de la biblioteca "
                f"(antes={filter_scroll_before}, después={filter_scroll_after})"
            )
            assert "Video" in page.locator(".library-filter-controls .niche-dd").nth(2).inner_text()
            duration_screenshot_path = os.environ.get("CREATTIA_DURATION_FILTER_SCREENSHOT", "").strip()
            if duration_screenshot_path:
                Path(duration_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=duration_screenshot_path, full_page=False)
            page.get_by_role("button", name="Limpiar todo", exact=True).click()
            page.wait_for_timeout(300)

            static_card = page.locator("article.library-ad-card-masonry:not(:has(.winner-video-play))").first
            static_card.wait_for(timeout=30_000)
            static_card.click()
            page.get_by_role("heading", name="Crear con este diseño").wait_for(timeout=10_000)
            static_grid_box = page.locator(".creation-flow-layout").bounding_box()
            assert static_grid_box, "El creador estático debe renderizar su grilla"
            page.locator(".creation-reference-copy").wait_for(timeout=10_000)
            reference_image = page.locator(".creation-flow-aside img").first
            reference_image.wait_for(timeout=10_000)
            page.wait_for_function(
                "el => el.complete && el.naturalWidth > 0",
                arg=reference_image.element_handle(),
                timeout=15_000,
            )
            static_screenshot_path = os.environ.get("CREATTIA_STATIC_COPY_SCREENSHOT", "").strip()
            if static_screenshot_path:
                Path(static_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=static_screenshot_path, full_page=False)
            page.get_by_role("button", name="Volver a la biblioteca", exact=False).click()
            page.get_by_role("heading", name="Biblioteca de ganadores").wait_for(timeout=10_000)
            library_columns = page.locator(".library-masonry-column")
            initial_column_count = library_columns.count()
            assert initial_column_count > 2, "La biblioteca desktop debe mostrar más de dos columnas"
            play_buttons = page.locator('[aria-label^="Reproducir video de"]:visible')
            play_buttons.first.wait_for(timeout=30_000)
            video_count = play_buttons.count()
            assert video_count > 0, "La biblioteca debe renderizar videos ganadores"
            video_cards = page.locator("article.library-ad-card-masonry:has(.winner-video-play)")
            selected_video_card = None
            reference_copy = ""
            for index in range(video_cards.count()):
                card = video_cards.nth(index)
                copy_text = card.locator(".library-card-copy").inner_text().strip()
                if copy_text and copy_text != "Inspiración publicitaria ganadora.":
                    selected_video_card = card
                    reference_copy = copy_text
                    break
            assert selected_video_card and reference_copy, "Debe existir un video con copy para comprobar el detalle"
            selected_video_card.locator('[aria-label^="Reproducir video de"]').click()
            inline_video = page.locator("video.winner-inline-video:visible").first
            inline_video.wait_for(timeout=10_000)
            assert inline_video.get_attribute("controls") is not None
            assert page.locator(".ref-modal video").count() == 0, "El video no debe abrirse en un modal"
            inline_screenshot_path = os.environ.get("CREATTIA_INLINE_VIDEO_SCREENSHOT", "").strip()
            if inline_screenshot_path:
                Path(inline_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=inline_screenshot_path, full_page=False)
            video_card = inline_video.locator("xpath=ancestor::article[1]")
            video_card.get_by_role("button", name="Usar esta idea", exact=True).click()
            page.get_by_role("heading", name="Adaptá la idea ganadora a tu negocio").wait_for(timeout=10_000)
            video_copy_panel = page.locator(".video-reference-copy")
            video_copy_panel.wait_for(timeout=10_000)
            opened_reference_copy = video_copy_panel.locator("p").inner_text().strip()
            normalized_card_copy = re.sub(r"\s+", " ", reference_copy).strip()
            normalized_opened_copy = re.sub(r"\s+", " ", opened_reference_copy).strip()
            assert normalized_card_copy == normalized_opened_copy, (
                "El copy visible en la tarjeta debe aparecer debajo del video abierto "
                f"(tarjeta={reference_copy[:120]!r}, abierto={opened_reference_copy[:120]!r})"
            )
            page.get_by_role("button", name="Volver a la biblioteca", exact=False).click()
            page.get_by_role("heading", name="Biblioteca de ganadores").wait_for(timeout=10_000)
            page.wait_for_timeout(500)
            assert library_columns.count() == initial_column_count, "Al volver del creador de video debe restaurarse la cantidad de columnas"
            return_screenshot_path = os.environ.get("CREATTIA_LIBRARY_RETURN_SCREENSHOT", "").strip()
            if return_screenshot_path:
                Path(return_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=return_screenshot_path, full_page=False)

            page.locator('[aria-label^="Reproducir video de"]:visible').first.click()
            inline_video = page.locator("video.winner-inline-video:visible").first
            inline_video.wait_for(timeout=10_000)
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(300)
            assert inline_video.is_visible(), "El reproductor inline debe seguir visible en mobile"
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El reproductor inline no debe desbordar en mobile"
            video_card = inline_video.locator("xpath=ancestor::article[1]")
            video_card.get_by_role("button", name="Usar esta idea", exact=True).click()
            page.get_by_role("heading", name="Adaptá la idea ganadora a tu negocio").wait_for(timeout=10_000)
            assert page.locator(".video-reference-note, .video-analysis-card").count() == 0

            page.set_viewport_size({"width": 1440, "height": 900})
            page.wait_for_timeout(300)
            flow_box = page.locator(".video-guided-flow").bounding_box()
            video_grid_box = page.locator(".video-creation-grid").bounding_box()
            form_box = page.locator(".video-image-flow-panel").bounding_box()
            assert flow_box and video_grid_box and abs(video_grid_box["width"] - static_grid_box["width"]) < 2, "El flujo de video debe usar el mismo ancho disponible que el estático"
            assert form_box and abs((form_box["x"] + form_box["width"]) - (video_grid_box["x"] + video_grid_box["width"])) < 2, "El formulario debe llegar hasta el borde derecho disponible"
            product_tabs = page.locator(".video-product-tabs .wiz-tab")
            tab_boxes = [product_tabs.nth(index).bounding_box() for index in range(product_tabs.count())]
            assert len(tab_boxes) == 3 and all(box for box in tab_boxes)
            assert max(box["y"] for box in tab_boxes if box) - min(box["y"] for box in tab_boxes if box) < 2, "Las tres formas de cargar el producto deben quedar en una sola fila"
            page.set_viewport_size({"width": 1728, "height": 900})
            page.wait_for_timeout(300)
            wide_video_grid_box = page.locator(".video-creation-grid").bounding_box()
            assert wide_video_grid_box and wide_video_grid_box["width"] > 1142, "El creador de video no debe quedar limitado a 1140 px en monitores anchos"
            setup_screenshot_path = os.environ.get("CREATTIA_VIDEO_SETUP_SCREENSHOT", "").strip()
            if setup_screenshot_path:
                Path(setup_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=setup_screenshot_path, full_page=False)

            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(500)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El paso de producto no debe desbordar en mobile"
            setup_mobile_screenshot_path = os.environ.get("CREATTIA_VIDEO_SETUP_MOBILE_SCREENSHOT", "").strip()
            if setup_mobile_screenshot_path:
                Path(setup_mobile_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=setup_mobile_screenshot_path, full_page=False)
            page.get_by_placeholder("Ej.: https://mitienda.com/producto").wait_for()
            page.get_by_role("button", name=re.compile("Cargar a mano")).click()
            page.get_by_placeholder("Ej.: Sérum hidratante Hydra 10").fill("Hydra 10")
            page.get_by_placeholder("Ej.: hidrata 24 h, apto para piel sensible, cuesta $29.900 y tiene envío gratis").fill("Hidratación ligera para piel sensible")
            page.locator('.video-manual-product input[type="file"]').set_input_files(str(product_path))
            page.get_by_role("button", name="Continuar", exact=True).click()

            page.get_by_text("¿Qué querés tomar del anuncio ganador?").wait_for()
            page.get_by_text("Propuesta de la IA", exact=False).wait_for(timeout=10_000)
            audience_input = page.locator(".video-brief-fields input").nth(0)
            benefit_input = page.locator(".video-brief-fields input").nth(1)
            assert audience_input.input_value() == fake_suggestions["audience"]
            assert benefit_input.input_value() == fake_suggestions["benefit"]
            assert "active" in (page.get_by_role("button", name="Idea + guion adaptado", exact=False).get_attribute("class") or "")
            assert "active" in (page.get_by_role("button", name="UGC / Testimonial", exact=False).get_attribute("class") or "")
            assert page.get_by_role("button", name="Crear guion con esta propuesta", exact=False).count() == 1
            page.get_by_text("La IA ya eligió el enfoque más fuerte", exact=True).wait_for()
            assert page.get_by_text(fake_suggestions["audienceReason"], exact=True).count() == 1
            assert page.get_by_text(fake_suggestions["hookIdea"], exact=True).count() == 1
            page.get_by_text("Ver públicos alternativos y dirección completa", exact=True).click()
            assert page.get_by_role("button", name=re.compile("25 a 40 años.*Rutinas simples", re.S)).count() == 1
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "La guía inteligente no debe desbordar en mobile"
            suggestion_screenshot_path = os.environ.get("CREATTIA_VIDEO_SUGGESTIONS_SCREENSHOT", "").strip()
            if suggestion_screenshot_path:
                Path(suggestion_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=suggestion_screenshot_path, full_page=False)
            page.get_by_role("button", name="Idea + guion adaptado", exact=False).click()
            page.get_by_placeholder("Ej.: mujeres de 25 a 40 con piel sensible").fill("Personas de 25 a 40 con piel sensible")
            page.get_by_placeholder("Ej.: hidrata sin dejar sensación grasa").fill("Hidrata sin sensación grasa")
            page.get_by_role("button", name="Continuar", exact=True).click()

            page.get_by_text("¿Quién aparece en el video?").wait_for()
            assert "active" in (page.get_by_role("button", name="Definir persona", exact=False).get_attribute("class") or "")
            product_usage_input = page.locator('.video-wizard-fields textarea[placeholder^="Ej.: abre el envase"]')
            assert product_usage_input.input_value() == fake_suggestions["productUsage"]
            page.get_by_role("button", name="Sin personas", exact=False).click()
            page.get_by_placeholder("Ej.: abre el envase, aplica dos gotas y muestra la textura de cerca").fill("Mostrar el envase y la textura en primer plano")
            page.get_by_role("button", name="Continuar", exact=True).click()

            page.get_by_text("Formato del video", exact=True).wait_for()
            assert page.locator(".video-duration-grid").get_by_role("button", name="Igual al ganador", exact=False).count() == 1
            assert "active" in (page.locator(".video-format-grid .batch-format-card").nth(1).get_attribute("class") or "")
            assert "active" in (page.get_by_role("button", name="Recomendada por IA · 13 s", exact=False).get_attribute("class") or "")
            assert page.get_by_label("Duración personalizada").input_value() == "13"
            page.get_by_label("Duración personalizada").fill("17")
            assert page.get_by_label("Duración personalizada").input_value() == "17"
            page.locator(".video-duration-custom").get_by_text("8 créditos", exact=True).wait_for()
            assert "active" in (page.locator(".video-option-grid button").filter(has_text="Adaptar el di").get_attribute("class") or "")
            suggested_music = page.locator(".video-audio-grid fieldset").nth(1).locator("button.active")
            assert suggested_music.count() == 1 and suggested_music.inner_text().startswith("Con m")
            page.get_by_role("button", name="30 s", exact=True).click()
            page.locator(".video-duration-custom").get_by_text("12 créditos", exact=True).wait_for()
            page.get_by_role("button", name="Adaptar el diálogo ganador", exact=False).click()
            page.get_by_placeholder("Ej.: nombrar a Marca UI Creattia", exact=False).fill("Nombrar Hydra 10 y cerrar con Conocelo hoy")
            page.get_by_role("button", name="Con voz en off", exact=True).click()
            page.get_by_role("button", name="Con música", exact=True).click()
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Producción no debe desbordar en mobile"
            production_screenshot_path = os.environ.get("CREATTIA_VIDEO_PRODUCTION_SCREENSHOT", "").strip()
            if production_screenshot_path:
                Path(production_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.locator(".video-duration-grid").scroll_into_view_if_needed()
                page.screenshot(path=production_screenshot_path, full_page=False)

            page.get_by_role("button", name="Analizar y crear guion", exact=True).click()
            page.get_by_text("PLAN Y GUION CREADOS PARA HYDRA 10").wait_for(timeout=10_000)
            page.get_by_text("Hook detectado", exact=True).wait_for()
            page.get_by_text("Guion hablado", exact=True).wait_for()
            assert page.get_by_role("textbox", name="Diálogo 1", exact=True).input_value().startswith("Si tu piel")
            assert "Aprobar y generar" in page.locator(".video-review-actions").inner_text()
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "La revisión del guion no debe desbordar en mobile"
            mobile_screenshot_path = os.environ.get("CREATTIA_UI_MOBILE_SCREENSHOT", "").strip()
            if mobile_screenshot_path:
                Path(mobile_screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=mobile_screenshot_path, full_page=True)

            page.set_viewport_size({"width": 1440, "height": 900})
            page.wait_for_timeout(300)
            screenshot_path = os.environ.get("CREATTIA_UI_SCREENSHOT", "").strip()
            if screenshot_path:
                Path(screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=screenshot_path, full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "El flujo no debe desbordar en desktop"
            assert not browser_errors, f"Errores de navegador: {browser_errors}"
            print(f"video-ui: PASS; {video_count} videos, intake URL/manual, casting, producción y guion verificados en 390px/1440px")
            browser.close()
finally:
    requests.delete(f"{supabase_url}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=30)
