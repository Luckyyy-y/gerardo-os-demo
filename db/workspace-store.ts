import { env } from "cloudflare:workers";

type WorkspaceRow = {
  data_json: string;
  version: number;
  updated_at: number;
};

let schemaReady: Promise<void> | undefined;

function getDatabase() {
  if (!env.DB) {
    throw new Error("Workspace storage is temporarily unavailable.");
  }

  return env.DB;
}

async function ensureSchema(database: D1Database) {
  if (!schemaReady) {
    schemaReady = database
      .prepare(
        `CREATE TABLE IF NOT EXISTS workspace_state (
          owner_id TEXT PRIMARY KEY NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER DEFAULT 1 NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
      )
      .run()
      .then(() => undefined)
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }

  await schemaReady;
}

export async function readWorkspace(ownerId: string) {
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database
    .prepare(
      `SELECT data_json, version, updated_at
       FROM workspace_state
       WHERE owner_id = ?
       LIMIT 1`,
    )
    .bind(ownerId)
    .first<WorkspaceRow>();

  if (!row) return null;

  return {
    state: JSON.parse(row.data_json) as unknown,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function writeWorkspace(ownerId: string, state: unknown) {
  const now = Date.now();
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database
    .prepare(
      `INSERT INTO workspace_state (owner_id, data_json, version, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(owner_id) DO UPDATE SET
         data_json = excluded.data_json,
         version = workspace_state.version + 1,
         updated_at = excluded.updated_at
       RETURNING version, updated_at`,
    )
    .bind(ownerId, JSON.stringify(state), now)
    .first<{ version: number; updated_at: number }>();

  if (!row) {
    throw new Error("The workspace could not be saved.");
  }

  return { version: row.version, updatedAt: row.updated_at };
}
