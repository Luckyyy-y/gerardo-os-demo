import { z } from "zod";
import { readWorkspace, writeWorkspace } from "@/db/workspace-store";
import { apiError, AppError, ownerFrom } from "@/lib/server/http";

const payloadSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(10),
  })
  .passthrough();

function storageError(error: unknown) {
  console.error("Workspace storage error", error instanceof Error ? error.name : "UnknownError");
  return Response.json(
    { error: "Your workspace could not be reached. Try again in a moment." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const ownerId = ownerFrom(request);
    const record = await readWorkspace(ownerId);
    return Response.json(record ?? { state: null, version: 0, updatedAt: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AppError) return apiError(error);
    return storageError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ownerId = ownerFrom(request);
    const raw = await request.text();
    if (raw.length > 500_000) {
      return Response.json({ error: "Workspace data is too large." }, { status: 413 });
    }

    const parsed = JSON.parse(raw) as { state?: unknown };
    const state = payloadSchema.safeParse(parsed.state);
    if (!state.success) {
      return Response.json({ error: "Workspace data is invalid." }, { status: 400 });
    }

    const saved = await writeWorkspace(ownerId, state.data);
    return Response.json(saved, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Workspace data is invalid." }, { status: 400 });
    }
    if (error instanceof AppError) return apiError(error);
    return storageError(error);
  }
}
