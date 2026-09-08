import { CHALLENGES, evaluateChallenge, gameDay, streakAwardEntries } from '../../src/modules/gamification.js';
import { calculateStreak, getOffsetDayKey } from '../../src/modules/streak.js';
import { replayCatchGame, TICK_MS } from '../../src/modules/catchGame.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function randomNumber() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

async function readKV(kv, key, fallback) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function batch(db, statements) {
  for (let offset = 0; offset < statements.length; offset += 50) {
    await db.batch(statements.slice(offset, offset + 50));
  }
}

async function reconcile(db, profile, logs, today) {
  const existing = await db.prepare('SELECT day FROM streak_awards WHERE profile = ?').bind(profile).all();
  const awarded = new Set(existing.results.map(row => row.day));
  await batch(db, streakAwardEntries(logs, today).filter(entry => !awarded.has(entry.day)).map(entry =>
    db.prepare('INSERT OR IGNORE INTO streak_awards (profile, day, points) VALUES (?, ?, ?)')
      .bind(profile, entry.day, entry.points)));

  const active = await db.prepare("SELECT * FROM challenges WHERE profile = ? AND status = 'active'").bind(profile).first();
  if (active) {
    const next = evaluateChallenge(active, logs, today);
    if (active.progress !== next.progress || active.status !== next.status) {
      await db.prepare("UPDATE challenges SET progress = ?, status = ?, points = ? WHERE id = ? AND status = 'active'")
        .bind(next.progress, next.status, next.points, active.id).run();
    }
  }
}

async function checkChallenge(db, profile, today, person) {
  const token = crypto.randomUUID();
  const choices = Object.keys(CHALLENGES).filter(kind => kind !== 'deficit' || Number(person?.maintenanceKcal) > 0);
  const kind = randomNumber() < 0.10 ? choices[Math.floor(randomNumber() * choices.length)] : null;
  const statements = [db.prepare('INSERT OR IGNORE INTO challenge_checks (profile, day, token) VALUES (?, ?, ?)')
    .bind(profile, today, token)];
  if (kind) {
    // Both statements execute in one transaction. Only the winning daily token
    // can create a challenge, even with concurrent tabs/devices or a retry.
    statements.push(db.prepare(`INSERT OR IGNORE INTO challenges (id, profile, kind, start_day, end_day)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM challenge_checks WHERE token = ?)
      AND NOT EXISTS (SELECT 1 FROM challenges WHERE profile = ? AND status = 'active')`)
      .bind(token, profile, kind, today, getOffsetDayKey(today, CHALLENGES[kind].days - 1), token, profile));
  }
  await db.batch(statements);
}

async function getStatus(db, profile, today, people, logs) {
  const round = await db.prepare("SELECT day, finished_at, score FROM game_rounds WHERE profile = ? AND game = 'catch' AND day = ?")
    .bind(profile, today).first();
  const challenges = await db.prepare('SELECT * FROM challenges WHERE profile = ? ORDER BY start_day DESC, id DESC LIMIT 10')
    .bind(profile).all();
  const checked = await db.prepare('SELECT day FROM challenge_checks WHERE profile = ? AND day = ?').bind(profile, today).first();
  const leaderboard = await Promise.all([0, 1].map(async index => {
    const totals = await db.prepare(`SELECT
      COALESCE((SELECT SUM(points) FROM streak_awards WHERE profile = ?), 0) AS streakPoints,
      COALESCE((SELECT SUM(points) FROM challenges WHERE profile = ? AND status = 'completed'), 0) AS challengePoints,
      COALESCE((SELECT SUM(score) FROM game_rounds WHERE profile = ? AND finished_at IS NOT NULL), 0) AS gamePoints`)
      .bind(index, index, index).first();
    return {
      profile: index, name: people[index]?.name || `Person ${index + 1}`,
      ...totals, total: totals.streakPoints + totals.challengePoints + totals.gamePoints,
      streak: calculateStreak(logs[index], { today }).currentStreak,
    };
  }));
  leaderboard.sort((a, b) => b.total - a.total || b.streak - a.streak || a.profile - b.profile);
  return { today, round, challenges: challenges.results, checkedToday: !!checked, leaderboard };
}

async function handle(context, isPost) {
  const { request, env } = context;
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Cross-origin access denied' }, 403);
  }
  if (!env.TISCHPLAN_GAME_DB || !env.TISCHPLAN_STORAGE) {
    return json({ error: 'Punktewertung noch nicht eingerichtet. D1-Bindung TISCHPLAN_GAME_DB und Migration erforderlich. Training ist bereits möglich.' }, 503);
  }
  try {
    let body = {};
    if (isPost) {
      const raw = await request.text();
      if (raw.length > 16000) return json({ error: 'Spielaufzeichnung zu groß.' }, 413);
      try { body = JSON.parse(raw); } catch { return json({ error: 'Ungültiges JSON.' }, 400); }
    }
    const profileValue = isPost ? body.profile : new URL(request.url).searchParams.get('profile');
    if (!['0', '1'].includes(String(profileValue))) return json({ error: 'Ungültiges Profil.' }, 400);
    const profile = Number(profileValue);
    const db = env.TISCHPLAN_GAME_DB;
    const now = Date.now();
    const today = gameDay(new Date(now));
    const settings = await readKV(env.TISCHPLAN_STORAGE, 'settings', {});
    const people = settings.people || [];
    const logs = await Promise.all([0, 1].map(index => readKV(env.TISCHPLAN_STORAGE, `calorie_logs_${index}`, {})));
    await Promise.all(logs.map((log, index) => reconcile(db, index, log, today)));

    if (isPost) {
      if (body.action === 'open') {
        await checkChallenge(db, profile, today, people[profile]);
      } else if (body.action === 'decline') {
        await db.prepare("UPDATE challenges SET status = 'declined' WHERE id = ? AND profile = ? AND status = 'active'")
          .bind(String(body.id || ''), profile).run();
      } else if (body.action === 'start') {
        const sessionId = crypto.randomUUID();
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        const inserted = await db.prepare("INSERT OR IGNORE INTO game_rounds (profile, game, day, session_id, seed, started_at) VALUES (?, 'catch', ?, ?, ?, ?)")
          .bind(profile, today, sessionId, seed, now).run();
        if (!inserted.meta.changes) return json({ error: 'Deine gewertete Runde für heute wurde bereits gestartet.', code: 'DAILY_LIMIT' }, 409);
        return json({ sessionId, seed, day: today, startedAt: now });
      } else if (body.action === 'finish' || body.action === 'abandon') {
        const round = await db.prepare('SELECT * FROM game_rounds WHERE session_id = ? AND profile = ?')
          .bind(String(body.sessionId || ''), profile).first();
        if (!round) return json({ error: 'Runde nicht gefunden.' }, 404);
        if (round.finished_at !== null) return json({ score: round.score, alreadyFinished: true });
        let score = 0;
        if (body.action === 'finish') {
          let replay;
          try { replay = replayCatchGame(round.seed, body.inputs); }
          catch (error) { return json({ error: error.message }, 400); }
          if (now - round.started_at + 250 < replay.tick * TICK_MS) {
            return json({ error: 'Runde wurde zu früh abgeschlossen.' }, 400);
          }
          score = replay.score;
        }
        await db.prepare('UPDATE game_rounds SET score = ?, finished_at = ? WHERE session_id = ? AND finished_at IS NULL')
          .bind(score, now, round.session_id).run();
        const saved = await db.prepare('SELECT score FROM game_rounds WHERE session_id = ?').bind(round.session_id).first();
        return json({ score: saved.score });
      } else {
        return json({ error: 'Unbekannte Aktion.' }, 400);
      }
    }
    return json(await getStatus(db, profile, today, people, logs));
  } catch (error) {
    console.error('Gamification API:', error.message);
    return json({ error: 'Punkte konnten nicht geladen oder gespeichert werden. Bitte Verbindung und D1-Einrichtung prüfen und erneut versuchen.' }, 500);
  }
}

export const onRequestGet = context => handle(context, false);
export const onRequestPost = context => handle(context, true);
