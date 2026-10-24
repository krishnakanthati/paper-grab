"""Draws the Loopy Land logo (the same picture as public/logo.svg) into PNG icons and a social card, with Pillow.
   python3 tools/make_icons.py   ->   public/icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
SS = 4  # supersampling for smooth edges

def smooth(points, n=4):
    """Chaikin corner cutting: turns a few points into a soft rounded blob."""
    pts = points[:]
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        pts = out
    return pts

def quad(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]

def gradient(size, top, bottom):
    w, h = size
    g = Image.new('RGB', (w, h))
    px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(w): px[x, y] = c
    return g

def logo(px):
    """The logo mark on a rounded-square sea, `px` pixels wide."""
    S = px * SS; k = S / 96
    img = gradient((S, S), (0x52, 0xc6, 0xf6), (0x1f, 0x86, 0xe6)).convert('RGBA')
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=24 * k, fill=255)
    d = ImageDraw.Draw(img)
    scale = lambda pts: [(x * k, y * k) for x, y in pts]
    land = smooth([(13, 52), (22, 31), (42, 21), (64, 24), (82, 40), (82, 60), (68, 78), (44, 82), (22, 74)])
    d.polygon(scale(land), fill=(0xe8, 0xfb, 0xf4))
    land_mask = Image.new('L', (S, S), 0); ImageDraw.Draw(land_mask).polygon(scale(land), fill=255)
    red = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(red).polygon(scale(smooth([(8, 52), (14, 28), (34, 24), (42, 60), (24, 68)], 3)), fill=(0xef, 0x4b, 0x4b))
    red.putalpha(Image.composite(red.getchannel('A'), Image.new('L', (S, S), 0), land_mask))
    img.alpha_composite(red)
    d = ImageDraw.Draw(img)
    trail = scale(quad((30, 69), (50, 50), (69, 42)))
    d.line(trail, fill=(0xff, 0xb3, 0xb3), width=int(7 * k), joint='curve')
    for x, y in (trail[0], trail[-1]): d.ellipse([x - 3.5 * k, y - 3.5 * k, x + 3.5 * k, y + 3.5 * k], fill=(0xff, 0xb3, 0xb3))
    d.rounded_rectangle([58 * k, 22 * k, 86 * k, 48 * k], radius=10 * k, fill=(255, 255, 255))
    d.rounded_rectangle([60.5 * k, 24.5 * k, 83.5 * k, 45.5 * k], radius=8 * k, fill=(0x3b, 0x82, 0xf6))
    for cx in (67.5, 77):
        d.ellipse([(cx - 4.3) * k, 30.7 * k, (cx + 4.3) * k, 39.3 * k], fill=(255, 255, 255))
        d.ellipse([(cx + .7 - 2.7) * k, 32.9 * k, (cx + .7 + 2.7) * k, 38.3 * k], fill=(0x14, 0x18, 0x24))
        d.ellipse([(cx + 1.5 - .9) * k, 33.7 * k, (cx + 1.5 + .9) * k, 35.5 * k], fill=(255, 255, 255))
    for cx in (63.6, 81.4): d.ellipse([(cx - 2.2) * k, 39.1 * k, (cx + 2.2) * k, 41.9 * k], fill=(0xff, 0x9f, 0xb0))
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(img, (0, 0), mask)
    return out.resize((px, px), Image.LANCZOS)

def font(size):
    for path in ['/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(path): return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def card(w=1200, h=630):
    img = gradient((w, h), (0x52, 0xc6, 0xf6), (0x1f, 0x86, 0xe6)).convert('RGBA')
    mark = logo(380); img.alpha_composite(mark, (90, (h - 380) // 2))
    d = ImageDraw.Draw(img)
    d.text((520, 210), 'Loopy Land', font=font(120), fill=(255, 255, 255), stroke_width=4, stroke_fill=(0x1c, 0x5f, 0xc2))
    d.text((524, 360), 'claim the world, one loop at a time', font=font(40), fill=(0xe8, 0xfb, 0xf4))
    return img.convert('RGB')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, px in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
        logo(px).save(os.path.join(OUT, name))
    card().save(os.path.join(OUT, 'og-image.png'))
    print('icons written to', os.path.abspath(OUT))
