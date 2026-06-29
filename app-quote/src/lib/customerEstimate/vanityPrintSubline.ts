/**
 * Customer PDF subline for vanity program rooms, e.g.
 * `Vanity program · Color: Calacatta · Group Promo`
 */
export function formatVanityCustomerPrintSubline(params: {
  materialGroup?: string | null;
  colorLabel?: string | null;
  projectColorTbd?: boolean;
}): string {
  const parts: string[] = ["Vanity program"];
  const color = params.colorLabel?.trim();
  if (color) {
    parts.push(`Color: ${color}`);
  } else if (params.projectColorTbd) {
    parts.push("Color TBD");
  }
  const group = params.materialGroup?.trim();
  if (group) parts.push(group);
  return parts.join(" · ");
}
