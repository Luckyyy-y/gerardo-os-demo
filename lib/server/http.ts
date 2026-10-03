import { z } from "zod";

export class AppError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

export function ownerFrom(request: Request) {
  const owner = request.headers.get("x-gerardo-authenticated-user-id");
  if (!owner) throw new AppError("Your sign-in expired. Reload Gerardo OS and sign in again.", 401);
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AppError("Open this action inside Gerardo OS.", 403);
    }
    if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError("JSON is required.", 415);
  }
  return owner;
}

export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const text = await request.text();
  if (text.length > 24_000) throw new AppError("This request is too large.", 413);
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new AppError("Check the connection details and try again."); }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function apiError(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message, code: error.code }, error.status);
  console.error("Integration request failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "The connection is temporarily unavailable. Try again shortly." }, 503);
}
