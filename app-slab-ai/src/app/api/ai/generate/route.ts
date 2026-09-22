import { NextRequest, NextResponse } from "next/server";
import { createGenerationStream, prepareGeneration } from "@/lib/ai/generate";
import { getSafeAIStatus } from "@/lib/ai/provider";
import { recordTelemetry } from "@/lib/ai/telemetry";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth } from "@/lib/auth/resolveContext";

export const runtime = "nodejs";

type Body = {
  toolId?: string;
  formData?: Record<string, unknown>;
  generationId?: string;
};

function errorResponse(err: unknown) {
  const e = err as { message?: string; code?: string; status?: number; issues?: unknown };
  const status = e.status ?? 500;
  const code = e.code ?? "INTERNAL_ERROR";
  const message =
    status >= 500 && code !== "DEV_BYPASS_FORBIDDEN"
      ? "Something went wrong generating a response. Please try again."
      : e.message || "Request failed";

  return NextResponse.json(
    {
      error: message,
      code,
      ...(e.issues ? { issues: e.issues } : {}),
      ai: getSafeAIStatus(),
    },
    { status }
  );
}

/**
 * POST /api/ai/generate
 * Requires authenticated slab_ai context via Brain (or explicit dev auth bypass).
 * Never accepts system prompts from the client.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toolId || typeof body.toolId !== "string") {
      return NextResponse.json({ error: "toolId is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    const prepared = await prepareGeneration({
      toolId: body.toolId,
      formData: body.formData ?? {},
      generationId: body.generationId,
      organizationId: auth.organizationId,
      userId: auth.userId,
      auth,
    });

    return await createGenerationStream(prepared, req.signal);
  } catch (err) {
    const e = err as { code?: string; message?: string; status?: number };
    if (e.code) {
      recordTelemetry({
        type: "generation_failed",
        generationId: "n/a",
        toolId: "unknown",
        success: false,
        errorCode: e.code,
        timestamp: new Date().toISOString(),
      });
    }
    return errorResponse(err);
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "slab-ai-generate",
    ai: getSafeAIStatus(),
    authRequired: String(process.env.SLAB_AI_DEV_AUTH_BYPASS ?? "") !== "1",
  });
}
