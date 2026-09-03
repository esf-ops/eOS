/**
 * Client-side Estimate Queue (Scope Creation Queue) grouping / filter / label helpers.
 */

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
function asString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim() || fallback;
  }
  if (typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const displayName = asString(obj.displayName);
    if (displayName) return displayName;
    const safe = asString(obj.safeAddressLabel);
    if (safe) return safe;
  }
  return fallback;
}

/**
 * @param {string} value
 */
function isWeakLabel(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  return /^(unknown contact|customer not identified|not identified|inbound sender|inbound mailbox|manual estimate|email on file|quote request)$/i.test(
    s
  );
}

/**
 * @param {string|null|undefined} filename
 */
export function filenameWithoutExtension(filename) {
  const s = String(filename || "").trim();
  if (!s) return "";
  return s.replace(/\.[a-z0-9]{2,5}$/i, "") || s;
}

/**
 * Opaque numeric / Graph-like filenames should not be primary titles.
 * @param {string|null|undefined} name
 */
export function isOpaquePlanFilename(name) {
  const raw = String(name || "").trim();
  if (!raw) return true;
  const base = filenameWithoutExtension(raw);
  if (!base) return true;
  if (/^\d{8,}$/.test(base)) return true;
  if (/^AAMk/i.test(base) || /^AAMk/i.test(raw)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(base) && !/\s/.test(base)) return true;
  return false;
}

/**
 * @param {string|null|undefined} name
 */
export function looksLikeAttachmentFilename(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  return /\.(pdf|png|jpe?g|gif|webp|tif{1,2}|heic|dwg|dxf|svg)$/i.test(s);
}

/**
 * @param {string|null|undefined} name
 * @param {Array<string|null|undefined>} planNames
 */
export function matchesAnyPlanFilename(name, planNames = []) {
  const raw = String(name || "").trim();
  if (!raw) return false;
  const base = filenameWithoutExtension(raw).toLowerCase();
  const lower = raw.toLowerCase();
  for (const p of planNames) {
    const plan = String(p || "").trim();
    if (!plan) continue;
    if (lower === plan.toLowerCase()) return true;
    if (base && base === filenameWithoutExtension(plan).toLowerCase()) return true;
  }
  return false;
}

/**
 * @param {string|null|undefined} value
 */
export function isUsableRequestSubject(value) {
  const s = asString(value);
  if (!s) return false;
  if (s === "(no subject)") return false;
  if (/not named|not identified|^unknown$/i.test(s)) return false;
  if (isOpaquePlanFilename(s)) return false;
  if (looksLikeAttachmentFilename(s)) return false;
  return true;
}

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
 * @typedef {"all_active"|"ready"|"manual"|"processing"|"failed"} QueueFilterKey
 */

/**
 * Client-side filter — never resurfaces scoped rows.
 * @param {object[]} items
 * @param {QueueFilterKey} filter
 * @param {string} [search]
 */
export function filterQueueItems(items, filter = "all_active", search = "") {
  const unscoped = (Array.isArray(items) ? items : []).filter(
    (i) => i?.alreadyScoped !== true && i?.status?.key !== "scope_set"
  );
  let rows = unscoped;
  switch (filter) {
    case "ready":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "ready");
      break;
    case "manual":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "manual");
      break;
    case "processing":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "processing");
      break;
    case "failed":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "failed");
      break;
    case "all_active":
    default:
      rows = unscoped;
      break;
  }

  const q = String(search || "")
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((item) => {
    const hay = [
      item?.estimateName,
      item?.defaultEstimateName,
      item?.customerDisplay,
      item?.customerName,
      item?.senderLabel,
      item?.projectDisplay,
      item?.projectName,
      item?.requestTitle,
      item?.subject,
      item?.planFilename,
      item?.planLabel,
      item?.summary?.label
    ]
      .map((v) => asString(v).toLowerCase())
      .join(" ");
    return hay.includes(q) && !/aamk/i.test(q);
  });
}

/**
 * Editable Estimate / Job name default.
 * Precedence: explicit saved name → email subject → request title → plan filename fallback.
 * PDF filenames never overwrite a valid request subject.
 * @param {object} item
 */
export function resolveDefaultEstimateName(item) {
  const planNames = [
    item?.selectedPlanFilename,
    item?.takeoffPlanFilename,
    item?.planFilename,
    item?.packetFilename,
    item?.attachmentName,
    ...(Array.isArray(item?.packetFiles) ? item.packetFiles.map((f) => f?.filename) : [])
  ].filter(Boolean);

  const explicitSaved = asString(
    item?.scopeProjectName ||
      item?.estimateProjectName ||
      item?.quoteFlowEstimateName ||
      item?.scope?.projectName ||
      item?.scope?.quoteFlowEstimateName
  );
  if (
    explicitSaved &&
    !isWeakLabel(explicitSaved) &&
    !looksLikeAttachmentFilename(explicitSaved) &&
    !matchesAnyPlanFilename(explicitSaved, planNames) &&
    !isOpaquePlanFilename(explicitSaved)
  ) {
    return explicitSaved;
  }

  const subject = asString(item?.requestSubject || item?.subject);
  if (isUsableRequestSubject(subject) && !matchesAnyPlanFilename(subject, planNames)) {
    return subject;
  }

  // Recover when API estimateName was previously set to the plan filename.
  if (
    (looksLikeAttachmentFilename(explicitSaved) ||
      matchesAnyPlanFilename(explicitSaved, planNames)) &&
    isUsableRequestSubject(subject)
  ) {
    return subject;
  }

  const fromApi = asString(item?.estimateName || item?.defaultEstimateName || item?.requestTitle);
  if (
    fromApi &&
    !isWeakLabel(fromApi) &&
    !/^AAMk/i.test(fromApi) &&
    !/unknown contact/i.test(fromApi) &&
    !isOpaquePlanFilename(fromApi) &&
    !looksLikeAttachmentFilename(fromApi) &&
    !matchesAnyPlanFilename(fromApi, planNames)
  ) {
    return fromApi;
  }

  if (
    (looksLikeAttachmentFilename(fromApi) || matchesAnyPlanFilename(fromApi, planNames)) &&
    isUsableRequestSubject(subject)
  ) {
    return subject;
  }

  if (item?.packetMerged && item?.packetFilename && !isOpaquePlanFilename(item.packetFilename)) {
    return filenameWithoutExtension(item.packetFilename) || asString(item.packetFilename);
  }

  const project = asString(item?.projectDisplay || item?.projectName);
  if (
    project &&
    !isWeakLabel(project) &&
    !/not named|not identified/i.test(project) &&
    !isOpaquePlanFilename(project) &&
    !looksLikeAttachmentFilename(project) &&
    !matchesAnyPlanFilename(project, planNames)
  ) {
    return project;
  }

  const selected = asString(item?.selectedPlanFilename || item?.takeoffPlanFilename || item?.planFilename);
  if (selected && !isOpaquePlanFilename(selected) && !/^AAMk/i.test(selected)) {
    return filenameWithoutExtension(selected) || selected;
  }

  if (explicitSaved && !isWeakLabel(explicitSaved)) return explicitSaved;

  const customer = resolveQueueCustomer(item, { allowUntitled: false });
  if (customer && !isWeakLabel(customer) && !/^Plan:/i.test(customer)) return customer;

  const rawId = asString(item?.takeoffJobId || item?.intakeCaseId);
  if (rawId && !/^AAMk/i.test(rawId)) {
    const short = rawId.replace(/-/g, "").slice(0, 8);
    if (short) return `Quote ${short}`;
  }
  return "Untitled quote request";
}

/**
 * @param {object} item
 * @param {{ allowUntitled?: boolean }} [opts]
 */
export function resolveQueueCustomer(item, opts = {}) {
  const candidates = [
    item?.customerDisplay,
    item?.customerName,
    item?.customerLabel,
    item?.senderLabel,
    item?.sender,
    item?.senderDisplayName,
    item?.contact
  ];
  for (const c of candidates) {
    const v = asString(c);
    if (v && !isWeakLabel(v) && !/not identified/i.test(v) && !/^AAMk/i.test(v)) return v;
  }
  const plan =
    filenameWithoutExtension(item?.selectedPlanFilename || item?.planFilename) ||
    asString(item?.selectedPlanFilename || item?.planFilename);
  if (plan && !/^AAMk/i.test(plan) && !isOpaquePlanFilename(plan)) return `Plan: ${plan}`;
  const project = asString(item?.projectDisplay || item?.projectName || item?.requestSubject || item?.subject);
  if (project && !isWeakLabel(project) && !/not named|not identified/i.test(project)) {
    return project;
  }
  if (opts.allowUntitled === false) return "";
  return "";
}

/**
 * Row / workspace title — never "Unknown contact — Unknown contact".
 * @param {object} item
 */
export function resolveQueueTitle(item) {
  return resolveDefaultEstimateName(item);
}

/**
 * One-line subtitle under the title (contact · plan), skipping duplicates / weak labels.
 * @param {object} item
 * @param {string} [estimateName]
 */
export function resolveQueueSubtitle(item, estimateName = "") {
  const name = String(estimateName || resolveDefaultEstimateName(item)).trim();
  const customer = resolveQueueCustomer(item);
  const plan =
    filenameWithoutExtension(item?.selectedPlanFilename || item?.planFilename) ||
    asString(item?.selectedPlanFilename || item?.planFilename);
  const parts = [];
  if (customer && customer !== name && !/^Plan:/i.test(customer) && !isWeakLabel(customer)) {
    parts.push(customer);
  }
  if (
    plan &&
    plan !== name &&
    `Plan: ${plan}` !== customer &&
    !isOpaquePlanFilename(plan)
  ) {
    parts.push(plan);
  }
  return parts.join(" · ");
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
