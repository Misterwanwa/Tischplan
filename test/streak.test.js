import { test } from 'node:test';
import assert from 'node:assert';
import { calculateStreak } from '../src/modules/streak.js';

test('Streak: Active today continues streak from yesterday', () => {
  const dayLogs = {
    '2026-09-06': { meals: { lunch: [{ name: 'Nudeln' }] } },
    '2026-09-07': { meals: { dinner: [{ name: 'Salat' }] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07' });
  assert.strictEqual(res.currentStreak, 2);
  assert.strictEqual(res.status, 'active_today');
});

test('Streak: Today empty, yesterday active -> streak stays alive until midnight', () => {
  const dayLogs = {
    '2026-09-05': { meals: { lunch: [{ name: 'Suppe' }] } },
    '2026-09-06': { meals: { lunch: [{ name: 'Nudeln' }] } },
    '2026-09-07': { meals: { lunch: [] } }, // empty today
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07' });
  assert.strictEqual(res.currentStreak, 2);
  assert.strictEqual(res.status, 'active_waiting_today');
});

test('Streak: Missed full day yesterday breaks streak to 0', () => {
  const dayLogs = {
    '2026-09-04': { meals: { lunch: [{ name: 'Suppe' }] } },
    '2026-09-05': { meals: { lunch: [{ name: 'Nudeln' }] } },
    // 2026-09-06 missed!
    '2026-09-07': { meals: { lunch: [] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07' });
  assert.strictEqual(res.currentStreak, 0);
  assert.strictEqual(res.status, 'broken');
  assert.strictEqual(res.longestStreak, 2);
});

test('Streak: Next logged day starts fresh streak at 1', () => {
  const dayLogs = {
    '2026-09-04': { meals: { lunch: [{ name: 'Suppe' }] } },
    // 2026-09-05 missed
    // 2026-09-06 missed
    '2026-09-07': { meals: { lunch: [{ name: 'Curry' }] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07' });
  assert.strictEqual(res.currentStreak, 1);
  assert.strictEqual(res.status, 'active_today');
  assert.strictEqual(res.longestStreak, 1);
});

test('Streak: Backfilling a past gap restores the contiguous streak', () => {
  const dayLogs = {
    '2026-09-01': { meals: { lunch: [{ name: 'Essen' }] } },
    '2026-09-02': { meals: { lunch: [{ name: 'Essen' }] } },
    // 2026-09-03 was missing, now filled!
    '2026-09-03': { meals: { lunch: [{ name: 'Nachtrag' }] } },
    '2026-09-04': { meals: { lunch: [{ name: 'Essen' }] } },
    '2026-09-05': { meals: { lunch: [{ name: 'Essen' }] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-05' });
  assert.strictEqual(res.currentStreak, 5);
  assert.strictEqual(res.longestStreak, 5);
});

test('Streak: Future logs do not extend current streak', () => {
  const dayLogs = {
    '2026-09-07': { meals: { dinner: [{ name: 'Essen' }] } },
    '2026-09-08': { meals: { dinner: [{ name: 'Zukunft' }] } },
    '2026-09-09': { meals: { dinner: [{ name: 'Zukunft' }] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07' });
  assert.strictEqual(res.currentStreak, 1);
});

test('Streak: Rescued days preserve streak without adding fake meals', () => {
  const dayLogs = {
    '2026-09-05': { meals: { lunch: [{ name: 'Essen' }] } },
    // 2026-09-06 had no meals, but was rescued
    '2026-09-07': { meals: { dinner: [{ name: 'Essen' }] } },
  };
  const res = calculateStreak(dayLogs, { today: '2026-09-07', rescuedDays: ['2026-09-06'] });
  assert.strictEqual(res.currentStreak, 3);
  assert.strictEqual(res.rescuedCount, 1);
});
