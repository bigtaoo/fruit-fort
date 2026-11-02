"""Lay a UI direction's cut parts over a HUD-less battle screenshot, at the live HUD's positions.
usage: python ui_mock.py <direction> <clean.png> <hud.png> <parts dir> <out.png>
<direction> is a key of DIRS below; <parts dir> holds the folders ui_cut.py wrote for that
direction's sheets (<name>_kit/part_N.png, <name>_icons/part_N.png). <clean.png> is the battle at
390x844 CSS px x2 with the HUD made invisible (opacity 0, so the camera framing stays the same);
<hud.png> is the same frame with the HUD, used only to take the hero portrait. Boxes are the
HUD's CSS-px rects from the 2026-10-31 build (src/view/hud.ts), so the mock matches the layout."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

S = 2  # screenshot px per CSS px
FONT = 'C:/Windows/Fonts/seguibl.ttf'
INK = (43, 29, 20)

STATS = [('Damage', 4, 57), ('Fire rate', 3, 62), ('Crit', 1, 42), ('Multishot', 0, 120),
         ('Range', 0, 30), ('Train speed', 1, 28), ('Gold', 2, 63), ('Fence', 0, 25)]
GOLD = 34

# Per direction: which cut part plays which role, and the text colours. Icon order follows
# STAT_KEYS in src/sim/config.ts: dmg spd crit multi range move gold wall.
DIRS = {
    'a_wood': dict(kit='a_wood_kit', icons='a_wood_icons', stat='part_2', wave='part_0',
                   small='part_3', bar='part_6', hero='part_5', coin='part_9',
                   icon=['part_0', 'part_1', 'part_3', 'part_2', 'part_5', 'part_4', 'part_6', 'part_7'],
                   text=(255, 248, 230), outline=INK, bar_fill=(240, 120, 150)),
    'b_sticker': dict(kit='b_sticker_kit', icons='b_sticker_icons', stat='part_0', wave='part_6',
                      small='part_1', bar='part_4', hero='part_12', coin='part_9',
                      icon=['part_0', 'part_1', 'part_2', 'part_3', 'part_4', 'part_5', 'part_6', 'part_7'],
                      text=INK, outline=None, bar_fill=(244, 130, 160)),
    'c_toy': dict(kit='c_toy_kit', icons='c_toy_icons', stat='part_0', wave='part_6',
                  small='part_1', bar='part_3', hero='part_4', coin='part_5',
                  icon=['part_0', 'part_2', 'part_3', 'part_4', 'part_3', 'part_5', 'part_6', 'part_8'],
                  text=(255, 255, 255), outline=INK, bar_fill=(250, 110, 150),
                  tint=[(110, 180, 255), (255, 200, 60), (255, 110, 110), (110, 220, 170)]),
}


def nine(src, w, h, frac=0.42):
    """Stretch src to w x h keeping the corners: scale so the height fits, then 9-slice."""
    k = h / src.height
    src = src.resize((max(1, round(src.width * k)), h), Image.LANCZOS)
    if src.width >= w:
        return src.resize((w, h), Image.LANCZOS)
    c = round(h * frac)
    c = min(c, src.width // 2 - 1)
    out = Image.new('RGBA', (w, h))
    out.paste(src.crop((0, 0, c, h)), (0, 0))
    out.paste(src.crop((src.width - c, 0, src.width, h)), (w - c, 0))
    out.paste(src.crop((c, 0, src.width - c, h)).resize((w - 2 * c, h), Image.LANCZOS), (c, 0))
    return out


def fit(src, w, h):
    im = src.copy()
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def tint(im, rgb):
    """Colour a grey part: multiply its luminance by rgb, keep alpha."""
    g = ImageEnhance.Brightness(im.convert('L')).enhance(1.25)
    col = Image.merge('RGB', [g.point(lambda v, c=c: min(255, v * c // 200)) for c in rgb])
    col.putalpha(im.getchannel('A'))
    return col


def text(d, xy, s, size, fill, outline, anchor='mm'):
    f = ImageFont.truetype(FONT, size)
    if outline:
        d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=max(2, size // 7), stroke_fill=outline)
    else:
        d.text(xy, s, font=f, fill=fill, anchor=anchor)


def main(name, clean, hud, parts, out):
    cfg = DIRS[name]
    P = lambda sheet, p: Image.open(Path(parts) / cfg[sheet] / f'{p}.png').convert('RGBA')
    im = Image.open(clean).convert('RGBA')
    d = ImageDraw.Draw(im)
    put = lambda part, x, y: im.alpha_composite(part, (round(x), round(y)))
    col, ol = cfg['text'], cfg['outline']

    # Top row: wave badge, gold, speed and sound buttons.
    put(nine(P('kit', cfg['wave']), 150 * S, 34 * S), 8 * S, 8 * S)
    text(d, (83 * S, 25 * S), 'Wave 5 / 5', 15 * S, col, ol)
    put(fit(P('kit', cfg['coin']), 26 * S, 26 * S), 166 * S, 12 * S)
    text(d, (196 * S, 25 * S), str(GOLD), 17 * S, (255, 255, 255), INK, 'lm')
    for x, w, label in [(266, 52, 'x1'), (326, 52, None)]:
        put(nine(P('kit', cfg['small']), w * S, 36 * S), x * S, 8 * S)
        if label:
            text(d, ((x + w / 2) * S, 26 * S), label, 15 * S, col, ol)
        else:  # speaker
            sx, sy = (x + w / 2 - 8) * S, 26 * S
            body = [(sx, sy - 4 * S), (sx + 5 * S, sy - 4 * S), (sx + 11 * S, sy - 10 * S), (sx + 11 * S, sy + 10 * S),
                    (sx + 5 * S, sy + 4 * S), (sx, sy + 4 * S)]
            d.polygon(body, fill=col, outline=ol or col, width=2 * S if ol else 1)
            d.arc((sx + 8 * S, sy - 8 * S, sx + 20 * S, sy + 8 * S), -50, 50, fill=ol or col, width=3 * S)

    # Fence bar: frame, then the fill inset inside it, then the label.
    bx, by, bw, bh = 10, 50, 370, 24
    frame = nine(P('kit', cfg['bar']), bw * S, bh * S, 0.5)
    put(frame, bx * S, by * S)
    ins = 5 * S
    fw = round((bw * S - 2 * ins) * 804 / 1000)
    fill = Image.new('RGBA', (fw, bh * S - 2 * ins), cfg['bar_fill'] + (255,))
    mask = Image.new('L', fill.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, fill.width - 1, fill.height - 1), radius=fill.height // 2, fill=255)
    hl = ImageDraw.Draw(fill)
    hl.rectangle((0, 0, fw, fill.height // 3), fill=tuple(min(255, c + 40) for c in cfg['bar_fill']) + (255,))
    fill.putalpha(mask)
    put(fill, bx * S + ins, by * S + ins)
    text(d, ((bx + bw / 2) * S, (by + bh / 2) * S), 'Fence 804 / 1000', 12 * S, (255, 255, 255), INK)

    # Hero skill button with the soldier portrait from the live HUD.
    hx, hy, hs = 10, 594, 88
    ring = fit(P('kit', cfg['hero']), hs * S, hs * S)
    put(ring, (hx + hs / 2) * S - ring.width / 2, (hy + hs / 2) * S - ring.height / 2)
    face = Image.open(hud).convert('RGBA').crop((31 * S, 611 * S, 77 * S, 657 * S)).resize((54 * S, 54 * S), Image.LANCZOS)
    m = Image.new('L', face.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, face.width - 1, face.height - 1), fill=255)
    face.putalpha(m)
    put(face, (hx + hs / 2 - 27) * S, (hy + hs / 2 - 31) * S)
    text(d, ((hx + hs / 2) * S, (hy + hs - 14) * S), 'Bugle', 12 * S, (255, 255, 255), INK)

    # 2 x 4 stat buttons. Can't afford = the same frame greyed out.
    for i, (label, lvl, cost) in enumerate(STATS):
        cx, cy = 10 + (i % 4) * 93.5, 692 + (i // 4) * 74
        w, h = 88, 70
        off = cost > GOLD
        fr = P('kit', cfg['stat'])
        if 'tint' in cfg and not off:
            fr = tint(fr, cfg['tint'][i % 4])
        if off:  # what CSS filter: grayscale(.85) brightness(.85) would do; no extra asset
            a = fr.getchannel('A')
            fr = ImageEnhance.Brightness(ImageEnhance.Color(fr.convert('RGB')).enhance(0.15)).enhance(0.85)
            fr.putalpha(a)
        put(nine(fr, w * S, h * S, 0.3), cx * S, cy * S)
        ic = fit(P('icons', cfg['icon'][i]), 30 * S, 28 * S)
        if off:
            ic = Image.blend(ic, ImageEnhance.Color(ic).enhance(0.25), 0.7)
        put(ic, (cx + w / 2) * S - ic.width / 2, (cy + 4) * S)
        tc = (150, 140, 130) if off and ol is None else col
        size = 10 if len(label) > 9 else 11
        text(d, ((cx + w / 2) * S, (cy + 41) * S), f'{label} {lvl}', size * S, tc, ol)
        coin = fit(P('kit', cfg['coin']), 13 * S, 13 * S)
        put(coin, (cx + w / 2 - 15) * S, (cy + 50) * S)
        text(d, ((cx + w / 2 - 1) * S, (cy + 57) * S), str(cost), 12 * S, (255, 255, 255), INK, 'lm')

    im.convert('RGB').save(out)
    print(out, im.size)


if __name__ == '__main__':
    main(*sys.argv[1:6])
