"""Run with python -m unittest discover -s test -p '*_test.py'."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('product_icons', Path(__file__).parents[1] / 'scripts/product_icons.py')
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)


class ProductIconImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        for name, value in {'ROOT': self.root, 'ICONS': self.root / 'public/icons/products',
                            'MANIFEST': self.root / 'public/icons/products/manifest.json',
                            'SOURCES': self.root / 'scripts/pictogram_batches'}.items():
            patcher = patch.object(icons, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        (self.root / 'public').mkdir()
        (self.root / 'public/products.csv').write_text(
            'ID;Name;Kategorie\n' + ''.join(f'p{i};Product {i};Test\n' for i in range(9)))
        self.batch = self.root / 'batch.json'
        self.batch.write_text(json.dumps({'products': [{'id': f'p{i}', 'name': f'Product {i}'} for i in range(9)]}))
        sheet = Image.new('RGBA', (900, 900))
        draw = ImageDraw.Draw(sheet)
        for i in range(9):
            row, col = divmod(i, 3)
            draw.ellipse((col * 300 + 70, row * 300 + 80, col * 300 + 230, row * 300 + 220),
                         outline='white', width=8)
        self.image = self.root / 'sheet.png'
        sheet.save(self.image)

    def test_real_paths_and_progress_and_no_overwrites(self):
        icons.import_sheet(self.image, self.batch, True)
        self.assertEqual(icons.pending(), [])
        svg = (icons.ICONS / 'p0.svg').read_text()
        self.assertIn('<path', svg)
        self.assertNotIn('<image', svg)
        self.assertIn('#FFFFFF', svg)
        self.assertEqual(len(icons.manifest()['icons']), 9)
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            icons.import_sheet(self.image, self.batch, True)

    def test_review_is_required(self):
        with self.assertRaisesRegex(ValueError, 'Inspect'):
            icons.import_sheet(self.image, self.batch, False)
        self.assertFalse(icons.MANIFEST.exists())

    def test_opaque_background_is_rejected(self):
        Image.new('RGB', (900, 900), 'white').save(self.image)
        with self.assertRaisesRegex(ValueError, 'transparent'):
            icons.import_sheet(self.image, self.batch, True)

    def test_mostly_opaque_background_with_isolated_transparent_pixel_is_rejected(self):
        sheet = Image.new('RGBA', (900, 900), (0, 0, 0, 255))
        sheet.putpixel((0, 0), (0, 0, 0, 0))
        sheet.save(self.image)
        with self.assertRaisesRegex(ValueError, 'transparent'):
            icons.import_sheet(self.image, self.batch, True)

    def test_bad_last_cell_leaves_entire_batch_unpublished(self):
        sheet = Image.open(self.image)
        sheet.paste((0, 0, 0, 0), (600, 600, 900, 900))
        sheet.save(self.image)
        with self.assertRaisesRegex(ValueError, 'Empty'):
            icons.import_sheet(self.image, self.batch, True)
        self.assertFalse(icons.ICONS.exists())

    def test_unknown_id_is_rejected(self):
        self.batch.write_text(json.dumps({'products': [{'id': '../escape', 'name': 'bad'}]}))
        with self.assertRaisesRegex(ValueError, 'known product IDs'):
            icons.import_sheet(self.image, self.batch, True)

    def test_gutter_moves_to_preserve_crossing_motif(self):
        mask = np.zeros((900, 900), dtype=bool)
        mask[580:606, 100:120] = True
        cuts = icons.grid_cuts(mask, 0)
        self.assertGreaterEqual(cuts[2], 611)

    def test_absent_gutter_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'gutter'):
            icons.grid_cuts(np.ones((900, 900), dtype=bool), 0)

    def test_unmanifested_svg_blocks_overwrite_and_is_skipped_in_pending(self):
        icons.ICONS.mkdir(parents=True, exist_ok=True)
        (icons.ICONS / 'p0.svg').write_text('<svg></svg>', encoding='utf-8')
        pending_ids = [p['ID'] for p in icons.pending()]
        self.assertNotIn('p0', pending_ids)
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            icons.import_sheet(self.image, self.batch, True)

    def test_partial_batch_prompt_is_consistent(self):
        batch = [{'ID': f'p{i}', 'Name': f'Product {i}', 'Kategorie': 'Test'} for i in range(6)]
        prompt = icons.prompt_for_batch(batch)
        self.assertIn('Create exactly six minimalist', prompt)
        self.assertNotIn('Create exactly nine', prompt)
        self.assertIn('leave all 3 remaining cells completely empty', prompt)

    def test_failed_manifest_write_rolls_back_svgs(self):
        with patch.object(icons.Path, 'write_text', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                icons.import_sheet(self.image, self.batch, True)
        # Verify no orphaned SVG was left in icons directory
        svgs = list(icons.ICONS.glob('*.svg')) if icons.ICONS.exists() else []
        self.assertEqual(svgs, [])


if __name__ == '__main__':
    unittest.main()
