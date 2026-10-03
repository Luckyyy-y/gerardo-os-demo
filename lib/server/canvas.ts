import { AppError } from "./http";
import { parseCanvasCalendar, type CanvasImport } from "../canvas";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export function canvasUrl(value: string) {
  const normalized = value.trim().replace(/^webcal:/i, "https:");
  if (/\s/.test(normalized)) {
    throw new AppError("The Canvas link contains extra text. Copy only the private URL ending in .ics.");
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AppError("Enter a valid Canvas address.");
  }

  const approvedHost =
    url.hostname === "canvas.uh.edu" || url.hostname.endsWith(".instructure.com");
  const calendarPath = /^\/feeds\/calendars\/[^/]+\.ics$/i.test(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !approvedHost
  ) {
    throw new AppError("Use your UH Canvas or Instructure HTTPS address.");
  }
  if (!calendarPath) {
    throw new AppError(
      "Use Canvas → Calendar → Calendar Feed and copy only the private URL ending in .ics.",
    );
  }

  return url;
}

async function limitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 4_000_000) {
      await reader.cancel();
      throw new AppError("Canvas returned too much data for one request.", 502);
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}

function retryDelay(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 2_000);
  }
  return 250 * (attempt + 1);
}

async function fetchCanvas(url: URL) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: attempt === 0 ? "text/calendar" : "*/*",
          "User-Agent": "GerardoOS/1.0 (+https://github.com/gavera783/gerardo-os)",
        },
      });

      const retryable = response.status === 406
        ? attempt === 0
        : RETRYABLE_STATUSES.has(response.status);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        return response;
      }

      const delay = response.status === 406 ? 0 : retryDelay(response, attempt);
      await response.body?.cancel().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new AppError(
          "Cloudflare could not reach Canvas after three attempts. Wait a minute and retry.",
          502,
          "CANVAS_NETWORK_ERROR",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw new AppError(
    "Cloudflare could not reach Canvas after three attempts. Wait a minute and retry.",
    502,
    "CANVAS_NETWORK_ERROR",
  );
}

function canvasHttpError(status: number) {
  if (status === 400) {
    return new AppError(
      "Canvas rejected this calendar address (HTTP 400). Re-copy the private Calendar Feed link.",
      502,
      "CANVAS_HTTP_400",
    );
  }
  if (status === 401) {
    return new AppError(
      "Canvas returned HTTP 401 for this calendar feed. Copy a fresh private Calendar Feed link from Canvas.",
      502,
      "CANVAS_HTTP_401",
    );
  }
  if (status === 403) {
    return new AppError(
      "Canvas returned HTTP 403. The feed works in your browser, but UH blocked the Cloudflare request.",
      502,
      "CANVAS_HTTP_403",
    );
  }
  if (status === 406) {
    return new AppError(
      "UH blocked automatic Canvas sync from Cloudflare (HTTP 406). Use the downloaded .ics file import in Canvas settings.",
      502,
      "CANVAS_HTTP_406",
    );
  }
  if (status === 404 || status === 410) {
    return new AppError(
      `Canvas returned HTTP ${status}. The saved feed link is incomplete or was reset; copy it again from Canvas → Calendar → Calendar Feed.`,
      502,
      `CANVAS_HTTP_${status}`,
    );
  }
  if (status === 429) {
    return new AppError(
      "Canvas is rate-limiting calendar sync (HTTP 429). Gerardo OS retried automatically; wait one minute and try again.",
      502,
      "CANVAS_HTTP_429",
    );
  }
  if (status >= 500) {
    return new AppError(
      `Canvas is temporarily unavailable (HTTP ${status}). Gerardo OS tried three times; retry in a minute.`,
      502,
      `CANVAS_HTTP_${status}`,
    );
  }
  return new AppError(
    `Canvas returned HTTP ${status} while loading this calendar feed.`,
    502,
    `CANVAS_HTTP_${status}`,
  );
}

export async function importFeed(value: string, timeZone: string): Promise<CanvasImport> {
  let url = canvasUrl(value);

  for (let hop = 0; hop < 5; hop += 1) {
    let response = await fetchCanvas(url);
    if (response.status === 406 && url.hostname === "canvas.uh.edu") {
      await response.body?.cancel().catch(() => undefined);
      const fallback = new URL(url);
      fallback.hostname = "uh.instructure.com";
      url = fallback;
      response = await fetchCanvas(url);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      url = canvasUrl(new URL(location, url).href);
      continue;
    }

    if (!response.ok) throw canvasHttpError(response.status);

    try {
      return parseCanvasCalendar(await limitedText(response), timeZone);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : "The calendar could not be read.",
      );
    }
  }

  throw new AppError(
    "The calendar link redirects to sign-in. Copy your private .ics Calendar Feed link instead.",
  );
}
