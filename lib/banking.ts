import type { Transaction } from "./workspace";
export type BankAccount = { id: string; itemId: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; limit: number | null; currency: string };
export type BankTransaction = Transaction & { source: "plaid"; itemId: string; isRefund?: boolean };
export type BankItem = { id: string; institution: string; lastSyncedAt: string | null; error?: string; needsReconnect: boolean };
export type BankSnapshot = { ready: boolean; environment: "sandbox" | "production"; missing: string[]; items: BankItem[]; otherEnvironmentItems: number; accounts: BankAccount[]; transactions: BankTransaction[]; historyDays: number; error?: string };
export type PlaidTransaction = { transaction_id: string; account_id: string; name: string; merchant_name?: string | null; amount: number; date: string; pending: boolean; pending_transaction_id?: string | null; iso_currency_code?: string | null; unofficial_currency_code?: string | null; personal_finance_category?: { primary?: string; detailed?: string } | null };
export function normalizeBankTransaction(t: PlaidTransaction, itemId: string): BankTransaction {
  const primary = t.personal_finance_category?.primary || "OTHER";
  const detail = t.personal_finance_category?.detailed || primary;
  const isTransfer = primary.startsWith("TRANSFER_") || detail.includes("CREDIT_CARD_PAYMENT");
  return { id: `plaid-${t.transaction_id}`, itemId, accountId: t.account_id, source: "plaid", title: t.merchant_name || t.name, amount: Math.abs(t.amount), type: t.amount < 0 ? "income" : "expense", category: detail.toLowerCase().replace(/_/g, " "), date: t.date, pending: t.pending, currency: t.iso_currency_code || t.unofficial_currency_code || "USD", isTransfer, isRefund: t.amount < 0 && primary !== "INCOME" && !isTransfer };
}
export function applyTransactionPage(current: BankTransaction[], added: PlaidTransaction[], modified: PlaidTransaction[], removed: Array<{transaction_id: string}>, itemId: string) {
  const map = new Map(current.map(t => [t.id, t]));
  for (const row of removed) map.delete(`plaid-${row.transaction_id}`);
  for (const row of [...added, ...modified]) {
    if (row.pending_transaction_id) map.delete(`plaid-${row.pending_transaction_id}`);
    const normalized = normalizeBankTransaction(row, itemId); map.set(normalized.id, normalized);
  }
  return [...map.values()];
}
export function financeTotals(transactions: Array<Transaction & { isRefund?: boolean }>, month: string) {
  const rows = transactions.filter(t => t.date.startsWith(month) && !t.pending && !t.isTransfer && (!t.currency || t.currency === "USD"));
  return { expenses: rows.reduce((sum, t) => sum + (t.type === "expense" ? t.amount : t.isRefund ? -t.amount : 0), 0), income: rows.filter(t => t.type === "income" && !t.isRefund).reduce((sum, t) => sum + t.amount, 0) };
}
