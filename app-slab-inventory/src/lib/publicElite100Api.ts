import { joinBackendUrl, ApiError } from "@quote-lib/api";
import type { Elite100ShowroomData } from "./elite100ShowroomTypes";

/** Public read-only Elite 100 showroom payload (no auth). */
export async function fetchPublicElite100Showroom(): Promise<Elite100ShowroomData & { ok?: boolean; note?: string }> {
  const url = joinBackendUrl("/api/public/elite100-showroom");
  const res = await fetch(url, { method: "GET", credentials: "omit" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new ApiError(msg || `HTTP ${res.status}`, res.status, json ?? text);
  }
  return json as Elite100ShowroomData & { ok?: boolean; note?: string };
}
