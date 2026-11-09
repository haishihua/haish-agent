#!/usr/bin/env python3
"""Pack the demo's original drag drawings at the same scale and baseline."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    'lift': ([199, 552, 907, 1262, 1618, 1973], 539),
    'land': ([204, 557, 912, 1266, 1623, 1978], 501),
}


def pack(name, centers, baseline):
    source = Image.open(ROOT / f'scripts/assets/penguin-drag-{name}-source.png').convert('RGBA')
    if source.size != (2172, 724):
        raise ValueError(f'{name}: unexpected sheet size {source.size}')
    sheet = Image.new('RGBA', (180 * len(centers), 155))
    for index, center in enumerate(centers):
        crop = source.crop((center - 145, baseline - 330, center + 145, baseline + 8))
        crop = crop.resize((round(290 * .39), round(338 * .39)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (180, 155))
        frame.alpha_composite(crop, ((180 - crop.width) // 2, 145 - round(330 * .39)))
        sheet.paste(frame, (index * 180, 0))
    sheet.save(ROOT / f'app-web/assets/ui/pet/drag-{name}.png', optimize=True)


if __name__ == '__main__':
    for name, (centers, baseline) in SOURCES.items():
        pack(name, centers, baseline)
