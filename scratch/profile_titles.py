import os
from PIL import Image, ImageDraw, ImageFont

src_dir = "/Users/lucagazze/Downloads"
images = [
    "WhatsApp Image 2026-06-14 at 12.28.35.jpeg", # Image 1
    "WhatsApp Image 2026-06-14 at 12.28.57.jpeg", # Image 2
    "WhatsApp Image 2026-06-14 at 12.29.15.jpeg", # Image 3
    "WhatsApp Image 2026-06-14 at 12.29.26.jpeg", # Image 4
    "WhatsApp Image 2026-06-14 at 12.29.41.jpeg", # Image 5
    "WhatsApp Image 2026-06-14 at 12.29.52.jpeg", # Image 6
    "WhatsApp Image 2026-06-14 at 12.30.23.jpeg", # Image 7
    "WhatsApp Image 2026-06-14 at 12.30.44.jpeg", # Image 8
    "WhatsApp Image 2026-06-14 at 12.32.39.jpeg"  # Image 9
]

# Standard candidate titles in the app
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
    "Integraciones",
    "Mi Perfil"
]

# Let's write a script that analyzes the text by checking the width of the bounding box of non-white pixels
# and prints some visual characteristics of each crop to help us identify them immediately.
for i, img_name in enumerate(images):
    path = os.path.join(src_dir, img_name)
    im = Image.open(path)
    
    # Crop the title area: x: 180 to 450, y: 15 to 65
    crop = im.crop((180, 15, 450, 65))
    w_crop, h_crop = crop.size
    
    # Convert crop to grayscale and count dark pixels per column
    gray = crop.convert("L")
    col_density = []
    for x in range(w_crop):
        dark_pixels = sum(1 for y in range(h_crop) if gray.getpixel((x, y)) < 120)
        col_density.append(dark_pixels)
        
    # Find bounding box of text in the crop (columns that have dark pixels)
    text_cols = [x for x, d in enumerate(col_density) if d > 1]
    if text_cols:
        text_width = text_cols[-1] - text_cols[0]
        start_x = text_cols[0]
    else:
        text_width = 0
        start_x = 0
        
    print(f"Image {i+1} ({img_name}): text_width: {text_width}, start_x: {start_x}")
    # Print a tiny ASCII art representation of the column density to visualize the word lengths/spacing!
    ascii_profile = "".join("#" if d > 2 else "." for d in col_density[start_x:start_x+100])
    print(f"  Profile: {ascii_profile}")
