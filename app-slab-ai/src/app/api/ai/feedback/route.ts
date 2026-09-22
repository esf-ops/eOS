import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";
import { recordTelemetry } from "@/lib/ai/telemetry";

type Body = {
  generationId?: string;
  toolId?: string;
  feedback?: "up" | "down";
  note?: string;
};

export async function POST(req: NextRequest) {
  try {
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    const body = (await req.json()) as Body;
    if (!body.generationId || !body.toolId || (body.feedback !== "up" && body.feedback !== "down")) {
      return NextResponse.json({ error: "Invalid feedback payload", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (auth.authMode === "brain" && auth.accessToken) {
      const res = await brainFetch(`/api/slab-ai/generations/${body.generationId}/feedback`, auth, {
        method: "POST",
        body: JSON.stringify({ rating: body.feedback, comment: body.note }),
      });
      if (res.status === 404) {
        return NextResponse.json(
          { error: "Generation not found in your organization history.", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      if (!res.ok && res.status !== 503) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return NextResponse.json(
          { error: data.error || "Unable to record feedback", code: "FEEDBACK_FAILED" },
          { status: res.status }
        );
      }
    }

    recordTelemetry({
      type: "feedback",
      generationId: body.generationId,
      organizationId: auth.organizationId,
      userId: auth.userId,
      toolId: body.toolId,
      feedback: body.feedback,
      feedbackNote: body.note ? String(body.note).slice(0, 500) : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, authMode: auth.authMode });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json(
      { error: e.message || "Unable to record feedback", code: e.code || "INTERNAL_ERROR" },
      { status: e.status || 500 }
    );
  }
}
