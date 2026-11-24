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
  ChevronLeft,
  ChevronRight,
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
  ListOrdered,
  Download,
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
  rankTasks,
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
  { value: "planner", label: "Next Move", icon: ListOrdered },
  { value: "academics", label: "Academics", icon: GraduationCap },
  { value: "finance", label: "Finances", icon: WalletCards },
  { value: "brain", label: "Second brain", icon: Brain },
  { value: "health", label: "System health", icon: Activity },
  { value: "settings", label: "Customize", icon: Settings2 },
];

const viewTitles: Record<ViewName, string> = {
  today: "Today",
  planner: "Next Move",
  academics: "Academics",
  finance: "Finances",
  brain: "Second brain",
  health: "System health",
  settings: "Customize",
};

// Stored accent keys are kept for existing browsers; they now name signal colors.
const accentHex: Record<Accent, string> = {
  indigo: "#e1251b",
  cyan: "#1f7fd1",
  amber: "#d98a0b",
  rose: "#d6336c",
};
const accentLabel: Record<Accent, string> = { indigo: "Red", cyan: "Blue", amber: "Ochre", rose: "Magenta" };

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
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-rule bg-background px-4 sm:px-6">
            <SidebarTrigger className="md:hidden" />
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
              {viewTitles[view]}
              <span className="font-normal text-muted-foreground"> · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
            </h1>
            <SyncBadge status={syncStatus} onRetry={() => void saveWorkspace(workspaceRef.current)} />
            <Button onClick={() => openQuickAdd()}>
              <Plus />
              <span className="hidden sm:inline">Quick add</span>
            </Button>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-card px-4 py-2 sm:px-6" role="note">
            <p className="text-muted-foreground"><strong className="font-extrabold text-foreground">Portfolio demo</strong> · Fictional sample data · Saved in this browser only</p>
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
                onStartFocus={startFocusForTask}
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
    <Sidebar collapsible="icon" className="border-r border-rule">
      <SidebarHeader className="h-14 justify-center border-b border-rule px-4 group-data-[collapsible=icon]:px-2">
        <p className="truncate text-[15px] font-black uppercase tracking-[0.04em] group-data-[collapsible=icon]:hidden">{appName}</p>
        <p className="hidden text-center text-[15px] font-black group-data-[collapsible=icon]:block" aria-hidden>G</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-4">
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
      <SidebarFooter className="border-t border-rule p-0">
        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {syncStatus === "offline" ? <CloudOff className="size-4 text-[color:var(--warn)]" /> : syncStatus === "local" ? <HardDrive className="size-4 text-[color:var(--info)]" /> : <Cloud className="size-4 text-[color:var(--ok)]" />}
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
          ? { icon: CloudOff, label: "Storage unavailable", className: "text-[color:var(--warn)]" }
          : status === "local"
            ? { icon: HardDrive, label: "Saved on this device", className: "text-[color:var(--info)]" }
          : { icon: CheckCircle2, label: "Synced", className: "text-[color:var(--ok)]" };
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
    <section className="recovery-strip mb-4" aria-label="Recently completed tasks">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          <h2 className="font-extrabold">Recently completed</h2>
          <span className="label">12-hour undo</span>
        </div>
        <p className="text-[13px] text-muted-foreground">Completed work is hidden, not deleted.</p>
      </div>
      <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {recent.map((task) => (
          <div key={task.id} className="flex min-w-0 items-center gap-3 border-t border-rule py-2">
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
        <Loader2 className="mx-auto mb-4 size-6 animate-spin" />
        <p className="font-extrabold">Opening the demo workspace</p>
        <p className="mt-1 text-muted-foreground">Loading sample data from this browser.</p>
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
  onStartFocus,
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
  onStartFocus: (task: Task, minutes: number) => void;
}) {
  const openTasks = workspace.tasks.filter((task) => task.status !== "done");
  const today = addDaysIso(0);
  const dueToday = openTasks.filter((task) => task.due === today).length;
  const overdue = openTasks.filter((task) => task.due && task.due < today).length;
  const nextTasks = [...openTasks].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 7);

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      <div className="summary-strip">
        <p><b>{openTasks.length}</b> open · <b>{dueToday}</b> due today · <b className={overdue ? "is-signal" : undefined}>{overdue} overdue</b> · <b>{daysUntil(workspace.settings.graduationDate).toLocaleString()}</b> days to graduation</p>
        <Button variant="ghost" size="sm" onClick={() => onOpenQuickAdd("task")}><Plus /> Add dated task</Button>
      </div>

      <WeekCalendar
        tasks={workspace.tasks}
        courses={workspace.courses}
        onMove={(id, due) => onUpdate((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === id ? { ...task, due } : task),
        }))}
      />

      <div className="today-grid">
        <section className="attention" aria-labelledby="attention-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="attention-heading" className="label !text-foreground">Needs attention</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("academics")}>All work <ArrowUpRight /></Button>
          </div>
          <TaskList
            tasks={nextTasks}
            courses={workspace.courses}
            onToggle={onToggleTask}
            onStatus={onTaskStatus}
            emptyText="Nothing is due. Add the next thing when it shows up."
          />
        </section>
        <div className="side">
          <TodayNextMove workspace={workspace} onStartFocus={onStartFocus} onOpenPlanner={() => onNavigate("planner")} />
          <FocusWidget presets={workspace.settings.focusPresets} launch={focusLaunch} />
        </div>
      </div>

      <div className="today-lower">
        <div className="border-b border-rule px-6 py-5 max-md:px-4"><SpotifyCard workspace={workspace} onUpdate={onUpdate} /></div>
        <Panel className="half-left" title="Sample projects" action={
          <Button variant="ghost" size="sm" asChild><a href={`https://github.com/Luckyyy-y/gerardo-os-demo`} target="_blank" rel="noreferrer">Open GitHub <ArrowUpRight /></a></Button>
        }>
          <GithubProjects />
        </Panel>
        <Panel className="half-right" title="Habits today">
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
        title="Academics"
        copy="Your enrolled classes, assignments, and course materials together."
        action={<div className="flex flex-wrap gap-2"><CanvasConnection workspace={workspace} onUpdate={onUpdate} /><Button variant="outline" onClick={() => onOpenQuickAdd("course")}><Plus /> Add course</Button></div>}
      />

      <div className="grid gap-x-8 md:grid-cols-2 2xl:grid-cols-3">
        {workspace.courses.map((course) => {
          const outstanding = academicTasks.filter((task) => task.courseId === course.id && task.status !== "done").length;
          return (
            <article key={course.id} className="course-card" style={{ "--course-color": course.color } as React.CSSProperties}>
              <div className="course-accent" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-extrabold">{course.title}</h3>
                  <p className="text-muted-foreground"><span className="font-semibold text-foreground">{course.code}</span> · {course.instructor}</p>{course.source === "canvas" && <div className="mt-2 flex gap-2 items-center"><Badge variant="outline">Canvas</Badge>{course.score != null && <span className="text-sm">Grade: {course.score}% {course.grade}</span>}{course.url && <a href={course.url} target="_blank" rel="noreferrer" className="text-sm text-foreground">Open class ↗</a>}</div>}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${course.title}`} onClick={() => onRemoveCourse(course.id)}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[13px] text-muted-foreground">
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
        <Panel className="xl:col-span-7" title="Lecture & deadline runway">
          <div className="-m-4 max-md:-m-[.85rem]"><WeekStrip tasks={academicTasks} /></div>
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

function HealthCard({ name, level, description, action }: {
  icon?: typeof Cloud;
  name: string;
  level: HealthLevel;
  description: string;
  action?: ReactNode;
}) {
  return (
    <article className="border-t border-rule py-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">{name}</h2>
            <span className="status-chip" data-level={level}>{healthLabel(level)}</span>
          </div>
          <p className="mt-2 max-w-[70ch] text-muted-foreground">{description}</p>
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
  return <div className="space-y-5"><SectionHeading title="System health" copy="The public demo uses your browser only. It does not check the private app or its accounts." />
    <div className="grid gap-x-10 lg:grid-cols-2">
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
        title="Finances"
        copy="Explore fictional expenses, income, and savings. Manual entries stay in this browser."
        action={<Button variant="outline" onClick={() => onOpenQuickAdd("money")}><Plus /> Add transaction</Button>}
      />

      <BankConnections banking={banking} />
      <div className="ledger">
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
                <div><p className="text-muted-foreground">Budget used</p><p className="mt-1 text-[1.6rem] font-extrabold">{budget ? `${budgetProgress}%` : "Not set"}</p></div>
                <p className="text-sm text-muted-foreground">{formatMoney(Math.max(0, budget - expenses))} left</p>
              </div>
              <Progress value={budgetProgress} className={cn(budgetProgress > 85 && "[&_[data-slot=progress-indicator]]:bg-signal")} />
            </div>
            <div>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div><p className="text-muted-foreground">Savings goal</p><p className="mt-1 text-[1.6rem] font-extrabold">{savingsProgress}%</p></div>
                <p className="text-sm text-muted-foreground">{formatMoney(workspace.settings.savingsGoal)}</p>
              </div>
              <Progress value={savingsProgress} />
            </div>
            <div className="border-t border-rule pt-4 text-[13px] text-muted-foreground">
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
        <Panel className="xl:col-span-5" title="About this demo" icon={Link2}>
          <div className="space-y-3">

            <p className="text-sm text-muted-foreground">The numbers here are sample data. Bank connections are disabled. Use Reset demo to restore the starting entries.</p>
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
      <SectionHeading title="Second brain" copy="Capture ideas and questions, organize them by area, turn the useful ones into tasks, and archive or delete them when you’re done." />
      <SecondBrainInbox workspace={workspace} onUpdate={onUpdate} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Active projects" icon={Target} action={
          <Button variant="outline" size="sm" onClick={() => onOpenQuickAdd("project")}><Plus /> Project</Button>
        }>
          <div className="grid gap-x-8 md:grid-cols-2">
            {workspace.projects.map((project) => (
              <article key={project.id} className="project-card">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-extrabold">{project.title}</h3><p className="capitalize text-muted-foreground">{project.area}</p></div>
                  <span className="font-extrabold">{project.progress}%</span>
                </div>
                <p className="mt-2 text-muted-foreground">Next: {project.nextAction}</p>
                <Slider value={[project.progress]} max={100} step={5} className="mt-5" aria-label={`${project.title} progress`} onValueChange={(value) => onProjectProgress(project.id, value[0] ?? 0)} />
              </article>
            ))}
            {workspace.projects.length === 0 && <EmptyCard title="No active projects" copy="Give your next outcome a name and one concrete action." onClick={() => onOpenQuickAdd("project")} />}
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Habits today">
          <div className="space-y-2">
            {workspace.habits.map((habit) => (
              <label key={habit.id} className="subtle-row cursor-pointer">
                <Checkbox checked={habit.done} onCheckedChange={(value) => onToggleHabit(habit.id, value === true)} />
                <span className={cn("flex-1 text-sm", habit.done && "text-muted-foreground line-through")}>{habit.title}</span>
                {habit.done && <CheckCircle2 className="size-4" />}
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
                <ExternalLink className="size-4 shrink-0" />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold group-hover:underline">{resource.title}</p><p className="text-[13px] text-muted-foreground">{resource.tag}</p></div>
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
      <SectionHeading title="Customize" copy="Appearance, music, storage, and the numbers you track can all be changed here." />
      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Workspace" icon={Settings2}>
          <form onSubmit={save} className="space-y-6">
            <Field label="App name" hint="Shown in the sidebar and header.">
              <Input value={draft.appName} onChange={(event) => setDraft({ ...draft, appName: event.target.value })} maxLength={32} />
            </Field>
            <Field label="Signal color" hint="Colors today's column, the main buttons and overdue marks.">
              <div className="flex flex-wrap gap-3">
                {(Object.keys(accentHex) as Accent[]).map((accent) => (
                  <button key={accent} type="button" aria-label={`Use ${accentLabel[accent]}`} aria-pressed={draft.accent === accent} onClick={() => setDraft({ ...draft, accent })} className={cn("accent-choice", draft.accent === accent && "is-selected")}>
                    <span style={{ backgroundColor: accentHex[accent] }} />
                    <span>{accentLabel[accent]}</span>
                  </button>
                ))}
              </div>
            </Field>
            <p className="notice text-muted-foreground">Live Spotify, GitHub, Canvas, and bank connections are disabled. Customize the sample workspace without entering account credentials.</p>
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
            <div className="flex items-center justify-between gap-4 border-t border-rule pt-4">
              <div><p className="font-semibold">Compact layout</p><p className="mt-1 text-[13px] text-muted-foreground">Fit more on the desktop monitor.</p></div>
              <Switch checked={draft.compactMode} onCheckedChange={(checked) => setDraft({ ...draft, compactMode: checked })} aria-label="Compact layout" />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-rule pt-4">
              <div><p className="font-semibold">Pure black background</p><p className="mt-1 text-[13px] text-muted-foreground">Use OLED black instead of the carbon background.</p></div>
              <Switch checked={draft.pureBlack || false} onCheckedChange={(checked) => setDraft({ ...draft, pureBlack: checked })} aria-label="Pure black background" />
            </div>
            <div className="flex justify-end"><Button type="submit">Save customization</Button></div>
          </form>
        </Panel>

        <div className="space-y-5 xl:col-span-5">
          <Panel title="Install as an app">
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

function Panel({ title, action, className, children }: { title: string; icon?: typeof LayoutDashboard; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("panel", className)}>
      <div className="panel-heading">
        <h2 className="min-w-0 truncate">{title}</h2>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function SectionHeading({ title, copy, action }: { eyebrow?: string; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-b border-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><h2 className="view-title">{title}</h2><p className="mt-3 max-w-[65ch] text-muted-foreground">{copy}</p></div>
      {action}
    </section>
  );
}

function TaskList({ tasks, courses, onToggle, onStatus, emptyText }: { tasks: WorkspaceState["tasks"]; courses: WorkspaceState["courses"]; onToggle: (id: string, checked: boolean) => void; onStatus: (id: string, status: TaskStatus) => void; emptyText: string }) {
  if (!tasks.length) return <EmptyState icon={CheckCircle2} title="Clear runway" copy={emptyText} />;
  return (
    <div>
      {tasks.map((task) => {
        const course = courses.find((item) => item.id === task.courseId);
        const today = addDaysIso(0), late = Boolean(task.due && task.due < today && task.status !== "done"), dueNow = task.due === today;
        return (
          <div key={task.id} className={cn("task-row", (late || dueNow) && "is-hot", task.status === "done" && "opacity-55")}>
            <Checkbox checked={task.status === "done"} onCheckedChange={(value) => onToggle(task.id, value === true)} aria-label={`Mark ${task.title} complete`} />
            <div className="min-w-0 flex-1"><p className={cn("task-title break-words font-semibold", task.status === "done" && "line-through")}>{task.title}</p><div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground"><span className="course-swatch" style={{ "--swatch": course?.color } as React.CSSProperties} /><span className="font-semibold capitalize text-foreground/80">{course?.code ?? task.area}</span><span>·</span>{late && <span className="overdue-tag">Overdue</span>}<span className={late || dueNow ? "text-foreground" : ""}>{formatDate(task.due)}</span></div></div>
            <PriorityBadge priority={task.priority} />
            <TaskStatusSelect value={task.status} onChange={(status) => onStatus(task.id, status)} />
          </div>
        );
      })}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant="outline" className={cn("priority-badge", `priority-${priority}`)}>{priority}</Badge>;
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
    <div className="grid grid-cols-7 border-t border-rule">
      {days.map((day, index) => (
        <div key={day.iso} className={cn("day-cell", index === 0 && "is-today", index === 6 && "border-r-0")}>
          <p className="label !text-current opacity-80">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date)}</p>
          <p className="display mt-1 text-4xl">{day.date.getDate()}</p>
          <p className="mt-3 font-semibold">{day.tasks.length ? `${day.tasks.length} due` : "—"}</p>
          <ul className="mt-1 space-y-1">{day.tasks.slice(0, 2).map((task) => <li key={task.id} className="truncate text-[13px] opacity-80" title={task.title}>{task.title}</li>)}</ul>
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

  const total = mode * 60;
  const elapsed = total ? 1 - seconds / total : 0;
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const state = running ? "running" : seconds === 0 ? "finished" : seconds < total ? "paused" : "ready";

  return (
    <section className="focus-card" aria-label="Focus timer">
      <h2 className="sr-only">Focus timer</h2>
      <div role="timer" aria-label="Time remaining" className={cn("timer-readout", running && "is-running")}>{display}</div>
      <div className="timer-bar mt-3" aria-hidden><span style={{ width: `${Math.min(100, elapsed * 100)}%` }} /></div>
      <p className="mt-2 text-muted-foreground"><b className="text-foreground">Focus timer</b> · {state}{launch ? <> · <span className="break-words text-foreground">{launch.title}</span></> : null}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="preset-row" role="group" aria-label="Focus length">{choices.map((minutes) => <button type="button" key={minutes} aria-pressed={mode === minutes} onClick={() => changeMode(minutes)}>{minutes}</button>)}</div>
        <form className="flex items-center gap-1" onSubmit={setManualTime}><Input type="number" inputMode="numeric" min={1} max={240} step={1} value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} aria-label="Custom timer minutes" className="h-8 w-16" /><Button type="submit" size="sm" variant="ghost">Set</Button></form>
      </div>
      <div className="mt-4 flex gap-2"><Button variant={running ? "default" : "outline"} onClick={() => { if (!running && seconds <= 0) setSeconds(mode * 60); setRunning((value) => !value); }}>{running ? <Pause /> : <Play />}{running ? "Pause" : state === "paused" ? "Resume" : `Start ${mode} min`}</Button><Button size="icon" variant="outline" aria-label="Reset timer" onClick={() => { setSeconds(mode * 60); setRunning(false); }}><RotateCcw /></Button></div>
    </section>
  );
}

function TodayNextMove({ workspace, onStartFocus, onOpenPlanner }: { workspace: WorkspaceState; onStartFocus: (task: Task, minutes: number) => void; onOpenPlanner: () => void }) {
  const block = 50;
  const top = rankTasks(workspace.tasks, { availableMinutes: block, energy: "medium" })[0];
  const minutes = top ? Math.min(top.estimatedMinutes, block) : block;
  return (
    <section className="next-block" aria-label="Next move">
      {top ? <>
        <h2 className="next-title !mt-0">{top.task.title}</h2>
        <p className="text-muted-foreground"><b className="text-foreground">Next move</b> · {top.reasons.length ? top.reasons.slice(0, 3).join(" · ") : `ranked for a ${block}-minute block at medium energy`}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => onStartFocus(top.task, minutes)}><Play /> Start {minutes} min focus</Button>
          <Button variant="outline" onClick={onOpenPlanner}>Other options</Button>
        </div>
      </> : <>
        <h2 className="next-title !mt-0 text-muted-foreground">Nothing to recommend</h2>
        <p className="text-muted-foreground">Add a sample task with a date and Next Move will rank it.</p>
      </>}
    </section>
  );
}

function WeekCalendar({ tasks, courses, onMove }: { tasks: WorkspaceState["tasks"]; courses: WorkspaceState["courses"]; onMove: (id: string, due: string) => void }) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const today = addDaysIso(0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const iso = addDaysIso(offset + index);
    return { date: new Date(`${iso}T12:00:00`), iso };
  });
  const moving = tasks.find((task) => task.id === selectedTask);
  const range = `${days[0].date.toLocaleDateString(undefined, { month: "long", day: "numeric" })} – ${days[6].date.toLocaleDateString(undefined, days[0].date.getMonth() === days[6].date.getMonth() ? { day: "numeric" } : { month: "long", day: "numeric" })}`;
  const move = (id: string, iso: string) => { onMove(id, iso); setSelectedTask(null); toast.success(`Moved to ${formatDate(iso)}`); };
  return (
    <section aria-label="Week calendar">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 max-md:px-4">
        <h2 className="text-[15px] font-extrabold">{range}</h2>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" aria-label="Previous week" onClick={() => setOffset(offset - 7)}><ChevronLeft /></Button>
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(0)}>Today</Button>
          <Button size="icon-sm" variant="outline" aria-label="Next week" onClick={() => setOffset(offset + 7)}><ChevronRight /></Button>
        </div>
      </div>
      {moving && <div className="flex flex-wrap items-center gap-3 border-t border-rule px-6 py-2 text-[13px] max-md:px-4"><span>Choose a new date for <b>{moving.title}</b>.</span><Button size="xs" variant="ghost" onClick={() => setSelectedTask(null)}>Cancel</Button></div>}
      <div className="planning-week">
        {days.map((day) => {
          const list = tasks.filter((task) => task.due === day.iso && task.status !== "done");
          return (
            <div key={day.iso} className={cn("calendar-day", day.iso === today && "is-today", day.iso < today && "is-past")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData("text/task-id"); if (id) move(id, day.iso); }}>
              <div className="day-head">
                <span className="label">{day.date.toLocaleDateString(undefined, { weekday: "short" })}{day.iso === days[0].iso || day.date.getDate() === 1 ? ` · ${day.date.toLocaleDateString(undefined, { month: "short" })}` : ""}</span>
                <span className="day-numeral" aria-label={day.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}>{day.date.getDate()}</span>
              </div>
              {selectedTask && <Button size="xs" variant={day.iso === today ? "secondary" : "outline"} className="mb-2 w-full" onClick={() => move(selectedTask, day.iso)}>Move to {day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Button>}
              {list.map((task) => {
                const course = courses.find((item) => item.id === task.courseId);
                return (
                  <article key={task.id} className={cn("calendar-task", selectedTask === task.id && "is-selected")}>
                    <div className="task-line"><span className="course-swatch translate-y-[1px]" style={{ "--swatch": course?.color } as React.CSSProperties} /><span className="min-w-0"><span className="block break-words font-semibold">{task.title}</span><span className="muted block capitalize text-muted-foreground">{course?.code || task.area}</span></span></div>
                    <div className="task-actions pl-[17px]"><button type="button" draggable onClick={() => setSelectedTask((current) => current === task.id ? null : task.id)} onDragStart={(event) => { event.dataTransfer.setData("text/task-id", task.id); event.dataTransfer.effectAllowed = "move"; }} aria-label={`Move ${task.title}`}>Move</button></div>
                  </article>
                );
              })}
              {!list.length && <p className="muted border-t border-rule pt-2 text-muted-foreground">Nothing scheduled</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GithubProjects() {
  return <div><p className="mb-2 text-muted-foreground">Sample workspace projects, not live GitHub activity.</p>{["Cloud architecture exercise", "Network troubleshooting lab"].map(title => <div className="subtle-row" key={title}><FolderGit2 className="size-4 shrink-0" /><div><p className="font-semibold">{title}</p><p className="text-[13px] text-muted-foreground">Fictional demo project</p></div></div>)}</div>;
}

function EditableHabits({ workspace, onToggle, onUpdate }: { workspace: WorkspaceState; onToggle: (id: string, checked: boolean) => void; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const add = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("habit") || "").trim(); if (!title) return; onUpdate((current) => ({ ...current, habits: [...current.habits, { id: makeId("habit"), title, done: false }] })); form.reset(); };
  return <div className="space-y-3"><form onSubmit={add} className="flex gap-2"><Input name="habit" placeholder="Add your own habit" aria-label="New habit" /><Button type="submit" size="icon" aria-label="Add habit"><Plus /></Button></form><div className="grid gap-x-6 sm:grid-cols-2">{workspace.habits.map((habit) => <div key={habit.id} className="subtle-row"><Checkbox checked={habit.done} onCheckedChange={(value) => onToggle(habit.id, value === true)} /><span className={cn("min-w-0 flex-1 truncate text-sm", habit.done && "text-muted-foreground line-through")}>{habit.title}</span><Button size="icon-xs" variant="ghost" aria-label={`Remove ${habit.title}`} onClick={() => onUpdate((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habit.id) }))}><Trash2 /></Button></div>)}</div></div>;
}

function SubscriptionTracker({ workspace, onUpdate }: { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const subscriptions = workspace.subscriptions || [];
  const monthly = subscriptions.reduce((sum, item) => sum + item.amount, 0);
  const add = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const name = String(data.get("name") || "").trim(); const amount = Math.abs(Number(data.get("amount"))); if (!name || !amount) return; onUpdate((current) => ({ ...current, subscriptions: [...(current.subscriptions || []), { id: makeId("subscription"), name, amount, billingDay: Math.max(1, Math.min(31, Number(data.get("day")) || 1)), category: "Subscription" }] })); form.reset(); };
  return <div className="space-y-4"><div><div className="flex items-end justify-between"><div><p className="text-muted-foreground">Recurring monthly</p><p className="mt-1 text-[1.6rem] font-extrabold">{formatMoney(monthly)}</p></div><span className="text-xs text-muted-foreground">{subscriptions.length} active</span></div><Progress value={Math.min(100, workspace.settings.monthlyBudget ? monthly / workspace.settings.monthlyBudget * 100 : 0)} className="mt-3" /></div><form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]"><Input name="name" placeholder="Spotify" aria-label="Subscription name" /><Input name="amount" type="number" min="0.01" step="0.01" placeholder="$" aria-label="Monthly amount" /><Input name="day" type="number" min="1" max="31" placeholder="Day" aria-label="Billing day" /><Button type="submit"><Plus /> Add</Button></form><div className="space-y-2">{subscriptions.map((item) => <div key={item.id} className="subtle-row"><RefreshCw className="size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">Bills on day {item.billingDay}</p></div><span className="text-sm font-medium">{formatMoney(item.amount)}</span><Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => onUpdate((current) => ({ ...current, subscriptions: (current.subscriptions || []).filter((entry) => entry.id !== item.id) }))}><Trash2 /></Button></div>)}</div></div>;
}

function NotesMiniCard({ onOpenNotes }: { onOpenNotes: () => void }) {
  return (
    <section className="notes-mini-card">
      <NotebookPen className="size-5 shrink-0" />
      <div className="min-w-0 flex-1"><h2 className="font-extrabold">Samsung Notes</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Desktop launcher disabled in this public demo.</p></div>
      <Button size="sm" variant="outline" onClick={onOpenNotes}>Open <ArrowUpRight /></Button>
    </section>
  );
}

function NotesDock({ onOpenNotes, className }: { onOpenNotes: () => void; className?: string }) {
  return (
    <section className={cn("notes-dock", className)}>
      <div><h2 className="label !text-foreground">Samsung Notes</h2><p className="mt-3 max-w-[48ch] text-muted-foreground">The private app can launch Samsung Notes. This demo shows the design without launching applications.</p></div>
      <div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={onOpenNotes}><NotebookPen /> Open Samsung Notes</Button><Button variant="outline" asChild><a href="https://www.samsung.com/us/support/owners/app/samsung-notes/" target="_blank" rel="noreferrer">Notes help <ExternalLink /></a></Button></div>
    </section>
  );
}

function MetricCard({ label, value, note, tone = "default" }: { label: string; value: string; note: string; icon?: typeof WalletCards; tone?: "default" | "good" | "warn" }) {
  return (
    <article className={cn("metric-card", tone === "warn" && "is-warn")}><p className="label">{label}</p><p className="metric-value">{value}</p><p className="mt-2 text-[13px] text-muted-foreground">{note}</p></article>
  );
}

function EmptyState({ title, copy, action, onClick }: { icon?: typeof LayoutDashboard; title: string; copy: string; action?: string; onClick?: () => void }) {
  return (
    <div className="border-t border-rule py-6"><p className="font-extrabold">{title}</p><p className="mt-1 max-w-[60ch] text-muted-foreground">{copy}</p>{action && onClick && <Button variant="outline" size="sm" className="mt-4" onClick={onClick}>{action}</Button>}</div>
  );
}

function EmptyCard({ title, copy, onClick }: { title: string; copy: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full border-t border-rule py-5 text-left hover:bg-secondary"><span className="flex items-center gap-2 font-extrabold"><Plus className="size-4" />{title}</span><span className="mt-1 block max-w-[60ch] text-muted-foreground">{copy}</span></button>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="font-semibold">{label}</span>{hint && <span className="mt-1 block max-w-[65ch] text-[13px] text-muted-foreground">{hint}</span>}<div className="mt-2">{children}</div></label>;
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

  if (installed) return <div className="mt-5 flex items-center gap-2 text-sm text-[color:var(--ok)]"><CheckCircle2 className="size-4" />Installed on this device</div>;
  if (!prompt) return <p className="mt-4 text-muted-foreground">In Edge or Chrome, open the browser menu and choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>.</p>;

  return <Button className="mt-5" onClick={async () => { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === "accepted") setInstalled(true); setPrompt(null); }}><Download /> Install Gerardo OS</Button>;
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
    onUpdate((current) => ({ ...current, courses: [...current.courses, { id: makeId("course"), code: String(data.get("code") || "COURSE").trim().toUpperCase(), title, instructor: String(data.get("instructor") || "Add instructor").trim(), color: String(data.get("color") || "#2f6bd8"), progress: 0 }] }));
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
      <DialogContent className="max-h-[90vh] overflow-y-auto border-rule bg-[#10131c] sm:max-w-2xl">
        <DialogHeader><DialogTitle>Quick add</DialogTitle><DialogDescription>Put the item where it belongs without leaving your flow.</DialogDescription></DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as AddTab)}>
          <TabsList className="grid h-auto w-full grid-cols-5 bg-card">
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
