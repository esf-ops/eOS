/**
 * Published pricing baseline backsplash mode for public Digital Estimate display.
 * Uses height mode + billed inclusion — never eligibility alone.
 */

export function resolvePublishedBacksplashMode(room: {
  backsplashHeightMode?: string | null;
  backsplashIncluded?: boolean;
}): string {
  const m = String(room?.backsplashHeightMode || "")
    .toLowerCase()
    .trim();
  if (m === "full_height") return "full_height";
  if (m === "custom" || m === "custom_height") return "custom_height";
  if (m === "standard" || m === "standard_4in" || m === "4in" || m === "4_inch") {
    return "standard_4in";
  }
  if (m === "none") return "none";
  // Legacy rooms without height mode: billed SF implies 4-inch; otherwise none.
  return room?.backsplashIncluded ? "standard_4in" : "none";
}

export function backsplashModeTokenFromOptionKey(optionKey: string): string {
  const parts = String(optionKey || "").split(":");
  return parts.slice(2).join(":").toLowerCase();
}
