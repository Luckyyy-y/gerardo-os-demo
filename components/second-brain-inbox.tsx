"use client";
import { useState, type FormEvent } from "react";
import { Archive, Check, Lightbulb, ListTodo, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDaysIso, makeId, type Capture, type WorkspaceState } from "@/lib/workspace";

const areas = ["University", "Cloud & security", "Career", "Finances", "Personal", "Creative"];
type Status = NonNullable<Capture["status"]>;
export function SecondBrainInbox({ workspace, onUpdate }: { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const [status, setStatus] = useState<Status>("inbox");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");
  const [edit, setEdit] = useState<Capture | null>(null);
  const visible = workspace.captures.filter(item => (item.status || "inbox") === status && (area === "all" || item.area === area) && `${item.text} ${item.kind} ${item.area || ""}`.toLowerCase().includes(search.toLowerCase()));
  const patch = (id: string, fields: Partial<Capture>) => onUpdate(current => ({ ...current, captures: current.captures.map(item => item.id === id ? { ...item, ...fields, updatedAt: new Date().toISOString() } : item) }));
  function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const text = String(new FormData(form).get("idea") || "").trim(); if (!text) return;
    onUpdate(current => ({ ...current, captures: [{ id: makeId("capture"), text, kind: /^https?:\/\//i.test(text) ? "link" : "idea", status: "inbox", createdAt: new Date().toISOString() }, ...current.captures] }));
    form.reset(); setStatus("inbox"); setSearch(""); setArea("all"); toast.success("Saved to your inbox");
  }
  function remove(item: Capture) {
    onUpdate(current => ({ ...current, captures: current.captures.filter(c => c.id !== item.id) }));
    toast("Idea deleted", { duration: 10_000, action: { label: "Undo", onClick: () => onUpdate(current => ({ ...current, captures: current.captures.some(c => c.id === item.id) ? current.captures : [item, ...current.captures] })) } });
  }
  function makeTask(item: Capture) {
    if (item.linkedTaskId && workspace.tasks.some(t => t.id === item.linkedTaskId)) { toast.info("This idea already has a task in Today."); return; }
    const id = makeId("task");
    onUpdate(current => ({ ...current, tasks: [...current.tasks, { id, title: item.text, due: addDaysIso(0), priority: "medium", status: "todo", area: item.area === "University" ? "academic" : item.area === "Career" ? "career" : item.area === "Finances" ? "finance" : "personal" }], captures: current.captures.map(c => c.id === item.id ? { ...c, status: "active", linkedTaskId: id } : c) }));
    toast.success("Task added to Today", { description: "The idea is now in Active. You can change the task’s date in the calendar." });
  }
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6 space-y-5">
    <form onSubmit={capture} className="flex gap-2 items-center"><Lightbulb className="size-5 shrink-0 text-primary" /><Input name="idea" required maxLength={8000} aria-label="Capture an idea" placeholder="An idea, question, note, or useful link…" className="h-12 text-base" /><Button type="submit"><Plus /><span className="hidden sm:inline">Capture</span></Button></form>
    <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search ideas" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find something you saved" /></div><Select value={area} onValueChange={setArea}><SelectTrigger aria-label="Filter ideas by area" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All areas</SelectItem>{areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
    <Tabs value={status} onValueChange={value => setStatus(value as Status)}><TabsList className="h-auto flex flex-wrap w-full justify-start">{(["inbox", "active", "done", "archived"] as Status[]).map(s => <TabsTrigger key={s} value={s} className="capitalize">{s} <span className="ml-1 text-muted-foreground">{workspace.captures.filter(i => (i.status || "inbox") === s).length}</span></TabsTrigger>)}</TabsList></Tabs>
    <div className="space-y-3">{visible.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-background/40 p-4">
      <div className="flex flex-wrap gap-2 mb-3"><Badge variant="outline" className="capitalize">{item.kind}</Badge>{item.area && <Badge variant="secondary">{item.area}</Badge>}{item.linkedTaskId && <Badge variant="outline">Task linked</Badge>}</div>
      <p className="whitespace-pre-wrap break-words text-base leading-7">{item.text}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setEdit({ ...item })}><Pencil /> Edit</Button>
        {status !== "archived" && <Button size="sm" variant="outline" onClick={() => makeTask(item)}><ListTodo /> {item.linkedTaskId ? "Task created" : "Make task"}</Button>}
        {status !== "done" && status !== "archived" && <Button size="sm" variant="ghost" onClick={() => patch(item.id, { status: "done" })}><Check /> Done</Button>}
        <Button size="sm" variant="ghost" onClick={() => patch(item.id, { status: status === "archived" ? "inbox" : "archived" })}>{status === "archived" ? <RotateCcw /> : <Archive />}{status === "archived" ? "Restore" : "Archive"}</Button>
        <Button size="sm" variant="ghost" className="text-rose-300 hover:text-rose-200 sm:ml-auto" aria-label={`Delete idea: ${item.text.slice(0, 60)}`} onClick={() => remove(item)}><Trash2 /> Delete</Button>
      </div>
    </article>)}{!visible.length && <div className="py-8 text-center"><Lightbulb className="mx-auto size-6 text-primary mb-3" /><p className="font-medium">{search || area !== "all" ? "No matching ideas" : `Nothing in ${status} yet`}</p><p className="mt-2 text-sm text-muted-foreground">{status === "inbox" ? "Capture a thought above, then give it an area or turn it into a task." : "Use the actions on an idea to move it here."}</p></div>}</div>
    <Dialog open={Boolean(edit)} onOpenChange={open => { if (!open) setEdit(null); }}><DialogContent><DialogHeader><DialogTitle>Edit your idea</DialogTitle><DialogDescription>Give it context so it is useful when you come back.</DialogDescription></DialogHeader>{edit && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!edit.text.trim()) return; patch(edit.id, { text: edit.text.trim(), area: edit.area, kind: edit.kind, status: edit.status || "inbox" }); setEdit(null); }}><Textarea aria-label="Idea text" required maxLength={8000} rows={6} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} /><Select value={edit.area || "none"} onValueChange={value => setEdit({ ...edit, area: value === "none" ? undefined : value })}><SelectTrigger aria-label="Idea area"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No area yet</SelectItem>{areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select><Select value={edit.kind} onValueChange={kind => setEdit({ ...edit, kind: kind as Capture["kind"] })}><SelectTrigger aria-label="Idea type"><SelectValue /></SelectTrigger><SelectContent>{["idea", "link", "question"].map(k => <SelectItem value={k} key={k}>{k}</SelectItem>)}</SelectContent></Select><Select value={edit.status || "inbox"} onValueChange={s => setEdit({ ...edit, status: s as Status })}><SelectTrigger aria-label="Idea status"><SelectValue /></SelectTrigger><SelectContent>{["inbox", "active", "done", "archived"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button type="submit" className="w-full">Save idea</Button></form>}</DialogContent></Dialog>
  </section>;
}
