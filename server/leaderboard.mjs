// ============================================================================
// ADGE Tennis — ranking: pure logic + SQL (single source of truth).
//
// This module is plain ESM JS on PURPOSE: it is imported BOTH by the Node
// server at runtime (server/index.mjs, no build step) AND by the vitest tests
// (test/leaderboard.test.mjs). So the code the tests cover is the code that
// actually runs — no TS/JS drift, no orphaned "spec". The React frontend never
// needs it (the API returns already-ranked JSON), which is why it lives here in
// server/ rather than as a src/*.ts module. (CLAUDE.md documents this reading of
// the spec's "src/ or shared .ts" line — a deliberate choice, not an oversight.)
//
// Time model: ALL day boundaries are Asia/Bangkok (UTC+7, no DST). A "day
// string" is 'YYYY-MM-DD' in Bangkok wall-clock. played_at (= a session's
// started_at) is the anchor timestamp for which Bangkok calendar day a record
// belongs to. Day arithmetic is done at noon UTC to dodge any tz slippage.
// ============================================================================

const BKK = 'Asia/Bangkok';
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BKK,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ANON = 'ผู้เล่นนิรนาม';

/** Bangkok calendar day 'YYYY-MM-DD' for a Date (default: now). */
export function bangkokDayString(date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return dayFmt.format(date);
}

/**
 * Shift a Bangkok day string by n days. Parses at noon UTC (= 19:00 Bangkok,
 * same calendar day) so ±1 day never lands on a DST/rounding boundary.
 */
export function addDays(dayStr, n) {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return bangkokDayString(d);
}

/**
 * Inclusive [from, to] Bangkok day-string window for a period.
 *  - day   → today only
 *  - week  → last 7 days incl today (today-6 .. today)
 *  - month → last 30 days incl today (today-29 .. today)
 */
export function periodWindow(period, today = bangkokDayString()) {
  switch (period) {
    case 'day':
      return { from: today, to: today };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: addDays(today, -29), to: today };
    default:
      throw new Error(`unknown period: ${period}`);
  }
}

/**
 * Same inclusive Bangkok-day window as periodWindow(), but expressed as UTC
 * Date instants for a timestamp range query (Firestore backend). Returns
 * [start, endExclusive): start = 00:00:00 Bangkok of the `from` day;
 * endExclusive = 00:00:00 Bangkok of the day AFTER `to`. Bangkok is UTC+7 with
 * no DST, so start-of-day = 'YYYY-MM-DDT00:00:00+07:00'. This is exactly
 * equivalent to the postgres WINDOW_SQL `(played_at AT TIME ZONE 'Asia/Bangkok')
 * ::date BETWEEN from AND to` (both include the whole `to` calendar day).
 * Pure — the load-bearing conversion, unit-tested for the +7 offset.
 */
export function periodWindowInstants(period, today = bangkokDayString()) {
  const { from, to } = periodWindow(period, today);
  const start = new Date(`${from}T00:00:00+07:00`);
  const endExclusive = new Date(`${addDays(to, 1)}T00:00:00+07:00`);
  return { start, endExclusive };
}

/** Normalize a raw user_name: blank/whitespace → the anonymous bucket. */
export function normalizeUserName(name) {
  const t = typeof name === 'string' ? name.trim() : '';
  return t === '' ? ANON : t;
}

/**
 * Merge per-session records into per-user aggregates.
 * record: { userName, avgScore, maxScore, shotCount }
 *   avgScore is that session's mean per-shot score; shotCount weights it.
 * Returns per-user: shot-weighted avgScore, max of maxScore, summed shotCount.
 */
export function mergeRecords(records) {
  const byUser = new Map();
  for (const r of records) {
    const name = normalizeUserName(r.userName);
    const shotCount = Number(r.shotCount) || 0;
    if (shotCount <= 0) continue; // a session with no shots contributes nothing
    const avgScore = Number(r.avgScore) || 0;
    const maxScore = Number(r.maxScore) || 0;
    const cur = byUser.get(name) || {
      userName: name,
      weightedSum: 0,
      shotCount: 0,
      maxScore: 0,
    };
    cur.weightedSum += avgScore * shotCount;
    cur.shotCount += shotCount;
    cur.maxScore = Math.max(cur.maxScore, maxScore);
    byUser.set(name, cur);
  }
  return [...byUser.values()].map((u) => ({
    userName: u.userName,
    avgScore: u.shotCount > 0 ? u.weightedSum / u.shotCount : 0,
    maxScore: u.maxScore,
    shotCount: u.shotCount,
  }));
}

/**
 * Rank merged per-user aggregates: avgScore desc, tie-break maxScore desc, then
 * shotCount desc, then userName asc (deterministic). Min 1 shot. Cap 50.
 * Returns [{ rank, userName, avgScore, maxScore, shotCount }].
 */
export function rankEntries(merged) {
  return merged
    .filter((u) => (Number(u.shotCount) || 0) >= 1)
    .sort(
      (a, b) =>
        b.avgScore - a.avgScore ||
        b.maxScore - a.maxScore ||
        b.shotCount - a.shotCount ||
        a.userName.localeCompare(b.userName),
    )
    .slice(0, 50)
    .map((u, i) => ({
      rank: i + 1,
      userName: u.userName,
      avgScore: u.avgScore,
      maxScore: u.maxScore,
      shotCount: u.shotCount,
    }));
}

/** Convenience: merge + rank in one call (the load-bearing runtime path). */
export function mergeAndRank(records) {
  return rankEntries(mergeRecords(records));
}

// ---------------------------------------------------------------------------
// SQL (kept beside the logic that mirrors it).
// ---------------------------------------------------------------------------

/** This service OWNS this table. One row per finished session. NEVER deleted. */
export const MIGRATE_SQL = `
CREATE TABLE IF NOT EXISTS leaderboard_records (
  session_id uuid PRIMARY KEY,
  user_name  text NOT NULL DEFAULT '',
  avg_score  real NOT NULL DEFAULT 0,
  max_score  real NOT NULL DEFAULT 0,
  shot_count int  NOT NULL DEFAULT 0,
  played_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS leaderboard_records_played_idx
  ON leaderboard_records (played_at);
`;

/**
 * Boot + hourly BACKFILL safety net: upsert one row per recent session that has
 * shots, computed from live sessions⋈shots. Idempotent by session_id PK, so it
 * co-exists with (and heals) the main app's own per-session-end insert. Only
 * touches sessions from the last 3 days (all the source DB ever keeps); rows
 * already in leaderboard_records for older sessions stay frozen forever.
 */
export const BACKFILL_SQL = `
INSERT INTO leaderboard_records
  (session_id, user_name, avg_score, max_score, shot_count, played_at)
SELECT
  se.id,
  COALESCE(NULLIF(TRIM(se.user_name), ''), 'ผู้เล่นนิรนาม'),
  AVG(sh.score)::real,
  MAX(sh.score)::real,
  COUNT(sh.id)::int,
  se.started_at
FROM sessions se
JOIN shots sh ON sh.session_id = se.id
WHERE se.started_at >= now() - INTERVAL '3 days'
GROUP BY se.id, se.user_name, se.started_at
ON CONFLICT (session_id) DO UPDATE SET
  user_name  = EXCLUDED.user_name,
  avg_score  = EXCLUDED.avg_score,
  max_score  = EXCLUDED.max_score,
  shot_count = EXCLUDED.shot_count,
  played_at  = EXCLUDED.played_at;
`;

/**
 * Read records whose played_at (in Bangkok) falls in the inclusive day window.
 * $1 = from day-string, $2 = to day-string. Merge + rank happens in JS.
 */
export const WINDOW_SQL = `
SELECT user_name, avg_score, max_score, shot_count
FROM leaderboard_records
WHERE (played_at AT TIME ZONE 'Asia/Bangkok')::date >= $1::date
  AND (played_at AT TIME ZONE 'Asia/Bangkok')::date <= $2::date;
`;
