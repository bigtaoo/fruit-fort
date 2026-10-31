"""Side-by-side sheet of style frames at phone size, to judge readability the way a player sees it.
usage: python phone_view.py <out.png> <scale> <image>...
Each image is scaled by <scale> (pick it so the cake comes out about 105 px wide, its size on a
390x844 CSS-px phone; see docs/art/style-frame.md §3), labelled with its file name."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

GAP = 16


def main(out, scale, paths):
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        ims.append((Path(p).stem, im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)))
    W = max(im.width for _, im in ims)
    h = max(im.height for _, im in ims) + 28
    sheet = Image.new("RGB", (len(ims) * (W + GAP) + GAP, h + GAP), "white")
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(ims):
        x = GAP + i * (W + GAP)
        d.text((x, 6), name, fill="black")
        sheet.paste(im, (x, 28))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3:])
