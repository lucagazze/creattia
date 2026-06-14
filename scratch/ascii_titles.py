import os
from PIL import Image

src_dir = "/Users/lucagazze/Downloads"
images = [
    "WhatsApp Image 2026-06-14 at 12.28.35.jpeg",
    "WhatsApp Image 2026-06-14 at 12.28.57.jpeg",
    "WhatsApp Image 2026-06-14 at 12.29.15.jpeg",
    "WhatsApp Image 2026-06-14 at 12.29.26.jpeg",
    "WhatsApp Image 2026-06-14 at 12.29.41.jpeg",
    "WhatsApp Image 2026-06-14 at 12.29.52.jpeg",
    "WhatsApp Image 2026-06-14 at 12.30.23.jpeg",
    "WhatsApp Image 2026-06-14 at 12.30.44.jpeg",
    "WhatsApp Image 2026-06-14 at 12.32.39.jpeg"
]

for idx, img_name in enumerate(images):
    path = os.path.join(src_dir, img_name)
    im = Image.open(path)
    
    # We find the title bounding box:
    # First crop x: 180 to 550, y: 15 to 80
    crop = im.crop((180, 15, 550, 80)).convert("L")
    bg_val = crop.getpixel((crop.width - 5, 5))
    if bg_val < 100:
        crop = Image.eval(crop, lambda x: 255 - x)
        
    box = crop.getbbox()
    if box:
        # Crop to the actual text content and resize for readability in console
        crop_text = crop.crop(box)
        # Resize to e.g. height: 12, width: proportional (max 100)
        h_new = 12
        w_new = int(crop_text.width * (h_new / crop_text.height) * 1.8) # 1.8 ratio compensation for console chars
        w_new = min(w_new, 120)
        
        resized = crop_text.resize((w_new, h_new), Image.Resampling.BILINEAR)
        print(f"\n======================================")
        print(f"IMAGE {idx+1}: {img_name}")
        print(f"======================================")
        for y in range(h_new):
            row = []
            for x in range(w_new):
                val = resized.getpixel((x, y))
                row.append("M" if val < 100 else "#" if val < 160 else "-" if val < 220 else " ")
            print("".join(row))
    else:
        print(f"\nIMAGE {idx+1}: {img_name} - No text found in title area")
