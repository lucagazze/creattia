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

# We will check the color of the sidebar items to find which one is active (highlighted with violet or dark background)
# Let's inspect the vertical strip of the sidebar where the active indicator or background is.
# Typically, the active item has a violet background or a violet indicator bar on the left (e.g. x around 10-20, or a violet pill at x: 20-140).
# Let's sample a few columns in the sidebar and print the active color or check for violet/dark highlights.
# We will also print the coordinates of non-white areas in the sidebar menu.

for img_name in images:
    path = os.path.join(src_dir, img_name)
    if not os.path.exists(path):
        print(f"File not found: {img_name}")
        continue
        
    im = Image.open(path)
    w, h = im.size
    
    # We will sample the sidebar region: x: [0, 180], y: [80, 600]
    # Let's find any violet pixels (violet is typically like R: ~124, G: ~58, B: ~237 or similar, let's look for R in 90-140, G < 100, B > 180)
    # Or in dark mode/light mode active backgrounds.
    # Let's print the average color of 10px-height rows in the sidebar to see which row is highlighted.
    highlights = []
    for y_start in range(80, 580, 10):
        # Sample a block at x: 20-120
        r_sum, g_sum, b_sum = 0, 0, 0
        count = 0
        for x in range(20, 120):
            for y in range(y_start, y_start + 10):
                r, g, b = im.getpixel((x, y))[:3]
                r_sum += r
                g_sum += g
                b_sum += b
                count += 1
        avg_r = r_sum / count
        avg_g = g_sum / count
        avg_b = b_sum / count
        
        # Check for violet/purple active item or dark highlight
        # In light mode, active background might be violet (e.g. RGB 124, 58, 237) or black/dark (RGB < 50, < 50, < 50)
        # Let's log rows with significantly different colors from the white/light background
        if avg_r < 240 or avg_g < 240 or avg_b < 240:
            highlights.append((y_start, (int(avg_r), int(avg_g), int(avg_b))))
            
    print(f"\nImage: {img_name} ({w}x{h})")
    print("Highlights (y-coord, RGB):")
    # Group highlights by contiguous blocks
    for h_item in highlights[:15]:
        print(f"  y: {h_item[0]}-{h_item[0]+10} -> RGB: {h_item[1]}")
