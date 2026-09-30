#!/usr/bin/env python3
"""Extract the existing penguin illustration for Icon Composer (requires Pillow).

The traced silhouette excludes the legacy rounded card and its drop shadow.
The character's existing painted texture is deliberately preserved. Only the
background, outer mask, and additional icon effects belong to Icon Composer.
Run from any directory; the legacy PNG is a migration input, not a build input.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'build/icon.png'
DESTINATION = ROOT / 'build/Haish.icon/Assets/penguin.png'

# Cubic Bezier silhouette in the original 1024px artwork coordinates.
START = (246, 909)
CURVES = [
    ((244, 864), (248, 826), (254, 785)),
    ((210, 776), (188, 751), (193, 704)),
    ((194, 646), (231, 581), (270, 536)),
    ((253, 503), (241, 467), (242, 425)),
    ((238, 281), (352, 177), (506, 176)),
    ((658, 167), (768, 282), (777, 416)),
    ((782, 472), (767, 518), (751, 548)),
    ((794, 580), (828, 640), (837, 704)),
    ((847, 758), (819, 805), (808, 819)),
    ((814, 850), (814, 881), (809, 909)),
    ((642, 911), (416, 912), START),
]


def silhouette():
    points = [START]
    p0 = START
    for p1, p2, p3 in CURVES:
        for step in range(1, 101):
            t = step / 100
            s = 1 - t
            points.append(tuple(s**3*p0[i] + 3*s*s*t*p1[i]
                                + 3*s*t*t*p2[i] + t**3*p3[i] for i in (0, 1)))
        p0 = p3
    mask = Image.new('L', (4096, 4096))
    ImageDraw.Draw(mask).polygon([(round(x*4), round(y*4)) for x, y in points], fill=255)
    # Trim the old cream-card fringe before antialiasing the character edge.
    return (mask.resize((1024, 1024), Image.Resampling.LANCZOS)
            .filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(0.5)))


if __name__ == '__main__':
    image = Image.open(SOURCE).convert('RGBA')
    if image.size != (1024, 1024):
        raise SystemExit('Expected the original 1024×1024 penguin artwork')
    image.putalpha(silhouette())
    # No baked card, rounded mask, or outer transparent margin in the background.
    # Enlarge the character to meet the bottom of the full-bleed canvas naturally.
    image = image.resize((1208, 1208), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', (1024, 1024))
    layer.alpha_composite(image, (-92, -40))
    layer.save(DESTINATION, optimize=True)
    print(f'Prepared {DESTINATION.relative_to(ROOT)}')
