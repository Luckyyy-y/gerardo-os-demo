"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, Link2, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeCanvas, parseCanvasCalendar, type CanvasImport } from "@/lib/canvas";
import type { WorkspaceState } from "@/lib/workspace";

type Props = { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void };
export async function canvasRequest(body: unknown) {
  const response = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: "Your sign-in expired. Reload the app and sign in again." }));
  if (!response.ok || data.error) throw new Error(data.error || "Canvas sync failed."); return data;
}
export function CanvasConnection({ workspace, onUpdate }: Props) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState(workspace.settings.canvasFeedUrl || "");
  const [error, setError] = useState(""); const [serverBlocked, setServerBlocked] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const timeZone = workspace.settings.canvasTimeZone || "America/Chicago";
  const savedFeed = feed.trim().replace(/^webcal:/i, "https:");

  function finishImport(imported: CanvasImport, autoSync: boolean) {
    onUpdate(current => mergeCanvas({
      ...current,
      settings: {
        ...current.settings,
        canvasFeedUrl: feed.trim(),
        canvasAutoSync: autoSync,
        canvasLastSyncError: undefined,
      },
    }, imported));
    toast.success(`${imported.courses.length} courses and ${imported.assignments.length} assignments synced`, {
      description: imported.warnings.length ? "Some Canvas items could not be read. See the sync details." : "Existing due dates and assignment details are updated.",
    });
  }

  async function sync() {
    setBusy(true); setError("");
    try {
      const imported = await canvasRequest({ action: "sync", feedUrl: feed.trim(), timeZone }) as CanvasImport;
      setServerBlocked(false);
      finishImport(imported, workspace.settings.canvasAutoSync ?? true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Canvas sync failed.";
      if (/HTTP 406/i.test(message)) {
        const blockedMessage = "UH is blocking automatic Canvas sync from Cloudflare. Download the calendar file below, then import it into Gerardo OS.";
        setServerBlocked(true); setOpen(true); setError(blockedMessage);
        onUpdate(current => ({
          ...current,
          settings: { ...current.settings, canvasFeedUrl: feed.trim(), canvasAutoSync: false, canvasLastSyncError: blockedMessage },
        }));
        toast.error("UH blocked the automatic Canvas request", { description: "Use the calendar-file import in Canvas settings." });
      } else {
        setError(message);
        onUpdate(current => ({ ...current, settings: { ...current.settings, canvasLastSyncError: message } }));
        toast.error(message);
      }
    } finally { setBusy(false); }
  }

  async function importCalendarFile(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      if (file.size > 4_000_000) throw new Error("This Canvas calendar file is too large.");
      const imported = parseCanvasCalendar(await file.text(), timeZone);
      setServerBlocked(true);
      finishImport(imported, false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The Canvas calendar file could not be read.";
      setError(message);
      onUpdate(current => ({ ...current, settings: { ...current.settings, canvasLastSyncError: message } }));
      toast.error(message);
    } finally { setBusy(false); }
  }

  function openCalendarFeed() {
    try {
      const url = new URL(savedFeed);
      if (url.protocol !== "https:" || (url.hostname !== "canvas.uh.edu" && !url.hostname.endsWith(".instructure.com"))) {
        throw new Error();
      }
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      setError("Paste your private Canvas calendar link first.");
    }
  }

  return <><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void sync()}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync Canvas</Button><Button variant="outline" onClick={() => setOpen(true)}><Link2 /> Canvas settings</Button></div>
    {error && !open && <p role="alert" className="basis-full text-sm text-rose-300 max-w-lg">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Sync Canvas calendar</DialogTitle><DialogDescription>UH does not allow a student API token here, so Gerardo OS uses your private Canvas calendar feed only.</DialogDescription></DialogHeader>
      <div className="space-y-5"><section className="space-y-3"><h3 className="font-semibold">Private calendar feed</h3><p className="text-sm text-muted-foreground">In Canvas, open Calendar → Calendar Feed and copy the private .ics link. The feed contains events and assignments from your enabled Canvas calendars.</p><Input value={feed} onChange={e => setFeed(e.target.value)} aria-label="Canvas calendar feed" placeholder="https://canvas.uh.edu/feeds/calendars/….ics" />
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !feed.trim()} onClick={() => void sync()}>{serverBlocked ? "Retry automatic sync" : "Save & sync calendar"}</Button><Button variant="outline" disabled={!savedFeed} onClick={openCalendarFeed}><ExternalLink /> Open/download latest .ics</Button><input ref={fileInput} className="sr-only" type="file" accept=".ics,text/calendar,text/plain" aria-label="Choose a Canvas calendar file" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importCalendarFile(file); }} /><Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Upload /> Import downloaded .ics</Button></div>
      {(serverBlocked || /406/.test(error)) && <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6"><p className="font-medium text-amber-100">UH is rejecting Cloudflare’s automatic request. Your Canvas link can still be valid.</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground"><li>Select <strong className="text-foreground">Open/download latest .ics</strong>.</li><li>Save the calendar file if your browser opens it as text.</li><li>Return here and select <strong className="text-foreground">Import downloaded .ics</strong>.</li></ol></div>}
      <p className="text-xs leading-5 text-muted-foreground">The downloaded-file method reads the calendar inside your browser and never sends it through the blocked Cloudflare-to-UH connection.</p></section>
      <div className="flex justify-between gap-4 items-center border-t border-white/10 pt-4"><div><p className="text-sm">Sync on open and every 15 minutes while the app is open</p>{serverBlocked && <p className="mt-1 text-xs text-muted-foreground">Turn this back on only if UH starts accepting automatic requests again.</p>}</div><Switch aria-label="Automatic Canvas sync" checked={workspace.settings.canvasAutoSync ?? true} onCheckedChange={checked => onUpdate(current => ({ ...current, settings: { ...current.settings, canvasAutoSync: checked } }))} /></div>
      <p className="text-sm text-muted-foreground">Dates use {timeZone}. Imported items link back to Canvas; changes here do not submit work or change Canvas. Calendar feeds do not include Canvas To Do items or course materials.</p>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}</div>
    </DialogContent></Dialog></>;
}

export function CanvasAutoSync({ workspace, onUpdate, ready }: Props & { ready: boolean }) {
  const ref = useRef(workspace); const running = useRef(false); const attempted = useRef(0);
  useEffect(() => { ref.current = workspace; }, [workspace]);
  useEffect(() => {
    if (!ready) return;
    async function sync() {
      const current = ref.current;
      if (current.settings.canvasAutoSync === false || running.current || document.hidden || !navigator.onLine) return;
      if (!current.settings.canvasFeedUrl) return;
      if (Date.now() - Math.max(attempted.current, Date.parse(current.canvas?.lastSyncedAt || "") || 0) < 15 * 60_000) return;
      running.current = true; attempted.current = Date.now();
      try { const data = await canvasRequest({ action: "sync", feedUrl: current.settings.canvasFeedUrl, timeZone: current.settings.canvasTimeZone || "America/Chicago" }) as CanvasImport; onUpdate(latest => mergeCanvas({ ...latest, settings: { ...latest.settings, canvasLastSyncError: undefined } }, data)); }
      catch (e) {
        const message = e instanceof Error ? e.message : "Use Sync Canvas in Academics to retry.";
        if (/HTTP 406/i.test(message)) {
          onUpdate(latest => ({ ...latest, settings: { ...latest.settings, canvasAutoSync: false, canvasLastSyncError: "UH is blocking automatic Canvas sync from Cloudflare. Use the calendar-file import in Canvas settings." } }));
          toast.error("UH blocked automatic Canvas sync", { description: "Use Import downloaded .ics in Canvas settings." });
        } else {
          onUpdate(latest => ({ ...latest, settings: { ...latest.settings, canvasLastSyncError: message } }));
          toast.error("Canvas could not auto-sync", { description: message });
        }
      } finally { running.current = false; }
    }
    void sync(); const timer = window.setInterval(() => void sync(), 60_000); const visible = () => { if (!document.hidden) void sync(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, [ready, onUpdate]);
  return null;
}
export function CanvasMaterials({ workspace }: { workspace: WorkspaceState }) {
  if (!workspace.canvas) return null;
  const data = workspace.canvas; const code = (id: string) => workspace.courses.find(c => c.id === id)?.code || "Canvas";
  return <section className="space-y-4"><div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground"><p>Last Canvas sync: {new Date(data.lastSyncedAt).toLocaleString()} · {data.mode === "api" ? "Account connection" : "Calendar feed"}</p>{data.warnings.map(w => <p className="mt-2 text-amber-200" key={w}>{w}</p>)}</div>{data.mode === "api" && <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 p-5"><h3 className="font-semibold mb-4">Announcements</h3>{data.announcements.length ? <div className="max-h-96 overflow-y-auto space-y-3">{data.announcements.map(item => <a key={item.id} href={/^https:\/\//.test(item.url) ? item.url : "#"} target="_blank" rel="noreferrer" className="subtle-row"><div className="flex-1 min-w-0"><p className="text-sm text-primary">{code(item.courseId)}</p><p className="text-base">{item.title}</p></div><ExternalLink className="size-4 shrink-0" /></a>)}</div> : <p className="text-sm text-muted-foreground">No announcements returned by Canvas.</p>}</div><div className="rounded-2xl border border-white/10 p-5"><h3 className="font-semibold mb-4">Class modules & resources</h3><div className="max-h-96 overflow-y-auto space-y-4">{data.modules.map(module => <details key={module.id} className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm"><span className="text-primary">{code(module.courseId)}</span> · {module.title}</summary><div className="mt-3 space-y-2">{module.items.map(item => <a key={item.id} href={/^https:\/\//.test(item.url) ? item.url : "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:text-primary"><BookOpen className="size-4 shrink-0" />{item.title}</a>)}</div></details>)}{!data.modules.length && <p className="text-sm text-muted-foreground">No modules returned by Canvas.</p>}</div></div></div>}</section>;
}
