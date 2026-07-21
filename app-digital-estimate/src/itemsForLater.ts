/**
 * Group / deduplicate "Items for later" requirements for the customer UI.
 * Never invents requirements — only reshapes server-provided rows.
 */

export type MissingInfoRequirement = {
  code?: string;
  message?: string;
  customerCopy?: string;
  roomKey?: string | null;
  roomName?: string | null;
  timing?: string | null;
  optional?: boolean;
};

export type GroupedMissingInfo = {
  key: string;
  title: string;
  timing: "before_review" | "before_fabrication" | "optional" | "unknown";
  timingLabel: string;
  rooms: string[];
  count: number;
};

function timingOf(req: MissingInfoRequirement): GroupedMissingInfo["timing"] {
  const raw = String(req.timing || req.code || "").toLowerCase();
  if (req.optional || /optional/.test(raw)) return "optional";
  if (/review|estimator/.test(raw)) return "before_review";
  if (/fabricat|install|production/.test(raw)) return "before_fabrication";
  // Default: needed before fabrication (customer-facing copy historically used this).
  return "before_fabrication";
}

function timingLabel(t: GroupedMissingInfo["timing"]): string {
  if (t === "before_review") return "Needed before estimator review";
  if (t === "before_fabrication") return "Needed before fabrication";
  if (t === "optional") return "Optional information";
  return "Still needed";
}

function plainTitle(req: MissingInfoRequirement): string {
  const copy = String(req.customerCopy || req.message || "").trim();
  if (!copy) return "Additional detail needed";
  // Strip trailing room suffixes like " for Kitchen" when grouping.
  return copy
    .replace(/\s+for\s+[^.,;]+$/i, "")
    .replace(/\s+in\s+[^.,;]+$/i, "")
    .replace(/\s*\([^)]*room[^)]*\)\s*$/i, "")
    .trim() || "Additional detail needed";
}

/**
 * Collapse identical needs and list affected rooms beneath each need.
 */
export function groupMissingInformationRequirements(
  requirements: MissingInfoRequirement[] | null | undefined,
  roomNameByKey?: Record<string, string> | null,
): GroupedMissingInfo[] {
  const list = Array.isArray(requirements) ? requirements : [];
  const buckets = new Map<string, GroupedMissingInfo>();
  for (const req of list) {
    const timing = timingOf(req);
    const title = plainTitle(req);
    const key = `${timing}::${title.toLowerCase()}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        title,
        timing,
        timingLabel: timingLabel(timing),
        rooms: [],
        count: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const roomName =
      (req.roomName && String(req.roomName).trim()) ||
      (req.roomKey && roomNameByKey?.[String(req.roomKey)]) ||
      (req.roomKey ? String(req.roomKey) : null);
    // Never surface UUID-like room keys as labels.
    const looksUuid =
      roomName &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        roomName,
      );
    if (roomName && !looksUuid && !bucket.rooms.includes(roomName)) {
      bucket.rooms.push(roomName);
    }
  }
  const order: GroupedMissingInfo["timing"][] = [
    "before_review",
    "before_fabrication",
    "optional",
    "unknown",
  ];
  return [...buckets.values()].sort(
    (a, b) => order.indexOf(a.timing) - order.indexOf(b.timing) || a.title.localeCompare(b.title),
  );
}

export function missingInfoHeadline(groups: GroupedMissingInfo[]): string {
  const n = groups.reduce((s, g) => s + g.count, 0);
  if (n <= 0) return "";
  if (n === 1) return "1 detail is still needed before fabrication";
  return `${n} details are still needed before fabrication`;
}
