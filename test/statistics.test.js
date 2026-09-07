import { test } from 'node:test';
import assert from 'node:assert';
import {
  extractMeaningfulWords,
  createStatEvent,
  appendStatEvent,
  generateRewindReport,
  EVENT_TYPES
} from '../src/modules/statistics.js';

test('Statistics: Word extraction removes German stopwords and punctuation', () => {
  const words = extractMeaningfulWords('Klassische Spaghetti Bolognese mit feinem Parmesan und Ofen-Gemüse');
  assert.ok(!words.includes('mit'));
  assert.ok(!words.includes('und'));
  assert.ok(!words.includes('feinem'));
  assert.ok(!words.includes('klassische'));
  assert.ok(words.includes('spaghetti'));
  assert.ok(words.includes('bolognese'));
  assert.ok(words.includes('parmesan'));
  assert.ok(words.includes('gemuse') || words.includes('gemüse'));
});

test('Statistics: Event appending and deduplication', () => {
  let stats = { events: [], enabled: true };
  const ev1 = createStatEvent(EVENT_TYPES.RECIPE_COOKED, { actionId: 'act_1', recipeId: 'rec_1', recipeTitle: 'Pizza' });
  stats = appendStatEvent(stats, ev1);
  assert.strictEqual(stats.events.length, 1);

  // Duplicate within 10s is ignored
  const evDup = createStatEvent(EVENT_TYPES.RECIPE_COOKED, { actionId: 'act_1', recipeId: 'rec_1' });
  stats = appendStatEvent(stats, evDup);
  assert.strictEqual(stats.events.length, 1);
});

test('Statistics: Rewind report generation', () => {
  const statsState = {
    events: [
      { type: EVENT_TYPES.RECIPE_COOKED, recipeId: 'r1', recipeTitle: 'Lasagne', year: 2026, month: 3, timestamp: Date.now() },
      { type: EVENT_TYPES.RECIPE_COOKED, recipeId: 'r1', recipeTitle: 'Lasagne', year: 2026, month: 3, timestamp: Date.now() + 1 },
      { type: EVENT_TYPES.RECIPE_COOKED, recipeId: 'r2', recipeTitle: 'Curry', year: 2026, month: 5, timestamp: Date.now() + 2 },
      { type: EVENT_TYPES.SHOPPING_ADD, productName: 'Hafermilch', source: 'manual', year: 2026, month: 3, timestamp: Date.now() },
      { type: EVENT_TYPES.SHOPPING_ADD, productName: 'Kaffee', source: 'auto', year: 2026, month: 4, timestamp: Date.now() },
    ]
  };

  const report = generateRewindReport({
    targetYear: 2026,
    statsState,
    recipes: [{ title: 'Lasagne' }, { title: 'Curry' }],
    streakSummary: { currentStreak: 5, longestStreak: 12 }
  });

  assert.strictEqual(report.targetYear, 2026);
  assert.strictEqual(report.totalCookedCount, 3);
  assert.strictEqual(report.topCookedRecipes[0].title, 'Lasagne');
  assert.strictEqual(report.topCookedRecipes[0].count, 2);
  assert.strictEqual(report.shoppingCounts.manual, 1);
  assert.strictEqual(report.shoppingCounts.auto, 1);
  assert.strictEqual(report.streakHighlights.longestStreak, 12);
});
