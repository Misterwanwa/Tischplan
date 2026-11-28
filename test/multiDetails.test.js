import { test } from 'node:test';
import assert from 'node:assert';
import {
  getItemDetails,
  addDetailToItem,
  updateDetailInItem,
  removeDetailFromItem,
  formatDetailsSummary,
  getDetailsPreviewInfo
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

test('MultiDetails: Preview info and overflow indicators', () => {
  const singleShort = { name: 'Milch', details: ['1l'] };
  const info1 = getDetailsPreviewInfo(singleShort);
  assert.strictEqual(info1.count, 1);
  assert.strictEqual(info1.extraCount, 0);
  assert.strictEqual(info1.hasMore, false);

  const multipleDetails = { name: 'Äpfel', details: ['1kg', 'Bio', 'Gala'] };
  const info2 = getDetailsPreviewInfo(multipleDetails);
  assert.strictEqual(info2.count, 3);
  assert.strictEqual(info2.extraCount, 2);
  assert.strictEqual(info2.hasMore, true);

  const singleLong = { name: 'Fleisch', detail: 'Vom Wochenmarkt am Freitag' };
  const info3 = getDetailsPreviewInfo(singleLong);
  assert.strictEqual(info3.count, 1);
  assert.strictEqual(info3.extraCount, 0);
  assert.strictEqual(info3.hasMore, true);
});


