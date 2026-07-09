// ============================================================================
// ADGE Tennis — Firestore backend (DB_BACKEND=firestore).
//
// Google Cloud Firestore (native mode) replacement for the Postgres data layer,
// exposing the SAME interface as dbPostgres.mjs so index.mjs is unchanged:
//   dbReady() · initDb() · maybeBackfill() · fetchWindowRecords(period)
//
// Rankings are READ only from the durable `leaderboard_records` collection
// (one doc per finished session, doc id = sessionId, NO expireAt → forever).
// A BACKFILL safety net (boot + hourly + throttled on-demand) reads recent
// `sessions` (startedAt >= now-3d) + each session's `shots` subcollection,
// aggregates per session (avg/max/count over shot scores), and upserts
// leaderboard_records/{sessionId} via set() (idempotent, heals the main app's
// own per-session-end write). The per-USER aggregation (weighted avg / ties)
// is NOT done here — index.mjs runs the shared pure mergeAndRank() on the read
// path, identical to the postgres backend.
//
// TTL: `sessions` and `shots` carry an `expireAt` field auto-purged by
// Firestore platform TTL (configured on the DB, not in code) — this service
// NEVER deletes those. leaderboard_records has no expireAt and is durable.
//
// Auth: Application Default Credentials. On Cloud Run that is the runtime SA
// (roles/datastore.user) via the metadata server — no env var. Locally,
// GOOGLE_APPLICATION_CREDENTIALS points at an SA key. The client constructs
// lazily and creds resolve at first RPC, so any auth/reachability failure
// surfaces as a rejected query → index.mjs returns the bilingual 503.
// ============================================================================

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { periodWindowInstants } from './leaderboard.mjs';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'ton-team';
const DATABASE = process.env.FIRESTORE_DATABASE || 'nonprd';
const ANON = 'ผู้เล่นนิรนาม';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const WRITE_BATCH_LIMIT = 400; // Firestore hard cap is 500 ops/batch

/** Lazy singleton — undefined until first use, null if construction fails. */
let db;

function getDb() {
  if (db !== undefined) return db;
  try {
    db = new Firestore({ projectId: PROJECT, databaseId: DATABASE });
  } catch (err) {
    console.error('[db] Firestore init failed:', err?.message || err);
    db = null;
  }
  return db;
}

/**
 * True when the Firestore client constructed. Creds are resolved lazily at RPC
 * time (ADC / metadata server), so an unreachable/unauthorized backend is NOT
 * detected here — it surfaces as a rejected fetchWindowRecords → 503. This
 * mirrors the postgres gate: "configured" ⇒ attempt, then fail gracefully.
 */
export function dbReady() {
  return Boolean(getDb());
}

/** Read raw per-session records for a period from leaderboard_records. */
export async function fetchWindowRecords(period) {
  const fs = getDb();
  if (!fs) throw new Error('Firestore not configured');
  const { start, endExclusive } = periodWindowInstants(period);
  const snap = await fs
    .collection('leaderboard_records')
    .where('playedAt', '>=', Timestamp.fromDate(start))
    .where('playedAt', '<', Timestamp.fromDate(endExclusive))
    .get();
  return snap.docs.map((d) => {
    const r = d.data();
    return {
      userName: r.userName,
      avgScore: Number(r.avgScore) || 0,
      maxScore: Number(r.maxScore) || 0,
      shotCount: Number(r.shotCount) || 0,
    };
  });
}

/**
 * BACKFILL: upsert leaderboard_records for every recent session that has shots.
 * Reads sessions (startedAt >= now-3d), then each session's shots subcollection,
 * aggregates avg/max/count over shot.score, and set()s the durable record.
 * Idempotent by doc id (sessionId). Sessions with no shots contribute nothing.
 */
export async function backfill() {
  const fs = getDb();
  if (!fs) return;
  const cutoff = Timestamp.fromMillis(Date.now() - THREE_DAYS_MS);
  const sessionsSnap = await fs
    .collection('sessions')
    .where('startedAt', '>=', cutoff)
    .get();

  const upserts = [];
  for (const sessDoc of sessionsSnap.docs) {
    const sess = sessDoc.data() || {};
    const shotsSnap = await sessDoc.ref.collection('shots').get();
    if (shotsSnap.empty) continue; // no shots ⇒ no leaderboard contribution

    let sum = 0;
    let max = 0;
    let count = 0;
    for (const shDoc of shotsSnap.docs) {
      const score = Number(shDoc.data()?.score) || 0;
      sum += score;
      if (score > max) max = score;
      count += 1;
    }
    if (count <= 0) continue;

    const rawName = typeof sess.userName === 'string' ? sess.userName.trim() : '';
    upserts.push({
      sessionId: sessDoc.id,
      data: {
        userName: rawName === '' ? ANON : rawName,
        avgScore: sum / count,
        maxScore: max,
        shotCount: count,
        // startedAt is the session anchor = played_at in the postgres model.
        playedAt: sess.startedAt || Timestamp.now(),
      },
    });
  }

  // Commit in chunks so we never exceed Firestore's per-batch op cap.
  for (let i = 0; i < upserts.length; i += WRITE_BATCH_LIMIT) {
    const batch = fs.batch();
    for (const u of upserts.slice(i, i + WRITE_BATCH_LIMIT)) {
      batch.set(fs.collection('leaderboard_records').doc(u.sessionId), u.data);
    }
    await batch.commit();
  }
}

// --- refresh throttling (mirrors db.mjs exactly) ----------------------------
let lastBackfillAt = 0;
const ON_DEMAND_MIN_MS = 5 * 60 * 1000; // >5 min since last → refresh on request
const HOURLY_MS = 60 * 60 * 1000;

/**
 * Best-effort on-demand backfill: at most once per 5 min, never throws. The
 * throttle timestamp is set BEFORE the attempt so a broken backend is not
 * hammered on every request; any error is swallowed (serve whatever is stored).
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
 * Boot-time init: backfill (best-effort, never throws into boot) + schedule a
 * recurring hourly backfill. No migrate step — Firestore is schemaless and TTL
 * is configured at the platform level. No-op when the client failed to build.
 */
export function initDb() {
  if (!dbReady()) {
    console.log('[db] Firestore client unavailable — leaderboard offline (API returns 503)');
    return;
  }
  backfill()
    .then(() => {
      lastBackfillAt = Date.now();
      console.log(
        `[db] backfilled leaderboard_records (firestore db: ${DATABASE}, project: ${PROJECT}); rankings ON`,
      );
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
