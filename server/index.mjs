// ADGE Tennis — ranking leaderboard API + static server.
// -----------------------------------------------------------------------------
// Serves the built frontend (../dist) AND exposes:
//   GET /healthz               → 200 { ok }
//   GET /api/leaderboard?period=day|week|month
//        → { period, updatedAt, entries: [{rank,userName,avgScore,maxScore,shotCount}] }
//
// Rankings are read ONLY from leaderboard_records (this service's durable table,
// never purged). The DB layer backfills that table from the shared source on
// boot + hourly + throttled on-demand. If the DB is missing/unreachable the API
// returns a bilingual 503 JSON and the frontend shows a graceful offline state —
// nothing ever crashes.
// -----------------------------------------------------------------------------
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, dbReady, initDb, maybeBackfill } from './db.mjs';
import { periodWindow, mergeAndRank, WINDOW_SQL } from './leaderboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

const VALID_PERIODS = new Set(['day', 'week', 'month']);

// Shared bilingual 503 body (matches the main app's tone).
function unavailableBody() {
  return {
    error: 'leaderboard_unavailable',
    message:
      'Leaderboard database is not configured or unreachable right now. / ' +
      'ยังเชื่อมต่อฐานข้อมูลกระดานแชมป์ไม่ได้ในตอนนี้',
  };
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, db: dbReady() });
});

app.get('/api/leaderboard', async (req, res) => {
  const period = String(req.query.period || 'day');
  if (!VALID_PERIODS.has(period)) {
    return res.status(400).json({ error: 'invalid_period', message: 'period must be day|week|month' });
  }
  if (!dbReady()) {
    return res.status(503).json(unavailableBody());
  }
  try {
    // Throttled best-effort refresh so on-court sessions show up quickly.
    await maybeBackfill();
    const { from, to } = periodWindow(period);
    const { rows } = await query(WINDOW_SQL, [from, to]);
    const records = rows.map((r) => ({
      userName: r.user_name,
      avgScore: r.avg_score,
      maxScore: r.max_score,
      shotCount: r.shot_count,
    }));
    const entries = mergeAndRank(records);
    res.set('Cache-Control', 'no-store');
    res.json({ period, updatedAt: new Date().toISOString(), entries });
  } catch (err) {
    console.error('[api] leaderboard:', err?.message || err);
    res.status(503).json(unavailableBody());
  }
});

// Boot the DB (migrate + backfill + hourly timer). Degrades to 503 when env
// missing — never throws into boot.
initDb();

// Static frontend + SPA fallback.
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => {
  console.log(`ADGE Tennis ranking server on :${PORT} (db: ${dbReady() ? 'on' : 'OFF'})`);
});
