"""Génère les icônes PNG de l'app à partir du dessin du logo (python tools/make_icons.py)."""
from PIL import Image, ImageDraw, ImageFont

BG, INK = (246, 243, 238), (30, 36, 33)
N = 1024
k = N * 0.58 / 200            # le logo (200 de large) occupe ~58 % de l'icône
ox, oy = (N - 200 * k) / 2, (N - 170 * k) / 2 + 10
P = lambda x, y: (ox + x * k, oy + y * k)

img = Image.new('RGB', (N, N), BG)
d = ImageDraw.Draw(img)
serif = 'C:/Windows/Fonts/georgia.ttf'
d.line([P(100, 5), P(195, 165), P(5, 165), P(100, 5)], fill=INK, width=round(3 * k), joint='curve')
d.line([P(88, 47), P(112, 47)], fill=INK, width=max(2, round(1.2 * k)))
f = ImageFont.truetype(serif, round(19 * k))
d.text(P(100, 67), 'L E', font=f, fill=INK, anchor='ms')
d.rectangle([P(8, 73), P(192, 107)], fill=BG)
big, small = ImageFont.truetype(serif, round(40 * k)), ImageFont.truetype(serif, round(31 * k))
parts = [('C', big), ('ARTE', small), ('L', big)]
widths = [d.textlength(t, font=fo) for t, fo in parts]
x = P(100, 0)[0] - sum(widths) / 2
for (t, fo), w in zip(parts, widths):
    d.text((x, P(0, 102)[1]), t, font=fo, fill=INK, anchor='ls'); x += w
d.line([P(58, 113), P(94, 113)], fill=INK, width=max(2, round(1.2 * k)))
d.line([P(106, 113), P(142, 113)], fill=INK, width=max(2, round(1.2 * k)))
d.polygon([P(100, 109), P(104, 113), P(100, 117), P(96, 113)], fill=INK)
d.text(P(100, 133), '10|04', font=ImageFont.truetype(serif, round(13 * k)), fill=INK, anchor='ms')
for cx, h in ((87, 22), (100, 27), (113, 22)):
    top = 163 - h
    d.polygon([P(cx - 5, 163), P(cx - 5, top + 10), P(cx - 2, top + 3), P(cx - 2, top), P(cx + 2, top), P(cx + 2, top + 3), P(cx + 5, top + 10), P(cx + 5, 163)], fill=INK)

for s in (512, 192, 180):
    img.resize((s, s), Image.LANCZOS).save(f'icons/icon-{s}.png', optimize=True)
