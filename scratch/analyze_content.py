import os
from PIL import Image

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

for idx, img_name in enumerate(images):
    path = os.path.join(src_dir, img_name)
    im = Image.open(path)
    w, h = im.size
    
    # Analyze regions of the content pane:
    # 1. Check if there are large colored blocks or charts
    # Let's check colors in the main pane x: 250 to w-50, y: 150 to h-100
    # We will sample a grid of pixels to describe the content
    grid_colors = []
    unique_colors = set()
    for gx in range(250, w - 50, 50):
        for gy in range(150, h - 100, 50):
            r, g, b = im.getpixel((gx, gy))[:3]
            unique_colors.add((r, g, b))
            
    # Count how many green, blue, pink, or purple pixels we find (typical badge / chart colors)
    green_count = 0
    blue_count = 0
    pink_count = 0
    purple_count = 0
    dark_count = 0
    
    for c in unique_colors:
        r, g, b = c
        # green/emerald badge: R is low, G is high, B is medium-high
        if g > 150 and r < 120 and b < 180:
            green_count += 1
        # blue badge/button: R is low, G is medium, B is high
        elif b > 180 and r < 120 and g > 100:
            blue_count += 1
        # pink badge/line: R is high, G is low-medium, B is high
        elif r > 180 and g < 150 and b > 150:
            pink_count += 1
        # dark background: R < 30, G < 30, B < 30
        elif r < 30 and g < 30 and b < 30:
            dark_count += 1
            
    print(f"\nImage {idx+1} ({img_name}): Size {w}x{h}")
    print(f"  Dark pixels: {dark_count}, Greenish: {green_count}, Bluish: {blue_count}, Pinkish: {pink_count}")
    
    # Check specific header text/badge presence:
    # Let's crop a sample of the main page top header (x: 200 to 800, y: 90 to 140)
    # and print if it has high contrast or specific layouts
    header_crop = im.crop((200, 90, 800, 140))
    header_gray = header_crop.convert("L")
    dark_pixels = sum(1 for x in range(header_gray.width) for y in range(header_gray.height) if header_gray.getpixel((x, y)) < 100)
    print(f"  Header text density: {dark_pixels}")
