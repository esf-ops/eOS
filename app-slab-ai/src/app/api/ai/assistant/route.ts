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
 *
 * LEGACY — Skill/intent orchestration (classifyIntent, deterministicPlan, runAssistant).
 * Kept for rollback and direct Skill tooling. NOT the primary home chat path.
 *
 * Primary conversational path: POST /api/ai/brain-agent/run → Brain Agent.
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

    return NextResponse.json({
      ok: true,
      ...result,
      path: "legacy-assistant",
      legacyAssistant: true,
    });
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
        path: "legacy-assistant",
        legacyAssistant: true,
      },
      { status }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "slab-ai-assistant",
    legacy: true,
    primary: false,
    note: "Legacy Skill/intent orchestrator. Primary chat uses /api/ai/brain-agent/run.",
    modes: ["clarify", "disambiguate", "generate", "message"],
    writeActions: false,
  });
}
