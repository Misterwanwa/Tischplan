import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestGet, onRequestPost } from '../functions/api/games.js';
import { onRequestPost as saveStorage } from '../functions/api/storage.js';
import { createCatchGame, stepCatchGame } from '../src/modules/catchGame.js';

function harness(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/games/0001_gamification.sql', import.meta.url), 'utf8'));
  t.after(() => sql.close());
  const values = new Map([['settings', { people: [{ name: 'Braun', maintenanceKcal: 2000 }, { name: 'Weiß' }] }]]);
  const db = {
    prepare(query) {
      let args = [];
      return {
        bind(...next) { args = next; return this; },
        first() { return sql.prepare(query).get(...args) || null; },
        all() { return { results: sql.prepare(query).all(...args) }; },
        run() { const result = sql.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(statement => statement.run()); sql.exec('COMMIT'); return results; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
  const env = { TISCHPLAN_GAME_DB: db, TISCHPLAN_STORAGE: {
    get: async key => values.has(key) ? JSON.stringify(values.get(key)) : null,
    put: async (key, value) => values.set(key, JSON.parse(value)),
  } };
  let time = Date.parse('2026-06-01T12:00:00Z');
  t.mock.method(Date, 'now', () => time);
  const request = async (body = null, profile = 0) => {
    const req = new Request(`https://tischplan.example/api/games?profile=${profile}`, body
      ? { method: 'POST', headers: { origin: 'https://tischplan.example' }, body: JSON.stringify({ profile, ...body }) } : {});
    const response = await (body ? onRequestPost : onRequestGet)({ request: req, env });
    return { status: response.status, data: await response.json() };
  };
  return { sql, values, env, request, advance: milliseconds => { time += milliseconds; } };
}
const day = (firstTrackedOn = '2026-06-01') => ({ firstTrackedOn, trackingComplete: true, meals: { lunch: [{ kcal: 500, isVegetable: true }] } });

test('API: simultaneous starts and other-device reloads reserve only one daily round per user', async t => {
  const h = harness(t);
  const responses = await Promise.all([h.request({ action: 'start' }), h.request({ action: 'start' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await h.request()).data.round.score, 0);
  assert.equal((await h.request({ action: 'start' }, 1)).status, 200);
  h.advance(86400000);
  assert.equal((await h.request({ action: 'start' })).status, 200);
});
test('API: replayed finish requests are idempotent and a submitted score is ignored', async t => {
  const h = harness(t);
  const start = (await h.request({ action: 'start' })).data;
  const game = createCatchGame(start.seed);
  const inputs = [];
  while (!game.over) { inputs.push(200); stepCatchGame(game, 200); }
  assert.equal((await h.request({ action: 'finish', sessionId: start.sessionId, inputs })).status, 400);
  h.advance(61000);
  const body = { action: 'finish', sessionId: start.sessionId, inputs, score: 999999 };
  assert.equal((await h.request(body)).data.score, game.score);
  assert.equal((await h.request(body)).data.alreadyFinished, true);
  assert.equal((await h.request()).data.leaderboard.find(row => row.profile === 0).gamePoints, game.score);
  assert.equal((await h.request({ action: 'abandon', sessionId: start.sessionId })).data.score, game.score);
});
test('API: abandoning, reopening and training cannot grant another daily attempt', async t => {
  const h = harness(t);
  const start = (await h.request({ action: 'start' })).data;
  assert.equal((await h.request({ action: 'abandon', sessionId: start.sessionId })).data.score, 0);
  assert.equal((await h.request({ action: 'start' })).status, 409);
  assert.equal((await h.request({ action: 'finish', sessionId: start.sessionId }, 1)).status, 404);
});
test('API: daily challenge draw cannot be repeated; no draw on leaderboard GET', async t => {
  const h = harness(t);
  t.mock.method(crypto, 'getRandomValues', buffer => { buffer[0] = 0; return buffer; });
  await h.request();
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS count FROM challenge_checks').get().count, 0);
  await Promise.all([h.request({ action: 'open' }), h.request({ action: 'open' })]);
  const first = (await h.request()).data.challenges[0];
  assert.equal(first.kind, 'no_snacks');
  await h.request({ action: 'decline', id: first.id });
  await h.request({ action: 'open' });
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS count FROM challenges').get().count, 1);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS count FROM challenge_checks').get().count, 1);
});
test('API: a failed 10% draw also consumes the day; active challenges do not stack', async t => {
  const h = harness(t);
  let random = 429496730; // Just above 10%, therefore no challenge.
  t.mock.method(crypto, 'getRandomValues', buffer => { buffer[0] = random; return buffer; });
  await h.request({ action: 'open' });
  random = 0;
  assert.equal((await h.request({ action: 'open' })).data.challenges.length, 0);
  h.advance(86400000);
  await h.request({ action: 'open' });
  // Before the next daily draw, make the preceding challenge day qualify.
  h.values.set('calorie_logs_0', { '2026-06-02': day('2026-06-02') });
  h.advance(86400000);
  assert.equal((await h.request({ action: 'open' })).data.challenges.length, 1);
});
test('API: streak awards are stable across edits/deletes/re-adds and isolated per person', async t => {
  const h = harness(t);
  h.values.set('calorie_logs_0', { '2026-06-01': day(), '2026-05-31': day() });
  h.values.set('calorie_logs_1', { '2026-06-01': day() });
  let rows = (await h.request()).data.leaderboard;
  assert.equal(rows.find(row => row.profile === 0).streakPoints, 6);
  assert.equal(rows.find(row => row.profile === 1).streakPoints, 5);
  h.values.set('calorie_logs_0', {});
  await h.request();
  h.values.set('calorie_logs_0', { '2026-06-01': day() });
  rows = (await h.request()).data.leaderboard;
  assert.equal(rows.find(row => row.profile === 0).streakPoints, 6);
});
test('API: completed challenges award once, including repeated reconciliation', async t => {
  const h = harness(t);
  h.sql.prepare("INSERT INTO challenges (id, profile, kind, start_day, end_day) VALUES ('test', 0, 'vegetables', '2026-05-27', '2026-05-31')").run();
  h.values.set('calorie_logs_0', Object.fromEntries([27, 28, 29, 30, 31].map(d => [`2026-05-${d}`, day()])));
  for (let i = 0; i < 2; i++) {
    const row = (await h.request()).data.leaderboard.find(entry => entry.profile === 0);
    assert.equal(row.challengePoints, 10);
  }
});
test('Storage: client cannot spoof a same-day timestamp for retroactive points', async t => {
  const h = harness(t);
  const save = async logs => saveStorage({ env: h.env, request: new Request('https://tischplan.example/api/storage', {
    method: 'POST', body: JSON.stringify({ key: 'calorie_logs_0', value: logs }),
  }) });
  await save({ '2026-05-31': day('2026-05-31'), '2026-06-01': day() });
  assert.equal(h.values.get('calorie_logs_0')['2026-05-31'].firstTrackedOn, '2026-06-01');
  const rows = (await h.request()).data.leaderboard;
  assert.equal(rows.find(row => row.profile === 0).streakPoints, 6);
});
test('API: cross-origin calls, invalid profiles, unknown actions and missing binding are explicit failures', async t => {
  const h = harness(t);
  assert.equal((await h.request({ action: 'unknown' })).status, 400);
  assert.equal((await h.request(null, 2)).status, 400);
  const cross = await onRequestPost({ env: h.env, request: new Request('https://tischplan.example/api/games', {
    method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}',
  }) });
  assert.equal(cross.status, 403);
  const missing = await onRequestGet({ env: {}, request: new Request('https://tischplan.example/api/games?profile=0') });
  assert.equal(missing.status, 503);
});
