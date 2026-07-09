// ============================================================================
// ADGE Tennis — Postgres backend adapter (DB_BACKEND=postgres, the default).
//
// A thin, byte-identical wrapper over the UNTOUCHED db.mjs. It exists only so
// both backends expose ONE shared interface to index.mjs:
//   dbReady() · initDb() · maybeBackfill() · fetchWindowRecords(period)
//
// The lifecycle functions pass straight through to db.mjs (no behavior change).
// fetchWindowRecords() moves the window-query + row→record mapping that used to
// live inline in index.mjs here, so index.mjs is backend-agnostic. The SQL and
// the row shape are exactly what index.mjs ran before — prod is unaffected.
// ============================================================================

import { query, dbReady, initDb, maybeBackfill } from './db.mjs';
import { periodWindow, WINDOW_SQL } from './leaderboard.mjs';

export { dbReady, initDb, maybeBackfill };

/**
 * Fetch this period's raw per-session records from leaderboard_records.
 * Returns [{ userName, avgScore, maxScore, shotCount }] — the exact shape
 * index.mjs feeds to mergeAndRank(). Rejects on any pg error (caller → 503).
 */
export async function fetchWindowRecords(period) {
  const { from, to } = periodWindow(period);
  const { rows } = await query(WINDOW_SQL, [from, to]);
  return rows.map((r) => ({
    userName: r.user_name,
    avgScore: r.avg_score,
    maxScore: r.max_score,
    shotCount: r.shot_count,
  }));
}
