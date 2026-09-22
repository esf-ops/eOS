import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch, brainBaseUrl } from "@/lib/auth/resolveContext";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const auth = await resolveSlabAiAuth(getAccessTokenFromHeader(req.headers.get("authorization")));
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({ ok: false, error: "Brain auth required" }, { status: 503 });
    }
    const res = await brainFetch(`/api/slab-ai/knowledge/documents/${id}`, auth);
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 401 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const auth = await resolveSlabAiAuth(getAccessTokenFromHeader(req.headers.get("authorization")));
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({ ok: false, error: "Brain auth required" }, { status: 503 });
    }
    const action = req.nextUrl.searchParams.get("action") || "approve";
    const body = await req.json().catch(() => ({}));
    const path =
      action === "reprocess"
        ? `/api/slab-ai/knowledge/documents/${id}/reprocess`
        : action === "reject"
          ? `/api/slab-ai/knowledge/documents/${id}/reject`
          : action === "archive"
            ? `/api/slab-ai/knowledge/documents/${id}/archive`
            : action === "restore"
              ? `/api/slab-ai/knowledge/documents/${id}/restore`
              : `/api/slab-ai/knowledge/documents/${id}/approve`;
    const res = await fetch(`${brainBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 401 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const auth = await resolveSlabAiAuth(getAccessTokenFromHeader(req.headers.get("authorization")));
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({ ok: false, error: "Brain auth required" }, { status: 503 });
    }
    const res = await brainFetch(`/api/slab-ai/knowledge/documents/${id}`, auth, { method: "DELETE" });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 401 });
  }
}
