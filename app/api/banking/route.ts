import { z } from "zod";
import { apiError, ownerFrom, readJson, json, AppError } from "@/lib/server/http";
import { getBanks, createBankLink, exchangeBank, syncBanks, disconnectBank } from "@/lib/server/plaid";
export async function GET(request: Request) { try { return json(await getBanks(ownerFrom(request))); } catch (e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    const owner = ownerFrom(request);
    const body = await readJson(request, z.object({ action: z.enum(["link", "exchange", "sync", "disconnect"]), publicToken: z.string().max(2000).optional(), itemId: z.string().max(200).optional() }));
    if (body.action === "link") return json(await createBankLink(owner, new URL(request.url).origin, body.itemId));
    if (body.action === "exchange") return json(await exchangeBank(owner, body.publicToken || ""));
    if (body.action === "sync") return json(await syncBanks(owner));
    if (!body.itemId) throw new AppError("Choose the bank to disconnect.");
    return json(await disconnectBank(owner, body.itemId));
  } catch (e) { return apiError(e); }
}
