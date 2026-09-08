-- Separate D1 database, binding: TISCHPLAN_GAME_DB. Existing KV data is unchanged.
CREATE TABLE IF NOT EXISTS game_rounds (
  profile INTEGER NOT NULL CHECK (profile IN (0, 1)),
  game TEXT NOT NULL DEFAULT 'catch',
  day TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile, game, day)
);

CREATE TABLE IF NOT EXISTS challenge_checks (
  profile INTEGER NOT NULL CHECK (profile IN (0, 1)),
  day TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  PRIMARY KEY (profile, day)
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  profile INTEGER NOT NULL CHECK (profile IN (0, 1)),
  kind TEXT NOT NULL CHECK (kind IN ('no_snacks', 'vegetables', 'deficit')),
  start_day TEXT NOT NULL,
  end_day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired', 'declined')),
  progress INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_challenge ON challenges(profile) WHERE status = 'active';

-- Immutable daily awards: editing/removing/re-adding a meal cannot award twice.
CREATE TABLE IF NOT EXISTS streak_awards (
  profile INTEGER NOT NULL CHECK (profile IN (0, 1)),
  day TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points IN (1, 5)),
  PRIMARY KEY (profile, day)
);
