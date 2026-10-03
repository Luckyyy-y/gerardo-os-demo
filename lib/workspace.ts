export type Accent = "indigo" | "cyan" | "amber" | "rose";
export type Priority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskDifficulty = 1 | 2 | 3;
export type TaskEnergy = "low" | "medium" | "high";
export type TaskKind = "general" | "assignment" | "study" | "chore";
export type TaskRecurrence = "daily" | "weekly" | "monthly";
export type ViewName = "today" | "planner" | "academics" | "finance" | "brain" | "health" | "settings";

export type Task = {
  id: string;
  title: string;
  due: string;
  priority: Priority;
  status: TaskStatus;
  area: "academic" | "finance" | "personal" | "career";
  courseId?: string;
  source?: "canvas";
  externalId?: string;
  sourceUrl?: string;
  /** UID from the original Canvas feed, kept so a changed due date updates the old task. */
  sourceUid?: string;
  dueAt?: string;
  submitted?: boolean;
  score?: number | null;
  pointsPossible?: number | null;
  kind?: TaskKind;
  difficulty?: TaskDifficulty;
  estimatedMinutes?: number;
  energy?: TaskEnergy;
  recurrence?: TaskRecurrence;
  lastCompletedAt?: string;
  /** Status to restore when a user undoes a completion during the grace period. */
  completedFromStatus?: Exclude<TaskStatus, "done">;
  /** Previous due date for rolling back the latest recurring-task completion. */
  lastCompletedDue?: string;
  snoozedUntil?: string;
};

export type Course = {
  id: string;
  code: string;
  title: string;
  instructor: string;
  color: string;
  progress: number;
  source?: "canvas";
  externalId?: string;
  url?: string;
  grade?: string | null;
  score?: number | null;
};

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: "expense" | "income";
  category: string;
  date: string;
  source?: "plaid";
  accountId?: string;
  pending?: boolean;
  currency?: string;
  isTransfer?: boolean;
};

export type Project = {
  id: string;
  title: string;
  area: string;
  progress: number;
  nextAction: string;
};

export type Habit = {
  id: string;
  title: string;
  done: boolean;
};

export type Capture = {
  id: string;
  text: string;
  kind: "idea" | "link" | "question";
  createdAt: string;
  status?: "inbox" | "active" | "done" | "archived";
  area?: string;
  updatedAt?: string;
  linkedTaskId?: string;
};

export type Resource = {
  id: string;
  title: string;
  url: string;
  tag: string;
};

export type WorkspaceSettings = {
  appName: string;
  accent: Accent;
  spotifyUrl: string;
  compactMode: boolean;
  monthlyBudget: number;
  savingsGoal: number;
  currentSavings: number;
  debtBalance: number;
  graduationDate: string;
  pureBlack?: boolean;
  githubUsername?: string;
  spotifyClientId?: string;
  focusPresets?: number[];
  canvasFeedUrl?: string;
  canvasBaseUrl?: string;
  canvasTimeZone?: string;
  canvasAutoSync?: boolean;
  canvasLastSyncError?: string;
  spotifyStudyMode?: boolean;
  spotifyFocusUrl?: string;
};

export type Subscription = {
  id: string;
  name: string;
  amount: number;
  billingDay: number;
  category: string;
};

export type WorkspaceState = {
  schemaVersion: 1;
  settings: WorkspaceSettings;
  tasks: Task[];
  courses: Course[];
  transactions: Transaction[];
  projects: Project[];
  habits: Habit[];
  captures: Capture[];
  resources: Resource[];
  subscriptions?: Subscription[];
  canvas?: {
    lastSyncedAt: string;
    mode: "feed" | "api";
    warnings: string[];
    announcements: Array<{ id: string; courseId: string; title: string; url: string; postedAt: string }>;
    modules: Array<{ id: string; courseId: string; title: string; items: Array<{ id: string; title: string; url: string; type: string }> }>;
  };
};

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function makeId(prefix: string) {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

/** Fictional portfolio fixtures; not Gerardo’s finances, coursework, or activity. */
export function createStarterState(): WorkspaceState {
  return {
    schemaVersion: 1,
    settings: {
      appName: "Gerardo OS Demo",
      accent: "indigo",
      spotifyUrl: "",
      compactMode: false,
      monthlyBudget: 900,
      savingsGoal: 2000,
      currentSavings: 850,
      debtBalance: 300,
      graduationDate: "2027-12-15",
      pureBlack: false,
      githubUsername: "",
      spotifyClientId: "",
      focusPresets: [15, 25, 45, 60, 90],
      canvasFeedUrl: "",
    },
    tasks: [
      {
        id: "task-threat-model",
        title: "Finish the threat-model outline",
        due: addDaysIso(0),
        priority: "high",
        status: "doing",
        area: "academic",
        courseId: "course-secure-apps",
      },
      {
        id: "task-iam-lab",
        title: "Review the AWS IAM lab",
        due: addDaysIso(1),
        priority: "medium",
        status: "todo",
        area: "academic",
        courseId: "course-cloud",
      },
      {
        id: "task-portfolio",
        title: "Document one portfolio project",
        due: addDaysIso(3),
        priority: "medium",
        status: "todo",
        area: "career",
      },
      {
        id: "task-budget",
        title: "Set this month’s spending plan",
        due: addDaysIso(2),
        priority: "low",
        status: "todo",
        area: "finance",
      },
    ],
    courses: [
      {
        id: "course-secure-apps",
        code: "DEMO 101",
        title: "Secure Application Design",
        instructor: "Sample instructor",
        color: "#7c8cff",
        progress: 68,
      },
      {
        id: "course-cloud",
        code: "CLOUD",
        title: "Cloud Systems",
        instructor: "Sample instructor",
        color: "#22d3ee",
        progress: 42,
      },
      {
        id: "course-cyber",
        code: "CYBER",
        title: "Cybersecurity Lab",
        instructor: "Sample instructor",
        color: "#f59e0b",
        progress: 31,
      },
    ],
    transactions: [
      { id: "demo-income", title: "Sample monthly income", amount: 1200, type: "income", category: "Income", date: addDaysIso(0) },
      { id: "demo-groceries", title: "Sample groceries", amount: 48.75, type: "expense", category: "Food", date: addDaysIso(0) },
      { id: "demo-transit", title: "Sample transit", amount: 25, type: "expense", category: "Transport", date: addDaysIso(0) },
    ],
    projects: [
      {
        id: "project-aws-portfolio",
        title: "AWS portfolio lab",
        area: "Cloud & cybersecurity",
        progress: 45,
        nextAction: "Write the architecture notes",
      },
      {
        id: "project-internship",
        title: "Internship search",
        area: "Career",
        progress: 25,
        nextAction: "Tailor the next application",
      },
    ],
    habits: [
      { id: "habit-water", title: "Water goal", done: false },
      { id: "habit-study", title: "One focused study block", done: false },
      { id: "habit-walk", title: "Walk or movement", done: false },
      { id: "habit-review", title: "Five-minute review", done: false },
    ],
    captures: [
      { id: "demo-idea", text: "Sample idea: diagram the trust boundaries for a cloud lab", kind: "idea", createdAt: new Date().toISOString(), status: "inbox" },
      { id: "demo-question", text: "Sample question: how should a recurring task behave after undo?", kind: "question", createdAt: new Date().toISOString(), status: "inbox" },
    ],
    resources: [
      {
        id: "resource-aws",
        title: "AWS Well-Architected Framework",
        url: "https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html",
        tag: "Cloud",
      },
      {
        id: "resource-notes",
        title: "Samsung Notes support",
        url: "https://www.samsung.com/us/support/owners/app/samsung-notes/",
        tag: "Notes",
      },
    ],
    subscriptions: [{ id: "demo-subscription", name: "Sample study service", amount: 8, billingDay: 10, category: "Study" }],
  };
}

export function spotifyEmbedUrl(value: string) {
  const fallback = "https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?theme=0";

  if (value.startsWith("spotify:")) {
    const [, type, id] = value.split(":");
    if (type && id) return `https://open.spotify.com/embed/${type}/${id}?theme=0`;
  }

  try {
    const url = new URL(value);
    if (url.hostname !== "open.spotify.com") return fallback;
    const parts = url.pathname.split("/").filter(Boolean);
    const supported = ["playlist", "album", "artist", "track", "show", "episode"];
    if (parts.length < 2 || !supported.includes(parts[0])) return fallback;
    return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}?theme=0`;
  } catch {
    return fallback;
  }
}
