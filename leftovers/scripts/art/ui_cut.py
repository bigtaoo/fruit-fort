"""Cut the parts out of a generated UI sheet (parts on a flat grey background) into transparent PNGs.
usage: python ui_cut.py <sheet.png> <out dir> [min area]
The background is the median colour of the sheet's border. Every pixel reachable from the border
through pixels that are the background colour scaled darker (the soft drop shadows the generator
paints under each part) or barely brighter (a background gradient) becomes transparent; what is left is split into
connected parts, each saved as part_<n>.png (numbered left to right, top to bottom, by rows) with a
2-pixel feathered edge. Prints each part's box so you can rename them."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

PAD = 4


def cut(sheet, out, min_area=900):
    im = Image.open(sheet).convert('RGB')
    a = np.asarray(im).astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, 0)
    # Background or shadow: the background colour scaled darker (a shadow keeps its tint), or a
    # little brighter where the background has a soft gradient, but not as bright as white sticker borders.
    ratio = a / np.maximum(bg, 1)
    k = ratio.mean(2)
    top = 1 + (border.max(0) - bg).max() / bg.mean() + 0.012
    soft = (ratio.max(2) - ratio.min(2) < 0.07) & (k <= top) & (k > 0.45)
    lab, _ = ndimage.label(soft)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    clear = np.isin(lab, edge[edge > 0])
    solid = ndimage.binary_opening(~clear, iterations=2)
    solid = ndimage.binary_fill_holes(solid)
    parts, n = ndimage.label(solid)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(parts), 1):
        area = (parts[sl] == i).sum()
        if area >= min_area:
            boxes.append((i, sl))
    # Rows: sort by top, group parts whose vertical centres are close, then left to right.
    boxes.sort(key=lambda b: (b[1][0].start + b[1][0].stop) / 2)
    rows, last = [], None
    for b in boxes:
        cy = (b[1][0].start + b[1][0].stop) / 2
        if last is None or cy - last > 60:
            rows.append([])
        rows[-1].append(b)
        last = cy
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[1][1].start)]
    Path(out).mkdir(parents=True, exist_ok=True)
    alpha = Image.fromarray(((parts > 0) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.copy()
    rgba.putalpha(alpha)
    for k, (i, sl) in enumerate(ordered):
        y0, y1 = max(sl[0].start - PAD, 0), min(sl[0].stop + PAD, a.shape[0])
        x0, x1 = max(sl[1].start - PAD, 0), min(sl[1].stop + PAD, a.shape[1])
        crop = rgba.crop((x0, y0, x1, y1))
        keep = Image.fromarray(((parts[y0:y1, x0:x1] == i) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
        crop.putalpha(Image.fromarray(np.minimum(np.asarray(crop.getchannel('A')), np.asarray(keep))))
        p = Path(out) / f'part_{k}.png'
        crop.save(p)
        print(p.name, (x0, y0, x1 - x0, y1 - y0))


if __name__ == '__main__':
    cut(sys.argv[1], sys.argv[2], *(int(x) for x in sys.argv[3:]))
