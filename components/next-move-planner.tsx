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
      <section className="border-b border-rule pb-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <h2 className="view-title">Next Move</h2>
            <p className="mt-3 max-w-[65ch] text-muted-foreground">Your deadlines, difficulty, priority, recurring responsibilities, and current capacity decide the order. No paid AI is involved.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[25rem]">
            <label className="font-semibold">Time available
              <Select value={String(availableMinutes)} onValueChange={(value) => setAvailableMinutes(Number(value))}>
                <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{minuteChoices.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="font-semibold">Energy right now
              <Select value={energy} onValueChange={(value) => setEnergy(value as TaskEnergy)}>
                <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
              </Select>
            </label>
          </div>
        </div>
      </section>

      {!selected ? (
        <section className="border-b border-rule py-10">
          <div>
            <h2 className="display text-5xl text-muted-foreground">Your queue is clear</h2>
            <p className="mt-3 max-w-[60ch] text-muted-foreground">Add an assignment, study session, or recurring responsibility and Next Move will rank it.</p>
            <Button className="mt-5" onClick={onOpenQuickAdd}><Plus /> Add a task</Button>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="border-y border-rule bg-card p-5 sm:p-7 xl:col-span-8">
            <div>
              <h2 className="display max-w-3xl break-words text-[clamp(2.5rem,4.5vw,4.5rem)]">{selected.task.title}</h2>
              <p className="mt-3 text-muted-foreground"><b className="text-foreground">{selected.task.id === recommendations[0]?.task.id ? "Best fit" : "Selected"}</b> · {kindLabel(selected.kind)} · {selected.reasons[0] ?? "the strongest fit for your current plan"}</p>

              <dl className="mt-5 grid max-w-xl grid-cols-2 border-t border-rule sm:grid-cols-4">
                <div className="col-span-2 border-b border-rule py-2 pr-3 sm:col-span-4"><dt className="label">Due</dt><dd className={cn("font-extrabold", selected.task.due && selected.task.due < addDaysIso(0) && "text-signal")}>{dueLabel(selected.task.due)}</dd></div>
                <div className="border-b border-rule py-2 pr-3"><dt className="label">Time</dt><dd className="font-extrabold">{selected.estimatedMinutes} min</dd></div>
                <div className="border-b border-rule py-2 pr-3"><dt className="label">Difficulty</dt><dd className="font-extrabold">{difficultyLabel(selected.difficulty)}</dd></div>
                <div className="border-b border-rule py-2 pr-3"><dt className="label">Energy</dt><dd className="font-extrabold">{titleCase(selected.energy)}</dd></div>
                {selected.task.recurrence && <div className="border-b border-rule py-2 pr-3"><dt className="label">Repeats</dt><dd className="font-extrabold">{titleCase(selected.task.recurrence)}</dd></div>}
              </dl>

              <div className="mt-7 flex flex-wrap gap-2">
                <Button onClick={() => onStartFocus(selected.task, Math.min(selected.estimatedMinutes, availableMinutes))}><Play /> Start {Math.min(selected.estimatedMinutes, availableMinutes)}m focus</Button>
                <Button variant="secondary" onClick={() => onComplete(selected.task.id)}><CheckCircle2 /> Complete</Button>
                <Button variant="outline" onClick={chooseEasier}>Something easier</Button>
                <Button variant="ghost" onClick={() => setShowWhy((value) => !value)}>Why this?</Button>
                <Button variant="ghost" onClick={() => snooze(selected.task.id)}>Not today</Button>
              </div>

              {showWhy && (
                <div className="mt-5 border-t border-rule pt-4">
                  <p className="font-extrabold">Why it ranked first</p>
                  <ul className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                    {selected.reasons.map((reason) => <li key={reason} className="flex items-start gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-foreground" />{reason}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-7 border-t border-rule pt-5">
                <p className="font-semibold">Adjust how the planner sees this task</p>
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

          <section className="xl:col-span-4">
            <div className="flex items-center justify-between gap-3 pb-2">
              <h2 className="label !text-foreground">Up next</h2>
              <span className="label">{recommendations.length} open</span>
            </div>
            <div>
              {recommendations.slice(0, 5).map((item, index) => (
                <button key={item.task.id} type="button" onClick={() => { setSelectedId(item.task.id); setShowWhy(false); }} className={cn("w-full border-t border-rule px-2 py-3 text-left", item.task.id === selected.task.id ? "bg-foreground text-background" : "hover:bg-secondary") }>
                  <div className="flex items-start gap-3">
                    <span className="display w-7 shrink-0 text-2xl">{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="break-words font-semibold">{item.task.title}</p><p className="mt-0.5 text-[13px] opacity-70">{dueLabel(item.task.due)} · {item.estimatedMinutes}m · {difficultyLabel(item.difficulty)}</p></div>
                  </div>
                </button>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={onOpenQuickAdd}><Plus /> Add another task</Button>
          </section>
        </div>
      )}

      <section className="border-t border-rule pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="label !text-foreground">Recurring responsibilities</h2><p className="mt-1 text-muted-foreground">Cleaning, laundry, study sessions, reviews, and anything that should return automatically.</p></div>
          <Button variant="outline" size="sm" onClick={onOpenQuickAdd}><Plus /> Add recurring</Button>
        </div>
        {recurring.length ? (
          <div className="mt-4 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
            {recurring.slice(0, 6).map((task) => {
              const defaults = taskDefaults(task);
              return (
                <article key={task.id} className="border-t border-rule py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold">{task.title}</p><p className="mt-1 text-[13px] text-muted-foreground">{titleCase(task.recurrence as TaskRecurrence)} · {dueLabel(task.due)} · {defaults.estimatedMinutes}m</p></div>
                    <AlarmClock className="size-4 shrink-0 text-foreground" />
                  </div>
                  <Button size="xs" variant="ghost" className="mt-3" onClick={() => tuneTask(task.id, { recurrence: undefined })}>Stop repeating</Button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border-t border-rule py-6 text-muted-foreground">No repeating tasks yet. Add “Clean room” and choose Weekly to start.</div>
        )}
      </section>
    </div>
  );
}
