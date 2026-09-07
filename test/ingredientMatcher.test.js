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

test('Ingredient Matcher: parseIngredientTextLine parses trailing and leading quantities', async () => {
  const { parseIngredientTextLine } = await import('../src/modules/ingredientMatcher.js');

  const p1 = parseIngredientTextLine('Gnocchi 600g');
  assert.strictEqual(p1.name, 'Gnocchi');
  assert.strictEqual(p1.amount, 600);
  assert.strictEqual(p1.unit, 'g');

  const p2 = parseIngredientTextLine('Gnocchi 600 g');
  assert.strictEqual(p2.name, 'Gnocchi');
  assert.strictEqual(p2.amount, 600);
  assert.strictEqual(p2.unit, 'g');

  const p3 = parseIngredientTextLine('Gnocchi (600g)');
  assert.strictEqual(p3.name, 'Gnocchi');
  assert.strictEqual(p3.amount, 600);
  assert.strictEqual(p3.unit, 'g');

  const p4 = parseIngredientTextLine('600g Gnocchi');
  assert.strictEqual(p4.name, 'Gnocchi');
  assert.strictEqual(p4.amount, 600);
  assert.strictEqual(p4.unit, 'g');

  const p5 = parseIngredientTextLine('1 Dose Tomaten');
  assert.strictEqual(p5.name, 'Tomaten');
  assert.strictEqual(p5.amount, 1);
  assert.strictEqual(p5.unit, 'Dose');

  const p6 = parseIngredientTextLine('Gnocchi');
  assert.strictEqual(p6.name, 'Gnocchi');
  assert.strictEqual(p6.amount, null);
  assert.strictEqual(p6.unit, '');
});

test('Ingredient Matcher: Weekly import correctly parses "Gnocchi 600g" and matches catalog', () => {
  const productsWithGnocchi = [
    ...mockProducts,
    { id: 'gnocchi_frisch', name: 'Gnocchi', category: 'Getreideprodukte', icon: 'Wheat' }
  ];

  const usage = [
    {
      recipe: {
        title: 'Gnocchi Pfanne',
        ingredients: [
          'Gnocchi 600g'
        ]
      },
      multiplier: 1
    }
  ];

  const { autoItems, pendingChoices } = analyzeWeekIngredients(usage, productsWithGnocchi);
  assert.strictEqual(pendingChoices.length, 0, 'Should not require resolution modal');
  assert.strictEqual(autoItems.length, 1);
  const item = autoItems[0];
  assert.strictEqual(item.name, 'Gnocchi');
  assert.strictEqual(item.productId, 'gnocchi_frisch');
  assert.ok(item.details.includes('600g'));
  assert.ok(item.details.includes('Rezept: Gnocchi Pfanne'));
});

