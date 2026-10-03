import { env } from "cloudflare:workers";
import { readWorkspace, writeWorkspace } from "./workspace-store";
import { AppError } from "../lib/server/http";

// Provider records are separate from the browser-editable workspace. Reuse the
// existing D1 table without changing its schema or exposing these owner keys.
function recordKey(owner: string, provider: string) { return `integration:v1:${owner}:${provider}`; }
export function encryptionConfigured() {
  return typeof env.INTEGRATION_ENCRYPTION_KEY === "string" && /^[a-fA-F0-9]{64}$/.test(env.INTEGRATION_ENCRYPTION_KEY);
}
async function key() {
  if (!encryptionConfigured()) throw new AppError("Secure connection storage needs setup. Follow the connection setup instructions.", 503, "SETUP_REQUIRED");
  const bytes = new Uint8Array((env.INTEGRATION_ENCRYPTION_KEY as string).match(/../g)!.map(x => parseInt(x, 16)));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function readIntegration<T>(owner: string, provider: string) {
  const record = await readWorkspace(recordKey(owner, provider));
  if (!record) return null;
  const envelope = record.state as { iv: string; ciphertext: string };
  if (!envelope.ciphertext) return null;
  const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv), additionalData: new TextEncoder().encode(recordKey(owner, provider)) }, await key(), decode(envelope.ciphertext));
  } catch {
    throw new AppError(
      "The saved bank connection cannot be unlocked with the current INTEGRATION_ENCRYPTION_KEY. Restore the original key in Cloudflare, then reload Finance.",
      409,
      "INTEGRATION_DECRYPT_FAILED",
    );
  }
  return { data: JSON.parse(new TextDecoder().decode(plaintext)) as T, version: record.version };
}
export async function writeIntegration(owner: string, provider: string, data: unknown, expectedVersion?: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(recordKey(owner, provider)) }, await key(), new TextEncoder().encode(JSON.stringify(data))));
  const encode = (bytes: Uint8Array) => { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
  const envelope = { schemaVersion: 1, iv: encode(iv), ciphertext: encode(ciphertext) };
  if (expectedVersion === undefined) return writeWorkspace(recordKey(owner, provider), envelope);
  const now = Date.now();
  // Compare-and-swap prevents overlapping device syncs from losing a bank cursor.
  const result = expectedVersion === 0
    ? await env.DB.prepare("INSERT INTO workspace_state (owner_id,data_json,version,updated_at) VALUES (?,?,1,?) ON CONFLICT(owner_id) DO NOTHING RETURNING version").bind(recordKey(owner, provider), JSON.stringify(envelope), now).first<{version:number}>()
    : await env.DB.prepare("UPDATE workspace_state SET data_json=?,version=version+1,updated_at=? WHERE owner_id=? AND version=? RETURNING version").bind(JSON.stringify(envelope), now, recordKey(owner, provider), expectedVersion).first<{version:number}>();
  if (!result) throw new AppError("Another device updated this connection. Refresh and try again.", 409, "CONFLICT");
  return { version: result.version, updatedAt: now };
}
export async function deleteIntegration(owner: string, provider: string) {
  await env.DB.prepare("DELETE FROM workspace_state WHERE owner_id=?").bind(recordKey(owner, provider)).run();
}
