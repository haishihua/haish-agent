#!/usr/bin/env python3
"""Trace the penguin avatar sheet into crisp SVG avatars.

Usage:
    python3 -m venv tmp/venv && tmp/venv/bin/pip install potracer pillow numpy
    tmp/venv/bin/python scripts/assets/trace-penguin-avatars.py

Why: a sheet cell is ~150 px wide. Upscaling that raster to 256 leaves
stair-steps that are obvious once the avatar is drawn at 104 px on a HiDPI
screen. The artwork is two flat tones (white body, black line), so tracing is
lossless where it matters: both coverage maps are supersampled 4x (LANCZOS) and
potrace follows the 50% isocontour, which turns the antialiased bitmap back into
smooth curves that stay sharp at any size.

Each avatar is two stacked paths: the opaque silhouette in white, then the ink in
black. Drawing the silhouette first keeps the white belly and eye patches, and
the ink covers the shared edge exactly, so there is no white fringe.

Cells come from the same alpha-band split as extract-penguin-avatars.py, so
detached marks (zzz, !!, music notes) stay inside their own tile.
"""
from pathlib import Path
import importlib.util

import numpy as np
import potrace
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/assets/penguin-avatar-sheet.png'
OUT = ROOT / 'app-web/assets/ui/agent-avatars'
EXTRACTOR = ROOT / 'scripts/assets/extract-penguin-avatars.py'

SUPERSAMPLE = 4
TILE = 256
# 按“企鹅本体”而不是整格着墨区定尺寸：整格也包含问号、zzz、音符这类
# 脱离的小符号，按整格缩放会让带配饰的企鹅明显比别人小一号。
# 本体边长（不是面积）做基准最稳：实测 55 张的本体渲染边长收敛到 177~192 px，
# 换成面积口径反而让细长的姿势被放大到 240 px 以上，看起来更不齐。
BODY_TARGET_RATIO = 0.75
# 配饰可以伸到贴边，但不能出框。
FRAME_CAP_RATIO = 0.98
EDGE_MARGIN = 2
INK = '#111111'
PAPER = '#ffffff'
# 客户明确不要的格子：2 = 与第 1 格重复的站姿，16 = 戴眼镜看书。重跑也不会带回来。
SKIP_CELLS = {2, 16}


def load_extractor():
    spec = importlib.util.spec_from_file_location('extract_penguin_avatars', EXTRACTOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def trace_coverage(coverage):
    """Trace a 0..1 coverage map; supersampling keeps sub-pixel accuracy."""
    height, width = coverage.shape
    as_image = Image.fromarray((coverage * 255).astype(np.uint8))
    levels = np.asarray(as_image.resize((width * SUPERSAMPLE, height * SUPERSAMPLE), Image.LANCZOS), dtype=np.float64)
    # potracer expects black = ink, and internally inverts the buffer.
    ink = np.where(levels > 127.5, 0, 255).astype(np.uint8)
    return potrace.Bitmap(ink).trace(
        turdsize=2,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0,
        opticurve=True,
        opttolerance=0.2,
    )


def flatten(curves):
    """potrace nests holes as children; SVG fill-rule=evenodd wants them inline."""
    for curve in curves:
        yield curve
        children = getattr(curve, 'children', None)
        if children:
            yield from flatten(children)


def curve_path(curve):
    start = curve.start_point
    parts = [f'M{start.x:.2f} {start.y:.2f}']
    for segment in curve.segments:
        if segment.is_corner:
            corner, end = segment.c, segment.end_point
            parts.append(f'L{corner.x:.2f} {corner.y:.2f}L{end.x:.2f} {end.y:.2f}')
        else:
            c1, c2, end = segment.c1, segment.c2, segment.end_point
            parts.append(f'C{c1.x:.2f} {c1.y:.2f} {c2.x:.2f} {c2.y:.2f} {end.x:.2f} {end.y:.2f}')
    parts.append('Z')
    return ''.join(parts)


def points(curve):
    yield curve.start_point
    for segment in curve.segments:
        if segment.is_corner:
            yield segment.c
        else:
            yield segment.c1
            yield segment.c2
        yield segment.end_point


def bounds(path):
    xs, ys = [], []
    for curve in flatten(path.curves):
        for point in points(curve):
            xs.append(point.x)
            ys.append(point.y)
    return min(xs), min(ys), max(xs), max(ys)


def largest_blob(mask):
    """Bounding box + pixel area of the biggest connected ink region.

    That region is the penguin itself; question marks, zzz and music notes are
    separate small blobs and must not decide the scale.
    """
    height, width = mask.shape
    seen = np.zeros((height, width), dtype=bool)
    best = None
    best_area = 0
    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or seen[start_y, start_x]:
                continue
            stack = [(start_y, start_x)]
            seen[start_y, start_x] = True
            area = 0
            x0 = x1 = start_x
            y0 = y1 = start_y
            while stack:
                y, x = stack.pop()
                area += 1
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if area > best_area:
                best_area = area
                best = (x0, y0, x1 + 1, y1 + 1)
    return best, best_area


def sprite_svg(paper_path, ink_path, body_box, scale):
    left, top, right, bottom = bounds(paper_path)
    body_left, body_top, body_right, body_bottom = body_box
    # Centre the body, then nudge so detached marks still sit inside the tile.
    offset_x = TILE / 2 - (body_left + body_right) / 2 * scale
    offset_y = TILE / 2 - (body_top + body_bottom) / 2 * scale
    for axis, offset, low, high in (('x', offset_x, left, right), ('y', offset_y, top, bottom)):
        projected_low = low * scale + offset
        projected_high = high * scale + offset
        if projected_low < EDGE_MARGIN:
            offset += EDGE_MARGIN - projected_low
        elif projected_high > TILE - EDGE_MARGIN:
            offset -= projected_high - (TILE - EDGE_MARGIN)
        if axis == 'x':
            offset_x = offset
        else:
            offset_y = offset
    layers = []
    for fill, path in ((PAPER, paper_path), (INK, ink_path)):
        data = ''.join(curve_path(curve) for curve in flatten(path.curves))
        layers.append(f'<path fill="{fill}" fill-rule="evenodd" d="{data}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}" '
        f'role="img" aria-hidden="true">'
        f'<g transform="translate({offset_x:.3f} {offset_y:.3f}) scale({scale:.5f})">' + ''.join(layers) + '</g></svg>\n'
    )


def main():
    extractor = load_extractor()
    sheet = Image.open(SOURCE).convert('RGBA')
    boxes = extractor.cell_boxes(np.array(sheet)[..., 3] > extractor.ALPHA_THRESHOLD)
    if len(boxes) != extractor.COLUMNS * extractor.ROWS:
        raise SystemExit(f'expected {extractor.COLUMNS * extractor.ROWS} cells, located {len(boxes)}')
    OUT.mkdir(parents=True, exist_ok=True)

    cells = []
    for index, box in enumerate(boxes, start=1):
        if box is None:
            raise SystemExit(f'cell {index} is empty')
        if index in SKIP_CELLS:
            (OUT / f'penguin-{index:02d}.svg').unlink(missing_ok=True)
            continue
        left, top, right, bottom = box
        sprite = sheet.crop((left, top, right + 1, bottom + 1))
        values = np.asarray(sprite, dtype=np.float64) / 255.0
        alpha = values[..., 3]
        luminance = 0.2126 * values[..., 0] + 0.7152 * values[..., 1] + 0.0722 * values[..., 2]
        paper = trace_coverage(alpha)
        ink = trace_coverage(alpha * (1.0 - luminance))
        body_box, _ = largest_blob(alpha > 0.5)
        if body_box is None:
            raise SystemExit(f'cell {index} has no ink')
        body_box = tuple(value * SUPERSAMPLE for value in body_box)
        body_long = max(body_box[2] - body_box[0], body_box[3] - body_box[1])
        union = bounds(paper)
        cells.append(
            {
                'index': index,
                'paper': paper,
                'ink': ink,
                'body_box': body_box,
                'long': body_long,
                'union_long': max(union[2] - union[0], union[3] - union[1]),
            }
        )

    for cell in cells:
        scale = min(
            TILE * BODY_TARGET_RATIO / cell['long'],
            TILE * FRAME_CAP_RATIO / cell['union_long'],
        )
        svg = sprite_svg(cell['paper'], cell['ink'], cell['body_box'], scale)
        (OUT / f'penguin-{cell["index"]:02d}.svg').write_text(svg, encoding='utf8')
    print(f'wrote {len(cells)} traced avatars to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
