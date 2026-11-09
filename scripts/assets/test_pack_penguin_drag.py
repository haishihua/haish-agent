#!/usr/bin/env python3
"""Verify drag sheets preserve the demo's common scale and ground baseline."""
import importlib.util
import unittest
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('pack_penguin_drag', ROOT / 'scripts/assets/pack-penguin-drag.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


class DragSpritesTest(unittest.TestCase):
    def test_sheets_match_source_crops(self):
        for name, (centers, baseline) in packer.SOURCES.items():
            with self.subTest(name=name):
                source = Image.open(ROOT / f'scripts/assets/penguin-drag-{name}-source.png').convert('RGBA')
                sheet = Image.open(ROOT / f'app-web/assets/ui/pet/drag-{name}.png').convert('RGBA')
                self.assertEqual(sheet.size, (1080, 155))
                for index, center in enumerate(centers):
                    crop = source.crop((center - 145, baseline - 330, center + 145, baseline + 8))
                    crop = crop.resize((round(290 * .39), round(338 * .39)), Image.Resampling.LANCZOS)
                    frame = Image.new('RGBA', (180, 155))
                    frame.alpha_composite(crop, ((180 - crop.width) // 2, 145 - round(330 * .39)))
                    actual = sheet.crop((index * 180, 0, (index + 1) * 180, 155))
                    self.assertIsNotNone(actual.getchannel('A').getbbox())
                    self.assertIsNone(ImageChops.difference(frame, actual).getbbox())


if __name__ == '__main__':
    unittest.main()
