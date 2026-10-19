#!/usr/bin/env python3
"""Plan nine-product sheets and import visually reviewed sheets as real SVG paths."""
import argparse
import csv
import hashlib
import json
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'public/icons/products'
MANIFEST = ICONS / 'manifest.json'
SOURCES = ROOT / 'scripts/pictogram_batches'
STYLE = (
    'Create exactly nine minimalist hand-drawn doodle pictograms in a regular 3x3 grid. '
    'Pure white smooth rounded outline strokes of consistent width on genuinely transparent '
    'background. Simple organic outlines, sparse interior detail, no solid filled objects, '
    'no shading, gradients, labels, text, borders or grid lines. Each icon fully contained '
    'and centered in its equal square cell, with 18 percent empty padding on every side. '
    'Keep all nine motifs separate. Items in reading order, left to right, top to bottom: '
)


def products():
    with (ROOT / 'public/products.csv').open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream, delimiter=';'))
    ids = [row['ID'] for row in rows]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'[\w-]+', i) for i in ids):
        raise ValueError('Duplicate or unsafe product IDs in products.csv')
    return rows


def manifest():
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding='utf-8'))
    return {'schemaVersion': 1, 'style': 'white-outline-doodle', 'icons': {}}


def pending():
    return [p for p in products() if not (ICONS / (p['ID'] + '.svg')).exists()]


def grid_cuts(mask, axis):
    """Find a clear gutter close to each third; never cut through a motif."""
    import numpy as np
    size = mask.shape[axis]
    occupied = np.any(mask, axis=1 - axis)
    cuts = [0]
    for third in (1, 2):
        ideal, radius = size * third // 3, size // 16
        candidates = [p for p in range(ideal - radius, ideal + radius + 1)
                      if not occupied[max(0, p - 5):min(size, p + 5)].any()]
        if not candidates:
            raise ValueError('No clear grid gutter near one third; regenerate the sheet')
        cuts.append(min(candidates, key=lambda p: abs(p - ideal)))
    return cuts + [size]


def plan(output):
    batch = pending()[:9]
    result = {
        'products': [{'id': p['ID'], 'name': p['Name'], 'category': p['Kategorie']} for p in batch],
        'prompt': STYLE + '; '.join(p['Name'] for p in batch),
        'unusedCells': 9 - len(batch),
    }
    if len(batch) < 9:
        result['prompt'] += '. Leave all remaining cells completely empty.'
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if output:
        Path(output).write_text(text, encoding='utf-8')
    print(text, end='')


def import_sheet(image_path, batch_path, reviewed):
    if not reviewed:
        raise ValueError('Inspect the sheet for correct products and reading order, then use --reviewed')
    from PIL import Image
    import numpy as np
    import vtracer

    batch = json.loads(Path(batch_path).read_text(encoding='utf-8'))['products']
    known = {p['ID'] for p in products()}
    ids = [p['id'] for p in batch]
    if not 1 <= len(ids) <= 9 or len(set(ids)) != len(ids) or not set(ids) <= known:
        raise ValueError('Batch must contain 1–9 unique, known product IDs')
    state = manifest()
    for product_id in ids:
        if (ICONS / f'{product_id}.svg').exists() or product_id in state['icons']:
            raise ValueError(f'Refusing to overwrite existing icon: {product_id}')

    image = Image.open(image_path).convert('RGBA')
    width, height = image.size
    if width != height or width < 600:
        raise ValueError('Expected a square sheet of at least 600 pixels')
    rgba = np.asarray(image)
    if not np.any(rgba[:, :, 3] == 0):
        raise ValueError('Sheet has no genuinely transparent pixels; regenerate with transparency')
    # Ignore near-transparent residual texture. Preserve only visible white strokes.
    mask = (rgba[:, :, 3] >= 128) & (rgba[:, :, :3].min(axis=2) >= 200)
    row_cuts, col_cuts = grid_cuts(mask, 0), grid_cuts(mask, 1)
    source_hash = hashlib.sha256(Path(image_path).read_bytes()).hexdigest()
    source_name = f'{ids[0]}-{source_hash[:12]}.png'
    generated = {}
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for index in range(9):
            row, col = divmod(index, 3)
            cell = mask[row_cuts[row]:row_cuts[row + 1], col_cuts[col]:col_cuts[col + 1]]
            if index >= len(ids):
                if cell.any():
                    raise ValueError('Expected unused cells to be empty')
                continue
            ys, xs = np.where(cell)
            if len(xs) < 100:
                raise ValueError(f'Empty or tiny motif: {ids[index]}')
            if xs.min() < 4 or ys.min() < 4 or xs.max() >= cell.shape[1] - 4 or ys.max() >= cell.shape[0] - 4:
                raise ValueError(f'Motif touches its cell boundary: {ids[index]}; regenerate sheet')
            if cell.mean() > 0.40:
                raise ValueError(f'Excessive opaque area: {ids[index]}')
            ink = Image.fromarray((~cell).astype('uint8') * 255)
            ink = ink.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
            ink.thumbnail((432, 432), Image.Resampling.LANCZOS)
            canvas = Image.new('L', (512, 512), 255)
            canvas.paste(ink, ((512 - ink.width) // 2, (512 - ink.height) // 2))
            raster, vector = temp / 'mask.png', temp / 'trace.svg'
            canvas.convert('RGB').save(raster)
            vtracer.convert_image_to_svg_py(str(raster), str(vector), colormode='binary',
                                          mode='spline', filter_speckle=8, path_precision=2)
            svg = ET.parse(vector).getroot()
            paths = list(svg.iter('{http://www.w3.org/2000/svg}path'))
            if not paths:
                raise ValueError(f'Vectorization produced no paths: {ids[index]}')
            svg.set('viewBox', '0 0 512 512')
            svg.set('role', 'img')
            ET.SubElement(svg, '{http://www.w3.org/2000/svg}title').text = batch[index]['name']
            for path in paths:
                path.set('fill', '#FFFFFF')
            ET.register_namespace('', 'http://www.w3.org/2000/svg')
            generated[ids[index]] = ET.tostring(svg, encoding='unicode') + '\n'

    # Validate the entire batch before publishing any output or updating the manifest.
    ICONS.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(image_path, SOURCES / source_name)
    (SOURCES / source_name.replace('.png', '.json')).write_text(
        Path(batch_path).read_text(encoding='utf-8'), encoding='utf-8')
    for product_id, svg in generated.items():
        (ICONS / f'{product_id}.svg').write_text(svg, encoding='utf-8')
        state['icons'][product_id] = {'file': f'{product_id}.svg', 'source': source_name,
                                     'sourceSha256': source_hash, 'reviewed': True}
    MANIFEST.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(generated)} SVG icons; {len(pending())} products remaining.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('status')
    next_command = commands.add_parser('next')
    next_command.add_argument('--output')
    importer = commands.add_parser('import')
    importer.add_argument('image')
    importer.add_argument('--batch', required=True)
    importer.add_argument('--reviewed', action='store_true')
    args = parser.parse_args()
    if args.command == 'status':
        total, remaining = len(products()), len(pending())
        print(json.dumps({'total': total, 'completed': total - remaining, 'remaining': remaining,
                          'sheetsRemaining': (remaining + 8) // 9}))
    elif args.command == 'next':
        plan(args.output)
    else:
        import_sheet(args.image, args.batch, args.reviewed)


if __name__ == '__main__':
    main()
