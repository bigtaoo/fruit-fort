"""Build the final UI asset set (sticker direction) from the parts ui_cut.py cut out of docs/art/ui_r1.
usage: python ui_assets.py <cut dir> <out dir>
<cut dir> holds one folder per sheet (icons1..4, frames1..2, b_sticker_kit), as ui_cut.py wrote them.
Each asset is trimmed to its alpha, freed of the generator's grey drop shadow where it has one, and
fitted into a fixed transparent canvas. Also writes check.png: every asset at 24, 32 and 48 px on
grass and on the picnic blanket."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# name: (sheet, part, canvas w, canvas h, drop shadow?)
PICKS = {
    'icon_dmg': ('icons1', 0, 128, 128, False),
    'icon_spd': ('icons1', 1, 128, 128, False),
    'icon_crit': ('icons3', 2, 128, 128, False),
    'icon_multi': ('icons1', 5, 128, 128, False),
    'icon_range': ('icons3', 0, 128, 128, False),
    'icon_move': ('icons4', 1, 128, 128, False),
    'icon_gold': ('icons2', 2, 128, 128, False),
    'icon_wall': ('icons2', 3, 128, 128, False),
    'coin': ('b_sticker_kit', 9, 128, 128, False),
    'crystal': ('b_sticker_kit', 8, 128, 128, False),
    'btn_yellow': ('frames1', 0, 160, 160, True),
    'btn_mint': ('frames1', 1, 192, 160, True),
    'btn_peach': ('frames1', 2, 192, 160, True),
    'btn_round': ('b_sticker_kit', 1, 128, 128, False),
    'panel': ('frames1', 3, 320, 240, True),
    'bar_frame': ('b_sticker_kit', 4, 512, 64, False),
    'wave_badge': ('b_sticker_kit', 6, 384, 64, False),
    'hero_ring': ('frames2', 2, 192, 192, False),
}


def unshadow(im):
    """Drop the brownish-grey shadow the generator paints under frames (dull, mid-dark, red > green >
    blue); only the biggest remaining blob, the frame itself, is kept."""
    a = np.asarray(im).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    sat = (rgb.max(2) - rgb.min(2)) / np.maximum(rgb.max(2), 1)
    lum = rgb.mean(2)
    keep = (al > 0) & ~((sat < 0.4) & (lum < 200) & (lum > 100) & (r >= g) & (g >= b))
    keep = ndimage.binary_opening(keep, iterations=2)
    lab, n = ndimage.label(keep)
    if n:
        keep = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)
    keep = ndimage.binary_fill_holes(keep)
    m = Image.fromarray((keep * 255).astype(np.uint8))
    out = im.copy()
    out.putalpha(Image.fromarray(np.minimum(al, np.asarray(m)).astype(np.uint8)))
    return out


def hollow(im):
    """Clear the hero ring's dark centre so the portrait shows through."""
    a = np.asarray(im).astype(int)
    h, w = a.shape[:2]
    dark = a[..., :3].mean(2) < 150
    lab, _ = ndimage.label(dark)
    hole = ndimage.binary_dilation(lab == lab[h // 2, w // 2], iterations=2)
    al = a[..., 3].copy()
    al[hole] = 0
    out = im.copy()
    out.putalpha(Image.fromarray(al.astype(np.uint8)))
    return out


def place(im, w, h, pad=4):
    im = im.crop(im.getbbox())
    k = min((w - 2 * pad) / im.width, (h - 2 * pad) / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (w, h))
    out.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return out


def check(assets, path):
    """Each asset at 24 / 32 / 48 px tall, on grass (top half) and on the yellow blanket (bottom)."""
    sizes, gap = (24, 32, 48), 12
    colw = max(round(48 * a.width / a.height) for a in assets.values()) + gap
    cols = 6
    rows = (len(assets) + cols - 1) // cols
    cell = sum(sizes) + 4 * gap
    W, H = cols * colw * 2, rows * cell * 2
    sheet = Image.new('RGBA', (cols * colw, rows * cell * 2))
    d = ImageDraw.Draw(sheet)
    d.rectangle((0, 0, sheet.width, rows * cell), fill=(92, 150, 64))
    for y in range(rows * cell, sheet.height, 16):  # gingham-ish blanket
        for x in range(0, sheet.width, 16):
            d.rectangle((x, y, x + 15, y + 15), fill=(250, 214, 110) if (x // 16 + y // 16) % 2 else (246, 196, 80))
    for half in (0, 1):
        for i, a in enumerate(assets.values()):
            x0, y = (i % cols) * colw + gap // 2, half * rows * cell + (i // cols) * cell + gap
            for s in sizes:
                t = a.resize((max(1, round(a.width * s / a.height)), s), Image.LANCZOS)
                sheet.alpha_composite(t, (x0, y))
                y += s + gap
    sheet.save(path)


def main(cut, out):
    Path(out).mkdir(parents=True, exist_ok=True)
    assets = {}
    for name, (sheet, part, w, h, shadow) in PICKS.items():
        im = Image.open(Path(cut) / sheet / f'part_{part}.png').convert('RGBA')
        if shadow:
            im = unshadow(im)
        if name == 'hero_ring':
            im = hollow(im)
        im = place(im, w, h)
        im.save(Path(out) / f'{name}.png')
        assets[name] = im
        print(name, im.size)
    check(assets, Path(out).parent / 'check.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
