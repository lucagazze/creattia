import os
import sys
import json
import urllib.request
from apify_client import ApifyClient

# 1. Initialize Apify Client
APIFY_TOKEN = os.environ.get("APIFY_TOKEN")
if not APIFY_TOKEN:
    # Try to read it from env files
    for env_file in [".env.local", ".env"]:
        if os.path.exists(env_file):
            with open(env_file, "r") as f:
                for line in f:
                    if "APIFY_TOKEN" in line or "APIFY_API_TOKEN" in line:
                        parts = line.strip().split("=", 1)
                        if len(parts) == 2:
                            APIFY_TOKEN = parts[1].strip().replace('"', '').replace("'", "")
                            break
        if APIFY_TOKEN:
            break

if not APIFY_TOKEN:
    print("Error: No se encontró el token de Apify. Por favor, definí la variable de entorno APIFY_TOKEN o agrégala a tu archivo .env.local.")
    sys.exit(1)

client = ApifyClient(APIFY_TOKEN)

def scrape_ads(query="e-commerce", limit=10, country="ALL"):
    print(f"--- Iniciando Búsqueda de Anuncios: '{query}' ({limit} máx, País: {country}) ---")
    
    # 2. Configure Scraper Input
    run_input = {
        "searchQueries": [query],
        "country": country,
        "maxAds": limit
    }
    
    # 3. Call Apify Actor
    try:
        run = client.actor("automation-lab/facebook-ads-library").call(run_input=run_input, timeout_secs=300)
        dataset_id = run["defaultDatasetId"]
        print(f"Actor finalizado. Descargando datos del dataset: {dataset_id}")
        
        # 4. Fetch Dataset Items
        items = list(client.dataset(dataset_id).list_items().items)
        print(f"Se encontraron {len(items)} anuncios.")
        
        # 5. Prepare Output Directories
        output_dir = os.path.abspath("./public/scraped_ads")
        os.makedirs(output_dir, exist_ok=True)
        
        ads_database = []
        
        # 6. Process each ad
        for idx, item in enumerate(items):
            ad_id = item.get("adArchiveId") or f"ad_{idx}"
            page_name = item.get("pageName", "Desconocido")
            ad_body = item.get("adBody", "")
            
            # Extract Image URL with fallbacks
            image_urls = item.get("adCreativeImageUrls") or []
            if not image_urls:
                snapshot = item.get("snapshotImageUrl")
                if snapshot:
                    image_urls = [snapshot]
                else:
                    image_urls = item.get("creativeImageUrls") or []
            
            # If still empty, check if it's a video ad and grab the thumbnail preview!
            if not image_urls:
                video_previews = item.get("videoPreviewUrls") or []
                if video_previews:
                    image_urls = video_previews
            
            image_url = image_urls[0] if image_urls else None
            local_image_name = None
            
            # Download image if available
            if image_url:
                try:
                    extension = ".jpg"
                    if ".png" in image_url.lower():
                        extension = ".png"
                    elif ".webp" in image_url.lower():
                        extension = ".webp"
                    
                    local_filename = f"{ad_id}{extension}"
                    local_filepath = os.path.join(output_dir, local_filename)
                    
                    print(f"[{idx+1}/{len(items)}] Descargando imagen para {page_name}...")
                    
                    # Custom user-agent header to bypass potential basic hotlinking blocks
                    opener = urllib.request.build_opener()
                    opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
                    urllib.request.install_opener(opener)
                    
                    urllib.request.urlretrieve(image_url, local_filepath)
                    local_image_name = local_filename
                except Exception as img_err:
                    print(f"Advertencia: No se pudo descargar la imagen {image_url}: {img_err}")
            
            # Build Metadata Record
            ads_database.append({
                "adId": ad_id,
                "adLibraryUrl": item.get("adLibraryUrl"),
                "pageName": page_name,
                "pageUrl": item.get("pageUrl"),
                "pageProfilePictureUrl": item.get("pageProfilePictureUrl"),
                "adBody": ad_body,
                "platforms": item.get("publisherPlatforms", ["FACEBOOK"]),
                "localImage": f"/scraped_ads/{local_image_name}" if local_image_name else None,
                "originalImageUrl": image_url,
                "collationsCount": item.get("collationCount", 1)
            })
        
        # 7. Write Database JSON
        json_path = os.path.join(output_dir, "ads.json")
        with open(json_path, "w", encoding="utf-8") as json_file:
            json.dump(ads_database, json_file, indent=2, ensure_ascii=False)
            
        print(f"\n¡Proceso finalizado con éxito!")
        print(f"Base de datos guardada en: {json_path}")
        print(f"Total imágenes descargadas en: {output_dir}")
        return ads_database
        
    except Exception as e:
        print("Error al ejecutar el actor de Apify:", e)
        return []

if __name__ == "__main__":
    query_param = sys.argv[1] if len(sys.argv) > 1 else "marketing"
    limit_param = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    scrape_ads(query=query_param, limit=limit_param)
