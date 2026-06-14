import os
from PIL import Image, ImageDraw

# Directories
src_dir = "/Users/lucagazze/.gemini/antigravity-ide/brain/7a24fd5d-5f8f-4a7b-977e-1a4e07afbc42"
dest_dir = "/Users/lucagazze/CLAUDE/CAR-SaaS-1/public/assets"
os.makedirs(dest_dir, exist_ok=True)

# 1. Resumen General Dashboard (media__1781450157697.png)
# Censor 'The Skirting Factory' at 'Resumen General • The Skirting Factory' and in bottom-left profile switcher.
img1_path = os.path.join(src_dir, "media__1781450157697.png")
if os.path.exists(img1_path):
    print("Processing Image 1 (Dashboard General)...")
    im = Image.open(img1_path)
    draw = ImageDraw.Draw(im)
    
    # Area for title 'The Skirting Factory' next to Resumen General
    # Coordinates roughly (x1, y1, x2, y2)
    # The title is: "Resumen General • The Skirting Factory"
    # Background is white (#ffffff) or very light grey. Let's cover with white.
    draw.rectangle([340, 230, 480, 280], fill="#ffffff") # next to title
    draw.rectangle([350, 235, 600, 275], fill="#ffffff") # cover the rest
    
    # Profile switcher at bottom left: cover the workspace name 'theskirtingfac...'
    # Profile box is at the bottom of the sidebar.
    draw.rectangle([35, 920, 115, 965], fill="#f5f5f7") # background of profile box (light grey sidebar)
    
    im.save(os.path.join(dest_dir, "landing_dashboard.png"))

# 2. Comments Section (media__1781450210320.png)
# Censor comments video/image preview, user names, handle names, comments profiles.
img2_path = os.path.join(src_dir, "media__1781450210320.png")
if os.path.exists(img2_path):
    print("Processing Image 2 (Comments)...")
    im = Image.open(img2_path)
    draw = ImageDraw.Draw(im)
    
    # Censor the video preview image in the middle (keep container, cover actual content with solid dark color or grey)
    draw.rectangle([288, 232, 472, 524], fill="#1e1e24")
    
    # Cover commenter names/handles in the list (e.g. '@Usuario 1', '@Usuario 2' - censor name handles to keep generic or solid blocks)
    # They are already '@Usuario 1' and '@Usuario 2' in the screenshot, but we can cover any other names or specific handles.
    # Let's clean the user avatar circles (they have letters)
    draw.rectangle([535, 310, 580, 360], fill="#ffffff") # avatar 1
    draw.rectangle([535, 475, 580, 525], fill="#ffffff") # avatar 2
    
    # Censor sidebar bottom profile switcher workspace info
    draw.rectangle([35, 920, 115, 965], fill="#f5f5f7")
    
    im.save(os.path.join(dest_dir, "landing_comments.png"))

# 3. Orders View (media__1781450245160.png)
# Censor client names in the orders table.
img3_path = os.path.join(src_dir, "media__1781450245160.png")
if os.path.exists(img3_path):
    print("Processing Image 3 (Orders)...")
    im = Image.open(img3_path)
    draw = ImageDraw.Draw(im)
    
    # Censor names in 'CLIENTE' column.
    # Column 'CLIENTE' is between 'FECHA' and 'PAGO'.
    # We draw grey/white rounded rectangles or simple blocks over the names to look clean and professional.
    # Rows are at approximate y-levels:
    # Header is around y=610
    # Rows:
    # 1. Tyler Bradley -> cover
    draw.rectangle([340, 635, 500, 670], fill="#ffffff")
    # 2. Cynthia Strickland -> cover
    draw.rectangle([340, 680, 500, 715], fill="#ffffff")
    # 3. Andria Bradac -> cover
    draw.rectangle([340, 725, 500, 760], fill="#ffffff")
    # 4. Andria Bradac -> cover
    draw.rectangle([340, 775, 500, 810], fill="#ffffff")
    # 5. Walter Carl Lee Hunt -> cover
    draw.rectangle([340, 820, 500, 855], fill="#ffffff")
    # 6. WILLIAM WEST -> cover
    draw.rectangle([340, 870, 500, 905], fill="#ffffff")
    # 7. Wendell Mitchell -> cover
    draw.rectangle([340, 915, 500, 950], fill="#ffffff")
    # 8. Sin nombre -> cover
    draw.rectangle([340, 960, 500, 995], fill="#ffffff")

    # Bottom left profile box workspace name
    draw.rectangle([35, 920, 115, 965], fill="#f5f5f7")

    im.save(os.path.join(dest_dir, "landing_orders.png"))

# 4. Individual Shop Performance - Shopify (media__1781450296179.png)
img4_path = os.path.join(src_dir, "media__1781450296179.png")
if os.path.exists(img4_path):
    print("Processing Image 4 (Shopify Store)...")
    im = Image.open(img4_path)
    draw = ImageDraw.Draw(im)
    
    # Cover the text '(shopify)' next to 'Rendimiento de Tienda'
    # "Métricas principales de tu e-commerce (shopify)." -> cover '(shopify)' or the subtitle
    draw.rectangle([330, 202, 420, 222], fill="#f5f5f7")
    
    # Bottom left profile switcher
    draw.rectangle([35, 920, 115, 965], fill="#f5f5f7")
    
    im.save(os.path.join(dest_dir, "landing_shopify.png"))

# 5. Meta Ads Regions/Platforms Dashboard (media__1781450332712.png)
img5_path = os.path.join(src_dir, "media__1781450332712.png")
if os.path.exists(img5_path):
    print("Processing Image 5 (Meta Ads Dashboard)...")
    im = Image.open(img5_path)
    draw = ImageDraw.Draw(im)
    
    # Bottom left profile switcher
    draw.rectangle([35, 920, 115, 965], fill="#f5f5f7")
    
    im.save(os.path.join(dest_dir, "landing_meta.png"))

# 6. Product Analysis Dashboard (media__1781450509904.png)
img6_path = os.path.join(src_dir, "media__1781450509904.png")
if os.path.exists(img6_path):
    print("Processing Image 6 (Product Analysis Dashboard)...")
    im = Image.open(img6_path)
    draw = ImageDraw.Draw(im)
    
    # Cover the workspace name 'theskirtingfac...' and 'The Skirting Facto...' in the profile switcher at bottom left
    draw.rectangle([40, 580, 140, 625], fill="#ffffff")
    
    im.save(os.path.join(dest_dir, "landing_product_analysis.png"))

print("All screenshots successfully processed and exported to public/assets!")

