interface Fetcher {
  fetch(input: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    [key: string]: unknown;
  };
  // Test-only helpers are supplied by tests/cloudflare-workers-shim.mjs.
  // They are declared here so the contract tests can type-check against the
  // same module name used by Worker code.
  export function resetDb(): void;
  export function rawRow(owner: string): { data_json: string; version: number; updated_at: number } | null;
}
