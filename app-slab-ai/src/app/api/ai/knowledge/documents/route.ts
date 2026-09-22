import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth, brainFetch, brainBaseUrl } from "@/lib/auth/resolveContext";

async function authOrFail(req: NextRequest) {
  const token = getAccessTokenFromHeader(req.headers.get("authorization"));
  return resolveSlabAiAuth(token);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authOrFail(req);
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json({
        ok: true,
        rows: [],
        warning: "Knowledge library requires Brain auth — empty in auth bypass.",
      });
    }
    const status = req.nextUrl.searchParams.get("status");
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await brainFetch(`/api/slab-ai/knowledge/documents${qs}`, auth);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status || 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authOrFail(req);
    if (auth.authMode === "dev_bypass") {
      return NextResponse.json(
        { ok: false, error: "Knowledge upload requires Brain auth (not available in auth bypass)." },
        { status: 503 }
      );
    }
    const body = await req.json();
    const res = await fetch(`${brainBaseUrl()}/api/slab-ai/knowledge/documents/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status || 401 });
  }
}
