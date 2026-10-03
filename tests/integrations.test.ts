import assert from "node:assert/strict";
import test from "node:test";
import { env, rawRow, resetDb } from "cloudflare:workers";
import { createStarterState, type Task } from "../lib/workspace";
import { mergeCanvas, parseCanvasCalendar } from "../lib/canvas";
import { canvasUrl, importFeed } from "../lib/server/canvas";
import { AppError, ownerFrom } from "../lib/server/http";
import { applyTransactionPage, financeTotals, normalizeBankTransaction, type BankTransaction } from "../lib/banking";
import { bankConfig, getBanks, syncBanks } from "../lib/server/plaid";
import { readIntegration, writeIntegration } from "../db/integration-store";
import { spotifyConnect, spotifyUri } from "../lib/spotify";
import {
  TASK_UNDO_WINDOW_MS,
  advanceRecurringDue,
  completeTask,
  isTaskCompletionUndoable,
  rankTasks,
  recentlyCompletedTasks,
  undoTaskCompletion,
} from "../lib/planner";

const originalFetch = globalThis.fetch;
const key = "0123456789abcdef".repeat(4);

test("Next Move ranks urgent hard work ahead of distant low-priority tasks", () => {
  const tasks: Task[] = [
    { id: "later", title: "Organize downloads", due: "2026-09-25", priority: "low", status: "todo", area: "personal", difficulty: 1, estimatedMinutes: 15, energy: "low" },
    { id: "urgent", title: "Finish secure application assignment", due: "2026-09-16", priority: "high", status: "todo", area: "academic", difficulty: 3, estimatedMinutes: 45, energy: "high" },
  ];
  const ranked = rankTasks(tasks, { availableMinutes: 45, energy: "high" }, new Date("2026-09-15T12:00:00"));
  assert.equal(ranked[0].task.id, "urgent");
  assert.ok(ranked[0].reasons.includes("Hard task—start early"));
});

test("Next Move responds to available time and energy", () => {
  const tasks: Task[] = [
    { id: "deep", title: "Complete the AWS lab", due: "2026-09-20", priority: "medium", status: "todo", area: "academic", difficulty: 3, estimatedMinutes: 90, energy: "high" },
    { id: "quick", title: "Clean my room", due: "2026-09-20", priority: "medium", status: "todo", area: "personal", kind: "chore", difficulty: 1, estimatedMinutes: 15, energy: "low" },
  ];
  const ranked = rankTasks(tasks, { availableMinutes: 15, energy: "low" }, new Date("2026-09-15T12:00:00"));
  assert.equal(ranked[0].task.id, "quick");
});

test("recurring tasks advance to the next future occurrence", () => {
  assert.equal(advanceRecurringDue("2026-09-10", "daily", new Date("2026-09-15T12:00:00")), "2026-09-16");
  assert.equal(advanceRecurringDue("2026-09-15", "weekly", new Date("2026-09-15T12:00:00")), "2026-09-22");
  assert.equal(advanceRecurringDue("2026-01-31", "monthly", new Date("2026-01-31T12:00:00")), "2026-02-28");
});

test("completed tasks remain undoable for exactly the 12-hour grace period", () => {
  const task: Task = { id: "essay", title: "Finish essay", due: "2026-09-16", priority: "high", status: "doing", area: "academic" };
  const completedAt = new Date("2026-09-15T08:00:00.000Z");
  const completed = completeTask(task, completedAt);

  assert.equal(completed.status, "done");
  assert.equal(completed.completedFromStatus, "doing");
  assert.equal(isTaskCompletionUndoable(completed, completedAt.getTime() + TASK_UNDO_WINDOW_MS - 1), true);
  assert.equal(isTaskCompletionUndoable(completed, completedAt.getTime() + TASK_UNDO_WINDOW_MS), false);
  assert.equal(isTaskCompletionUndoable({ ...completed, completedFromStatus: undefined }, completedAt.getTime()), false);

  const restored = undoTaskCompletion(completed);
  assert.equal(restored.status, "doing");
  assert.equal(restored.lastCompletedAt, undefined);
});

test("undoing a recurring task restores its previous due date and recent completions sort newest first", () => {
  const recurring: Task = { id: "room", title: "Clean my room", due: "2026-09-15", priority: "medium", status: "todo", area: "personal", recurrence: "weekly" };
  const first = completeTask(recurring, new Date("2026-09-15T08:00:00.000Z"));
  const second = completeTask({ ...recurring, id: "study", title: "Study Security+" }, new Date("2026-09-15T09:00:00.000Z"));

  assert.equal(first.due, "2026-09-22");
  assert.equal(first.status, "todo");
  assert.deepEqual(recentlyCompletedTasks([first, second], Date.parse("2026-09-15T10:00:00.000Z")).map((task) => task.id), ["study", "room"]);

  const restored = undoTaskCompletion(first);
  assert.equal(restored.due, "2026-09-15");
  assert.equal(restored.status, "todo");
});

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" }, ...init });
}

function withFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
  return () => { globalThis.fetch = originalFetch; };
}

test("Canvas parser keeps folded text, all-day dates, timezone dates, and stable feed ids", () => {
  const feed = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:legacy-1",
    "DTSTART;TZID=America/Chicago:20260907T233000", "SUMMARY:Submit paper [CIS 3337]",
    "URL:https://canvas.uh.edu/courses/42/assignments/9", "END:VEVENT",
    "BEGIN:VEVENT", "UID:all-day", "DTSTART;VALUE=DATE:20260908", "SUMMARY:Read the syllabus",
    "CATEGORIES:CIS 3337", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const parsed = parseCanvasCalendar(feed, "America/Chicago");
  assert.equal(parsed.courses.length, 1);
  assert.equal(parsed.assignments.length, 2);
  const timed = parsed.assignments.find(item => item.externalId === "9")!;
  assert.equal(timed.id, "canvas-assignment-42-9");
  assert.equal(timed.sourceUid, "legacy-1");
  assert.equal(timed.due, "2026-09-07");
  assert.equal(parsed.assignments.find(item => item.sourceUid === "all-day")!.dueAt, undefined);
});

test("Canvas parser accepts institutional lone-CR feeds and rejects an empty calendar", () => {
  const parsed = parseCanvasCalendar("begin:vcalendar\rversion:2.0\rbegin:vevent\ruid:cr-only\rdtstart;value=date:20260909\rsummary:Study session\rend:vevent\rend:vcalendar", "America/Chicago");
  assert.equal(parsed.assignments[0].title, "Study session");
  assert.equal(parsed.assignments[0].due, "2026-09-09");
  assert.throws(() => parseCanvasCalendar("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR"), /no calendar events/);
  assert.throws(() => parseCanvasCalendar("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:no-date\nSUMMARY:No date\nEND:VEVENT\nEND:VCALENDAR"), /none had a readable title and date/);
});

test("Canvas merge updates a legacy feed task when its due date changes and is idempotent", () => {
  const current = createStarterState();
  const legacy: Task = { id: "canvas-legacy-uid", title: "Submit paper", due: "2026-09-07", priority: "high", status: "doing", area: "academic", source: "canvas", courseId: "course-secure-apps" };
  current.tasks.push(legacy);
  const incoming = parseCanvasCalendar("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:legacy-uid\nDTSTART:20260908T120000Z\nSUMMARY:Submit paper\nCATEGORIES:CIS 3337\nEND:VEVENT\nEND:VCALENDAR");
  const once = mergeCanvas(current, incoming);
  assert.equal(once.tasks.length, current.tasks.length);
  const updated = once.tasks.find(task => task.id === legacy.id)!;
  assert.equal(updated.due, "2026-09-08");
  assert.equal(updated.priority, "high");
  assert.equal(updated.status, "doing");
  const twice = mergeCanvas(once, incoming);
  assert.equal(twice.tasks.length, once.tasks.length);
});

test("Canvas feed rejects an HTML page and unsafe redirects", async () => {
  let restore = withFetch(async () => new Response("<html>sign in</html>", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(() => importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago"), /web page instead of a calendar/);
  restore();
  restore = withFetch(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal.ics" } }));
  await assert.rejects(() => importFeed("webcal://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago"), /UH Canvas or Instructure/);
  restore();
  assert.equal(canvasUrl("webcal://canvas.uh.edu/feeds/calendars/test.ics").protocol, "https:");
});

test("Canvas feed requests identify the importer with a minimal calendar request", async () => {
  let seen: Request | undefined;
  const restore = withFetch(async (input, init) => {
    seen = new Request(input, init);
    return new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:header-check\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Header check\nEND:VEVENT\nEND:VCALENDAR");
  });
  const result = await importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago");
  assert.equal(result.assignments.length, 1);
  assert.equal(seen?.headers.get("user-agent"), "GerardoOS/1.0 (+https://github.com/gavera783/gerardo-os)");
  assert.equal(seen?.headers.get("accept"), "text/calendar");
  assert.equal(seen?.headers.get("cache-control"), null);
  assert.equal(seen?.headers.get("pragma"), null);
  restore();
});

test("Canvas feed retries HTTP 406 with a generic Accept header", async () => {
  const acceptHeaders: Array<string | null> = [];
  const restore = withFetch(async (input, init) => {
    acceptHeaders.push(new Request(input, init).headers.get("accept"));
    if (acceptHeaders.length === 1) return new Response("not acceptable", { status: 406 });
    return new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:accept-fallback\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Accept fallback\nEND:VEVENT\nEND:VCALENDAR");
  });
  const result = await importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago");
  assert.deepEqual(acceptHeaders, ["text/calendar", "*/*"]);
  assert.equal(result.assignments.length, 1);
  restore();
});

test("Canvas feed falls back to the UH Instructure hostname after HTTP 406", async () => {
  const hosts: string[] = [];
  const restore = withFetch(async (input) => {
    const host = new URL(input.toString()).hostname;
    hosts.push(host);
    if (host === "canvas.uh.edu") return new Response("not acceptable", { status: 406 });
    return new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:host-fallback\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Host fallback\nEND:VEVENT\nEND:VCALENDAR");
  });
  const result = await importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago");
  assert.deepEqual(hosts, ["canvas.uh.edu", "canvas.uh.edu", "uh.instructure.com"]);
  assert.equal(result.assignments.length, 1);
  restore();
});

test("Canvas explains the downloaded-file fallback when both UH hosts return HTTP 406", async () => {
  const restore = withFetch(async () => new Response("not acceptable", { status: 406 }));
  await assert.rejects(
    () => importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago"),
    (error: unknown) => error instanceof AppError
      && error.code === "CANVAS_HTTP_406"
      && /downloaded \.ics file import/i.test(error.message),
  );
  restore();
});

test("Canvas feed rejects copied extra text before fetching", async () => {
  await assert.rejects(
    () => importFeed("https://canvas.uh.edu/feeds/calendars/test.ics svg", "America/Chicago"),
    /contains extra text/,
  );
});

test("Canvas feed retries transient responses and reports exact permanent statuses", async () => {
  let requests = 0;
  let restore = withFetch(async () => {
    requests += 1;
    if (requests < 3) {
      return new Response("busy", { status: 503, headers: { "Retry-After": "0" } });
    }
    return new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:retry\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Retry check\nEND:VEVENT\nEND:VCALENDAR");
  });
  const result = await importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago");
  assert.equal(requests, 3);
  assert.equal(result.assignments.length, 1);
  restore();

  restore = withFetch(async () => new Response("missing", { status: 404 }));
  await assert.rejects(
    () => importFeed("https://canvas.uh.edu/feeds/calendars/test.ics", "America/Chicago"),
    (error: unknown) => error instanceof AppError && error.code === "CANVAS_HTTP_404" && /HTTP 404/.test(error.message),
  );
  restore();
});

test("Plaid normalization replaces pending transactions and excludes transfers", () => {
  const pending: BankTransaction = normalizeBankTransaction({ transaction_id: "pending", account_id: "a", name: "Store", amount: 20, date: "2026-09-01", pending: true, personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" } }, "item");
  const postedSource = { transaction_id: "posted", pending_transaction_id: "pending", account_id: "a", name: "Store", amount: 20, date: "2026-09-01", pending: false, personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" } };
  const posted = normalizeBankTransaction(postedSource, "item");
  const transfer = normalizeBankTransaction({ transaction_id: "transfer", account_id: "a", name: "Payment", amount: 50, date: "2026-09-01", pending: false, personal_finance_category: { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_ACCOUNT_TRANSFER" } }, "item");
  const rows = applyTransactionPage([pending], [postedSource], [], [], "item");
  assert.deepEqual(rows.map(row => row.id), ["plaid-posted"]);
  assert.equal(transfer.isTransfer, true);
  assert.equal(financeTotals([posted, transfer], "2026-09").expenses, 20);
});

test("encrypted integration records are owner-isolated and use compare-and-swap", async () => {
  resetDb();
  env.INTEGRATION_ENCRYPTION_KEY = key;
  const first = await writeIntegration("owner-a", "plaid", { access_token: "secret-value", items: [] });
  const record = await readIntegration<{ access_token: string }>("owner-a", "plaid");
  assert.equal(record?.data.access_token, "secret-value");
  assert.equal(await readIntegration("owner-b", "plaid"), null);
  assert.ok(!rawRow("integration:v1:owner-a:plaid")!.data_json.includes("secret-value"));
  await assert.rejects(() => writeIntegration("owner-a", "plaid", { changed: true }, first.version - 1), (error: unknown) => error instanceof AppError && error.status === 409);
});

test("bank storage reports when the Cloudflare encryption key changed", async () => {
  resetDb();
  env.INTEGRATION_ENCRYPTION_KEY = key;
  await writeIntegration("owner-a", "plaid", { items: [], transactions: [] });
  env.INTEGRATION_ENCRYPTION_KEY = "fedcba9876543210".repeat(4);
  await assert.rejects(
    () => readIntegration("owner-a", "plaid"),
    (error: unknown) => error instanceof AppError
      && error.code === "INTEGRATION_DECRYPT_FAILED"
      && /original key/i.test(error.message),
  );
});

test("bank status keeps track of a saved production connection when Plaid settings are incomplete", async () => {
  resetDb();
  Object.assign(env, {
    INTEGRATION_ENCRYPTION_KEY: key,
    PLAID_CLIENT_ID: undefined,
    PLAID_SECRET: undefined,
    PLAID_ENV: undefined,
  });
  await writeIntegration("owner-a", "plaid", {
    items: [{ id: "item-production", token: "access", institution: "Example Bank", accounts: [], lastSyncedAt: null, environment: "production" }],
    transactions: [],
  });
  const snapshot = await getBanks("owner-a");
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.otherEnvironmentItems, 1);
  assert.ok(snapshot.missing.includes("PLAID_CLIENT_ID"));
  assert.ok(snapshot.missing.includes("PLAID_ENV"));
});

test("Plaid sync keeps the previous cursor when a transaction page fails", async () => {
  resetDb();
  Object.assign(env, { INTEGRATION_ENCRYPTION_KEY: key, PLAID_CLIENT_ID: "client", PLAID_SECRET: "secret", PLAID_ENV: "sandbox" });
  await writeIntegration("owner-a", "plaid", { items: [{ id: "item-1", token: "access", institution: "Test Bank", accounts: [], cursor: "old-cursor", lastSyncedAt: null, environment: "sandbox" }], transactions: [] });
  const restore = withFetch(async input => {
    const path = new URL(input.toString()).pathname;
    if (path.endsWith("/accounts/get")) return jsonResponse({ accounts: [{ account_id: "acct", name: "Checking", mask: "1234", type: "depository", subtype: "checking", balances: { current: 100, available: 90, iso_currency_code: "USD" } }] });
    if (path.endsWith("/transactions/sync")) return jsonResponse({ error_code: "INSTITUTION_DOWN" }, { status: 500 });
    throw new Error(path);
  });
  const snapshot = await syncBanks("owner-a");
  assert.equal(snapshot.items[0].error, "The bank is temporarily unavailable. Try again later.");
  const stored = await readIntegration<{ items: Array<{ cursor?: string }>; transactions: BankTransaction[] }>("owner-a", "plaid");
  assert.equal(stored?.data.items[0].cursor, "old-cursor");
  assert.equal(stored?.data.transactions.length, 0);
  restore();
  Object.assign(env, { PLAID_CLIENT_ID: undefined, PLAID_SECRET: undefined, PLAID_ENV: undefined });
  assert.equal(bankConfig().ready, false);
});

test("API route ownership checks reject missing identity and cross-site writes", () => {
  assert.throws(() => ownerFrom(new Request("https://os.example/api/banking")), (error: unknown) => error instanceof AppError && error.status === 401);
  assert.throws(() => ownerFrom(new Request("https://os.example/api/banking", { method: "POST", headers: { "x-gerardo-authenticated-user-id": "cloudflare:a", Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" })), (error: unknown) => error instanceof AppError && error.status === 403);
  assert.equal(ownerFrom(new Request("https://os.example/api/banking", { method: "POST", headers: { "x-gerardo-authenticated-user-id": "cloudflare:a", Origin: "https://os.example", "Content-Type": "application/json" }, body: "{}" })), "cloudflare:a");
});

test("Spotify accepts normal alphanumeric client IDs and validates Spotify resource URLs", async () => {
  assert.equal(spotifyUri("https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"), "spotify:playlist:37i9dQZF1DWZeKCadgRdKQ");
  assert.equal(spotifyUri("https://evil.example/playlist/37i9dQZF1DWZeKCadgRdKQ"), null);
  const session = new Map<string, string>();
  const fakeLocation: { origin: string; search: string; pathname: string; last?: string; assign(url: string): void; replaceState(): void } = { origin: "https://os.example", search: "", pathname: "/", assign(url) { this.last = url; }, replaceState() {} };
  Object.assign(globalThis, { sessionStorage: { getItem: (key: string) => session.get(key) || null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key) }, window: { location: fakeLocation } });
  await spotifyConnect("g".repeat(32));
  assert.match((globalThis as { window: { location: { last?: string } } }).window.location.last || "", /code_challenge_method=S256/);
});
