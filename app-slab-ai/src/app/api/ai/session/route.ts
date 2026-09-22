import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromHeader } from "@/lib/auth/supabase";
import { resolveSlabAiAuth } from "@/lib/auth/resolveContext";

export async function GET(req: NextRequest) {
  try {
    const token = getAccessTokenFromHeader(req.headers.get("authorization"));
    const auth = await resolveSlabAiAuth(token);
    return NextResponse.json({
      ok: true,
      userId: auth.userId,
      organizationId: auth.organizationId,
      role: auth.role,
      displayName: auth.displayName,
      head: auth.head,
      authMode: auth.authMode,
      devBypass: auth.authMode === "dev_bypass",
      canAdministerKnowledge:
        auth.authMode === "dev_bypass" ||
        ["admin", "super_admin", "executive"].includes(String(auth.role || "").toLowerCase()),
    });
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    return NextResponse.json(
      { ok: false, error: e.message || "Unauthorized", code: e.code },
      { status: e.status || 401 }
    );
  }
}
