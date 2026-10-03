"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { BankSnapshot, BankTransaction } from "@/lib/banking";
import type { Transaction } from "@/lib/workspace";

type LinkHandler = { open(): void; destroy(): void };
type PlaidWindow = Window & { Plaid?: { create(options: { token: string; receivedRedirectUri?: string; onSuccess(token: string): void; onExit(error: { display_message?: string; error_message?: string } | null): void }): LinkHandler } };
let scriptPromise: Promise<void> | null = null;
async function loadLink() {
  if ((window as PlaidWindow).Plaid) return;
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js"; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error("Plaid’s connection window could not load. Check your connection and try again.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
async function bankRequest(body?: unknown) {
  const response = await fetch("/api/banking", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({ error: "Your sign-in expired. Reload the app and sign in again." }));
  if (!response.ok || data.error) {
    const error = new Error(data.error || "Bank connection failed.") as Error & { code?: string };
    error.code = data.code;
    throw error;
  }
  return data;
}
export function useBanking() {
  const [data, setData] = useState<BankSnapshot | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const dataRef = useRef(data); const running = useRef(false); const lastAttempt = useRef(0); const handlerRef = useRef<LinkHandler | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await bankRequest()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Banks could not be loaded."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const sync = useCallback(async (automatic = false) => {
    if (running.current) return; running.current = true; lastAttempt.current = Date.now(); setBusy(true);
    try {
      const next = await bankRequest({ action: "sync" }) as BankSnapshot; setData(next); setError("");
      if (!automatic) { const failed = next.items.filter(i => i.error).length; if (failed) toast.warning(`${failed} bank connection${failed === 1 ? " needs" : "s need"} attention`); else toast.success("Latest available bank data loaded"); }
    } catch (e) { const message = e instanceof Error ? e.message : "Bank sync failed."; setError(message); if (!automatic) toast.error(message); }
    finally { running.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    function refresh() { const current = dataRef.current; if (!current?.ready || !current.items.length || document.hidden || !navigator.onLine) return; const oldest = Math.min(...current.items.map(i => Date.parse(i.lastSyncedAt || "") || 0)); if (Date.now() - Math.max(oldest, lastAttempt.current) >= 15 * 60_000) void sync(true); }
    refresh(); const timer = setInterval(refresh, 60_000); document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
  }, [data?.ready, data?.items.length, sync]);
  const openLink = useCallback(async (linkToken: string, redirect?: string) => {
    await loadLink(); handlerRef.current?.destroy();
    const handler = (window as PlaidWindow).Plaid!.create({ token: linkToken, ...(redirect ? { receivedRedirectUri: redirect } : {}),
      onSuccess: publicToken => {
        setBusy(true);
        void bankRequest({ action: "exchange", publicToken }).then(next => { setData(next); setError(""); sessionStorage.removeItem("gerardo-plaid-link"); sessionStorage.removeItem("gerardo-plaid-link-created"); window.history.replaceState({}, "", window.location.pathname); toast.success("Bank connected", { description: "Initial transaction history may take a few minutes to arrive." }); }).catch(e => { setError(e.message); toast.error(e.message); }).finally(() => { setBusy(false); handler.destroy(); });
      },
      onExit: failure => { setBusy(false); if (failure) { const message = failure.display_message || "Bank sign-in was not completed. Try Connect bank again."; setError(message); toast.error(message); } handler.destroy(); },
    }); handlerRef.current = handler; handler.open();
  }, []);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("oauth_state_id")) return;
    const token = sessionStorage.getItem("gerardo-plaid-link"); const created = Number(sessionStorage.getItem("gerardo-plaid-link-created"));
    if (!token || !created || Date.now() - created > 30 * 60_000) { setError("The bank connection session expired. Select Connect bank again."); return; }
    setBusy(true); void openLink(token, window.location.href).catch(e => { setError(e.message); setBusy(false); });
  }, [openLink]);
  async function connect(itemId?: string) {
    if (busy) return; setBusy(true); setError("");
    try { const result = await bankRequest({ action: "link", itemId }); sessionStorage.setItem("gerardo-plaid-link", result.link_token); sessionStorage.setItem("gerardo-plaid-link-created", String(Date.now())); await openLink(result.link_token); }
    catch (e) { const message = e instanceof Error ? e.message : "Plaid could not open."; setError(message); toast.error(message); setBusy(false); }
  }
  async function disconnect(itemId: string) { setBusy(true); try { setData(await bankRequest({ action: "disconnect", itemId })); setError(""); toast.success("Bank disconnected"); } catch (e) { setError(e instanceof Error ? e.message : "Disconnect failed."); } finally { setBusy(false); } }
  return { data, busy, error, reload: load, sync, connect, disconnect };
}
type Banking = ReturnType<typeof useBanking>;
export function bankMoney(amount: number | null, currency = "USD") { if (amount === null) return "Unavailable"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; } }
export function BankConnections({ banking }: { banking: Banking }) {
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const { data, busy, error } = banking;
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4"><div className="flex flex-wrap items-start gap-3"><div className="flex-1"><h3 className="font-semibold flex items-center gap-2"><Link2 className="size-5 text-primary" /> Connected banks</h3><p className="mt-2 text-sm text-muted-foreground">Balances and transactions from each bank you authorize through Plaid.</p></div>{data?.ready && <div className="flex gap-2"><Button variant="outline" disabled={busy || !data.items.length} onClick={() => void banking.sync()}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync</Button><Button disabled={busy} onClick={() => void banking.connect()}>Connect bank</Button></div>}</div>
    {data?.environment === "sandbox" && data.ready && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Plaid test mode: connections and balances are test data. Production access is required for real accounts.</p>}
    {data && !data.ready && <div className="rounded-xl border border-white/10 p-4"><p className="font-medium">Bank connection settings need attention</p><p className="mt-2 text-sm text-muted-foreground">Cloudflare is missing: {data.missing.join(", ") || "an unknown setting"}. Your saved connection has not been deleted.</p>{data.otherEnvironmentItems > 0 && <p className="mt-2 text-sm text-amber-200">{data.otherEnvironmentItems} saved bank connection{data.otherEnvironmentItems === 1 ? " is" : "s are"} in the other Plaid environment. Set PLAID_ENV back to production to show your real accounts.</p>}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void banking.reload()}><RefreshCw /> Retry</Button><Button asChild size="sm" variant="outline"><a href="https://github.com/Luckyyy-y/gerardo-os-demo/blob/main/docs/connections.md" target="_blank" rel="noreferrer">Setup instructions <ExternalLink /></a></Button></div></div>}
    {!data && !error && <p className="text-sm text-muted-foreground">Checking bank connections…</p>}
    {error && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3"><p role="alert" className="min-w-0 flex-1 text-sm text-rose-300">{error}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => void banking.reload()}><RefreshCw /> Retry</Button></div>}
    {data?.ready && !data.items.length && data.otherEnvironmentItems > 0 && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Your saved bank connection is in the other Plaid environment. Cloudflare currently says {data.environment}; use production for your real accounts.</p>}
    {data?.ready && !data.items.length && data.otherEnvironmentItems === 0 && <p className="text-sm text-muted-foreground">No banks connected yet. Add each institution, then select the accounts you want to share.</p>}
    {data?.items.map(item => <div key={item.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap gap-3 justify-between"><div><p className="font-medium">{item.institution}</p><p className="mt-1 text-sm text-muted-foreground">{item.lastSyncedAt ? `Last checked ${new Date(item.lastSyncedAt).toLocaleString()}` : "Waiting for the first sync"}</p></div><div className="flex gap-2">{item.needsReconnect && <Button size="sm" variant="outline" disabled={busy} onClick={() => void banking.connect(item.id)}>Reconnect</Button>}<Button size="icon-sm" variant="ghost" disabled={busy} aria-label={`Disconnect ${item.institution}`} onClick={() => setRemove({ id: item.id, name: item.institution })}><Trash2 /></Button></div></div>{item.error && <p role="alert" className="mt-3 text-sm text-amber-200">{item.error}</p>}</div>)}
    {Boolean(data?.accounts.length) && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data!.accounts.map(account => <article key={account.id} className="rounded-xl border border-white/10 bg-background/40 p-4"><p className="text-sm font-medium">{account.name} {account.mask ? `••${account.mask}` : ""}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{account.subtype || account.type}</p><p className="mt-4 text-xl font-semibold">{bankMoney(account.current, account.currency)}</p><p className="mt-1 text-sm text-muted-foreground">{account.type === "credit" || account.type === "loan" ? "Balance owed" : "Current balance"}</p>{account.available !== null && <p className="mt-2 text-sm">Available: {bankMoney(account.available, account.currency)}</p>}{account.limit !== null && <p className="mt-1 text-sm">Limit: {bankMoney(account.limit, account.currency)}</p>}</article>)}</div>}
    <p className="text-sm text-muted-foreground">Refreshes when this tab opens and every 15 minutes while open. Banks supply updates on their own schedule. The dashboard shows up to 180 days of available transactions.</p>
    <AlertDialog open={Boolean(remove)} onOpenChange={open => { if (!open) setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect {remove?.name}?</AlertDialogTitle><AlertDialogDescription>This revokes this Plaid connection and removes its imported balances and transactions from Gerardo OS. Your manual entries stay.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (remove) void banking.disconnect(remove.id); setRemove(null); }}>Disconnect bank</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
export function TransactionActivity({ transactions }: { transactions: Array<Transaction | BankTransaction> }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const matches = transactions.filter(t => `${t.title} ${t.category}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.date.localeCompare(a.date));
  const maxPage = Math.max(0, Math.ceil(matches.length / 25) - 1); const current = Math.min(page, maxPage);
  return <div className="space-y-3"><Input aria-label="Search transactions" placeholder="Search transactions or categories" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><div className="max-h-[32rem] overflow-y-auto space-y-2">{matches.slice(current * 25, (current + 1) * 25).map(t => <div key={t.id} className="subtle-row items-start"><div className="flex-1 min-w-0"><p className="text-sm font-medium break-words">{t.title}</p><p className="text-sm mt-1 text-muted-foreground">{t.date} · {t.category}</p><div className="mt-1 flex gap-2"><Badge variant="outline">{t.source === "plaid" ? "Bank" : "Manual"}</Badge>{t.pending && <Badge variant="outline">Pending</Badge>}{t.isTransfer && <Badge variant="outline">Transfer</Badge>}</div></div><span className={`whitespace-nowrap text-sm font-medium ${t.type === "income" ? "text-emerald-300" : ""}`}>{t.type === "income" ? "+" : "−"}{bankMoney(t.amount, t.currency)}</span></div>)}{!matches.length && <p className="py-8 text-sm text-muted-foreground text-center">No transactions to show.</p>}</div><div className="flex gap-3 items-center justify-between text-sm text-muted-foreground"><span>{matches.length} transactions</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><span>{current + 1} / {maxPage + 1}</span><Button size="sm" variant="outline" disabled={current === maxPage} onClick={() => setPage(current + 1)}>Next</Button></div></div></div>;
}
