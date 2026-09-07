import { test } from 'node:test';
import assert from 'node:assert';
import {
  findProductMatch,
  normalizeUnitAndAmount,
  formatAggregatedDetail,
  analyzeWeekIngredients
} from '../src/modules/ingredientMatcher.js';

const mockProducts = [
  { id: 'milch', name: 'Milch', category: 'Kühlregal', icon: 'Milk' },
  { id: 'hafermilch', name: 'Hafermilch', category: 'Kühlregal', icon: 'Milk' },
  { id: 'tomaten', name: 'Tomaten', category: 'Obst & Gemüse', icon: 'Apple' },
  { id: 'apfel', name: 'Äpfel', category: 'Obst & Gemüse', icon: 'Apple' },
  { id: 'spaghetti', name: 'Spaghetti', category: 'Teigwaren', icon: 'Wheat' },
];

test('Ingredient Matcher: Exact and variant matches', () => {
  const match1 = findProductMatch('Tomaten', mockProducts);
  assert.strictEqual(match1.type, 'exact');
  assert.strictEqual(match1.product.id, 'tomaten');

  const match2 = findProductMatch('Tomate', mockProducts);
  assert.strictEqual(match2.type, 'variant');
  assert.strictEqual(match2.product.id, 'tomaten');
});

test('Ingredient Matcher: Hafermilch is NOT conflated with Milch', () => {
  const match = findProductMatch('Hafermilch', mockProducts);
  assert.strictEqual(match.type, 'exact');
  assert.strictEqual(match.product.id, 'hafermilch');

  // If hafermilch were missing, it should NOT match generic milch!
  const productsWithoutHafermilch = mockProducts.filter(p => p.id !== 'hafermilch');
  const matchFallback = findProductMatch('Hafermilch', productsWithoutHafermilch);
  assert.strictEqual(matchFallback.type, 'none');
  assert.strictEqual(matchFallback.product, null);
});

test('Ingredient Matcher: Unit normalization and arithmetic aggregation', () => {
  const u1 = normalizeUnitAndAmount(500, 'g');
  const u2 = normalizeUnitAndAmount(1, 'kg');
  assert.strictEqual(u1.baseUnit, 'g');
  assert.strictEqual(u1.baseAmount, 500);
  assert.strictEqual(u2.baseUnit, 'g');
  assert.strictEqual(u2.baseAmount, 1000);

  const formatted = formatAggregatedDetail(u1.baseAmount + u2.baseAmount, 'g');
  assert.strictEqual(formatted, '1.5kg');
});

test('Ingredient Matcher: Analyze week usage with automatic tag and recipe sources', () => {
  const usage = [
    {
      recipe: {
        title: 'Bolognese',
        ingredients: [
          { name: 'Spaghetti', amount: 250, unit: 'g' },
          { name: 'Tomaten', amount: 400, unit: 'g' },
        ]
      },
      multiplier: 2
    },
    {
      recipe: {
        title: 'Carbonara',
        ingredients: [
          { name: 'Spaghetti', amount: 250, unit: 'g' },
        ]
      },
      multiplier: 1
    }
  ];

  const { autoItems } = analyzeWeekIngredients(usage, mockProducts);
  const spaghettiItem = autoItems.find(i => i.productId === 'spaghetti');
  assert.ok(spaghettiItem);
  assert.ok(spaghettiItem.details.includes('Automatisch hinzugefügt'));
  assert.ok(spaghettiItem.details.includes('750g'));
  assert.ok(spaghettiItem.sourceRecipes.includes('Bolognese'));
  assert.ok(spaghettiItem.sourceRecipes.includes('Carbonara'));
});
