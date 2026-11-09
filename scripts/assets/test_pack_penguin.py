#!/usr/bin/env python3
"""Regression tests for extracting the supplied transparent pet sprite sheet."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image, ImageChops

spec = importlib.util.spec_from_file_location('pack_penguin', Path(__file__).with_name('pack-penguin.py'))
pack_penguin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack_penguin)


class PetExtractionTests(unittest.TestCase):
    def test_every_frame_preserves_source_pixels_and_is_not_clipped(self):
        source = Image.open(pack_penguin.DEFAULT_SOURCE).convert('RGBA')
        for name, (centers, top, bottom, width) in pack_penguin.CLIPS.items():
            for center in centers:
                with self.subTest(clip=name, center=center):
                    frame = pack_penguin.extract_frame(source, center, top, bottom, width)
                    left = (180 - width) // 2
                    bottom_offset = 155 - (bottom - top)
                    actual = frame.crop((left, bottom_offset, left + width, 155))
                    expected = source.crop((center - width // 2, top, center + (width + 1) // 2, bottom))
                    self.assertIsNone(ImageChops.difference(actual, expected).getbbox())
                    mask = expected.getchannel('A').point(lambda alpha: 255 if alpha >= 40 else 0)
                    bbox = mask.getbbox()
                    self.assertIsNotNone(bbox)
                    self.assertGreater(bbox[0], 1)
                    self.assertGreater(bbox[1], 1)
                    self.assertLess(bbox[2], width - 1)
                    self.assertLess(bbox[3], bottom - top - 1)
                    self.assertEqual(frame.getpixel((0, 0))[3], 0)

    def test_pack_recolors_only_detached_marks_preserving_alpha(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            pack_penguin.pack(output=output)
            source = Image.open(pack_penguin.DEFAULT_SOURCE).convert('RGBA')
            for name, (centers, top, bottom, width) in pack_penguin.CLIPS.items():
                with Image.open(output / f'{name}.png') as sheet:
                    self.assertEqual(sheet.size, (180 * len(centers), 155))
                    for index, center in enumerate(centers):
                        original = pack_penguin.extract_frame(source, center, top, bottom, width)
                        actual = sheet.crop((index * 180, 0, (index + 1) * 180, 155))
                        self.assert_frame_changes_are_marks(original, actual, name, index)
            for name in ('work', 'thinking'):
                original = Image.open(pack_penguin.ROOT / f'scripts/assets/penguin-{name}-original.png').convert('RGBA')
                with Image.open(output / f'{name}.png') as sheet:
                    self.assertEqual(sheet.size, original.size)
                    for index in range(sheet.width // 180):
                        bounds = (index * 180, 0, (index + 1) * 180, 155)
                        self.assert_frame_changes_are_marks(original.crop(bounds), sheet.crop(bounds), name, index)

    def assert_frame_changes_are_marks(self, original, actual, name, index):
        self.assertEqual(original.getchannel('A').tobytes(), actual.getchannel('A').tobytes())
        regions = pack_penguin.MARKS.get(name, {}).get(index, [])
        changed = 0
        for y in range(155):
            for x in range(180):
                before, after = original.getpixel((x, y)), actual.getpixel((x, y))
                if before != after:
                    changed += 1
                    self.assertTrue(any(l - 1 <= x < r + 1 and t - 1 <= y < b + 1 for l, t, r, b in regions))
                    self.assertEqual(after[:3], (255, 255, 255))
        if regions:
            self.assertGreater(changed, 0, (name, index))
        else:
            self.assertEqual(changed, 0)


if __name__ == '__main__':
    unittest.main()
