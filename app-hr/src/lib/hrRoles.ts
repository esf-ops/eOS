const MANAGER_ROLES = new Set(["admin", "executive", "hr", "super_admin"]);

/** Safe manager-role check — never throws on missing/undefined role. */
export function isHrManagerRole(role: string | null | undefined): boolean {
  return MANAGER_ROLES.has(String(role ?? "").trim().toLowerCase());
}

/** User-facing error text for failed HR API calls (no stack traces). */
export function hrApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status?: number }).status);
    if (status >= 500) return fallback;
    const msg = String((err as { message?: string }).message ?? "").trim();
    return msg || fallback;
  }
  return fallback;
}
