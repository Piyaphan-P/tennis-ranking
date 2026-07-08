// ============================================================================
// ต้นและเพชร Tennis Club — ranking DB access (Supabase Postgres, shared w/ app).
//
// Lazy singleton pg Pool, created ONLY when DATABASE_URL is set. TLS required,
// tiny pool, cold-disconnect tolerant (Supabase pooler reaps idle sockets). Any
// pg error surfaces as a rejected query() (caller → 503) and NEVER crashes the
// process (pool 'error' handler + per-query rejection).
//
// This service owns leaderboard_records (migrate on boot, never deletes rows).
// It BACKFILLS that table from live sessions⋈shots on boot + hourly + throttled
// on-demand (>5 min since last), as a safety net behind the main app's own
// per-session-end insert. Reads for the API come ONLY from leaderboard_records.
// ============================================================================

import pg from 'pg';
import { MIGRATE_SQL, BACKFILL_SQL } from './leaderboard.mjs';

const { Pool } = pg;
const CONN = process.env.DATABASE_URL || '';

/** Lazy singleton — undefined until first use, null when no DATABASE_URL. */
let pool;

/** True when Postgres is configured. */
export function dbReady() {
  return Boolean(CONN);
}

function getPool() {
  if (pool !== undefined) return pool;
  if (!CONN) {
    pool = null;
    return pool;
  }
  pool = new Pool({
    connectionString: CONN,
    max: 3,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => {
    console.error('[db] idle client error (ignored):', err?.message || err);
  });
  return pool;
}

/** Run one parameterized query. Rejects on any pg error (caller maps to 5xx). */
export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL not configured');
  return p.query(text, params);
}

/** Create leaderboard_records if absent. No-op when DB not configured. */
export async function migrate() {
  if (!dbReady()) return;
  await query(MIGRATE_SQL);
}

/** Upsert recent sessions into leaderboard_records. No-op when DB not configured. */
export async function backfill() {
  if (!dbReady()) return;
  await query(BACKFILL_SQL);
}

// --- refresh throttling ------------------------------------------------------
let lastBackfillAt = 0;
const ON_DEMAND_MIN_MS = 5 * 60 * 1000; // >5 min since last → refresh on request
const HOURLY_MS = 60 * 60 * 1000;

/**
 * Best-effort on-demand backfill: runs at most once per 5 min, never throws,
 * never blocks the caller into failure. Awaited so the response reflects fresh
 * data, but any error is swallowed (we still serve whatever is in the table).
 */
export async function maybeBackfill() {
  if (!dbReady()) return;
  const now = Date.now();
  if (now - lastBackfillAt < ON_DEMAND_MIN_MS) return;
  lastBackfillAt = now;
  try {
    await backfill();
  } catch (err) {
    console.error('[db] on-demand backfill failed (ignored):', err?.message || err);
  }
}

/**
 * Boot-time init: migrate then backfill (best-effort, never throws into boot),
 * and schedule a recurring hourly backfill. No-op when DB not configured.
 */
export function initDb() {
  if (!dbReady()) {
    console.log('[db] DATABASE_URL not set — leaderboard offline (API returns 503)');
    return;
  }
  migrate()
    .then(() => backfill())
    .then(() => {
      lastBackfillAt = Date.now();
      console.log('[db] migrated + backfilled leaderboard_records; rankings ON');
    })
    .catch((err) => console.error('[db] boot init failed (non-fatal):', err?.message || err));
  const timer = setInterval(() => {
    lastBackfillAt = Date.now();
    backfill().catch((err) =>
      console.error('[db] hourly backfill failed:', err?.message || err),
    );
  }, HOURLY_MS);
  timer.unref?.();
}
