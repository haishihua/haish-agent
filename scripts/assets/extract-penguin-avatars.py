#!/usr/bin/env python3
"""Slice the penguin avatar sheet into individual agent avatar PNGs.

Usage: python3 scripts/assets/extract-penguin-avatars.py

Source: scripts/assets/penguin-avatar-sheet.png (7 columns x 8 rows, white-filled
line art on transparency). Output: tmp/agent-avatar-rasters/penguin-NN.png,
256x256, content centered with even padding — a dev preview only, nothing ships.
The shipped avatars are the traced SVGs from trace-penguin-avatars.py: the sheet
cell is ~150 px wide, so an upscaled raster goes soft at hero size.
Cells are located from the alpha channel so detached marks (zzz, !!, music notes)
stay inside their tile.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/assets/penguin-avatar-sheet.png'
OUT = ROOT / 'tmp/agent-avatar-rasters'
COLUMNS = 7
ROWS = 8
TILE = 256
PADDING_RATIO = 0.07
ALPHA_THRESHOLD = 32


def bands(mask_1d):
    """Contiguous runs of True, as (start, end) inclusive pairs."""
    indexes = np.where(mask_1d)[0]
    if not len(indexes):
        return []
    runs = []
    start = previous = int(indexes[0])
    for index in indexes[1:]:
        index = int(index)
        if index - previous > 1:
            runs.append((start, previous))
            start = index
        previous = index
    runs.append((start, previous))
    return runs


def cell_boxes(mask):
    height, width = mask.shape
    boxes = []
    for row_start, row_end in bands(mask.any(axis=1))[:ROWS]:
        slots = [[] for _ in range(COLUMNS)]
        for column_start, column_end in bands(mask[row_start:row_end + 1].any(axis=0)):
            # Assign every run (penguin body or a detached mark) to its nearest column slot.
            center = (column_start + column_end) / 2
            slot = min(range(COLUMNS), key=lambda index: abs(center - (index + 0.5) * width / COLUMNS))
            slots[slot].append((column_start, column_end))
        for runs in slots:
            if not runs:
                boxes.append(None)
                continue
            left = min(run[0] for run in runs)
            right = max(run[1] for run in runs)
            crop = mask[row_start:row_end + 1, left:right + 1]
            rows = np.where(crop.any(axis=1))[0]
            boxes.append((left, row_start + int(rows.min()), right, row_start + int(rows.max())))
    return boxes


def square_sprite(image):
    content = image.crop(image.getbbox()) if image.getbbox() else image
    pad = max(content.width, content.height) * PADDING_RATIO
    side = int(round(max(content.width, content.height) + pad * 2))
    tile = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    tile.alpha_composite(content, ((side - content.width) // 2, (side - content.height) // 2))
    return tile.resize((TILE, TILE), Image.LANCZOS)


def main():
    sheet = Image.open(SOURCE).convert('RGBA')
    mask = np.array(sheet)[..., 3] > ALPHA_THRESHOLD
    boxes = cell_boxes(mask)
    if len(boxes) != COLUMNS * ROWS:
        raise SystemExit(f'expected {COLUMNS * ROWS} cells, located {len(boxes)}')
    OUT.mkdir(parents=True, exist_ok=True)
    for index, box in enumerate(boxes, start=1):
        if box is None:
            raise SystemExit(f'cell {index} is empty')
        left, top, right, bottom = box
        sprite = square_sprite(sheet.crop((left, top, right + 1, bottom + 1)))
        sprite.save(OUT / f'penguin-{index:02d}.png', optimize=True)
    print(f'wrote {len(boxes)} avatars to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
