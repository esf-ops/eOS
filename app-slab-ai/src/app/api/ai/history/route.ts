import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch } from "@/lib/auth/resolveContext";

export async function GET(req: NextRequest) {
  try {
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);

    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({
        ok: true,
        installed: false,
        authMode: "dev_bypass",
        rows: [],
        warning: "Dev auth bypass — durable history requires Brain session + eliteos_slab_ai_v1.sql",
      });
    }

    const limit = req.nextUrl.searchParams.get("limit") || "40";
    const res = await brainFetch(`/api/slab-ai/generations?limit=${limit}`, auth);
    if (res.status === 503) {
      return NextResponse.json({
        ok: true,
        installed: false,
        rows: [],
        warning: "Apply eliteos_slab_ai_v1.sql to enable durable history.",
      });
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return NextResponse.json(
        { ok: false, error: data.error || "Unable to load history" },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({ ...data, authMode: auth.authMode });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json(
      { ok: false, error: e.message || "Unauthorized", code: e.code },
      { status: e.status || 401 }
    );
  }
}
