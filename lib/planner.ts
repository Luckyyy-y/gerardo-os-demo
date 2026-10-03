import type { Task, TaskDifficulty, TaskEnergy, TaskKind, TaskRecurrence } from "./workspace";

const DAY_MS = 86_400_000;
export const TASK_UNDO_WINDOW_MS = 12 * 60 * 60 * 1000;

export type PlannerPreferences = {
  availableMinutes: number;
  energy: TaskEnergy;
};

export type TaskRecommendation = {
  task: Task;
  score: number;
  reasons: string[];
  estimatedMinutes: number;
  difficulty: TaskDifficulty;
  energy: TaskEnergy;
  kind: TaskKind;
};

function localDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(12, 0, 0, 0);
  return date;
}

function dayDifference(due: string, now: Date) {
  const target = localDay(due);
  const today = localDay(now);
  if (!target || !today) return 365;
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function inferredTaskKind(task: Task): TaskKind {
  if (task.kind) return task.kind;
  if (task.source === "canvas") return "assignment";
  if (/(security\+|network\+|\b(?:study|exam|cert|aws|comptia|practice test|quiz)\b)/i.test(task.title)) return "study";
  if (/\b(clean|laundry|room|trash|dishes|vacuum|organize|tidy)\b/i.test(task.title)) return "chore";
  if (task.area === "academic") return "assignment";
  return "general";
}

export function taskDefaults(task: Task) {
  const kind = inferredTaskKind(task);
  const difficulty = task.difficulty ?? (kind === "assignment" ? 2 : 1);
  const estimatedMinutes = task.estimatedMinutes ?? (kind === "chore" ? 15 : kind === "study" ? 45 : 30);
  const energy = task.energy ?? (difficulty === 3 ? "high" : difficulty === 1 ? "low" : "medium");
  return { kind, difficulty, estimatedMinutes, energy };
}

function dueScore(days: number, kind: TaskKind, reasons: string[]) {
  const chore = kind === "chore";
  if (days < 0) {
    reasons.push(`${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`);
    return chore ? 52 + Math.min(12, Math.abs(days) * 2) : 90 + Math.min(35, Math.abs(days) * 5);
  }
  if (days === 0) {
    reasons.push("Due today");
    return chore ? 48 : 72;
  }
  if (days === 1) {
    reasons.push("Due tomorrow");
    return chore ? 38 : 60;
  }
  if (days <= 3) {
    reasons.push(`Due in ${days} days`);
    return chore ? 28 : 48 - days * 3;
  }
  if (days <= 7) {
    reasons.push(`Due this week`);
    return 30 - days;
  }
  if (days <= 14) return 14;
  return Math.max(0, 10 - Math.floor(days / 14));
}

export function rankTasks(tasks: Task[], preferences: PlannerPreferences, now = new Date()): TaskRecommendation[] {
  const energyRank: Record<TaskEnergy, number> = { low: 1, medium: 2, high: 3 };

  return tasks
    .filter((task) => task.status !== "done")
    .filter((task) => !task.snoozedUntil || Date.parse(task.snoozedUntil) <= now.getTime())
    .map((task) => {
      const { kind, difficulty, estimatedMinutes, energy } = taskDefaults(task);
      const days = dayDifference(task.due, now);
      const reasons: string[] = [];
      let score = dueScore(days, kind, reasons);

      score += task.priority === "high" ? 30 : task.priority === "medium" ? 17 : 7;
      if (task.priority === "high") reasons.push("High priority");

      if (difficulty === 3 && days <= 7) {
        score += 16;
        reasons.push("Hard task—start early");
      } else if (difficulty === 2 && days <= 3) {
        score += 8;
      }

      if (kind === "study" && days <= 14) {
        score += 16;
        reasons.push("Study deadline is approaching");
      }
      if (task.status === "doing") {
        score += 12;
        reasons.push("Already in progress");
      }
      if (estimatedMinutes <= preferences.availableMinutes) {
        score += 10;
        reasons.push(`Fits your ${preferences.availableMinutes}-minute block`);
      } else {
        score -= Math.min(28, Math.ceil((estimatedMinutes - preferences.availableMinutes) / 10) * 4);
      }

      if (energyRank[energy] <= energyRank[preferences.energy]) {
        score += 8;
      } else {
        score -= 14;
      }

      if (task.recurrence) reasons.push(`Repeats ${task.recurrence}`);

      return {
        task,
        score,
        reasons: [...new Set(reasons)].slice(0, 4),
        estimatedMinutes,
        difficulty,
        energy,
        kind,
      };
    })
    .sort((a, b) => b.score - a.score || a.task.due.localeCompare(b.task.due) || a.task.title.localeCompare(b.task.title));
}

function addMonth(date: Date) {
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
}

export function advanceRecurringDue(due: string, recurrence: TaskRecurrence, now = new Date()) {
  const today = localDay(now) ?? new Date();
  const next = localDay(due) ?? new Date(today);
  let guard = 0;
  do {
    if (recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
    else addMonth(next);
    guard += 1;
  } while (next.getTime() <= today.getTime() && guard < 400);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export function completeTask(task: Task, now = new Date()): Task {
  const completedFromStatus = task.status === "done" ? "todo" : task.status;
  const completedAt = now.toISOString();

  if (task.recurrence) {
    return {
      ...task,
      status: "todo",
      due: advanceRecurringDue(task.due, task.recurrence, now),
      lastCompletedAt: completedAt,
      completedFromStatus,
      lastCompletedDue: task.due,
      snoozedUntil: undefined,
    };
  }

  return {
    ...task,
    status: "done",
    lastCompletedAt: completedAt,
    completedFromStatus,
    lastCompletedDue: undefined,
    snoozedUntil: undefined,
  };
}

export function isTaskCompletionUndoable(task: Task, now = Date.now()) {
  // Only completions recorded by the undo-aware flow are safe to restore.
  // Older recurring completions have a timestamp but no saved previous due date.
  if (!task.lastCompletedAt || !task.completedFromStatus) return false;
  const completedAt = Date.parse(task.lastCompletedAt);
  return Number.isFinite(completedAt) && now >= completedAt && now - completedAt < TASK_UNDO_WINDOW_MS;
}

export function undoTaskCompletion(task: Task): Task {
  return {
    ...task,
    status: task.completedFromStatus ?? "todo",
    due: task.lastCompletedDue ?? task.due,
    lastCompletedAt: undefined,
    completedFromStatus: undefined,
    lastCompletedDue: undefined,
  };
}

export function recentlyCompletedTasks(tasks: Task[], now = Date.now()) {
  return tasks
    .filter((task) => isTaskCompletionUndoable(task, now))
    .sort((a, b) => Date.parse(b.lastCompletedAt ?? "") - Date.parse(a.lastCompletedAt ?? ""));
}
