import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";
import { canShowBrainAgentDebug } from "@/lib/brainAgent/context";
import type { BrainAgentThreadContext } from "@/lib/brainAgent/types";

export const runtime = "nodejs";

type Body = {
  message?: string;
  context?: BrainAgentThreadContext;
  debug?: boolean;
};

/**
 * POST /api/ai/brain-agent/run
 *
 * Thin authenticated proxy → backend-core POST /api/brain-agent/run.
 * Primary conversational path for the eliteOS AI head.
 * Does not classify intent or select Skills.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ ok: false, error: "message is required", code: "VALIDATION" }, { status: 400 });
    }

    if (auth.authMode === "dev_bypass") {
      return NextResponse.json(
        {
          ok: false,
          answerState: "CAPABILITY_UNAVAILABLE",
          answer:
            "Brain Agent requires Brain auth. Dev auth bypass cannot reach operational data — sign in with a real session.",
          code: "DEV_BYPASS",
          evidence: [],
          toolCalls: 0,
        },
        { status: 503 }
      );
    }

    const wantDebug = Boolean(body.debug) && canShowBrainAgentDebug(auth.role);
    const context =
      body.context && typeof body.context === "object" ? body.context : {};

    const res = await brainFetch("/api/brain-agent/run", auth, {
      method: "POST",
      body: JSON.stringify({
        message,
        context,
        debug: wantDebug,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Never forward secrets if Brain ever echoed them
    if (data && typeof data === "object") {
      delete data.accessToken;
      delete data.serviceRoleKey;
      delete data.authorization;
    }

    // Strip toolTrace for non-debug callers even if Brain returned it
    if (!wantDebug && data && typeof data === "object") {
      delete data.toolTrace;
    }

    return NextResponse.json(
      {
        ...data,
        path: "brain-agent",
        legacyAssistant: false,
      },
      { status: res.status }
    );
  } catch (err) {
    const e = err as { message?: string; code?: string; status?: number };
    const status = e.status ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status >= 500 && e.code !== "DEV_BYPASS_FORBIDDEN"
            ? "Unable to reach the Brain Agent."
            : e.message || "Request failed",
        code: e.code || "INTERNAL_ERROR",
        answerState: "CAPABILITY_UNAVAILABLE",
        path: "brain-agent",
      },
      { status }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "slab-ai-brain-agent-proxy",
    primary: true,
    backend: "/api/brain-agent/run",
    writeActions: false,
    intentRouting: false,
  });
}
