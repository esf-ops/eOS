/**
 * Customer edge profile grouping — mirrors Studio canonical profiles.
 * Presentation only; amounts come from backend priceEffectLabel.
 */

export const INCLUDED_EDGE_TOKENS = [
  "edge_eased",
  "edge_large_eased",
  "edge_full_bullnose",
  "edge_large_ogee",
  "edge_bevel",
] as const;

export const UPGRADED_EDGE_TOKENS = [
  "edge_small_ogee",
  "edge_crescent",
  "edge_knife",
] as const;

export function edgeTokenFromOptionKey(optionKey: string): string {
  const parts = String(optionKey || "").split(":");
  if (parts[0] === "edge" && parts.length >= 3) {
    return parts.slice(2).join(":") || "edge_eased";
  }
  return parts[parts.length - 1] || "";
}

export function isIncludedEdgeToken(token: string): boolean {
  const t = String(token || "").toLowerCase();
  return (INCLUDED_EDGE_TOKENS as readonly string[]).includes(t);
}

export function isUpgradedEdgeToken(token: string): boolean {
  const t = String(token || "").toLowerCase();
  return (UPGRADED_EDGE_TOKENS as readonly string[]).includes(t);
}

export function sortEdgeOptionsByCanonicalOrder<T extends { optionKey: string; displayLabel: string }>(
  options: T[],
): { included: T[]; upgraded: T[] } {
  const rank = new Map<string, number>();
  INCLUDED_EDGE_TOKENS.forEach((t, i) => rank.set(t, i));
  UPGRADED_EDGE_TOKENS.forEach((t, i) => rank.set(t, 100 + i));

  const included: T[] = [];
  const upgraded: T[] = [];
  for (const opt of options) {
    const token = edgeTokenFromOptionKey(opt.optionKey);
    if (isUpgradedEdgeToken(token)) upgraded.push(opt);
    else included.push(opt);
  }
  const byRank = (a: T, b: T) =>
    (rank.get(edgeTokenFromOptionKey(a.optionKey)) ?? 999) -
    (rank.get(edgeTokenFromOptionKey(b.optionKey)) ?? 999);
  included.sort(byRank);
  upgraded.sort(byRank);
  return { included, upgraded };
}
