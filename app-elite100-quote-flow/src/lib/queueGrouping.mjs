/**
 * Client-side Estimate Queue (Scope Creation Queue) grouping helpers.
 */

/**
 * @param {object} item
 */
export function resolveQueueGroupKey(item) {
  if (item?.alreadyScoped === true || item?.status?.key === "scope_set") return "scoped";
  const fromApi = String(item?.group?.key || "");
  if (fromApi === "ready" || fromApi === "manual" || fromApi === "processing" || fromApi === "failed") {
    return fromApi;
  }
  const status = String(item?.status?.key || "");
  if (status === "ready_for_review") return "ready";
  if (status === "manual_scope_needed") return "manual";
  if (status === "takeoff_queued" || status === "takeoff_processing") return "processing";
  if (status === "takeoff_failed") return "failed";
  return "other";
}

/**
 * @param {object[]} items
 */
export function groupQueueItems(items) {
  const list = (Array.isArray(items) ? items : []).filter(
    (i) => i?.alreadyScoped !== true && i?.status?.key !== "scope_set"
  );
  /** @type {Record<string, object[]>} */
  const groups = { ready: [], manual: [], processing: [], failed: [], other: [] };
  for (const item of list) {
    const key = resolveQueueGroupKey(item);
    if (groups[key]) groups[key].push(item);
    else groups.other.push(item);
  }
  return {
    ...groups,
    stats: {
      readyForReview: groups.ready.length,
      manualScopeNeeded: groups.manual.length,
      processing: groups.processing.length,
      failed: groups.failed.length,
      total: list.length
    }
  };
}

/**
 * @param {object} item
 */
export function resolveQueueCustomer(item) {
  const v = String(item?.customerDisplay || item?.customerName || "").trim();
  if (v && !/not identified/i.test(v)) return v;
  const plan = String(item?.planFilename || "").trim();
  if (plan) return `Plan: ${plan}`;
  return "Unknown contact";
}

/**
 * @param {object} item
 */
export function resolveQueueTitle(item) {
  const title = String(item?.requestTitle || item?.projectDisplay || item?.projectName || "").trim();
  if (title && !/not named|not identified/i.test(title)) return title;
  const plan = String(item?.planFilename || "").trim();
  if (plan) return plan;
  return resolveQueueCustomer(item);
}

/**
 * @param {string|null|undefined} iso
 */
export function formatQueueTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}
