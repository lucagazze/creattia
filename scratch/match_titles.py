import os
from PIL import Image, ImageDraw, ImageFont

src_dir = "/Users/lucagazze/Downloads"
images = [
    "WhatsApp Image 2026-06-14 at 12.28.35.jpeg", # 1
    "WhatsApp Image 2026-06-14 at 12.28.57.jpeg", # 2
    "WhatsApp Image 2026-06-14 at 12.29.15.jpeg", # 3
    "WhatsApp Image 2026-06-14 at 12.29.26.jpeg", # 4
    "WhatsApp Image 2026-06-14 at 12.29.41.jpeg", # 5
    "WhatsApp Image 2026-06-14 at 12.29.52.jpeg", # 6
    "WhatsApp Image 2026-06-14 at 12.30.23.jpeg", # 7
    "WhatsApp Image 2026-06-14 at 12.30.44.jpeg", # 8
    "WhatsApp Image 2026-06-14 at 12.32.39.jpeg"  # 9
]

candidates = [
    "Inicio",
    "Mensajería",
    "Bandejas de Entrada",
    "Comentarios",
    "Redes Sociales",
    "Pedidos",
    "Inventario",
    "Clientes",
    "Análisis de Productos",
    "Meta Ads",
    "Creativos Ads",
    "Plantillas Email",
    "Tienda Online",
    "Atención"
]

# Let's render each candidate as text on a white background and match the black pixels
font_path = "/System/Library/Fonts/Helvetica.ttc"
if not os.path.exists(font_path):
    font_path = "/System/Library/Fonts/Cache/Arial.ttf" # Fallback

font = ImageFont.truetype(font_path, 20)

for idx, img_name in enumerate(images):
    path = os.path.join(src_dir, img_name)
    im = Image.open(path)
    # Crop the title: x: 190 to 450, y: 15 to 60
    crop = im.crop((190, 15, 450, 60)).convert("L")
    
    # If dark mode, invert the crop
    bg_val = crop.getpixel((crop.width - 5, 5))
    if bg_val < 100:
        crop = Image.eval(crop, lambda x: 255 - x)
        
    best_score = float('inf')
    best_candidate = "Unknown"
    
    # Simple projection matching
    # Find bounding box of non-white pixels in crop
    box = crop.getbbox()
    if box:
        crop_text = crop.crop(box)
        w_text, h_text = crop_text.size
        
        # We will match by drawing the candidate and comparing projection profiles
        for cand in candidates:
            # Render candidate
            cand_im = Image.new("L", (300, 50), 255)
            draw = ImageDraw.Draw(cand_im)
            draw.text((10, 10), cand, font=font, fill=0)
            cand_box = cand_im.getbbox()
            if cand_box:
                cand_text = cand_im.crop(cand_box)
                # Resize candidate text to match crop text height
                scale = h_text / cand_text.height
                new_w = int(cand_text.width * scale)
                cand_text_res = cand_text.resize((new_w, h_text))
                
                # Check aspect ratio difference
                ratio_diff = abs((w_text / h_text) - (new_w / h_text))
                if ratio_diff < 1.5:
                    # Do 1D horizontal projection matching (compare columns)
                    p1 = [sum(1 for y in range(h_text) if crop_text.getpixel((x, y)) < 150) for x in range(w_text)]
                    p2 = [sum(1 for y in range(h_text) if cand_text_res.getpixel((x, y)) < 150) for x in range(min(w_text, new_w))]
                    
                    # Compute mean squared error between profiles
                    mse = 0
                    min_len = min(len(p1), len(p2))
                    for k in range(min_len):
                        mse += (p1[k] - p2[k]) ** 2
                    mse += abs(len(p1) - len(p2)) * 100
                    mse = mse / min_len
                    
                    # Weight by aspect ratio diff
                    score = mse * (1 + ratio_diff)
                    if score < best_score:
                        best_score = score
                        best_candidate = cand
                        
    print(f"Image {idx+1} ({img_name}) matched: {best_candidate} (score: {best_score:.2f})")
