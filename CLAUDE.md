# CLAUDE.md

Guidance for Claude Code working in this repo. These instructions override default behavior.

## Project

**กระดานแชมป์ ต้นและเพชร Tennis Club** — the standalone competition **leaderboard** site for the Ton & Phet Tennis Club coaching app. Thai-primary, mobile-first, tournament-broadcast energy (ATP-finals style): big player names, a dramatic gold-glow **podium** for the top 3, and a full standings table, per **ประจำวัน / ประจำสัปดาห์ / ประจำเดือน** (day / week / month).

Brand name is **"ต้นและเพชร Tennis Club"** (Ton & Phet). NEVER write "ต้นเป็ด" / "TonPed" in UI copy.

This is a **separate** service from the main coaching app (`../tennis_project01`). Do not modify that folder.

## Stack

Vite + React 18 + TypeScript · plain CSS design tokens (`src/theme.css`, no Tailwind, no Zustand — plain `useState`/`useEffect`) · Node/Express API + static server (`server/index.mjs`) · `pg` → shared Supabase Postgres.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Vite dev server → http://localhost:5174 (proxies `/api` → :8080) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | vitest (pure ranking / date-window / merge logic) |
| `npm run build` | typecheck + production build → `dist/` |
| `npm start` (in repo root) | run the Express server (serves `dist/` + API) on :8080 |

Keep **typecheck + test + build** all green before committing/deploying.

To run the server against the real DB locally, export `DATABASE_URL` in your shell only
(read it from `../tennis_project01/.env.local` — NEVER copy the value into any tracked file):
`DATABASE_URL="…" PORT=8080 node server/index.mjs`.

## Data architecture (IMPORTANT — the source DB purges itself)

The main coaching app stores `sessions` and `shots` in a shared Supabase Postgres and **deletes
sessions older than 3 days**. A leaderboard needs history that outlives that purge, so this service
owns a **durable** table it never deletes:

```sql
CREATE TABLE IF NOT EXISTS leaderboard_records (
  session_id uuid PRIMARY KEY,          -- one row per finished session; PK ⇒ idempotent upsert
  user_name  text NOT NULL DEFAULT '',
  avg_score  real NOT NULL DEFAULT 0,   -- that session's mean per-shot score
  max_score  real NOT NULL DEFAULT 0,
  shot_count int  NOT NULL DEFAULT 0,
  played_at  timestamptz NOT NULL       -- = sessions.started_at
);
```

Two writers, both idempotent by `session_id`:
1. **The MAIN app** inserts one row here at session-end (orchestrator patches `tennis_project01/server/routes.mjs` — not this repo). This is the primary path.
2. **This service's BACKFILL** (`server/db.mjs` → `BACKFILL_SQL`) runs on **boot + hourly + throttled on-demand** (when an API request arrives >5 min since the last refresh). It upserts recent sessions (`started_at ≥ now() − 3 days`, joined to their shots) into `leaderboard_records`. This backfills existing recent data AND is a safety net if the main app's push ever fails. `ON CONFLICT (session_id) DO UPDATE` ⇒ the two writers heal, never duplicate.

Because rows are never deleted, `leaderboard_records` accumulates over time: on day one, week ≈ month ≈ the 3 days the source still holds; as the service runs, older days freeze into the table permanently. **That is the entire reason the table exists.**

### Time model — one clock end to end
All day boundaries are **Asia/Bangkok** (UTC+7, no DST). A record belongs to the Bangkok calendar
day of its `played_at`. The API windows filter on `(played_at AT TIME ZONE 'Asia/Bangkok')::date`;
the JS window bounds (`server/leaderboard.mjs` → `periodWindow`) are Bangkok day-strings computed
via `Intl` + noon-UTC arithmetic so ±1 day never slips a timezone. Keep both in Bangkok or you get
off-by-one at midnight.

### API
`GET /api/leaderboard?period=day|week|month` →
`{ period, updatedAt, entries: [{ rank, userName, avgScore, maxScore, shotCount }] }`
- window: day = today (Bangkok); week = last 7 days incl today; month = last 30 days incl today.
- per user across the window: `avgScore = Σ(avg_score·shot_count)/Σ(shot_count)` (**shot-weighted**, not a mean of daily means), `maxScore = max(max_score)`, `shotCount = Σ(shot_count)`.
- rank by `avgScore` desc, tie-break `maxScore` desc → `shotCount` desc → name asc. Min 1 shot. Cap 50.
- blank/whitespace `user_name` → grouped under `ผู้เล่นนิรนาม`.
- DB missing/unreachable → **503 JSON** `{error, message}` (bilingual); the frontend shows a graceful offline state. Nothing crashes.

`GET /healthz` → `200 { ok: true, db }`.

### Where the logic lives (deliberate reading of the spec)
The spec said "pure logic in `src/` or shared `.ts`". Ranking/merge/date-window logic instead lives
in **`server/leaderboard.mjs`** (plain ESM) so the *tested code is the code that actually runs*:
Node imports it at runtime (no build step) and vitest (`test/leaderboard.test.mjs`) imports the same
module. The React frontend never needs it (the API returns ranked JSON), so a `src/*.ts` copy would
be dead, drift-prone code. Tests sit outside `src/` so `tsc --noEmit` (include: `["src"]`) stays green.

## Deploy (Cloud Run)

Single container (Node serves `dist/` + `/api`). Build locally and push, then deploy `--image`
(the deploy SA cannot use Cloud Build):

```bash
# colima / local docker daemon must be running
docker buildx build --platform linux/amd64 \
  -t asia-southeast1-docker.pkg.dev/ton-team/ton-phet/ranking:v1 --push .

gcloud run deploy ton-phet-ranking \
  --image asia-southeast1-docker.pkg.dev/ton-team/ton-phet/ranking:v1 \
  --region asia-southeast1 --allow-unauthenticated \
  --update-env-vars 'DATABASE_URL=<the Supabase IPv4-pooler URL, url-encoded password>'
```

- Project `ton-team`, region `asia-southeast1`, service `ton-phet-ranking`.
- **Needs `DATABASE_URL`** (same shared Supabase as the main app). Use the **IPv4 pooler** host
  `aws-0-<region>.pooler.supabase.com:5432` (the direct `db.*.supabase.co` host is IPv6-only),
  password URL-encoded. Secret Manager is unavailable to the deploy SA → pass via `--update-env-vars`.
- Without `DATABASE_URL` the API returns a bilingual 503 and the site shows an offline state — it still boots.

## Security — non-negotiable

- **Never** let any key/DB URL reach git. `.env.local`, `*-service-account*.json`, `ton-team-*.json`, `.claude/`, screenshots are gitignored. `.env.example` holds the variable **name** only.
- No secrets in `VITE_*` / frontend — this app has none; the DB URL is backend-only.
- **Audit before every push:** grep the diff for `AIza`, `AQ.`, `postgres://`, `postgresql://`, `supabase`. The only allowed hits are the env-var **name** in docs and `.env.local` (untracked).

## Git

Commit/push only when asked (the orchestrator handles git + deploy). Co-author trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

> Note (prod): Cloud Run's Google Front End reserves `/healthz` on `*.run.app` and answers 404 at the edge — the container never sees it. Health-check via `/api/leaderboard?period=day` instead; `/healthz` still works locally.
