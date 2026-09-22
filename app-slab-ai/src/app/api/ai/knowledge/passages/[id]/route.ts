import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const auth = await resolveSlabAiAuth(getAccessTokenFromHeader(req.headers.get("authorization")));
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({
        ok: true,
        passage: {
          id,
          text: "SENTINEL fixture passage (dev bypass).",
          locator: "page 1 · demo",
        },
        document: { id: "doc-sentinel", title: "SENTINEL CNC Edge Breakout SOP (demo)", version: 1 },
        neighbors: [],
      });
    }
    const res = await brainFetch(`/api/slab-ai/knowledge/passages/${id}`, auth);
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 401 });
  }
}
