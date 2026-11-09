#!/usr/bin/env python3
"""Pack the supplied jump drawings using the demo's original crop and scale."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/assets/penguin-jump-sheet.png'
OUTPUT = ROOT / 'app-web/assets/ui/pet/jump.png'
REGIONS = [(20, 205), (205, 382), (382, 560), (560, 738), (738, 913), (913, 1090),
           (1090, 1268), (1268, 1445), (1445, 1623), (1623, 1801), (1801, 1977), (1977, 2150)]


def pack(source=SOURCE, output=OUTPUT):
    sheet = Image.open(source).convert('RGBA')
    if sheet.size != (2170, 725):
        raise ValueError(f'expected a 2170x725 sprite sheet, got {sheet.size}')
    result = Image.new('RGBA', (180 * len(REGIONS), 155))
    for index, (left, right) in enumerate(REGIONS):
        crop = sheet.crop((left, 150, right, 454))
        bbox = crop.getchannel('A').point(lambda a: 255 if a >= 40 else 0).getbbox()
        if not bbox:
            raise ValueError(f'empty jump frame {index + 1}')
        bbox = (max(0, bbox[0] - 3), max(0, bbox[1] - 3),
                min(crop.width, bbox[2] + 3), min(crop.height, bbox[3] + 3))
        figure = crop.crop(bbox)
        figure = figure.resize((round(figure.width * .65), round(figure.height * .65)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (180, 155))
        frame.alpha_composite(figure, ((180 - figure.width) // 2, 146 - figure.height))
        result.paste(frame, (index * 180, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output, optimize=True)


if __name__ == '__main__':
    pack()
