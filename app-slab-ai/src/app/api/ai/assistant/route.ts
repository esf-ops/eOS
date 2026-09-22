import { NextRequest, NextResponse } from "next/server";
import { planAssistantTurn } from "@/lib/ai/assistant";
import type { AssistantThreadContext } from "@/lib/ai/assistant";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth } from "@/lib/auth/resolveContext";

export const runtime = "nodejs";

type Body = {
  message?: string;
  context?: AssistantThreadContext;
  selectedEntity?: { domain: "account" | "quote"; id: string; label: string };
  clarifyAnswers?: Record<string, string>;
};

/**
 * POST /api/ai/assistant
 * Intent → clarify / disambiguate / generate skill / message.
 * Read-only orchestration; does not grant LLM database access.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    const result = await planAssistantTurn({
      message: String(body.message || ""),
      context: body.context || {},
      selectedEntity: body.selectedEntity,
      clarifyAnswers: body.clarifyAnswers,
      auth,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const e = err as { message?: string; code?: string; status?: number };
    const status = e.status ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status >= 500 && e.code !== "DEV_BYPASS_FORBIDDEN"
            ? "Unable to process that request."
            : e.message || "Request failed",
        code: e.code || "INTERNAL_ERROR",
      },
      { status }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "slab-ai-assistant",
    modes: ["clarify", "disambiguate", "generate", "message"],
    writeActions: false,
  });
}
