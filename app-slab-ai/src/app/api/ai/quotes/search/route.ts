import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";

export async function GET(req: NextRequest) {
  try {
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);
    const q = req.nextUrl.searchParams.get("q") || "";
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({
        ok: true,
        rows: [],
        warning: "Quote search requires Brain auth — not available in auth bypass mode.",
      });
    }
    const res = await brainFetch(`/api/slab-ai/quotes/search?q=${encodeURIComponent(q)}&limit=10`, auth);
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
