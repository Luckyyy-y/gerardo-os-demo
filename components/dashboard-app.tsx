"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FolderGit2,
  GripVertical,
  HardDrive,
  Clock3,
  Cloud,
  CloudOff,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListTodo,
  Loader2,
  Music2,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SpotifyProvider, SpotifyNowPlaying, SpotifyCard } from "@/components/spotify-player";
import { BankConnections, TransactionActivity, useBanking } from "@/components/bank-connections";
import { financeTotals } from "@/lib/banking";
import { SecondBrainInbox } from "@/components/second-brain-inbox";
import { CanvasConnection, CanvasAutoSync, CanvasMaterials } from "@/components/canvas-connection";
import { NextMovePlanner } from "@/components/next-move-planner";
import {
  TASK_UNDO_WINDOW_MS,
  completeTask,
  isTaskCompletionUndoable,
  recentlyCompletedTasks,
  undoTaskCompletion,
} from "@/lib/planner";
import {
  addDaysIso,
  createStarterState,
  makeId,
  type Accent,
  type Priority,
  type Task,
  type TaskDifficulty,
  type TaskEnergy,
  type TaskKind,
  type TaskRecurrence,
  type TaskStatus,
  type ViewName,
  type WorkspaceSettings,
  type WorkspaceState,
} from "@/lib/workspace";

type SyncStatus = "loading" | "saving" | "synced" | "offline" | "local";
type AddTab = "task" | "course" | "money" | "project" | "capture";
type FocusLaunch = { taskId: string; title: string; minutes: number; nonce: number };

const navigation: Array<{
  value: ViewName;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { value: "today", label: "Today", icon: LayoutDashboard },
  { value: "planner", label: "Next Move", icon: Sparkles },
  { value: "academics", label: "Academics", icon: GraduationCap },
  { value: "finance", label: "Finances", icon: WalletCards },
  { value: "brain", label: "Second brain", icon: Brain },
  { value: "health", label: "System health", icon: Activity },
  { value: "settings", label: "Customize", icon: Settings2 },
];

const viewTitles: Record<ViewName, string> = {
  today: "Today",
  planner: "Next Move",
  academics: "Academic command center",
  finance: "Money overview",
  brain: "Second brain",
  health: "Integration health",
  settings: "Customize your OS",
};

const accentHex: Record<Accent, string> = {
  indigo: "#7c8cff",
  cyan: "#22d3ee",
  amber: "#f59e0b",
  rose: "#fb7185",
};

function formatDate(value: string, short = false) {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: short ? undefined : "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function daysUntil(value: string) {
  const target = new Date(`${value}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.ceil((target - today.getTime()) / 86_400_000));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardApp({ userName }: { userName: string }) {
  const [view, setView] = useState<ViewName>("today");
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createStarterState());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<AddTab>("task");
  const [focusLaunch, setFocusLaunch] = useState<FocusLaunch | null>(null);
  const workspaceRef = useRef(workspace);
  const saveTimer = useRef<number | null>(null);
  const remoteSyncUnavailable = useRef(true);
  const banking = useBanking();

  const saveWorkspace = useCallback(async (next: WorkspaceState) => {
    try {
      window.localStorage.setItem("gerardo-os-demo-v1-workspace", JSON.stringify(next));
      setSyncStatus("local");
    } catch {
      setSyncStatus("offline");
      toast.error("Browser storage unavailable", { description: "Edits remain on this screen but will not survive a reload." });
    }
  }, []);

  const queueSave = useCallback(
    (next: WorkspaceState) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setSyncStatus(remoteSyncUnavailable.current ? "local" : "saving");
      saveTimer.current = window.setTimeout(() => void saveWorkspace(next), 550);
    },
    [saveWorkspace],
  );

  const updateWorkspace = useCallback(
    (change: (current: WorkspaceState) => WorkspaceState) => {
      const next = change(workspaceRef.current);
      workspaceRef.current = next;
      setWorkspace(next);
      try { window.localStorage.setItem("gerardo-os-demo-v1-workspace", JSON.stringify(next)); } catch { /* saveWorkspace reports storage failures */ }
      queueSave(next);
    },
    [queueSave],
  );

  useEffect(() => {
    try {
      const local = window.localStorage.getItem("gerardo-os-demo-v1-workspace");
      if (local) {
        const saved = JSON.parse(local) as WorkspaceState;
        if (saved.schemaVersion === 1 && saved.settings && [saved.tasks, saved.courses, saved.transactions, saved.projects, saved.habits, saved.captures, saved.resources].every(Array.isArray)) {
          workspaceRef.current = saved;
          setWorkspace(saved);
        }
      }
      setSyncStatus("local");
    } catch { setSyncStatus("offline"); }
    setReady(true);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, []);

  const resetDemo = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      window.localStorage.removeItem("gerardo-os-demo-v1-workspace");
      window.location.reload();
    } catch { toast.error("Browser storage unavailable; reset could not finish."); }
  };

  const openQuickAdd = (tab: AddTab = "task") => {
    setQuickAddTab(tab);
    setQuickAddOpen(true);
  };

  const changeView = (next: ViewName) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const undoCompletedTask = (id: string) => {
    const selected = workspaceRef.current.tasks.find((task) => task.id === id);
    if (!selected || !isTaskCompletionUndoable(selected)) {
      toast.error("The 12-hour undo period has ended");
      return;
    }
    updateWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? undoTaskCompletion(task) : task),
    }));
    toast.success("Task restored", { description: `${selected.title} is active again.` });
  };

  const setTaskStatus = (id: string, status: TaskStatus) => {
    const selected = workspaceRef.current.tasks.find((task) => task.id === id);
    if (!selected) return;

    if (status === "done") {
      const completed = completeTask(selected);
      updateWorkspace((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === id ? completed : task),
      }));
      toast.success(selected.recurrence ? "Recurring task complete" : "Task completed", {
        description: selected.recurrence
          ? `Next due ${formatDate(completed.due)}. Undo is available for 12 hours.`
          : "Undo is available for 12 hours.",
        action: { label: "Undo", onClick: () => undoCompletedTask(id) },
      });
      return;
    }

    updateWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? {
        ...task,
        status,
        snoozedUntil: status === "doing" ? undefined : task.snoozedUntil,
        lastCompletedAt: undefined,
        completedFromStatus: undefined,
        lastCompletedDue: undefined,
      } : task),
    }));
  };

  const toggleTask = (id: string, checked: boolean) => {
    setTaskStatus(id, checked ? "done" : "todo");
  };

  const startFocusForTask = (task: Task, minutes: number) => {
    const safeMinutes = Math.max(1, Math.min(240, Math.round(minutes)));
    setTaskStatus(task.id, "doing");
    setFocusLaunch({ taskId: task.id, title: task.title, minutes: safeMinutes, nonce: Date.now() });
    changeView("today");
  };

  const toggleHabit = (id: string, checked: boolean) => {
    updateWorkspace((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === id ? { ...habit, done: checked } : habit,
      ),
    }));
  };

  const openSamsungNotes = () => toast.info("Notes launcher disabled in demo", { description: "This integration belongs to the private app. No desktop app will be launched." });

  const removeCourse = (id: string) => {
    const removed = workspaceRef.current.courses.find((course) => course.id === id);
    if (!removed) return;
    updateWorkspace((current) => ({
      ...current,
      courses: current.courses.filter((course) => course.id !== id),
      tasks: current.tasks.map((task) =>
        task.courseId === id ? { ...task, courseId: undefined } : task,
      ),
    }));
    toast("Course removed", {
      action: {
        label: "Undo",
        onClick: () =>
          updateWorkspace((current) => ({
            ...current,
            courses: [...current.courses, removed],
          })),
      },
    });
  };

  const setCourseProgress = (id: string, progress: number) => {
    updateWorkspace((current) => ({
      ...current,
      courses: current.courses.map((course) =>
        course.id === id ? { ...course, progress } : course,
      ),
    }));
  };

  const setProjectProgress = (id: string, progress: number) => {
    updateWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === id ? { ...project, progress } : project,
      ),
    }));
  };

  return (
    <div
      data-accent={workspace.settings.accent}
      data-density={workspace.settings.compactMode ? "compact" : "comfortable"}
      data-black={workspace.settings.pureBlack ? "true" : "false"}
      className="min-h-svh bg-background text-foreground"
    >
      <CanvasAutoSync workspace={workspace} onUpdate={updateWorkspace} ready={ready} />
      <SpotifyProvider clientId={workspace.settings.spotifyClientId}>
      <SidebarProvider defaultOpen>
        <AppSidebar
          appName={workspace.settings.appName}
          activeView={view}
          onNavigate={changeView}
          syncStatus={syncStatus}
          spotifyUrl={workspace.settings.spotifyUrl}
        />
        <SidebarInset className="min-w-0 bg-transparent">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/8 bg-background/82 px-4 backdrop-blur-xl sm:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {workspace.settings.appName}
              </p>
              <h1 className="truncate text-base font-semibold sm:text-lg">{viewTitles[view]}</h1>
            </div>
            <SyncBadge status={syncStatus} onRetry={() => void saveWorkspace(workspaceRef.current)} />
            <Button onClick={() => openQuickAdd()} className="shadow-[0_0_26px_color-mix(in_srgb,var(--primary)_22%,transparent)]">
              <Plus />
              <span className="hidden sm:inline">Quick add</span>
            </Button>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3 sm:px-6" role="note">
            <p className="text-sm text-muted-foreground"><strong className="text-foreground">Portfolio demo</strong> · Fictional sample data · Saved in this browser only</p>
            <Button size="sm" variant="outline" onClick={resetDemo}><RotateCcw /> Reset demo</Button>
          </div>
          <main className="mx-auto w-full max-w-[1540px] flex-1 p-4 sm:p-6 lg:p-8">
            {ready && <RecentCompletions tasks={workspace.tasks} onUndo={undoCompletedTask} />}
            {!ready ? (
              <LoadingWorkspace />
            ) : view === "today" ? (
              <TodayView
                userName={userName}
                workspace={workspace}
                onToggleTask={toggleTask}
                onTaskStatus={setTaskStatus}
                onToggleHabit={toggleHabit}
                onOpenQuickAdd={openQuickAdd}
                onNavigate={changeView}
                onUpdate={updateWorkspace}
                focusLaunch={focusLaunch}
              />
            ) : view === "planner" ? (
              <NextMovePlanner
                workspace={workspace}
                onUpdate={updateWorkspace}
                onComplete={(taskId) => setTaskStatus(taskId, "done")}
                onStartFocus={startFocusForTask}
                onOpenQuickAdd={() => openQuickAdd("task")}
              />
            ) : view === "academics" ? (
              <AcademicsView
                workspace={workspace}
                onUpdate={updateWorkspace}
                onToggleTask={toggleTask}
                onTaskStatus={setTaskStatus}
                onOpenQuickAdd={openQuickAdd}
                onOpenNotes={openSamsungNotes}
                onCourseProgress={setCourseProgress}
                onRemoveCourse={removeCourse}
              />
            ) : view === "finance" ? (
              <FinanceView workspace={workspace} onOpenQuickAdd={openQuickAdd} onUpdate={updateWorkspace} banking={banking} />
            ) : view === "brain" ? (
              <BrainView
                workspace={workspace}
                onUpdate={updateWorkspace}
                onToggleHabit={toggleHabit}
                onOpenQuickAdd={openQuickAdd}
                onProjectProgress={setProjectProgress}
              />
            ) : view === "health" ? (
              <HealthView
                workspace={workspace}
                ready={ready}
                syncStatus={syncStatus}
                banking={banking}
                onNavigate={changeView}
                onRetrySync={() => void saveWorkspace(workspaceRef.current)}
              />
            ) : (
              <SettingsView
                workspace={workspace}
                onUpdate={updateWorkspace}
                syncStatus={syncStatus}
                onRetry={() => void saveWorkspace(workspaceRef.current)}
              />
            )}
          </main>
        </SidebarInset>
        <SidebarRail />
      </SidebarProvider>
      </SpotifyProvider>

      <QuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialTab={quickAddTab}
        workspace={workspace}
        onUpdate={updateWorkspace}
      />
    </div>
  );
}

function AppSidebar({
  appName,
  activeView,
  onNavigate,
  syncStatus,
  spotifyUrl,
}: {
  appName: string;
  activeView: ViewName;
  onNavigate: (view: ViewName) => void;
  syncStatus: SyncStatus;
  spotifyUrl: string;
}) {
  const { setOpenMobile } = useSidebar();
  const navigate = (view: ViewName) => {
    onNavigate(view);
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-3">
        <div className="flex h-12 items-center gap-3 rounded-xl border border-white/8 bg-white/[0.035] px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_28%,transparent)]">
            G
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">{appName}</p>
            <p className="text-xs text-muted-foreground">Portfolio demo</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Command center</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={activeView === item.value}
                    onClick={() => navigate(item.value)}
                    className="h-10"
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Now playing</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Spotify" className="h-10">
                  <a href={spotifyUrl || "https://open.spotify.com/"} target="_blank" rel="noreferrer">
                    <Music2 />
                    <span>Open Spotify player</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="mt-2 overflow-hidden px-2 group-data-[collapsible=icon]:hidden">
              <SpotifyNowPlaying compact />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {syncStatus === "offline" ? <CloudOff className="size-4 text-amber-400" /> : syncStatus === "local" ? <HardDrive className="size-4 text-cyan-300" /> : <Cloud className="size-4 text-emerald-400" />}
          <span className="group-data-[collapsible=icon]:hidden">
            {syncStatus === "offline" ? "Waiting to sync" : syncStatus === "local" ? "Saved on this device" : "PC + tablet sync"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function SyncBadge({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  const content =
    status === "loading"
      ? { icon: Loader2, label: "Loading", className: "animate-spin" }
      : status === "saving"
        ? { icon: Cloud, label: "Saving", className: "" }
        : status === "offline"
          ? { icon: CloudOff, label: "Storage unavailable", className: "text-amber-300" }
          : status === "local"
            ? { icon: HardDrive, label: "Saved on this device", className: "text-cyan-300" }
          : { icon: CheckCircle2, label: "Synced", className: "text-emerald-300" };
  const Icon = content.icon;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="hidden text-muted-foreground sm:flex"
      onClick={status === "offline" ? onRetry : undefined}
      disabled={status === "loading" || status === "saving"}
    >
      <Icon className={cn("size-4", content.className)} />
      {content.label}
    </Button>
  );
}

function undoTimeLeft(task: Task, now: number) {
  const completedAt = Date.parse(task.lastCompletedAt ?? "");
  const minutes = Math.max(1, Math.ceil((TASK_UNDO_WINDOW_MS - (now - completedAt)) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m left`;
  if (hours) return `${hours}h left`;
  return `${minutes}m left`;
}

function RecentCompletions({ tasks, onUndo }: { tasks: Task[]; onUndo: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const recent = recentlyCompletedTasks(tasks, now);
  if (!recent.length) return null;

  return (
    <section className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4" aria-label="Recently completed tasks">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-300" />
          <h2 className="text-sm font-semibold">Recently completed</h2>
          <Badge variant="outline">12-hour undo</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Completed work is hidden, not deleted.</p>
      </div>
      <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {recent.map((task) => (
          <div key={task.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/8 bg-background/45 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{undoTimeLeft(task, now)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onUndo(task.id)} aria-label={`Undo completion of ${task.title}`}>
              <RotateCcw /> Undo
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingWorkspace() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl border border-primary/25 bg-primary/10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
        <p className="text-base font-medium">Opening your workspace</p>
        <p className="mt-1 text-sm text-muted-foreground">Bringing your latest changes onto this screen.</p>
      </div>
    </div>
  );
}

function TodayView({
  userName,
  workspace,
  onToggleTask,
  onTaskStatus,
  onToggleHabit,
  onOpenQuickAdd,
  onNavigate,
  onUpdate,
  focusLaunch,
}: {
  userName: string;
  workspace: WorkspaceState;
  onToggleTask: (id: string, checked: boolean) => void;
  onTaskStatus: (id: string, status: TaskStatus) => void;
  onToggleHabit: (id: string, checked: boolean) => void;
  onOpenQuickAdd: (tab?: AddTab) => void;
  onNavigate: (view: ViewName) => void;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
  focusLaunch: FocusLaunch | null;
}) {
  const openTasks = workspace.tasks.filter((task) => task.status !== "done");
  const doneTasks = workspace.tasks.filter((task) => task.status === "done").length;
  const completion = workspace.tasks.length ? Math.round((doneTasks / workspace.tasks.length) * 100) : 0;
  const nextTasks = [...openTasks].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 6);

  return (
    <div className="space-y-5">
      <section className="command-ribbon overflow-hidden rounded-[1.4rem] border border-white/10 p-5 sm:p-7">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">{greeting()}, {userName}.</p>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-[-0.035em] sm:text-4xl">
              One place for the work that moves your life forward.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              {openTasks.length} open tasks · {daysUntil(workspace.settings.graduationDate).toLocaleString()} days to graduation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-40 sm:block">
              <div className="mb-2 flex justify-between text-xs text-white/55">
                <span>Weekly momentum</span>
                <span>{completion}%</span>
              </div>
              <Progress value={completion} />
            </div>
            <Button variant="secondary" onClick={() => onOpenQuickAdd("task")}>
              <Plus /> Add a task
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="What needs attention" icon={ListTodo} action={
          <Button variant="ghost" size="sm" onClick={() => onNavigate("academics")}>All work <ArrowUpRight /></Button>
        }>
          <TaskList
            tasks={nextTasks}
            courses={workspace.courses}
            onToggle={onToggleTask}
            onStatus={onTaskStatus}
            emptyText="Nothing urgent. Add the next move when it appears."
          />
        </Panel>
        <div className="grid gap-5 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1">
          <ElegantClock />
          <FocusWidget presets={workspace.settings.focusPresets} launch={focusLaunch} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-12" title="Seven-day runway" icon={CalendarDays}>
          <WeekStrip tasks={workspace.tasks} />
        </Panel>

      </div>

      <SpotifyCard workspace={workspace} onUpdate={onUpdate} />

      <Panel title="Interactive calendar" icon={CalendarDays} action={
        <Button variant="outline" size="sm" onClick={() => onOpenQuickAdd("task")}><Plus /> Add dated task</Button>
      }>
        <InteractiveCalendar
          tasks={workspace.tasks}
          courses={workspace.courses}
          onMove={(id, due) => onUpdate((current) => ({
            ...current,
            tasks: current.tasks.map((task) => task.id === id ? { ...task, due } : task),
          }))}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sample projects" icon={FolderGit2} action={
          <Button variant="ghost" size="sm" asChild><a href={`https://github.com/Luckyyy-y/gerardo-os-demo`} target="_blank" rel="noreferrer">Open GitHub <ArrowUpRight /></a></Button>
        }>
          <GithubProjects />
        </Panel>
        <Panel title="Habits today" icon={Sparkles}>
          <EditableHabits workspace={workspace} onToggle={onToggleHabit} onUpdate={onUpdate} />
        </Panel>
      </div>
    </div>
  );
}

function AcademicsView({
  workspace,
  onUpdate,
  onToggleTask,
  onTaskStatus,
  onOpenQuickAdd,
  onOpenNotes,
  onCourseProgress,
  onRemoveCourse,
}: {
  workspace: WorkspaceState;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
  onToggleTask: (id: string, checked: boolean) => void;
  onTaskStatus: (id: string, status: TaskStatus) => void;
  onOpenQuickAdd: (tab?: AddTab) => void;
  onOpenNotes: () => void;
  onCourseProgress: (id: string, progress: number) => void;
  onRemoveCourse: (id: string) => void;
}) {
  const academicTasks = workspace.tasks.filter((task) => task.area === "academic");

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Academic OS"
        title="Courses, deadlines, and deep work without the tab chaos."
        copy="Your enrolled classes, assignments, and course materials together."
        action={<div className="flex flex-wrap gap-2"><CanvasConnection workspace={workspace} onUpdate={onUpdate} /><Button onClick={() => onOpenQuickAdd("course")}><Plus /> Add course</Button></div>}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {workspace.courses.map((course) => {
          const outstanding = academicTasks.filter((task) => task.courseId === course.id && task.status !== "done").length;
          return (
            <article key={course.id} className="course-card" style={{ "--course-color": course.color } as React.CSSProperties}>
              <div className="course-accent" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--course-color)]">{course.code}</p>
                  <h3 className="mt-2 text-lg font-semibold">{course.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{course.instructor}</p>{course.source === "canvas" && <div className="mt-2 flex gap-2 items-center"><Badge variant="outline">Canvas</Badge>{course.score != null && <span className="text-sm">Grade: {course.score}% {course.grade}</span>}{course.url && <a href={course.url} target="_blank" rel="noreferrer" className="text-sm text-primary">Open class ↗</a>}</div>}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${course.title}`} onClick={() => onRemoveCourse(course.id)}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-7">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{outstanding} open assignment{outstanding === 1 ? "" : "s"}</span>
                  <span>{course.progress}% complete</span>
                </div>
                <Slider
                  value={[course.progress]}
                  max={100}
                  step={1}
                  aria-label={`${course.title} progress`}
                  onValueChange={(value) => onCourseProgress(course.id, value[0] ?? 0)}
                />
              </div>
            </article>
          );
        })}
        {workspace.courses.length === 0 && (
          <EmptyCard title="No courses yet" copy="Add this semester’s first course to connect its assignments." onClick={() => onOpenQuickAdd("course")} />
        )}
      </div>

      <Panel title="Assignments" icon={BookOpen} action={
        <Button variant="outline" size="sm" onClick={() => onOpenQuickAdd("task")}><Plus /> Assignment</Button>
      }>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><span className="sr-only">Complete</span></TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {academicTasks.map((task) => {
                const course = workspace.courses.find((item) => item.id === task.courseId);
                return (
                  <TableRow key={task.id} className={cn(task.status === "done" && "opacity-55")}>
                    <TableCell><Checkbox checked={task.status === "done"} onCheckedChange={(value) => onToggleTask(task.id, value === true)} /></TableCell>
                    <TableCell className="min-w-56 font-medium">{task.sourceUrl && /^https:\/\//.test(task.sourceUrl) ? <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-primary">{task.title} ↗</a> : task.title}{task.score != null && <p className="text-sm text-muted-foreground">Score: {task.score}{task.pointsPossible != null ? ` / ${task.pointsPossible}` : ""}</p>}</TableCell>
                    <TableCell>{course?.code ?? "General"}</TableCell>
                    <TableCell><PriorityBadge priority={task.priority} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(task.due)}</TableCell>
                    <TableCell><TaskStatusSelect value={task.status} onChange={(status) => onTaskStatus(task.id, status)} /></TableCell>
                  </TableRow>
                );
              })}
              {academicTasks.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No assignments yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <CanvasMaterials workspace={workspace} />
      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Lecture & deadline runway" icon={CalendarDays}>
          <WeekStrip tasks={academicTasks} />
        </Panel>
        <NotesDock className="xl:col-span-5" onOpenNotes={onOpenNotes} />
      </div>
    </div>
  );
}

type HealthLevel = "healthy" | "attention" | "ready" | "checking" | "inactive";

function healthLabel(level: HealthLevel) {
  if (level === "healthy") return "Healthy";
  if (level === "attention") return "Needs attention";
  if (level === "ready") return "Ready to connect";
  if (level === "inactive") return "Not enabled";
  return "Checking";
}

function healthTone(level: HealthLevel) {
  if (level === "healthy") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200";
  if (level === "attention") return "border-amber-300/25 bg-amber-300/[0.06] text-amber-200";
  if (level === "ready") return "border-primary/25 bg-primary/[0.06] text-primary";
  return "border-white/10 bg-white/[0.025] text-muted-foreground";
}

function HealthCard({ icon: Icon, name, level, description, action }: {
  icon: typeof Cloud;
  name: string;
  level: HealthLevel;
  description: string;
  action?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
          <Icon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{name}</h2>
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", healthTone(level))}>{healthLabel(level)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </article>
  );
}

function HealthView({ syncStatus, onNavigate }: {
  workspace: WorkspaceState; ready: boolean; syncStatus: SyncStatus; banking: ReturnType<typeof useBanking>;
  onNavigate: (view: ViewName) => void; onRetrySync: () => void;
}) {
  return <div className="space-y-5"><SectionHeading eyebrow="Demo boundaries" title="Know what this version connects to." copy="The public demo uses your browser only. It does not check the private app or its accounts." />
    <div className="grid gap-4 lg:grid-cols-2">
      <HealthCard icon={HardDrive} name="Browser storage" level={syncStatus === "offline" ? "attention" : "healthy"} description={syncStatus === "offline" ? "Storage is unavailable. Edits may be lost after reload." : "Sample edits are stored on this device. Reset demo restores the fictional starting workspace."} />
      <HealthCard icon={Cloud} name="Cloud workspace / D1" level="inactive" description="No cloud workspace endpoint is called. No sign-in or cross-device synchronization is available in this demo." />
      <HealthCard icon={GraduationCap} name="Canvas" level="inactive" description="No private calendar feed or API token is accepted. Coursework is sample data." action={<Button variant="outline" onClick={() => onNavigate("academics")}>Explore sample courses</Button>} />
      <HealthCard icon={WalletCards} name="Plaid" level="inactive" description="No bank connections, account balances, or imported transactions. Manual sample entries work locally." />
      <HealthCard icon={Music2} name="Spotify" level="inactive" description="No OAuth sign-in, playback control, or live music requests. Original integration code is retained as reference." />
    </div></div>;
}

function FinanceView({ workspace, onOpenQuickAdd, onUpdate, banking }: { workspace: WorkspaceState; onOpenQuickAdd: (tab?: AddTab) => void; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void; banking: ReturnType<typeof useBanking> }) {
  const allTransactions = [...workspace.transactions, ...(banking.data?.transactions || [])];
  const { expenses, income } = financeTotals(allTransactions, new Date().toISOString().slice(0, 7));
  const bankSavings = banking.data?.accounts.filter(a => a.subtype === "savings" && a.currency === "USD" && a.current !== null) || [];
  const bankDebts = banking.data?.accounts.filter(a => ["credit", "loan"].includes(a.type) && a.currency === "USD" && a.current !== null) || [];
  const savings = bankSavings.length ? bankSavings.reduce((n, a) => n + (a.current || 0), 0) : workspace.settings.currentSavings;
  const debt = bankDebts.length ? bankDebts.reduce((n, a) => n + (a.current || 0), 0) : workspace.settings.debtBalance;
  const budget = workspace.settings.monthlyBudget;
  const budgetProgress = budget > 0 ? Math.max(0, Math.min(100, Math.round((expenses / budget) * 100))) : 0;
  const savingsProgress = workspace.settings.savingsGoal > 0
    ? Math.min(100, Math.round((savings / workspace.settings.savingsGoal) * 100))
    : 0;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Finance OS"
        title="Your accounts, spending, and plans together."
        copy="Connected bank activity and manual entries, with a clear view of where your money goes."
        action={<Button onClick={() => onOpenQuickAdd("money")}><Plus /> Add transaction</Button>}
      />

      <BankConnections banking={banking} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Spent this month" value={formatMoney(expenses)} note={budget ? `${budgetProgress}% of ${formatMoney(budget)} budget` : "Set a budget in Customize"} icon={WalletCards} />
        <MetricCard label="Income this month" value={formatMoney(income)} note="Posted income; transfers excluded" icon={TrendingUp} tone="good" />
        <MetricCard label="Savings" value={formatMoney(savings)} note={workspace.settings.savingsGoal ? `${savingsProgress}% of your goal` : "Set a goal in Customize"} icon={Target} />
        <MetricCard label="Debt balance" value={formatMoney(debt)} note={bankDebts.length ? "Connected credit and loan balances" : "Manual balance in Customize"} icon={CircleDollarSign} tone={debt > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Monthly guardrail" icon={Banknote}>
          <div className="space-y-7">
            <div>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div><p className="text-sm text-muted-foreground">Budget used</p><p className="mt-1 text-2xl font-semibold">{budget ? `${budgetProgress}%` : "Not set"}</p></div>
                <p className="text-sm text-muted-foreground">{formatMoney(Math.max(0, budget - expenses))} left</p>
              </div>
              <Progress value={budgetProgress} className={cn("h-2.5", budgetProgress > 85 && "[&_[data-slot=progress-indicator]]:bg-amber-400")} />
            </div>
            <div>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div><p className="text-sm text-muted-foreground">Savings goal</p><p className="mt-1 text-2xl font-semibold">{savingsProgress}%</p></div>
                <p className="text-sm text-muted-foreground">{formatMoney(workspace.settings.savingsGoal)}</p>
              </div>
              <Progress value={savingsProgress} className="h-2.5 [&_[data-slot=progress-indicator]]:bg-emerald-400" />
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-muted-foreground">
              Budget totals use posted USD transactions. Transfers and credit card payments are excluded; identified refunds reduce spending. Manual entries for the same bank activity can double-count.
            </div>
          </div>
        </Panel>

        <Panel className="xl:col-span-7" title="Recent activity" icon={WalletCards} action={
          <Button variant="outline" size="sm" onClick={() => onOpenQuickAdd("money")}><Plus /> Log money</Button>
        }>
          <TransactionActivity transactions={allTransactions} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Subscriptions" icon={RefreshCw}>
          <SubscriptionTracker workspace={workspace} onUpdate={onUpdate} />
        </Panel>
        <Panel className="xl:col-span-5" title="Secure account connections" icon={Link2}>
          <div className="space-y-3">

            <div className="subtle-row"><div className="min-w-0 flex-1"><p className="text-sm font-medium">Credit Karma</p><p className="mt-1 text-xs leading-5 text-muted-foreground">No supported personal-data API is available for this app. Keep Credit Karma as a launcher and use bank sync for transactions.</p></div><Button size="sm" variant="outline" asChild><a href="https://www.creditkarma.com/" target="_blank" rel="noreferrer">Open</a></Button></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BrainView({
  workspace,
  onUpdate,
  onToggleHabit,
  onOpenQuickAdd,
  onProjectProgress,
}: {
  workspace: WorkspaceState;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
  onToggleHabit: (id: string, checked: boolean) => void;
  onOpenQuickAdd: (tab?: AddTab) => void;
  onProjectProgress: (id: string, progress: number) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Second Brain OS" title="A home for ideas you want to use." copy="Capture ideas and questions, organize them by area, turn the useful ones into tasks, and archive or delete them when you’re done." />
      <SecondBrainInbox workspace={workspace} onUpdate={onUpdate} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Active projects" icon={Target} action={
          <Button variant="outline" size="sm" onClick={() => onOpenQuickAdd("project")}><Plus /> Project</Button>
        }>
          <div className="grid gap-3 md:grid-cols-2">
            {workspace.projects.map((project) => (
              <article key={project.id} className="project-card">
                <div className="flex items-start justify-between gap-3">
                  <div><Badge variant="outline" className="mb-3">{project.area}</Badge><h3 className="font-semibold">{project.title}</h3></div>
                  <span className="text-sm font-medium text-primary">{project.progress}%</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Next: {project.nextAction}</p>
                <Slider value={[project.progress]} max={100} step={5} className="mt-5" aria-label={`${project.title} progress`} onValueChange={(value) => onProjectProgress(project.id, value[0] ?? 0)} />
              </article>
            ))}
            {workspace.projects.length === 0 && <EmptyCard title="No active projects" copy="Give your next outcome a name and one concrete action." onClick={() => onOpenQuickAdd("project")} />}
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Habits today" icon={Sparkles}>
          <div className="space-y-2">
            {workspace.habits.map((habit) => (
              <label key={habit.id} className="subtle-row cursor-pointer">
                <Checkbox checked={habit.done} onCheckedChange={(value) => onToggleHabit(habit.id, value === true)} />
                <span className={cn("flex-1 text-sm", habit.done && "text-muted-foreground line-through")}>{habit.title}</span>
                {habit.done && <CheckCircle2 className="size-4 text-emerald-400" />}
              </label>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-12" title="Useful tools & references" icon={Link2}>
          <div className="space-y-2">
            {workspace.resources.map((resource) => (
              <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="subtle-row group">
                <div className="grid size-9 place-items-center rounded-lg border border-white/8 bg-white/[0.03]"><ExternalLink className="size-4 text-primary" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium group-hover:text-primary">{resource.title}</p><p className="text-xs text-muted-foreground">{resource.tag}</p></div>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SettingsView({
  workspace,
  onUpdate,
  syncStatus,
  onRetry,
}: {
  workspace: WorkspaceState;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
  syncStatus: SyncStatus;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState<WorkspaceSettings>(workspace.settings);

  useEffect(() => setDraft(workspace.settings), [workspace.settings]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onUpdate((current) => ({ ...current, settings: draft }));
    toast.success("Your workspace look is saved");
  };

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Your system" title="Make the dashboard feel like yours." copy="Appearance, music, storage, and the numbers you track can all be changed here." />
      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Workspace" icon={Settings2}>
          <form onSubmit={save} className="space-y-6">
            <Field label="App name" hint="Shown in the sidebar and header.">
              <Input value={draft.appName} onChange={(event) => setDraft({ ...draft, appName: event.target.value })} maxLength={32} />
            </Field>
            <Field label="Accent color" hint="The dashboard stays dark; this changes its energy.">
              <div className="flex flex-wrap gap-3">
                {(Object.keys(accentHex) as Accent[]).map((accent) => (
                  <button key={accent} type="button" aria-label={`Use ${accent}`} aria-pressed={draft.accent === accent} onClick={() => setDraft({ ...draft, accent })} className={cn("accent-choice", draft.accent === accent && "is-selected")}>
                    <span style={{ backgroundColor: accentHex[accent] }} />
                    <span className="capitalize">{accent}</span>
                  </button>
                ))}
              </div>
            </Field>
            <p className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">Live Spotify, GitHub, Canvas, and bank connections are disabled. Customize the sample workspace without entering account credentials.</p>
            <Field label="Focus times" hint="Comma-separated minutes shown in the focus widget.">
              <Input value={(draft.focusPresets || [15,25,45,60,90]).join(", ")} onChange={(event) => setDraft({ ...draft, focusPresets: event.target.value.split(",").map(Number).filter((value) => value >= 1 && value <= 240).slice(0, 8) })} placeholder="15, 25, 45, 60, 90" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly budget"><Input type="number" min="0" step="1" value={draft.monthlyBudget || ""} onChange={(event) => setDraft({ ...draft, monthlyBudget: Number(event.target.value) })} placeholder="0" /></Field>
              <Field label="Debt balance"><Input type="number" min="0" step="1" value={draft.debtBalance || ""} onChange={(event) => setDraft({ ...draft, debtBalance: Number(event.target.value) })} placeholder="0" /></Field>
              <Field label="Savings goal"><Input type="number" min="0" step="1" value={draft.savingsGoal || ""} onChange={(event) => setDraft({ ...draft, savingsGoal: Number(event.target.value) })} placeholder="0" /></Field>
              <Field label="Current savings"><Input type="number" min="0" step="1" value={draft.currentSavings || ""} onChange={(event) => setDraft({ ...draft, currentSavings: Number(event.target.value) })} placeholder="0" /></Field>
            </div>
            <Field label="Graduation date"><Input type="date" value={draft.graduationDate} onChange={(event) => setDraft({ ...draft, graduationDate: event.target.value })} /></Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
              <div><p className="text-sm font-medium">Compact layout</p><p className="mt-1 text-xs text-muted-foreground">Fit more on the desktop monitor.</p></div>
              <Switch checked={draft.compactMode} onCheckedChange={(checked) => setDraft({ ...draft, compactMode: checked })} aria-label="Compact layout" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
              <div><p className="text-sm font-medium">Pure black background</p><p className="mt-1 text-xs text-muted-foreground">Use OLED black instead of the softer graphite background.</p></div>
              <Switch checked={draft.pureBlack || false} onCheckedChange={(checked) => setDraft({ ...draft, pureBlack: checked })} aria-label="Pure black background" />
            </div>
            <div className="flex justify-end"><Button type="submit">Save customization</Button></div>
          </form>
        </Panel>

        <div className="space-y-5 xl:col-span-5">
          <Panel title="Install as an app" icon={Sparkles}>
            <p className="text-sm leading-6 text-muted-foreground">Install it from your browser so it gets its own window and icon on Windows and your Galaxy tablet.</p>
            <InstallAppButton />
          </Panel>

          <Panel title="Sync health" icon={Cloud}>
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-sm font-medium capitalize">{syncStatus === "local" ? "Device only" : syncStatus}</p><p className="mt-1 text-xs text-muted-foreground">{syncStatus === "local" ? "Sample edits are stored in this browser only. Reset demo clears this demo’s data." : "Browser storage is unavailable; changes may be lost on reload."}</p></div>
              {syncStatus === "offline" && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw /> Retry</Button>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, className, children }: { title: string; icon: typeof LayoutDashboard; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("panel", className)}>
      <div className="panel-heading">
        <div className="flex min-w-0 items-center gap-2.5"><Icon className="size-4 text-primary" /><h2 className="truncate text-base font-semibold">{title}</h2></div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{copy}</p></div>
      {action}
    </section>
  );
}

function TaskList({ tasks, courses, onToggle, onStatus, emptyText }: { tasks: WorkspaceState["tasks"]; courses: WorkspaceState["courses"]; onToggle: (id: string, checked: boolean) => void; onStatus: (id: string, status: TaskStatus) => void; emptyText: string }) {
  if (!tasks.length) return <EmptyState icon={CheckCircle2} title="Clear runway" copy={emptyText} />;
  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const course = courses.find((item) => item.id === task.courseId);
        return (
          <div key={task.id} className={cn("task-row", task.status === "done" && "opacity-55")}>
            <Checkbox checked={task.status === "done"} onCheckedChange={(value) => onToggle(task.id, value === true)} aria-label={`Mark ${task.title} complete`} />
            <div className="min-w-0 flex-1"><p className={cn("truncate text-sm font-medium", task.status === "done" && "line-through")}>{task.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{course?.code ?? task.area}</span><span>·</span><span>{formatDate(task.due)}</span></div></div>
            <PriorityBadge priority={task.priority} />
            <TaskStatusSelect value={task.status} onChange={(status) => onStatus(task.id, status)} />
          </div>
        );
      })}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant="outline" className={cn("priority-badge", `priority-${priority}`)}><span className="size-1.5 rounded-full bg-current" />{priority}</Badge>;
}

function TaskStatusSelect({ value, onChange }: { value: TaskStatus; onChange: (value: TaskStatus) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as TaskStatus)}>
      <SelectTrigger size="sm" className="status-select"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="todo">Not started</SelectItem><SelectItem value="doing">In progress</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent>
    </Select>
  );
}

function WeekStrip({ tasks }: { tasks: WorkspaceState["tasks"] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, iso, tasks: tasks.filter((task) => task.due === iso && task.status !== "done") };
  });
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, index) => (
        <div key={day.iso} className={cn("day-cell", index === 0 && "is-today")}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date)}</p>
          <p className="mt-1 text-lg font-semibold">{day.date.getDate()}</p>
          <div className="mt-4 space-y-1.5">{day.tasks.slice(0, 3).map((task) => <div key={task.id} className={cn("h-1.5 rounded-full", task.priority === "high" ? "bg-rose-400" : task.priority === "medium" ? "bg-amber-400" : "bg-cyan-400")} title={task.title} />)}</div>
          <p className="mt-3 text-xs text-muted-foreground">{day.tasks.length || "—"}</p>
        </div>
      ))}
    </div>
  );
}

function FocusWidget({ presets, launch }: { presets?: number[]; launch?: FocusLaunch | null }) {
  const choices = presets?.length ? presets : [15, 25, 45, 60, 90];
  const [mode, setMode] = useState(choices.includes(25) ? 25 : choices[0]);
  const [seconds, setSeconds] = useState(mode * 60);
  const [running, setRunning] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(mode));

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          toast.success("Focus block complete");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, mode]);

  const changeMode = (minutes: number) => {
    const safeMinutes = Math.max(1, Math.min(240, Math.round(minutes)));
    setMode(safeMinutes);
    setCustomMinutes(String(safeMinutes));
    setSeconds(safeMinutes * 60);
    setRunning(false);
  };
  const setManualTime = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      toast.error("Enter a timer from 1 to 240 minutes.");
      return;
    }
    changeMode(minutes);
  };

  useEffect(() => {
    if (!launch) return;
    const safeMinutes = Math.max(1, Math.min(240, Math.round(launch.minutes)));
    setMode(safeMinutes);
    setCustomMinutes(String(safeMinutes));
    setSeconds(safeMinutes * 60);
    setRunning(true);
    toast.success("Focus block started", { description: launch.title });
  }, [launch]);

  const elapsed = 1 - seconds / (mode * 60);
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="focus-card">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /><h2 className="text-base font-semibold">Focus room</h2></div><Badge variant="outline">Pomodoro</Badge></div>
      {launch && <p className="mt-2 truncate text-sm text-muted-foreground">Working on: <span className="text-foreground">{launch.title}</span></p>}
      <div className="mt-5 flex items-center gap-5">
        <div className="timer-ring" style={{ "--timer-progress": `${elapsed * 360}deg` } as React.CSSProperties}><div><span>{display}</span><small>focus</small></div></div>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap gap-2">{choices.map((minutes) => <Button key={minutes} size="xs" variant={mode === minutes ? "default" : "outline"} onClick={() => changeMode(minutes)}>{minutes}m</Button>)}</div>
          <form className="mb-4 flex items-end gap-2" onSubmit={setManualTime}><label className="min-w-0 flex-1 text-xs text-muted-foreground">Minutes<Input type="number" inputMode="numeric" min={1} max={240} step={1} value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} aria-label="Custom timer minutes" className="mt-1" /></label><Button type="submit" size="sm" variant="outline">Set</Button></form>
          <div className="flex gap-2"><Button size="sm" onClick={() => { if (!running && seconds <= 0) setSeconds(mode * 60); setRunning((value) => !value); }}>{running ? <Pause /> : <Play />}{running ? "Pause" : "Start"}</Button><Button size="icon-sm" variant="outline" aria-label="Reset timer" onClick={() => { setSeconds(mode * 60); setRunning(false); }}><RotateCcw /></Button></div>
        </div>
      </div>
    </section>
  );
}

function ElegantClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="clock-card" aria-label="Current date and time">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Local time</p>
      <p className="mt-2 text-4xl font-semibold tracking-[-0.055em] tabular-nums sm:text-5xl">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now)}</p>
      <p className="mt-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)}</p>
      <div className="clock-scan" />
    </section>
  );
}

function InteractiveCalendar({ tasks, courses, onMove }: { tasks: WorkspaceState["tasks"]; courses: WorkspaceState["courses"]; onMove: (id: string, due: string) => void }) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, iso };
  });
  return (
    <div className="calendar-grid">
      {days.map((day, index) => (
        <div key={day.iso} className={cn("calendar-day", index === 0 && "is-today", selectedTask && "is-move-target")} onClick={() => { if (selectedTask) { onMove(selectedTask, day.iso); setSelectedTask(null); toast.success(`Moved to ${formatDate(day.iso)}`); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData("text/task-id"); if (id) { onMove(id, day.iso); toast.success(`Moved to ${formatDate(day.iso)}`); } }}>
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date)}</p><span className="text-sm font-semibold">{day.date.getDate()}</span></div>
          <div className="space-y-2">
            {tasks.filter((task) => task.due === day.iso && task.status !== "done").map((task) => {
              const course = courses.find((item) => item.id === task.courseId);
              return <button type="button" key={task.id} draggable onClick={(event) => { event.stopPropagation(); setSelectedTask((current) => current === task.id ? null : task.id); }} onDragStart={(event) => { event.dataTransfer.setData("text/task-id", task.id); event.dataTransfer.effectAllowed = "move"; }} className={cn("calendar-task w-full text-left", selectedTask === task.id && "is-selected")} title="Drag, or tap then choose another date"><GripVertical className="size-3.5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-xs font-medium">{task.title}</p><p className="truncate text-[11px] text-muted-foreground">{course?.code || task.area}</p></div></button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function GithubProjects() {
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Sample workspace projects, not live GitHub activity.</p>{["Cloud architecture exercise", "Network troubleshooting lab"].map(title => <div className="subtle-row" key={title}><FolderGit2 className="size-4 text-primary" /><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">Fictional demo project</p></div></div>)}</div>;
}

function EditableHabits({ workspace, onToggle, onUpdate }: { workspace: WorkspaceState; onToggle: (id: string, checked: boolean) => void; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const add = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("habit") || "").trim(); if (!title) return; onUpdate((current) => ({ ...current, habits: [...current.habits, { id: makeId("habit"), title, done: false }] })); form.reset(); };
  return <div className="space-y-3"><form onSubmit={add} className="flex gap-2"><Input name="habit" placeholder="Add your own habit" aria-label="New habit" /><Button type="submit" size="icon" aria-label="Add habit"><Plus /></Button></form><div className="grid gap-2 sm:grid-cols-2">{workspace.habits.map((habit) => <div key={habit.id} className="subtle-row"><Checkbox checked={habit.done} onCheckedChange={(value) => onToggle(habit.id, value === true)} /><span className={cn("min-w-0 flex-1 truncate text-sm", habit.done && "text-muted-foreground line-through")}>{habit.title}</span><Button size="icon-xs" variant="ghost" aria-label={`Remove ${habit.title}`} onClick={() => onUpdate((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) }))}><Trash2 /></Button></div>)}</div></div>;
}

function SubscriptionTracker({ workspace, onUpdate }: { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const subscriptions = workspace.subscriptions || [];
  const monthly = subscriptions.reduce((sum, item) => sum + item.amount, 0);
  const add = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const name = String(data.get("name") || "").trim(); const amount = Math.abs(Number(data.get("amount"))); if (!name || !amount) return; onUpdate((current) => ({ ...current, subscriptions: [...(current.subscriptions || []), { id: makeId("subscription"), name, amount, billingDay: Math.max(1, Math.min(31, Number(data.get("day")) || 1)), category: "Subscription" }] })); form.reset(); };
  return <div className="space-y-4"><div><div className="flex items-end justify-between"><div><p className="text-sm text-muted-foreground">Recurring monthly</p><p className="mt-1 text-2xl font-semibold">{formatMoney(monthly)}</p></div><span className="text-xs text-muted-foreground">{subscriptions.length} active</span></div><Progress value={Math.min(100, workspace.settings.monthlyBudget ? monthly / workspace.settings.monthlyBudget * 100 : 0)} className="mt-3" /></div><form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]"><Input name="name" placeholder="Spotify" aria-label="Subscription name" /><Input name="amount" type="number" min="0.01" step="0.01" placeholder="$" aria-label="Monthly amount" /><Input name="day" type="number" min="1" max="31" placeholder="Day" aria-label="Billing day" /><Button type="submit"><Plus /> Add</Button></form><div className="space-y-2">{subscriptions.map((item) => <div key={item.id} className="subtle-row"><RefreshCw className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">Bills on day {item.billingDay}</p></div><span className="text-sm font-medium">{formatMoney(item.amount)}</span><Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => onUpdate((current) => ({ ...current, subscriptions: (current.subscriptions || []).filter((entry) => entry.id !== item.id) }))}><Trash2 /></Button></div>)}</div></div>;
}

function NotesMiniCard({ onOpenNotes }: { onOpenNotes: () => void }) {
  return (
    <section className="notes-mini-card">
      <div className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary"><NotebookPen className="size-5" /></div>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Samsung Notes</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Desktop launcher disabled in this public demo.</p></div>
      <Button size="sm" variant="outline" onClick={onOpenNotes}>Open <ArrowUpRight /></Button>
    </section>
  );
}

function NotesDock({ onOpenNotes, className }: { onOpenNotes: () => void; className?: string }) {
  return (
    <section className={cn("notes-dock", className)}>
      <div><div className="mb-4 grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10"><NotebookPen className="size-5 text-primary" /></div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Notes dock</p><h2 className="mt-2 text-xl font-semibold">Write where the S Pen feels right.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The private app can launch Samsung Notes. This demo shows the design without launching applications.</p></div>
      <div className="mt-6 flex flex-wrap gap-2"><Button onClick={onOpenNotes}><NotebookPen /> Open Samsung Notes</Button><Button variant="outline" asChild><a href="https://www.samsung.com/us/support/owners/app/samsung-notes/" target="_blank" rel="noreferrer">Notes help <ExternalLink /></a></Button></div>
    </section>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone = "default" }: { label: string; value: string; note: string; icon: typeof WalletCards; tone?: "default" | "good" | "warn" }) {
  return (
    <article className="metric-card"><div className={cn("metric-icon", tone === "good" && "text-emerald-300", tone === "warn" && "text-amber-300")}><Icon className="size-4" /></div><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-muted-foreground">{note}</p></article>
  );
}

function EmptyState({ icon: Icon, title, copy, action, onClick }: { icon: typeof LayoutDashboard; title: string; copy: string; action?: string; onClick?: () => void }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 px-5 py-8 text-center"><div><Icon className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{copy}</p>{action && onClick && <Button variant="outline" size="sm" className="mt-4" onClick={onClick}>{action}</Button>}</div></div>
  );
}

function EmptyCard({ title, copy, onClick }: { title: string; copy: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="course-card grid min-h-52 place-items-center border-dashed text-center"><div><Plus className="mx-auto size-5 text-primary" /><p className="mt-3 text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{copy}</p></div></button>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}<div className="mt-2">{children}</div></label>;
}

function InstallAppButton() {
  type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); };
  }, []);

  if (installed) return <div className="mt-5 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Installed on this device</div>;
  if (!prompt) return <p className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-muted-foreground">In Edge or Chrome, open the browser menu and choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>.</p>;

  return <Button className="mt-5" onClick={async () => { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === "accepted") setInstalled(true); setPrompt(null); }}><Sparkles /> Install Gerardo OS</Button>;
}

function QuickAddDialog({ open, onOpenChange, initialTab, workspace, onUpdate }: { open: boolean; onOpenChange: (open: boolean) => void; initialTab: AddTab; workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  const [priority, setPriority] = useState<Priority>("medium");
  const [area, setArea] = useState<"academic" | "finance" | "personal" | "career">("academic");
  const [courseId, setCourseId] = useState("general");
  const [taskKind, setTaskKind] = useState<TaskKind>("assignment");
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(2);
  const [taskEnergy, setTaskEnergy] = useState<TaskEnergy>("medium");
  const [recurrence, setRecurrence] = useState<TaskRecurrence | "none">("none");
  const [moneyType, setMoneyType] = useState<"expense" | "income">("expense");
  const [captureKind, setCaptureKind] = useState<"idea" | "link" | "question">("idea");

  useEffect(() => { if (open) setTab(initialTab); }, [initialTab, open]);

  const finish = (message: string) => { onOpenChange(false); toast.success(message); };
  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title") ?? "").trim(); if (!title) return;
    const estimatedMinutes = Math.max(5, Math.min(240, Math.round(Number(data.get("estimatedMinutes")) || 30)));
    onUpdate((current) => ({ ...current, tasks: [{
      id: makeId("task"),
      title,
      due: String(data.get("due") || addDaysIso(0)),
      priority,
      status: "todo",
      area,
      courseId: courseId === "general" ? undefined : courseId,
      kind: taskKind,
      difficulty,
      estimatedMinutes,
      energy: taskEnergy,
      recurrence: recurrence === "none" ? undefined : recurrence,
    }, ...current.tasks] }));
    finish("Task added");
  };
  const addCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title") ?? "").trim(); if (!title) return;
    onUpdate((current) => ({ ...current, courses: [...current.courses, { id: makeId("course"), code: String(data.get("code") || "COURSE").trim().toUpperCase(), title, instructor: String(data.get("instructor") || "Add instructor").trim(), color: String(data.get("color") || "#7c8cff"), progress: 0 }] }));
    finish("Course added");
  };
  const addMoney = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title") ?? "").trim(); const amount = Math.abs(Number(data.get("amount"))); if (!title || !amount) return;
    onUpdate((current) => ({ ...current, transactions: [{ id: makeId("money"), title, amount, type: moneyType, category: String(data.get("category") || "Other").trim(), date: String(data.get("date") || addDaysIso(0)) }, ...current.transactions] }));
    finish("Transaction logged");
  };
  const addProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title") ?? "").trim(); if (!title) return;
    onUpdate((current) => ({ ...current, projects: [...current.projects, { id: makeId("project"), title, area: String(data.get("area") || "Personal").trim(), progress: 0, nextAction: String(data.get("nextAction") || "Define the next action").trim() }] }));
    finish("Project added");
  };
  const addCapture = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const text = String(data.get("text") ?? "").trim(); if (!text) return;
    onUpdate((current) => ({ ...current, captures: [{ id: makeId("capture"), text, kind: captureKind, createdAt: new Date().toISOString() }, ...current.captures] }));
    finish("Captured to your inbox");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#10131c] sm:max-w-2xl">
        <DialogHeader><DialogTitle>Quick add</DialogTitle><DialogDescription>Put the item where it belongs without leaving your flow.</DialogDescription></DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as AddTab)}>
          <TabsList className="grid h-auto w-full grid-cols-5 bg-white/[0.045]">
            <TabsTrigger value="task">Task</TabsTrigger><TabsTrigger value="course">Course</TabsTrigger><TabsTrigger value="money">Money</TabsTrigger><TabsTrigger value="project">Project</TabsTrigger><TabsTrigger value="capture">Capture</TabsTrigger>
          </TabsList>
          <TabsContent value="task">
            <DialogForm onSubmit={addTask} submitLabel="Add task">
              <Field label="What needs doing?"><Input name="title" required autoFocus placeholder="Study Security+ or clean my room" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Purpose">
                  <Select value={taskKind} onValueChange={(value) => { const kind = value as TaskKind; setTaskKind(kind); if (kind === "chore") setArea("personal"); if (kind === "study") setArea("career"); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="assignment">Assignment</SelectItem><SelectItem value="study">Study / certification</SelectItem><SelectItem value="chore">Chore / home</SelectItem><SelectItem value="general">General</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Due date"><Input name="due" type="date" defaultValue={addDaysIso(0)} required /></Field>
                <Field label="Priority"><Select value={priority} onValueChange={(value) => setPriority(value as Priority)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select></Field>
                <Field label="Difficulty"><Select value={String(difficulty)} onValueChange={(value) => setDifficulty(Number(value) as TaskDifficulty)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Easy</SelectItem><SelectItem value="2">Medium</SelectItem><SelectItem value="3">Hard</SelectItem></SelectContent></Select></Field>
                <Field label="Estimated minutes"><Input name="estimatedMinutes" type="number" min={5} max={240} step={5} defaultValue={45} required /></Field>
                <Field label="Energy needed"><Select value={taskEnergy} onValueChange={(value) => setTaskEnergy(value as TaskEnergy)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></Field>
                <Field label="Repeat"><Select value={recurrence} onValueChange={(value) => setRecurrence(value as TaskRecurrence | "none")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Does not repeat</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></Field>
                <Field label="Area"><Select value={area} onValueChange={(value) => setArea(value as typeof area)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="academic">Academic</SelectItem><SelectItem value="career">Career</SelectItem><SelectItem value="finance">Finance</SelectItem><SelectItem value="personal">Personal</SelectItem></SelectContent></Select></Field>
                <Field label="Course"><Select value={courseId} onValueChange={setCourseId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem>{workspace.courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code}</SelectItem>)}</SelectContent></Select></Field>
              </div>
            </DialogForm>
          </TabsContent>
          <TabsContent value="course"><DialogForm onSubmit={addCourse} submitLabel="Add course"><Field label="Course title"><Input name="title" required placeholder="Network Security" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Course code"><Input name="code" placeholder="CIS 0000" /></Field><Field label="Instructor"><Input name="instructor" placeholder="Professor name" /></Field><Field label="Accent"><Select name="color" defaultValue="#7c8cff"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="#7c8cff">Indigo</SelectItem><SelectItem value="#22d3ee">Cyan</SelectItem><SelectItem value="#f59e0b">Amber</SelectItem><SelectItem value="#fb7185">Rose</SelectItem></SelectContent></Select></Field></div></DialogForm></TabsContent>
          <TabsContent value="money"><DialogForm onSubmit={addMoney} submitLabel="Log transaction"><Field label="Description"><Input name="title" required placeholder="Textbook, paycheck, groceries…" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></Field><Field label="Type"><Select value={moneyType} onValueChange={(value) => setMoneyType(value as typeof moneyType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></Field><Field label="Category"><Input name="category" placeholder="School, food, pay…" /></Field><Field label="Date"><Input name="date" type="date" defaultValue={addDaysIso(0)} required /></Field></div><p className="text-xs leading-5 text-muted-foreground">Only enter a description and amount. Never add a card number, bank login, PIN, or account number.</p></DialogForm></TabsContent>
          <TabsContent value="project"><DialogForm onSubmit={addProject} submitLabel="Add project"><Field label="Project title"><Input name="title" required placeholder="Build AWS portfolio lab" /></Field><Field label="Life area"><Input name="area" placeholder="Cloud & cybersecurity" /></Field><Field label="First next action"><Input name="nextAction" placeholder="Sketch the architecture" /></Field></DialogForm></TabsContent>
          <TabsContent value="capture"><DialogForm onSubmit={addCapture} submitLabel="Save capture"><Field label="What should your future self remember?"><Textarea name="text" required rows={4} placeholder="Idea, question, or useful link…" /></Field><Field label="Type"><Select value={captureKind} onValueChange={(value) => setCaptureKind(value as typeof captureKind)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="idea">Idea</SelectItem><SelectItem value="question">Question</SelectItem><SelectItem value="link">Link</SelectItem></SelectContent></Select></Field></DialogForm></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DialogForm({ onSubmit, submitLabel, children }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel: string; children: React.ReactNode }) {
  return <form onSubmit={onSubmit} className="space-y-4 pt-3">{children}<div className="flex justify-end pt-2"><Button type="submit">{submitLabel}</Button></div></form>;
}
