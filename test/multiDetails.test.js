import { test } from 'node:test';
import assert from 'node:assert';
import {
  getItemDetails,
  addDetailToItem,
  updateDetailInItem,
  removeDetailFromItem,
  formatDetailsSummary
} from '../src/modules/multiDetails.js';

test('MultiDetails: Backwards compatibility with single string detail', () => {
  const legacyItem = { name: 'Milch', detail: '1l' };
  assert.deepStrictEqual(getItemDetails(legacyItem), ['1l']);

  const emptyItem = { name: 'Eier' };
  assert.deepStrictEqual(getItemDetails(emptyItem), []);

  const modernItem = { name: 'Brot', details: ['Vollkorn', 'Bio', 'geschnitten'] };
  assert.deepStrictEqual(getItemDetails(modernItem), ['Vollkorn', 'Bio', 'geschnitten']);
});

test('MultiDetails: Adding, updating, and removing details without duplicates', () => {
  let details = ['Bio'];
  details = addDetailToItem(details, '1kg');
  assert.deepStrictEqual(details, ['Bio', '1kg']);

  // Duplicate ignored
  details = addDetailToItem(details, 'bio');
  assert.deepStrictEqual(details, ['Bio', '1kg']);

  // Empty string ignored
  details = addDetailToItem(details, '   ');
  assert.deepStrictEqual(details, ['Bio', '1kg']);

  // Update detail at index 0
  details = updateDetailInItem(details, 0, 'Demeter Bio');
  assert.deepStrictEqual(details, ['Demeter Bio', '1kg']);

  // Remove detail
  details = removeDetailFromItem(details, 1);
  assert.deepStrictEqual(details, ['Demeter Bio']);

  assert.strictEqual(formatDetailsSummary(details), 'Demeter Bio');
});

test('MultiDetails: Preset option toggling logic', () => {
  let detailsList = ['1kg'];
  const preset = 'Bio';

  // Check selection
  const isSelected1 = detailsList.some(d => (typeof d === 'string' ? d : d.text).toLowerCase() === preset.toLowerCase());
  assert.strictEqual(isSelected1, false);

  // Add preset
  detailsList = addDetailToItem(detailsList, preset);
  assert.deepStrictEqual(detailsList, ['1kg', 'Bio']);

  // Now selected
  const isSelected2 = detailsList.some(d => (typeof d === 'string' ? d : d.text).toLowerCase() === preset.toLowerCase());
  assert.strictEqual(isSelected2, true);

  // Toggle off by finding index
  const foundIdx = detailsList.findIndex(d => (typeof d === 'string' ? d : d.text).toLowerCase() === preset.toLowerCase());
  assert.strictEqual(foundIdx, 1);
  detailsList = removeDetailFromItem(detailsList, foundIdx);
  assert.deepStrictEqual(detailsList, ['1kg']);
});

