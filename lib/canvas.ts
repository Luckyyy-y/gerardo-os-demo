import type { Course, Task, WorkspaceState } from "./workspace";

export type CanvasImport = {
  mode: "feed" | "api";
  courses: Course[];
  assignments: Task[];
  announcements: NonNullable<WorkspaceState["canvas"]>["announcements"];
  modules: NonNullable<WorkspaceState["canvas"]>["modules"];
  warnings: string[];
  syncedAt: string;
};
export const courseColors = ["#7c8cff", "#22d3ee", "#f59e0b", "#fb7185", "#34d399", "#a78bfa"];
export function calendarDay(iso: string, timeZone = "America/Chicago") {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}
export function cleanIcs(value: string) { return value.replace(/\\[nN]/g, "\n").replace(/\\([,;\\])/g, "$1").trim(); }
export function canvasCode(value: string) { return value.match(/\b[A-Z]{2,5}\s*\d{4}\b/i)?.[0].toUpperCase().replace(/\s/g, "") || value.trim().toLowerCase(); }
function textHash(value: string) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); }

export function parseCanvasCalendar(raw: string, timeZone = "America/Chicago"): CanvasImport {
  if (!/BEGIN:VCALENDAR/i.test(raw) || !/END:VCALENDAR/i.test(raw)) throw new Error("Canvas returned a web page instead of a calendar. Copy Calendar → Calendar Feed → the .ics link, not the calendar page address.");
  // Canvas normally emits CRLF, but some institutional proxies normalize it
  // to lone CR. Normalize both forms before unfolding RFC 5545 lines.
  const text = raw.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  const courses = new Map<string, Course>(); const assignments = new Map<string, Task>(); const warnings: string[] = [];
  let eventCount = 0; let importedEventCount = 0; let skippedEventCount = 0;
  for (const match of text.matchAll(/BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/gi)) {
    eventCount += 1;
    const fields = new Map<string, { value: string; params: string }>();
    for (const line of match[1].split("\n")) {
      const separator = line.indexOf(":"); if (separator < 0) continue;
      const [name, ...params] = line.slice(0, separator).split(";");
      fields.set(name.toUpperCase(), { value: cleanIcs(line.slice(separator + 1)), params: params.join(";") });
    }
    if (fields.get("STATUS")?.value === "CANCELLED") continue;
    const summary = fields.get("SUMMARY")?.value; const start = fields.get("DTSTART");
    if (!summary || !start) { skippedEventCount += 1; continue; }
    const d = start.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:(\d{2}))?(Z|[+-]\d{4})?)?$/i);
    if (!d) { skippedEventCount += 1; continue; }
    let due = `${d[1]}-${d[2]}-${d[3]}`; let dueAt: string | undefined;
    if (d[4]) {
      const wallClock = `${due}T${d[4]}:${d[5]}:${d[6] || "00"}`;
      const suffix = d[7]?.toUpperCase();
      if (suffix === "Z") dueAt = `${wallClock}Z`;
      else if (suffix && /^[+-]\d{4}$/.test(suffix)) {
        const offsetMinutes = (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(3))) * (suffix[0] === "+" ? 1 : -1);
        dueAt = new Date(Date.parse(`${wallClock}Z`) - offsetMinutes * 60_000).toISOString();
      }
      else {
        const zone = (start.params.match(/TZID="?([^;"\s]+)/)?.[1] || timeZone).replace(/^\//, "");
        try {
          const target = Date.parse(wallClock + "Z"); let guess = target;
          for (let i = 0; i < 3; i++) {
            const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
            const get = (type: string) => p.find(x => x.type === type)!.value;
            guess += target - Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
          }
          dueAt = new Date(guess).toISOString();
        } catch { warnings.push("One calendar time zone was unrecognized; its calendar date was kept."); }
      }
      if (dueAt) due = calendarDay(dueAt, timeZone);
    }
    const sourceUrl = fields.get("URL")?.value || fields.get("DESCRIPTION")?.value.match(/https:\/\/[^\s<>]+\/courses\/\d+(?:\/assignments\/\d+)?/)?.[0];
    const courseNumber = sourceUrl?.match(/\/courses\/(\d+)/)?.[1] || fields.get("X-CANVAS-COURSE-ID")?.value.match(/^\d+$/)?.[0];
    const canvasCourseLabel = ["X-CANVAS-COURSE-NAME", "X-CANVAS-COURSE", "X-CANVAS-CALENDAR"].map(name => fields.get(name)?.value).find(Boolean);
    const categoryLabel = fields.get("CATEGORIES")?.value.split(",")[0].trim();
    const label = summary.match(/\s*\[([^\]]+)\]\s*$/)?.[1] || canvasCourseLabel || categoryLabel;
    const matchingLabel = label ? [...courses.values()].find(course => canvasCode(course.code) === canvasCode(label)) : undefined;
    const courseId = courseNumber ? `canvas-course-${courseNumber}` : matchingLabel?.id || (label ? `canvas-course-feed-${textHash(canvasCode(label))}` : undefined);
    if (courseId && !courses.has(courseId)) courses.set(courseId, { id: courseId, externalId: courseNumber, source: "canvas", code: label || `Canvas ${courseNumber}`, title: label || `Canvas course ${courseNumber}`, instructor: "From calendar feed", progress: 0, color: courseColors[courses.size % courseColors.length], url: sourceUrl?.match(/^(https:\/\/[^/]+\/courses\/\d+)/)?.[1] });
    const uid = fields.get("UID")?.value || `${summary}-${start.value}`;
    const externalId = sourceUrl?.match(/\/assignments\/(\d+)/)?.[1];
    const id = externalId && courseNumber ? `canvas-assignment-${courseNumber}-${externalId}` : `canvas-${uid}`;
    assignments.set(id, { id, title: summary.replace(/\s*\[[^\]]+\]\s*$/, ""), due, dueAt, courseId, source: "canvas", externalId, sourceUid: uid, sourceUrl, priority: "medium", status: "todo", area: "academic" });
    importedEventCount += 1;
  }
  if (!eventCount) throw new Error("Canvas loaded the feed but it contained no calendar events. Re-copy the private Calendar Feed link and try again.");
  if (!importedEventCount) throw new Error("Canvas returned calendar events, but none had a readable title and date. Re-copy the private Calendar Feed link and try again.");
  if (skippedEventCount) warnings.push(`${skippedEventCount} Canvas calendar item${skippedEventCount === 1 ? " was" : "s were"} skipped because its title or date could not be read.`);
  return { mode: "feed", courses: [...courses.values()], assignments: [...assignments.values()], announcements: [], modules: [], warnings: [...new Set(warnings)], syncedAt: new Date().toISOString() };
}

export function mergeCanvas(current: WorkspaceState, incoming: CanvasImport): WorkspaceState {
  const courses = [...current.courses]; const ids = new Map<string, string>();
  for (const course of incoming.courses) {
    let index = courses.findIndex(c => c.id === course.id || (c.externalId && c.externalId === course.externalId));
    if (index < 0) { const candidates = courses.map((c, i) => ({ c, i })).filter(({ c }) => !c.externalId && canvasCode(c.code) === canvasCode(course.code)); if (candidates.length === 1) index = candidates[0].i; }
    if (index >= 0) { const existing = courses[index]; ids.set(course.id, existing.id); courses[index] = { ...existing, ...course, id: existing.id, color: existing.color, progress: incoming.mode === "feed" ? existing.progress : course.progress }; }
    else { courses.push(course); ids.set(course.id, course.id); }
  }
  const tasks = [...current.tasks];
  for (const assignment of incoming.assignments) {
    const courseId = assignment.courseId ? ids.get(assignment.courseId) || assignment.courseId : undefined;
    let index = tasks.findIndex(t => t.id === assignment.id || (assignment.sourceUid && t.id === `canvas-${assignment.sourceUid}`) || (t.source === "canvas" && t.externalId && t.externalId === assignment.externalId && t.courseId === courseId));
    if (index < 0) index = tasks.findIndex(t => t.id.startsWith("canvas-") && !t.externalId && t.title.replace(/\s*\[[^\]]+\]\s*$/, "") === assignment.title && t.due === assignment.due && (!t.courseId || t.courseId === courseId));
    if (index >= 0) { const previous = tasks[index]; tasks[index] = { ...previous, ...assignment, id: previous.id, courseId, priority: previous.priority, status: assignment.submitted ? "done" : previous.status }; }
    else tasks.push({ ...assignment, courseId });
  }
  // A feed has a limited date window; absence is never treated as deletion.
  const remap = <T extends { courseId: string }>(items: T[]) => items.map(item => ({ ...item, courseId: ids.get(item.courseId) || item.courseId }));
  return { ...current, courses, tasks, canvas: { lastSyncedAt: incoming.syncedAt, mode: incoming.mode, warnings: incoming.warnings, announcements: incoming.mode === "api" ? remap(incoming.announcements) : current.canvas?.announcements || [], modules: incoming.mode === "api" ? remap(incoming.modules) : current.canvas?.modules || [] } };
}
