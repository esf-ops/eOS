import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";

/** Admin-only embedding backfill proxy → Brain */
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveSlabAiAuth(getAccessTokenFromHeader(req.headers.get("authorization")));
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({ ok: false, error: "Brain auth required" }, { status: 503 });
    }
    const body = await req.json().catch(() => ({}));
    const res = await brainFetch("/api/slab-ai/knowledge/embeddings/backfill", auth, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 401 });
  }
}
