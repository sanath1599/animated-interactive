import { z } from "zod";
import { apiError, json, requireUser } from "@/lib/api";
import { DETAILS, createChatRequest } from "@/lib/studio/chat-build";
import { sourceSchema } from "@/lib/studio/source-schema";

export const runtime = "nodejs";

const body = z.object({
  source: sourceSchema,
  title: z.string().trim().min(1).max(120),
  audience: z.string().trim().max(200).optional(),
  details: z.string().trim().max(4000).optional(),
  detail: z.enum(DETAILS).default("standard"),
  focus: z.string().trim().max(2000).optional(),
  exclude: z.string().trim().max(2000).optional(),
  presenter: z.string().trim().max(80).optional(),
  organization: z.string().trim().max(80).optional(),
  date: z.string().trim().max(40).optional(),
  language: z.string().trim().max(40).optional(),
});

/**
 * Sets up a demo on this server (starts fetching the repository and records the build) and returns the
 * one-line prompt that hands it to a claude.ai chat, plus the claude.ai link with that prompt filled in.
 */
export async function POST(req: Request) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Choose a repository and enter a title.", 400);
  const { source, ...cfg } = parsed.data;
  // Empty optional fields are left out, so the guide only mentions what the user filled in.
  const settings = Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== "")) as typeof cfg;
  try {
    return json(await createChatRequest(r.session.userId, source, settings), 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Could not start fetching the repository.", 400);
  }
}
