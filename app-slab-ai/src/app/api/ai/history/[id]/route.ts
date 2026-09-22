import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({ ok: false, error: "History unavailable in auth bypass mode" }, { status: 503 });
    }

    const res = await brainFetch(`/api/slab-ai/generations/${id}`, auth);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json(
      { ok: false, error: e.message || "Unauthorized", code: e.code },
      { status: e.status || 401 }
    );
  }
}
