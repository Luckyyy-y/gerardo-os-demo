import { z } from "zod";
import { importFeed } from "@/lib/server/canvas";
import { ownerFrom, readJson, json, apiError } from "@/lib/server/http";

/**
 * UH does not issue student Canvas API tokens for this account, so the public
 * integration is deliberately calendar-feed only. The feed address is sent to
 * Canvas over HTTPS when syncing and is retained only as a private workspace
 * setting so automatic refresh works on both signed-in devices; it is never
 * logged or sent to another service.
 */
export async function GET(request: Request) {
  try {
    ownerFrom(request);
    return json({ feedOnly: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    ownerFrom(request);
    const body = await readJson(request, z.object({
      action: z.enum(["sync"]).default("sync"),
      feedUrl: z.string().max(4000),
      timeZone: z.string().max(100).default("America/Chicago"),
    }));
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timeZone });
    } catch {
      return json({ error: "Choose a valid time zone, such as America/Chicago." }, 400);
    }
    return json(await importFeed(body.feedUrl, body.timeZone));
  } catch (error) {
    return apiError(error);
  }
}
