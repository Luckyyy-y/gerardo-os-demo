import { env } from "cloudflare:workers";
import { AppError } from "./http";
import { readIntegration, writeIntegration, encryptionConfigured } from "../../db/integration-store";
import { applyTransactionPage, type BankAccount, type BankSnapshot, type BankTransaction, type PlaidTransaction } from "../banking";

type Item = { id: string; token: string; institution: string; cursor?: string; accounts: BankAccount[]; lastSyncedAt: string | null; error?: string; errorCode?: string; environment: string };
type Vault = { items: Item[]; transactions: BankTransaction[]; link?: { createdAt: number; itemId?: string } };
export class PlaidError extends AppError { constructor(public plaidCode: string, message: string) { super(message, 502, plaidCode); } }
export function bankConfig() {
  const environment = env.PLAID_ENV === "production" ? "production" : "sandbox";
  const missing = [!env.PLAID_CLIENT_ID && "PLAID_CLIENT_ID", !env.PLAID_SECRET && "PLAID_SECRET", !encryptionConfigured() && "INTEGRATION_ENCRYPTION_KEY", env.PLAID_ENV !== "production" && env.PLAID_ENV !== "sandbox" && "PLAID_ENV"].filter(Boolean) as string[];
  return { ready: !missing.length, environment, missing } as const;
}
function checkConfig() { if (!bankConfig().ready) throw new AppError("Bank connection setup is incomplete. Open the setup instructions to enable Plaid.", 503, "SETUP_REQUIRED"); }
export async function plaid<T>(path: string, body: object): Promise<T> {
  checkConfig();
  const response = await fetch(`https://${bankConfig().environment}.plaid.com${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Plaid-Version": "2020-09-14" }, body: JSON.stringify({ ...body, client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET }), signal: AbortSignal.timeout(25_000) });
  const result = await response.json() as T & { error_code?: string };
  if (!response.ok) {
    const code = result.error_code || "PLAID_UNAVAILABLE";
    const messages: Record<string, string> = {
      ITEM_LOGIN_REQUIRED: "Your bank needs you to sign in again. Choose Reconnect.",
      INSTITUTION_DOWN: "The bank is temporarily unavailable. Try again later.",
      INSTITUTION_NOT_RESPONDING: "The bank is not responding. Try again later.",
      INVALID_API_KEYS: "The Plaid credentials do not match this environment. Check the server setup.",
      INVALID_PRODUCT: "Enable Transactions for this Plaid application before connecting.",
      PRODUCT_NOT_ENABLED: "Transactions access is not enabled for this Plaid account.",
      INVALID_LINK_TOKEN: "This connection session expired. Start Connect bank again.",
      INVALID_PUBLIC_TOKEN: "This bank connection session expired. Start Connect bank again.",
      RATE_LIMIT_EXCEEDED: "Plaid is limiting requests. Wait a few minutes before syncing again.",
    };
    throw new PlaidError(code, messages[code] || "Plaid could not complete the request. Try again, or check the Plaid application’s product access.");
  }
  return result;
}
async function vaultFor(owner: string) { const record = await readIntegration<Vault>(owner, "plaid"); return { data: record?.data || { items: [], transactions: [] }, version: record?.version || 0 }; }
function view(data: Vault): BankSnapshot {
  const config = bankConfig(); const items = data.items.filter(i => i.environment === config.environment);
  return { ...config, historyDays: 180, otherEnvironmentItems: data.items.length - items.length, items: items.map(i => ({ id: i.id, institution: i.institution, lastSyncedAt: i.lastSyncedAt, error: i.error, needsReconnect: i.errorCode === "ITEM_LOGIN_REQUIRED" })), accounts: items.flatMap(i => i.accounts), transactions: data.transactions.filter(t => items.some(i => i.id === t.itemId)) };
}
export async function getBanks(owner: string) {
  if (!encryptionConfigured()) return view({ items: [], transactions: [] });
  return view((await vaultFor(owner)).data);
}
export async function createBankLink(owner: string, origin: string, itemId?: string) {
  checkConfig(); const record = await vaultFor(owner); const item = itemId ? record.data.items.find(i => i.id === itemId && i.environment === bankConfig().environment) : undefined;
  if (itemId && !item) throw new AppError("This bank connection was not found.", 404);
  if (!item && record.data.items.length >= 12) throw new AppError("Disconnect an unused bank before adding another.");
  const result = await plaid<{link_token: string; expiration: string}>("/link/token/create", { user: { client_user_id: owner }, client_name: "Gerardo OS", language: "en", country_codes: ["US"], redirect_uri: `${origin}/`, ...(item ? { access_token: item.token } : { products: ["transactions"], transactions: { days_requested: 180 } }) });
  await writeIntegration(owner, "plaid", { ...record.data, link: { createdAt: Date.now(), itemId } }, record.version);
  return result;
}
export async function exchangeBank(owner: string, publicToken: string) {
  const record = await vaultFor(owner);
  if (!record.data.link || Date.now() - record.data.link.createdAt > 30 * 60_000) throw new AppError("Start a new bank connection session.");
  if (record.data.link.itemId) {
    const item = record.data.items.find(i => i.id === record.data.link?.itemId);
    if (!item) throw new AppError("This bank connection was not found.", 404);
    item.error = undefined; item.errorCode = undefined;
    await writeIntegration(owner, "plaid", { ...record.data, link: undefined }, record.version);
    return syncBanks(owner);
  }
  const exchanged = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
  try {
    const info = await plaid<{item: {institution_id?: string; institution_name?: string}}>("/item/get", { access_token: exchanged.access_token });
    let institution = info.item.institution_name || "Connected bank";
    if (info.item.institution_id) { try { const details = await plaid<{institution: {name: string}}>("/institutions/get_by_id", { institution_id: info.item.institution_id, country_codes: ["US"] }); institution = details.institution.name; } catch { /* account names still identify the bank */ } }
    const latest = await vaultFor(owner);
    const item: Item = { id: exchanged.item_id, token: exchanged.access_token, institution, accounts: [], lastSyncedAt: null, environment: bankConfig().environment };
    await writeIntegration(owner, "plaid", { ...latest.data, items: [...latest.data.items.filter(i => i.id !== item.id), item], link: undefined }, latest.version);
  } catch (error) { await plaid("/item/remove", { access_token: exchanged.access_token }).catch(() => undefined); throw error; }
  return syncBanks(owner);
}
type ApiAccount = { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; balances: { current: number | null; available: number | null; limit?: number | null; iso_currency_code?: string | null } };
type SyncPage = { added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: Array<{transaction_id: string}>; next_cursor: string; has_more: boolean };
export async function syncBanks(owner: string) {
  checkConfig(); const record = await vaultFor(owner);
  const data: Vault = structuredClone(record.data);
  for (const item of data.items.filter(i => i.environment === bankConfig().environment)) {
    try {
      const accounts = await plaid<{accounts: ApiAccount[]}>("/accounts/get", { access_token: item.token });
      item.accounts = accounts.accounts.map(a => ({ id: a.account_id, itemId: item.id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype, current: a.balances.current, available: a.balances.available, limit: a.balances.limit ?? null, currency: a.balances.iso_currency_code || "USD" }));
      const startCursor = item.cursor; const startTransactions = data.transactions;
      for (let attempt = 0; attempt < 2; attempt++) {
        let cursor = startCursor; let transactions = startTransactions; let more = true;
        try {
          for (let page = 0; more && page < 30; page++) {
            const result = await plaid<SyncPage>("/transactions/sync", { access_token: item.token, ...(cursor ? { cursor } : {}), count: 500 });
            transactions = applyTransactionPage(transactions, result.added, result.modified, result.removed, item.id);
            cursor = result.next_cursor; more = result.has_more;
          }
          if (more) throw new AppError("This bank returned more transaction pages than the current sync limit. The previous sync is preserved.", 502);
          data.transactions = transactions; item.cursor = cursor; break;
        } catch (error) { if (error instanceof PlaidError && error.plaidCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt === 0) continue; throw error; }
      }
      item.lastSyncedAt = new Date().toISOString(); item.error = undefined; item.errorCode = undefined;
    } catch (error) { item.error = error instanceof AppError ? error.message : "This bank could not be synced. Try again later."; item.errorCode = error instanceof PlaidError ? error.plaidCode : "SYNC_FAILED"; }
  }
  const cutoff = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0,10);
  data.transactions = data.transactions.filter(t => t.date >= cutoff);
  if (JSON.stringify(data).length > 1_000_000) throw new AppError("The bank history is larger than the current storage limit. Your previous data and sync cursor are preserved.", 413);
  await writeIntegration(owner, "plaid", data, record.version);
  return view(data);
}
export async function disconnectBank(owner: string, itemId: string) {
  const record = await vaultFor(owner); const item = record.data.items.find(i => i.id === itemId && i.environment === bankConfig().environment);
  if (!item) throw new AppError("This bank connection was not found.", 404);
  await plaid("/item/remove", { access_token: item.token });
  // Read again after the external operation to preserve unrelated device updates.
  const latest = await vaultFor(owner);
  await writeIntegration(owner, "plaid", { ...latest.data, items: latest.data.items.filter(i => i.id !== itemId), transactions: latest.data.transactions.filter(t => t.itemId !== itemId) }, latest.version);
  return view({ ...latest.data, items: latest.data.items.filter(i => i.id !== itemId), transactions: latest.data.transactions.filter(t => t.itemId !== itemId) });
}
