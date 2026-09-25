# contact sheet of stills: python3 sheet.py out/sheet.png t1 t2 ...
import sys
from PIL import Image, ImageDraw
out, ts = sys.argv[1], sys.argv[2:]
cols = 3 if len(ts) > 4 else 2
w, h = 640, 360
rows = (len(ts) + cols - 1) // cols
S = Image.new('RGB', (cols * w + (cols + 1) * 8, rows * (h + 22) + 8), (40, 40, 40))
d = ImageDraw.Draw(S)
for i, t in enumerate(ts):
    im = Image.open(f'out/stills/t_{float(t):.3f}.png').convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = 8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 22)
    S.paste(im, (x, y + 14)); d.text((x, y), f't={t}', fill=(255, 255, 255))
S.save(out)
