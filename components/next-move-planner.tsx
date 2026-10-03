"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gauge,
  ListTodo,
  Play,
  Plus,
  Repeat2,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addDaysIso, type Task, type TaskDifficulty, type TaskEnergy, type TaskKind, type TaskRecurrence, type WorkspaceState } from "@/lib/workspace";
import { rankTasks, taskDefaults } from "@/lib/planner";

const minuteChoices = [15, 30, 45, 60, 90, 120];

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function kindLabel(kind: TaskKind) {
  if (kind === "assignment") return "Assignment";
  if (kind === "study") return "Study / certification";
  if (kind === "chore") return "Chore / home";
  return "General";
}

function difficultyLabel(value: TaskDifficulty) {
  if (value === 3) return "Hard";
  if (value === 2) return "Medium";
  return "Easy";
}

function dueLabel(value: string) {
  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return "No date";
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(due);
}

type PlannerProps = {
  workspace: WorkspaceState;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
  onComplete: (taskId: string) => void;
  onStartFocus: (task: Task, minutes: number) => void;
  onOpenQuickAdd: () => void;
};

export function NextMovePlanner({ workspace, onUpdate, onComplete, onStartFocus, onOpenQuickAdd }: PlannerProps) {
  const [availableMinutes, setAvailableMinutes] = useState(45);
  const [energy, setEnergy] = useState<TaskEnergy>("medium");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const recommendations = useMemo(
    () => rankTasks(workspace.tasks, { availableMinutes, energy }),
    [workspace.tasks, availableMinutes, energy],
  );
  const selected = recommendations.find((item) => item.task.id === selectedId) ?? recommendations[0];
  const recurring = workspace.tasks
    .filter((task) => task.recurrence && task.status !== "done")
    .sort((a, b) => a.due.localeCompare(b.due));

  useEffect(() => {
    if (selectedId && !recommendations.some((item) => item.task.id === selectedId)) setSelectedId(null);
  }, [recommendations, selectedId]);

  const tuneTask = (taskId: string, patch: Partial<Task>) => {
    onUpdate((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task),
    }));
  };

  const chooseEasier = () => {
    if (!selected || recommendations.length < 2) return;
    const easier = recommendations.find((item) =>
      item.task.id !== selected.task.id
      && item.difficulty <= selected.difficulty
      && item.estimatedMinutes <= availableMinutes,
    ) ?? recommendations.find((item) => item.task.id !== selected.task.id);
    if (easier) {
      setSelectedId(easier.task.id);
      setShowWhy(false);
    }
  };

  const snooze = (taskId: string) => {
    tuneTask(taskId, { snoozedUntil: `${addDaysIso(1)}T00:00:00` });
    setSelectedId(null);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Next Move</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Choose the right task for the time and energy you have.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Your deadlines, difficulty, priority, recurring responsibilities, and current capacity decide the order. No paid AI is involved.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[25rem]">
            <label className="text-sm font-medium">Time available
              <Select value={String(availableMinutes)} onValueChange={(value) => setAvailableMinutes(Number(value))}>
                <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{minuteChoices.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium">Energy right now
              <Select value={energy} onValueChange={(value) => setEnergy(value as TaskEnergy)}>
                <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
              </Select>
            </label>
          </div>
        </div>
      </section>

      {!selected ? (
        <section className="grid min-h-72 place-items-center rounded-[1.4rem] border border-dashed border-white/10 p-8 text-center">
          <div>
            <CheckCircle2 className="mx-auto size-7 text-emerald-300" />
            <h2 className="mt-4 text-lg font-semibold">Your queue is clear</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Add an assignment, study session, or recurring responsibility and Next Move will rank it.</p>
            <Button className="mt-5" onClick={onOpenQuickAdd}><Plus /> Add a task</Button>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="relative overflow-hidden rounded-[1.4rem] border border-primary/25 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_42%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018))] p-5 sm:p-7 xl:col-span-8">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-primary/25 bg-primary/10 text-primary"><Sparkles className="size-3.5" /> Best next move</Badge>
                  <Badge variant="outline">{kindLabel(selected.kind)}</Badge>
                </div>
                <span className={cn("text-sm font-medium", selected.task.due < addDaysIso(0) ? "text-rose-300" : "text-muted-foreground")}>{dueLabel(selected.task.due)}</span>
              </div>

              <h2 className="mt-6 max-w-3xl text-2xl font-semibold tracking-[-0.035em] sm:text-4xl">{selected.task.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.reasons[0] ?? "This is the strongest fit for your current plan."}</p>

              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5"><Clock3 className="size-4 text-primary" />{selected.estimatedMinutes} min</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5"><Gauge className="size-4 text-primary" />{difficultyLabel(selected.difficulty)}</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5"><Zap className="size-4 text-primary" />{titleCase(selected.energy)} energy</span>
                {selected.task.recurrence && <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5"><Repeat2 className="size-4 text-primary" />{titleCase(selected.task.recurrence)}</span>}
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <Button onClick={() => onStartFocus(selected.task, Math.min(selected.estimatedMinutes, availableMinutes))}><Play /> Start {Math.min(selected.estimatedMinutes, availableMinutes)}m focus</Button>
                <Button variant="secondary" onClick={() => onComplete(selected.task.id)}><CheckCircle2 /> Complete</Button>
                <Button variant="outline" onClick={chooseEasier}>Something easier</Button>
                <Button variant="ghost" onClick={() => setShowWhy((value) => !value)}>Why this?</Button>
                <Button variant="ghost" onClick={() => snooze(selected.task.id)}>Not today</Button>
              </div>

              {showWhy && (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm font-medium">Why it ranked first</p>
                  <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    {selected.reasons.map((reason) => <li key={reason} className="flex items-start gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />{reason}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-7 border-t border-white/10 pt-5">
                <p className="text-sm font-medium">Adjust how the planner sees this task</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Select value={selected.kind} onValueChange={(value) => tuneTask(selected.task.id, { kind: value as TaskKind })}>
                    <SelectTrigger className="w-full" aria-label="Task purpose"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="assignment">Assignment</SelectItem><SelectItem value="study">Study / certification</SelectItem><SelectItem value="chore">Chore / home</SelectItem></SelectContent>
                  </Select>
                  <Select value={String(selected.difficulty)} onValueChange={(value) => tuneTask(selected.task.id, { difficulty: Number(value) as TaskDifficulty })}>
                    <SelectTrigger className="w-full" aria-label="Task difficulty"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">Easy</SelectItem><SelectItem value="2">Medium</SelectItem><SelectItem value="3">Hard</SelectItem></SelectContent>
                  </Select>
                  <Select value={String(selected.estimatedMinutes)} onValueChange={(value) => tuneTask(selected.task.id, { estimatedMinutes: Number(value) })}>
                    <SelectTrigger className="w-full" aria-label="Estimated time"><SelectValue /></SelectTrigger>
                    <SelectContent>{minuteChoices.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={selected.energy} onValueChange={(value) => tuneTask(selected.task.id, { energy: value as TaskEnergy })}>
                    <SelectTrigger className="w-full" aria-label="Energy needed"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Low energy</SelectItem><SelectItem value="medium">Medium energy</SelectItem><SelectItem value="high">High energy</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5 xl:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><ListTodo className="size-4 text-primary" /><h2 className="font-semibold">Up next</h2></div>
              <Badge variant="outline">{recommendations.length} open</Badge>
            </div>
            <div className="mt-4 space-y-2">
              {recommendations.slice(0, 5).map((item, index) => (
                <button key={item.task.id} type="button" onClick={() => { setSelectedId(item.task.id); setShowWhy(false); }} className={cn("w-full rounded-xl border p-3 text-left transition-colors", item.task.id === selected.task.id ? "border-primary/30 bg-primary/[0.07]" : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]") }>
                  <div className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-xs font-semibold text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.task.title}</p><p className="mt-1 text-xs text-muted-foreground">{dueLabel(item.task.due)} · {item.estimatedMinutes}m · {difficultyLabel(item.difficulty)}</p></div>
                  </div>
                </button>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={onOpenQuickAdd}><Plus /> Add another task</Button>
          </section>
        </div>
      )}

      <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><Repeat2 className="size-4 text-primary" /><h2 className="font-semibold">Recurring responsibilities</h2></div><p className="mt-1 text-sm text-muted-foreground">Cleaning, laundry, study sessions, reviews, and anything that should return automatically.</p></div>
          <Button variant="outline" size="sm" onClick={onOpenQuickAdd}><Plus /> Add recurring</Button>
        </div>
        {recurring.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recurring.slice(0, 6).map((task) => {
              const defaults = taskDefaults(task);
              return (
                <article key={task.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{titleCase(task.recurrence as TaskRecurrence)} · {dueLabel(task.due)} · {defaults.estimatedMinutes}m</p></div>
                    <AlarmClock className="size-4 shrink-0 text-primary" />
                  </div>
                  <Button size="xs" variant="ghost" className="mt-3" onClick={() => tuneTask(task.id, { recurrence: undefined })}>Stop repeating</Button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">No repeating tasks yet. Add “Clean room” and choose Weekly to start.</div>
        )}
      </section>
    </div>
  );
}
