// ============================================================================
// ADGE Tennis — DB backend selector (DB_BACKEND).
//
// One shared interface, two implementations, chosen ONCE at module load:
//   DB_BACKEND=postgres (default) → dbPostgres.mjs (thin wrapper over the
//     untouched db.mjs — byte-identical to today's behavior; prod path).
//   DB_BACKEND=firestore          → dbFirestore.mjs (Google Cloud Firestore).
//
// Both modules export the same four names, so index.mjs imports only from here
// and never learns which backend is live. The import is dynamic so the unused
// backend's driver (pg or @google-cloud/firestore) is never even loaded.
// ============================================================================

const BACKEND = (process.env.DB_BACKEND || 'postgres').trim().toLowerCase();

const mod =
  BACKEND === 'firestore'
    ? await import('./dbFirestore.mjs')
    : await import('./dbPostgres.mjs');

if (BACKEND !== 'firestore' && BACKEND !== 'postgres') {
  console.error(`[db] unknown DB_BACKEND "${BACKEND}" — falling back to 'postgres'`);
}

export const backendName = BACKEND === 'firestore' ? 'firestore' : 'postgres';
export const dbReady = mod.dbReady;
export const initDb = mod.initDb;
export const maybeBackfill = mod.maybeBackfill;
export const fetchWindowRecords = mod.fetchWindowRecords;
