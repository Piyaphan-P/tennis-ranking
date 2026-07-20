# CLAUDE.md

Guidance for Claude Code working in this repo. These instructions override default behavior.

# (this file retitled for the SIT branch)

## Project

**กระดานแชมป์ ADGE Tennis (SIT)** — the standalone competition **leaderboard** site. Thai-primary, mobile-first, tournament-broadcast energy (ATP-finals style): big player names, a dramatic gold-glow **podium** for the top 3, and a full standings table, per **ประจำวัน / ประจำสัปดาห์ / ประจำเดือน** (day / week / month).

Brand name on this branch is **"ADGE Tennis"**. This is the **SIT (non-production)** variant. The `main` branch is production, branded **"ต้นและเพชร Tennis Club"** (Ton & Phet).

This is a **separate** service from the main coaching app (`../tennis_project01`). Do not modify that folder.

## SIT environment

This branch (`SIT`) is the **non-production** variant, isolated from production but sharing the same infra:

- **Brand:** all user-visible copy, `<title>`/meta, and docs headings say **"ADGE Tennis"** — never "ต้นและเพชร" / "Ton & Phet" / "ton-phet" in UI or generated artifact names. (Infra identifiers now live under GCP project `adge-tennis-nonprd` / Artifact Registry `…/adge-tennis-nonprd/adge/` — the old `ton-team`/`ton-phet` project is deleted.)
- **DB isolation (`DB_SCHEMA`):** both environments share one Supabase Postgres. `DB_SCHEMA` (default `public` = prod, unchanged) selects the schema. **SIT sets `DB_SCHEMA=sit`.** `server/db.mjs` sanitizes it (`/^[a-z_][a-z0-9_]*$/`, else falls back to `public` + logs), pins every connection via a `pool.on('connect')` → `SET search_path TO <schema>` hook (Supabase pooler on :5432 is SESSION mode, so the SET persists per connection), and `migrate()` runs `CREATE SCHEMA IF NOT EXISTS <schema>` before the table DDL. **All SQL stays unqualified** — search_path does the isolation; never hardcode a schema prefix. The backfill reads `sessions`/`shots` unqualified, so on SIT it resolves `sit.sessions` / `sit.shots` (written by the SIT main app), and writes `sit.leaderboard_records`.
- **SIT Cloud Run service:** `adge-ranking-sit` (region `asia-southeast1`; deploy via the same AR image path — infra unchanged; env `DATABASE_URL` + `DB_SCHEMA=sit`).
- **`main` branch = production:** GCP project `adge-tennis-prod` (empty as of 2026-07-20 — APIs not yet enabled, prod migration is future work), `DB_SCHEMA=public` (or unset), brand ต้นและเพชร Tennis Club. The orchestrator handles push/deploy; do not touch `main` from here.

### DB backend (`DB_BACKEND`) — Postgres | Firestore

The data layer is pluggable behind ONE shared interface (`dbReady · initDb · maybeBackfill · fetchWindowRecords`) selected once at boot by `DB_BACKEND`. `index.mjs` imports only from `server/dbBackend.mjs` and never learns which backend is live; the unused driver (`pg` or `@google-cloud/firestore`) is never even loaded (dynamic import).

| `DB_BACKEND` | Module | Storage | Notes |
|---|---|---|---|
| `postgres` (default) | `dbPostgres.mjs` → **untouched** `db.mjs` | shared Supabase Postgres | **byte-identical to prod today.** Uses `DATABASE_URL` + `DB_SCHEMA`. |
| `firestore` | `dbFirestore.mjs` | Firestore native-mode db (SIT) | Uses `FIRESTORE_DATABASE` (default `nonprd`) + `GOOGLE_CLOUD_PROJECT` (default `adge-tennis-nonprd`) + ADC. `DATABASE_URL` ignored. |

Pure ranking math is shared by BOTH backends: each backend only returns raw per-session records `[{userName, avgScore, maxScore, shotCount}]`; `index.mjs` runs `mergeAndRank()` (shot-weighted avg + tie-breaks) identically for either. The Bangkok-day→UTC-instant conversion for the Firestore range query is the pure, unit-tested `periodWindowInstants()` in `leaderboard.mjs` — same day boundaries as the postgres `WINDOW_SQL` (`from` 00:00 BKK inclusive .. `to`+1 day 00:00 BKK exclusive = whole `to` day covered).

**Firestore data contract (SIT `nonprd`, frozen — both repos agree):**
- `sessions/{sessionId}`: `{ userName, startedAt: Timestamp, endedAt, avgScore, shotCount, summary, expireAt: Timestamp }`
- `sessions/{sessionId}/shots/{shotId}`: `{ idx, type, score, angles, statuses, issues, peakWristSpeed, clipPath, clipMime, audioPath, audioMime, createdAt: Timestamp, expireAt: Timestamp }`
- `leaderboard_records/{sessionId}` (this service's durable read source): `{ userName, avgScore, maxScore, shotCount, playedAt: Timestamp }` — **NO `expireAt` → durable forever.** Doc id = sessionId ⇒ idempotent `set()` upsert. Backfill (boot + hourly + throttled on-demand >5 min) reads `sessions` where `startedAt ≥ now−3d`, aggregates each session's `shots` subcollection (avg/max/count over `score`), and upserts here. Read path queries `leaderboard_records` by `playedAt` range only.
- **TTL:** Firestore **platform TTL** on field `expireAt` (configured on the db, not in code) auto-deletes expired `sessions`/`shots`. This service **never** deletes anything on the Firestore path (no purge job).
- **Cloud Run:** runtime SA needs `roles/datastore.user`; credentials via ADC/metadata server (no env key). Local dev: `GOOGLE_APPLICATION_CREDENTIALS` → SA key (gitignored). Unreachable/unauthorized backend surfaces as a rejected read → the same bilingual **503 JSON** as the postgres path.

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
gcloud config set project adge-tennis-nonprd    # GCP: adge-tennis-nonprd (SIT) / adge-tennis-prod (prod, future)
docker buildx build --platform linux/amd64 \
  -t asia-southeast1-docker.pkg.dev/adge-tennis-nonprd/adge/ranking:v1 --push .

gcloud run deploy adge-ranking-sit \
  --image asia-southeast1-docker.pkg.dev/adge-tennis-nonprd/adge/ranking:v1 \
  --region asia-southeast1 --allow-unauthenticated --project adge-tennis-nonprd \
  --update-env-vars 'DATABASE_URL=<the Supabase IPv4-pooler URL, url-encoded password>'
```

- Project `adge-tennis-nonprd` (SIT; prod project `adge-tennis-prod` is empty as of 2026-07-20 — future), region `asia-southeast1`, service `adge-ranking-sit`.
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

## Migration log

- **GCP migration ton-team → adge-tennis-\* (2026-07-20):** the old `ton-team` GCP project was deleted; all references moved to **`adge-tennis-nonprd`** (SIT) / **`adge-tennis-prod`** (prod, empty/future). Code default `GOOGLE_CLOUD_PROJECT` in `server/dbFirestore.mjs` → `adge-tennis-nonprd`; `.env.example` comment updated; Artifact Registry image path → `asia-southeast1-docker.pkg.dev/adge-tennis-nonprd/adge/ranking`; deploy docs use `gcloud config set project adge-tennis-nonprd` and service `adge-ranking-sit` (unchanged). Firestore DB `nonprd` and the durable `leaderboard_records` read source unchanged. Matches the sibling app repo's same-day migration. (`.gitignore`/security `ton-team-*.json` SA-key pattern intentionally kept.)
