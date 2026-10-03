"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankSnapshot, BankTransaction } from "@/lib/banking";
import type { Transaction } from "@/lib/workspace";
export function useBanking() {
  return { data: null as BankSnapshot | null, busy: false, error: "", reload: async () => {}, sync: async () => {}, connect: async (_itemId?: string) => {}, disconnect: async (_itemId: string) => {} };
}
export function bankMoney(amount: number | null, currency = "USD") { if (amount === null) return "Unavailable"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; } }
export function BankConnections({ banking: _banking }: { banking: ReturnType<typeof useBanking> }) {
  return <section className="rounded-2xl border border-white/10 p-5"><h3 className="font-semibold">Sample finances</h3><p className="mt-2 text-sm text-muted-foreground">All amounts are fictional. Manual entries work locally; live bank connections are disabled in this demo. The private integration source is documented in the repository.</p></section>;
}
export function TransactionActivity({ transactions }: { transactions: Array<Transaction | BankTransaction> }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const matches = transactions.filter(t => `${t.title} ${t.category}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.date.localeCompare(a.date));
  const maxPage = Math.max(0, Math.ceil(matches.length / 25) - 1); const current = Math.min(page, maxPage);
  return <div className="space-y-3"><Input aria-label="Search transactions" placeholder="Search transactions or categories" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><div className="max-h-[32rem] overflow-y-auto space-y-2">{matches.slice(current * 25, (current + 1) * 25).map(t => <div key={t.id} className="subtle-row items-start"><div className="flex-1 min-w-0"><p className="text-sm font-medium break-words">{t.title}</p><p className="text-sm mt-1 text-muted-foreground">{t.date} · {t.category}</p><div className="mt-1 flex gap-2"><Badge variant="outline">{t.source === "plaid" ? "Bank" : "Manual"}</Badge>{t.pending && <Badge variant="outline">Pending</Badge>}{t.isTransfer && <Badge variant="outline">Transfer</Badge>}</div></div><span className={`whitespace-nowrap text-sm font-medium ${t.type === "income" ? "text-emerald-300" : ""}`}>{t.type === "income" ? "+" : "−"}{bankMoney(t.amount, t.currency)}</span></div>)}{!matches.length && <p className="py-8 text-sm text-muted-foreground text-center">No transactions to show.</p>}</div><div className="flex gap-3 items-center justify-between text-sm text-muted-foreground"><span>{matches.length} transactions</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><span>{current + 1} / {maxPage + 1}</span><Button size="sm" variant="outline" disabled={current === maxPage} onClick={() => setPage(current + 1)}>Next</Button></div></div></div>;
}
