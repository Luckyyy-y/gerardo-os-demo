// Small D1 substitute used by the integration-contract tests. It intentionally
// implements only the SQL issued by db/workspace-store and db/integration-store.
class MemoryStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const sql = this.sql.toUpperCase();
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.startsWith("DELETE FROM WORKSPACE_STATE")) {
      this.database.rows.delete(this.values[0]);
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO WORKSPACE_STATE")) {
      const owner = this.values[0];
      if (!this.database.rows.has(owner)) {
        this.database.rows.set(owner, {
          data_json: this.values[1],
          version: 1,
          updated_at: this.values[2],
        });
      } else if (sql.includes("DO UPDATE")) {
        const row = this.database.rows.get(owner);
        row.data_json = this.values[1];
        row.version += 1;
        row.updated_at = this.values[2];
      }
      return { success: true };
    }
    if (sql.startsWith("UPDATE WORKSPACE_STATE")) {
      const owner = this.values[2];
      const row = this.database.rows.get(owner);
      if (row && row.version === this.values[3]) {
        row.data_json = this.values[0];
        row.updated_at = this.values[1];
        row.version += 1;
      }
      return { success: true };
    }
    throw new Error(`Unsupported test SQL: ${this.sql}`);
  }

  async first() {
    const sql = this.sql.toUpperCase();
    if (sql.startsWith("SELECT DATA_JSON")) {
      const row = this.database.rows.get(this.values[0]);
      return row ? { data_json: row.data_json, version: row.version, updated_at: row.updated_at } : null;
    }
    if (sql.startsWith("INSERT INTO WORKSPACE_STATE")) {
      const owner = this.values[0];
      if (this.database.rows.has(owner)) return null;
      this.database.rows.set(owner, { data_json: this.values[1], version: 1, updated_at: this.values[2] });
      return { version: 1 };
    }
    if (sql.startsWith("UPDATE WORKSPACE_STATE")) {
      const owner = this.values[2];
      const row = this.database.rows.get(owner);
      if (!row || row.version !== this.values[3]) return null;
      row.data_json = this.values[0];
      row.updated_at = this.values[1];
      row.version += 1;
      return { version: row.version };
    }
    throw new Error(`Unsupported test SQL: ${this.sql}`);
  }

  async all() {
    return { results: [] };
  }
}

class MemoryD1 {
  rows = new Map();
  prepare(sql) {
    return new MemoryStatement(this, sql);
  }
}

export const env = { DB: new MemoryD1() };
export function resetDb() {
  env.DB = new MemoryD1();
}
export function rawRow(owner) {
  return env.DB.rows.get(owner) || null;
}
