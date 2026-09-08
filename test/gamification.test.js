import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, gameDay, evaluateChallenge, qualifiesForChallenge, streakAwardEntries } from '../src/modules/gamification.js';
import { getOffsetDayKey } from '../src/modules/streak.js';
import { createCatchGame, stepCatchGame, replayCatchGame, CATCH_ITEMS, MAX_TICKS } from '../src/modules/catchGame.js';

const foodDay = (patch = {}) => ({ trackingComplete: true, maintenanceKcal: 2000,
  meals: { lunch: [{ name: 'Gemüse', kcal: 500, isVegetable: true }], snack: [] }, ...patch });
const challenge = (kind, start = '2026-12-28') => ({ kind, status: 'active', start_day: start,
  end_day: getOffsetDayKey(start, CHALLENGES[kind].days - 1), progress: 0, points: 0 });
const fillDays = (start, count, make = foodDay) => Object.fromEntries(
  Array.from({ length: count }, (_, i) => [getOffsetDayKey(start, i), make()]));

test('Daily boundary uses Berlin, including winter, summer and year change', () => {
  assert.equal(gameDay(new Date('2026-12-31T23:00:00Z')), '2027-01-01');
  assert.equal(gameDay(new Date('2026-06-01T22:00:00Z')), '2026-06-02');
  assert.equal(gameDay(new Date('2026-06-01T21:59:59Z')), '2026-06-01');
});
test('No snacks: seven completed normal-meal days, never empty days', () => {
  assert.equal(qualifiesForChallenge('no_snacks', {}), false);
  assert.equal(qualifiesForChallenge('no_snacks', foodDay({ trackingComplete: false })), false);
  assert.equal(qualifiesForChallenge('no_snacks', foodDay({ meals: { snack: [{ kcal: 100 }] } })), false);
  const c = challenge('no_snacks');
  const logs = fillDays(c.start_day, 7);
  assert.equal(evaluateChallenge(c, logs, c.end_day).status, 'active');
  const complete = evaluateChallenge(c, logs, getOffsetDayKey(c.end_day, 1));
  assert.equal(complete.status, 'completed');
  assert.equal(complete.points, 25);
  assert.deepEqual(evaluateChallenge(complete, {}, '2027-02-01'), complete);
});
test('A later snack on the last day prevents the no-snacks reward', () => {
  const c = challenge('no_snacks');
  const logs = fillDays(c.start_day, 7);
  logs[c.end_day].meals.snack.push({ kcal: 0, name: 'Getränk' });
  assert.equal(evaluateChallenge(c, logs, getOffsetDayKey(c.end_day, 1)).status, 'failed');
});
test('Vegetables must be explicitly marked and have positive calories on five consecutive days', () => {
  assert.equal(qualifiesForChallenge('vegetables', foodDay({ meals: { lunch: [{ name: 'Gemüse', kcal: 10 }] } })), false);
  assert.equal(qualifiesForChallenge('vegetables', foodDay({ meals: { lunch: [{ isVegetable: true, kcal: 0 }] } })), false);
  const c = challenge('vegetables', '2026-03-27');
  const logs = fillDays(c.start_day, 5);
  assert.equal(evaluateChallenge(c, logs, getOffsetDayKey(c.end_day, 1)).points, 10);
  delete logs['2026-03-29'];
  assert.equal(evaluateChallenge(c, logs, getOffsetDayKey(c.end_day, 1)).status, 'failed');
});
test('100 loss uses maintenance, not an intake target or untracked calories', () => {
  const day = foodDay({ meals: { lunch: [{ kcal: 1900 }] } });
  assert.equal(qualifiesForChallenge('deficit', day), true);
  assert.equal(qualifiesForChallenge('deficit', { ...day, maintenanceKcal: 1999, burnedKcal: 200 }), false);
  assert.equal(qualifiesForChallenge('deficit', { ...day, maintenanceKcal: null }), false);
  assert.equal(qualifiesForChallenge('deficit', foodDay({ meals: {} })), false);
});
test('100 loss allows a new three-day run within its inclusive 15-day window', () => {
  const c = challenge('deficit', '2026-04-01');
  const logs = fillDays('2026-04-01', 2);
  Object.assign(logs, fillDays('2026-04-13', 3));
  assert.equal(evaluateChallenge(c, logs, '2026-04-15').status, 'active');
  assert.equal(evaluateChallenge(c, logs, '2026-04-16').points, 15);
  delete logs['2026-04-13'];
  logs['2026-04-16'] = foodDay();
  assert.equal(evaluateChallenge(c, logs, '2026-04-17').status, 'expired');
});
test('Streak points distinguish same-day, retroactive and legacy entries; ignore water and future', () => {
  const logs = {
    '2026-01-01': foodDay({ firstTrackedOn: '2026-01-01' }),
    '2026-01-02': foodDay({ firstTrackedOn: '2026-01-04' }),
    '2026-01-03': foodDay(), '2026-01-04': { water: 1 }, '2026-01-05': foodDay(),
  };
  assert.deepEqual(streakAwardEntries(logs, '2026-01-04').map(e => e.points), [5, 1, 1]);
});
test('Catch: healthy +1, junkfood -1, all four kitchen items terminate', () => {
  CATCH_ITEMS.forEach((item, index) => {
    const game = createCatchGame(1);
    game.items.push({ id: -1, index, x: 200, y: 419 });
    stepCatchGame(game, 200);
    assert.equal(game.over, !!item.fatal);
    assert.equal(game.score, item.fatal ? 0 : item.points);
  });
});
test('Catch: deterministic replay and input limits; no arbitrary client score', () => {
  const game = createCatchGame(42);
  const inputs = [];
  while (!game.over) { inputs.push(200); stepCatchGame(game, 200); }
  assert.deepEqual(replayCatchGame(42, inputs), game);
  assert.ok(game.tick <= MAX_TICKS);
  assert.throws(() => replayCatchGame(42, []));
  assert.throws(() => replayCatchGame(42, [NaN]));
  assert.throws(() => replayCatchGame(42, [400]));
  assert.throws(() => replayCatchGame(42, [200]));
  assert.throws(() => replayCatchGame(42, [...inputs, 200]));
});
