"""Bake the floating-text glyph atlas: src/assets/fx/glyphs.png + glyphs.json.

    python scripts/art/glyphs.py

The glyphs are drawn here as thick strokes on a small grid (chamfered corners, the sci-fi look of the
HUD), not taken from a font, so there is nothing to license and every device shows the same letters.
White fill with a light shade band at the bottom and a navy outline: the game multiplies the colour in,
so one atlas gives gold coins, red damage and green heals, the outline staying dark.
"""
import json
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'fx')

U = 9          # final pixels per grid unit; digits are 6 units tall
SS = 4         # supersampling
T = 1.1        # stroke width, units
EDGE = 0.55    # outline outside the stroke, units
H = 6.0
W = 3.2
C = 0.9        # chamfer

NAVY = (10, 26, 51, 255)

# Each glyph: (advance width in units, [polylines]); a one-point polyline is a dot.
G = {
    '0': (W, [[(C, 0), (W, 0), (W, H - C), (W - C, H), (0, H), (0, C), (C, 0)]]),
    '1': (1.6, [[(0.1, 1.2), (1.4, 0), (1.4, H)]]),
    '2': (W, [[(0, C), (C, 0), (W - C, 0), (W, C), (W, 2.4), (0, 4.9), (0, H), (W, H)]]),
    '3': (W, [[(0, 0), (W, 0), (1.2, 2.6), (W - C, 2.6), (W, 3.5), (W, H - C), (W - C, H), (0, H)]]),
    '4': (W + 0.3, [[(2.5, H), (2.5, 0), (0, 4.0), (W + 0.3, 4.0)]]),
    '5': (W, [[(W, 0), (0, 0), (0, 2.6), (W - C, 2.6), (W, 3.5), (W, H - C), (W - C, H), (0, H)]]),
    '6': (W, [[(W, 0), (C, 0), (0, C), (0, H), (W, H), (W, 2.6), (0, 2.6)]]),
    '7': (W, [[(0, 0), (W, 0), (W, 1.2), (1.1, H)]]),
    '8': (W, [[(C, 0), (W, 0), (W, 2.6), (0, 2.6), (0, C), (C, 0)],
              [(0, 2.6), (W, 2.6), (W, H - C), (W - C, H), (0, H), (0, 2.6)]]),
    '9': (W, [[(0, H), (W - C, H), (W, H - C), (W, 0), (0, 0), (0, 3.4), (W, 3.4)]]),
    '+': (3.0, [[(0, 3.2), (3.0, 3.2)], [(1.5, 1.7), (1.5, 4.7)]]),
    '-': (2.4, [[(0, 3.2), (2.4, 3.2)]]),
    'x': (2.6, [[(0, 1.9), (2.6, 4.5)], [(0, 4.5), (2.6, 1.9)]]),
    '%': (3.8, [[(3.6, 0), (0.2, H)], [(0.3, 0.6), (0.6, 1.2)], [(3.2, H - 1.2), (3.5, H - 0.6)]]),
    'K': (W, [[(0, 0), (0, H)], [(W, 0), (0.4, 3.0), (W, H)]]),
    'M': (4.2, [[(0, H), (0, 0), (2.1, 3.2), (4.2, 0), (4.2, H)]]),
    '!': (0.8, [[(0.4, 0), (0.4, 4.0)], [(0.4, H)]]),
    '.': (0.8, [[(0.4, H)]]),
}

PAD = T / 2 + EDGE + 0.15     # units around the strokes in each cell
CELL_H = H + 2 * PAD


def strokes(d, lines, ox, oy, width, color):
    """Polylines with round joins and caps: a line per segment and a disc at every point."""
    s = U * SS
    r = width * s / 2
    for line in lines:
        pts = [((ox + x) * s, (oy + y) * s) for x, y in line]
        for a, b in zip(pts, pts[1:]):
            d.line([a, b], fill=color, width=round(width * s))
        for x, y in pts:
            d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def main():
    os.makedirs(OUT, exist_ok=True)
    # One row per this many units of width; the atlas is 512 wide.
    AW = 512
    cells = []
    x = y = 0.0
    for ch, (adv, _) in G.items():
        cw = adv + 2 * PAD
        if (x + cw) * U > AW:
            x, y = 0.0, y + CELL_H
        cells.append((ch, x, y, cw))
        x += cw + 0.2
    AH = 1
    while AH < (y + CELL_H) * U:
        AH *= 2

    big = (AW * SS, AH * SS)
    outline = Image.new('RGBA', big, (0, 0, 0, 0))
    fill = Image.new('L', big, 0)
    do, df = ImageDraw.Draw(outline), ImageDraw.Draw(fill)
    for ch, cx, cy, _ in cells:
        lines = G[ch][1]
        strokes(do, lines, cx + PAD, cy + PAD, T + 2 * EDGE, NAVY)
        strokes(df, lines, cx + PAD, cy + PAD, T, 255)

    # The fill: white, a cooler shade on the lower part of each glyph.
    shade = Image.new('RGBA', big, (255, 255, 255, 255))
    sd = ImageDraw.Draw(shade)
    for ch, cx, cy, cw in cells:
        top = (cy + PAD + H * 0.58) * U * SS
        sd.rectangle([cx * U * SS, top, (cx + cw) * U * SS, (cy + CELL_H) * U * SS], fill=(196, 210, 228, 255))
    img = outline.copy()
    img.paste(shade, (0, 0), fill)
    img = img.resize((AW, AH), Image.LANCZOS)
    img.save(os.path.join(OUT, 'glyphs.png'), optimize=True)

    meta = {
        'size': [AW, AH],
        # Height of a cell in atlas pixels; glyph quads are drawn at this aspect.
        'cell': round(CELL_H * U, 2),
        # Empty margin left of the first stroke in every cell.
        'pad': round(PAD * U, 2),
        # Pen advance added after each glyph's own width: the next outline starts where this fill ends,
        # so no glyph's outline covers its neighbour's fill.
        'gap': round((T + EDGE) * U, 2),
        # Per glyph: cell x, cell y, cell width, advance width (all atlas pixels).
        'glyphs': {ch: [round(cx * U, 2), round(cy * U, 2), round(cw * U, 2), round(G[ch][0] * U, 2)] for ch, cx, cy, cw in cells},
    }
    with open(os.path.join(OUT, 'glyphs.json'), 'w', encoding='utf8') as f:
        json.dump(meta, f, indent=1)
    print(AW, AH, len(cells), 'glyphs')


if __name__ == '__main__':
    main()
