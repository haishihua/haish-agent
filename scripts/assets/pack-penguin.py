#!/usr/bin/env python3
"""Extract six pet animations from the supplied transparent sprite sheet.

Usage: python3 scripts/assets/pack-penguin.py [path/to/sheet.png]
Requires Pillow. Source colors and alpha are preserved except for explicitly
selected decorative marks, which are recolored white for dark backgrounds.
"""
from collections import deque
from pathlib import Path
import sys
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / 'scripts/assets/penguin-pet-sheet.png'
OUTPUT = ROOT / 'app-web/assets/ui/pet'
FRAME_SIZE = (180, 155)
# Coordinates refer to the 1254x1254 sheet. Crops use a common canvas and
# baseline within each action, preserving the movement drawn in the source.
CLIPS = {
    'idle': ([383], 28, 161, 126),  # second idle frame
    'walk': ([247, 380, 511, 641, 771, 901, 1031, 1160], 188, 310, 126),
    'run': ([248, 380, 510, 640, 770, 900, 1032, 1160], 332, 466, 126),
    'sit': ([255, 425, 595, 765, 945], 477, 610, 160),
    'cheer': ([252, 382, 512, 640, 756, 886, 1012, 1138], 765, 909, 126),
    'sleep': ([257, 430, 595, 765, 937, 1114], 1080, 1210, 160),
}


def extract_frame(sheet, center, top, bottom, width):
    if width > FRAME_SIZE[0] or bottom - top > FRAME_SIZE[1]:
        raise ValueError('source crop does not fit the frame canvas')
    crop = sheet.crop((center - width // 2, top, center + (width + 1) // 2, bottom))
    canvas = Image.new('RGBA', FRAME_SIZE, (0, 0, 0, 0))
    canvas.paste(crop, ((FRAME_SIZE[0] - width) // 2, FRAME_SIZE[1] - (bottom - top)))
    return canvas


# Frame indices are zero-based. Rectangles select only detached decorations,
# not the pet's outline. They are slightly padded to retain antialiased edges.
MARKS = {
    'run': {1: [(73, 135, 105, 147)], 2: [(74, 135, 104, 148)], 6: [(75, 133, 106, 146)]},
    'sit': {3: [(126, 60, 150, 92)]},
    'cheer': {
        2: [(104, 24, 131, 50)], 3: [(42, 30, 59, 47)],
        4: [(74, 124, 98, 150)], 5: [(56, 44, 74, 56), (110, 49, 128, 60)],
    },
    'sleep': {2: [(93, 46, 117, 71)], 3: [(94, 34, 132, 73)], 4: [(89, 34, 139, 73)]},
    'work': {2: [(123, 58, 149, 86)], 4: [(32, 73, 58, 102)], 5: [(122, 82, 142, 96)]},
    'thinking': {3: [(103, 16, 126, 47)]},
}


def recolor_marks(frame, clip, index):
    alpha = frame.getchannel('A')
    pixels = alpha.load()
    seen = set()
    selected = Image.new('L', frame.size)
    mask = selected.load()
    regions = MARKS.get(clip, {}).get(index, [])
    for left, top, right, bottom in regions:
        for y in range(top, bottom):
            for x in range(left, right):
                if pixels[x, y] < 40 or (x, y) in seen:
                    continue
                component = []
                queue = deque([(x, y)])
                seen.add((x, y))
                while queue:
                    px, py = queue.popleft()
                    component.append((px, py))
                    for nx in range(max(0, px - 1), min(frame.width, px + 2)):
                        for ny in range(max(0, py - 1), min(frame.height, py + 2)):
                            if (nx, ny) not in seen and pixels[nx, ny] >= 40:
                                seen.add((nx, ny))
                                queue.append((nx, ny))
                # The character is the large connected component. Never recolor it.
                if len(component) < 400 and all(
                    left <= px < right and top <= py < bottom for px, py in component
                ):
                    for px, py in component:
                        mask[px, py] = 255
    # Include only the low-alpha antialias fringe immediately adjacent to marks;
    # do not recolor any neighboring opaque part of the character.
    fringe = ImageChops.multiply(
        selected.filter(ImageFilter.MaxFilter(3)), alpha.point(lambda a: 255 if 0 < a < 40 else 0)
    )
    selected = ImageChops.lighter(selected, fringe)
    result = frame.copy()
    result.paste((255, 255, 255, 255), (0, 0, *frame.size), selected)
    result.putalpha(alpha)
    return result


def make_thinking_dot_layers(original, output):
    """Keep the original three dots as independent, antialiased animation layers."""
    frame = original.crop((5 * 180, 0, 6 * 180, 155))
    clean = frame.copy()
    pixels = clean.load()
    boxes = [(105, 17, 112, 24), (114, 17, 121, 24), (123, 17, 130, 24)]
    for left, top, right, bottom in boxes:
        for y in range(top, bottom):
            for x in range(left, right):
                a, b = frame.getpixel((left - 1, y)), frame.getpixel((right, y))
                weight = (x - left + 1) / (right - left + 1)
                pixels[x, y] = tuple(round(a[c] * (1 - weight) + b[c] * weight) for c in range(4))
    clean.save(output / 'thinking-hold-clean.png', optimize=True)
    for index, box in enumerate(boxes, 1):
        dot = Image.new('RGBA', FRAME_SIZE, (0, 0, 0, 0))
        clean_pixels = clean.load()
        dot_pixels = dot.load()
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                source = frame.getpixel((x, y))
                background = clean_pixels[x, y]
                opacity = max(0, min(255, round(255 * (1 - sum(source[:3]) / max(1, sum(background[:3]))))))
                if opacity:
                    dot_pixels[x, y] = (0, 0, 0, round(opacity * source[3] / 255))
        dot.save(output / f'thinking-dot-{index}.png', optimize=True)


def pack(source=DEFAULT_SOURCE, output=OUTPUT):
    sheet = Image.open(source).convert('RGBA')
    if sheet.size != (1254, 1254):
        raise ValueError(f'expected a 1254x1254 sprite sheet, got {sheet.size}')
    output.mkdir(parents=True, exist_ok=True)
    for name, (centers, top, bottom, width) in CLIPS.items():
        result = Image.new('RGBA', (FRAME_SIZE[0] * len(centers), FRAME_SIZE[1]))
        for index, center in enumerate(centers):
            frame = recolor_marks(extract_frame(sheet, center, top, bottom, width), name, index)
            result.paste(frame, (index * FRAME_SIZE[0], 0))
        result.save(output / f'{name}.png', optimize=True)
        print(f'{name}: {len(centers)} frames')
    for name in ('work', 'thinking'):
        original = Image.open(ROOT / f'scripts/assets/penguin-{name}-original.png').convert('RGBA')
        result = Image.new('RGBA', original.size)
        for index in range(original.width // FRAME_SIZE[0]):
            frame = original.crop((index * 180, 0, (index + 1) * 180, 155))
            result.paste(recolor_marks(frame, name, index), (index * 180, 0))
        result.save(output / f'{name}.png', optimize=True)
        if name == 'thinking':
            make_thinking_dot_layers(original, output)
        print(f'{name}: {original.width // 180} frames')


if __name__ == '__main__':
    pack(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE)
