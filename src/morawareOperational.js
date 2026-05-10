function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/** Unwrap fast-xml-parser / Moraware nodes that repeat as a single-element array. */
function unwrapFirst(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length ? unwrapFirst(value[0]) : null;
  return value;
}

function getText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return getText(value[0]);
  if (typeof value === "object") {
    const t = value._text ?? value["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

function getAttr(node, attrName) {
  if (!node || typeof node !== "object") return "";
  const a = node._attributes;
  if (!a || typeof a !== "object") return "";
  const v = a[attrName];
  return v == null ? "" : String(v).trim();
}

function normalizeDateToYmd(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, "0");
    const dd = String(us[2]).padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  return null;
}

function containsWordish(haystack, needle) {
  const h = String(haystack ?? "").toLowerCase();
  const n = String(needle ?? "").toLowerCase();
  return Boolean(n && h.includes(n));
}

function safeConcat(parts, maxLen) {
  const out = [];
  let used = 0;
  for (const p of parts) {
    const s = String(p ?? "").trim();
    if (!s) continue;
    const chunk = s.replace(/\s+/g, " ");
    if (!chunk) continue;
    const nextLen = used ? used + 2 + chunk.length : chunk.length;
    if (nextLen > maxLen) {
      const remaining = Math.max(0, maxLen - used - (used ? 2 : 0));
      if (remaining > 0) out.push(chunk.slice(0, remaining));
      break;
    }
    out.push(chunk);
    used = nextLen;
  }
  return out.join("\n\n");
}

function extractSlabNumbers(text) {
  const s = String(text ?? "");
  const re = /#?\d{4,6}(?:-\d+)?/g;
  const found = s.match(re) || [];
  const out = [];
  const seen = new Set();
  for (const raw of found) {
    const v = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!v) continue;
    // avoid obvious years
    if (v === "2026" || v === "2025" || v === "2024" || v === "2023") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickActivityType(act) {
  const typeNode = unwrapFirst(act?.activityType);
  const altType = unwrapFirst(act?.type);
  return getText(typeNode?.name) || getText(typeNode) || getText(altType?.name) || getText(altType);
}

function pickActivityStatus(act) {
  const st = unwrapFirst(act?.status);
  return getText(st?.name) || getText(st);
}

function pickPhaseName(act) {
  return (
    getText(act?.jobPhases?.jobPhase?.name) ||
    getText(act?.jobPhase?.name) ||
    getText(act?.phase?.name) ||
    getText(act?.phaseName)
  );
}

function pickActivityNotes(act) {
  return getText(act?.notes) || getText(act?.note) || getText(act?.comment);
}

function pickActivityDescription(act) {
  return getText(act?.description);
}

function parsePhaseSeqNumFromNode(p) {
  if (!p || typeof p !== "object") return null;
  const raw = getAttr(p, "seqNum") || getText(p?.seqNum);
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function extractActivityTypeMeta(act) {
  const node = unwrapFirst(act?.activityType);
  if (node && typeof node === "object") {
    return {
      activityTypeId: getAttr(node, "id"),
      activityTypeName: getText(node?.name) || pickActivityType(act)
    };
  }
  return { activityTypeId: "", activityTypeName: pickActivityType(act) };
}

function extractActivityStatusMeta(act) {
  const node = unwrapFirst(act?.status);
  if (node && typeof node === "object") {
    return {
      activityStatusId: getAttr(node, "id"),
      activityStatusName: getText(node?.name) || pickActivityStatus(act)
    };
  }
  return { activityStatusId: "", activityStatusName: pickActivityStatus(act) };
}

function jobPhaseRowsFromActivity(act) {
  const jp = act?.jobPhases;
  if (jp && typeof jp === "object" && !Array.isArray(jp)) {
    return asArray(jp.jobPhase);
  }
  return asArray(act?.jobPhase);
}

/** Phase row attached to a single activity (Moraware nests jobPhases on the activity). */
function extractActivityPhaseMeta(act) {
  const rows = jobPhaseRowsFromActivity(act);
  const first = unwrapFirst(rows[0]);
  if (!first) {
    return {
      phaseId: "",
      phaseName: pickPhaseName(act),
      phaseSeqNum: null
    };
  }
  return {
    phaseId: getAttr(first, "id") || String(first?.id ?? "").trim(),
    phaseName: getText(first?.name) || pickPhaseName(act),
    phaseSeqNum: parsePhaseSeqNumFromNode(first)
  };
}

function pickNonemptyString(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s !== "") return s;
  }
  return "";
}

function coercePhaseSeqNum(value) {
  if (value == null || String(value).trim() === "") return undefined;
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Collapse normalized activity + optional `raw` Moraware node for Supabase row mapping.
 * Handles normalized rows where `activityType` / `status` are plain strings but ids live on `raw`.
 */
export function mergeActivityFieldsForBrainInsert(activity) {
  const a = activity ?? {};
  const raw = a.raw && typeof a.raw === "object" && !Array.isArray(a.raw) ? a.raw : null;

  const typeNorm = extractActivityTypeMeta(a);
  const statNorm = extractActivityStatusMeta(a);
  const phaseNorm = extractActivityPhaseMeta(a);
  const typeRaw = raw ? extractActivityTypeMeta(raw) : typeNorm;
  const statRaw = raw ? extractActivityStatusMeta(raw) : statNorm;
  const phaseRaw = raw ? extractActivityPhaseMeta(raw) : phaseNorm;

  const activityTypeId = pickNonemptyString(a.activityTypeId, typeRaw.activityTypeId, typeNorm.activityTypeId);
  const activityTypeName = pickNonemptyString(
    a.activityTypeName,
    a.activityType,
    typeNorm.activityTypeName,
    typeRaw.activityTypeName
  );
  const activityStatusId = pickNonemptyString(a.activityStatusId, statRaw.activityStatusId, statNorm.activityStatusId);
  const activityStatusName = pickNonemptyString(
    a.activityStatusName,
    a.activityStatus,
    statNorm.activityStatusName,
    statRaw.activityStatusName
  );
  const phaseId = pickNonemptyString(a.phaseId, phaseRaw.phaseId, phaseNorm.phaseId);
  const phaseName = pickNonemptyString(a.phaseName, phaseNorm.phaseName, phaseRaw.phaseName);
  const phaseSeqNum = coercePhaseSeqNum(a.phaseSeqNum) ?? phaseRaw.phaseSeqNum ?? phaseNorm.phaseSeqNum ?? null;

  return {
    activityTypeId,
    activityTypeName,
    activityStatusId,
    activityStatusName,
    phaseId,
    phaseName,
    phaseSeqNum
  };
}

/**
 * Non-authoritative heuristics on free-form job notes (signals only — not worksheet Sq.Ft. truth).
 * @param {string} notesText
 * @param {{ includeRawSnippets?: boolean }} [options]
 */
export function analyzeJobNotesScope(notesText, options = {}) {
  const includeRawSnippets = Boolean(options?.includeRawSnippets);
  const text = String(notesText ?? "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const isSqftLine = (l) => {
    const s = String(l ?? "");
    return (
      /\d+\s*sf\b/i.test(s) ||
      /\d+\s*sq\s*\.?\s*ft\b/i.test(s) ||
      /\d+\s*sqft\b/i.test(s) ||
      /\d+\s*sq\s*'/i.test(s) ||
      /\d+\s*sq\s*ft\b/i.test(s)
    );
  };

  const hasPhaseLabel = (l) => /\bPHASE\s*\d+\b/i.test(String(l ?? ""));
  const hasScopeLikeLines = lines.some((l) => isSqftLine(l) || hasPhaseLabel(l)) || /\bPHASE\s*\d+\b/i.test(text);

  const sqftLines = lines.filter(isSqftLine);
  const phaseMatches = text.match(/\bPHASE\s*\d+\b/gi) || [];
  const detected_phase_labels = [...new Set(phaseMatches.map((m) => m.toUpperCase()))];

  const out = {
    has_scope_like_lines: Boolean(hasScopeLikeLines),
    detected_sqft_line_count: sqftLines.length,
    detected_phase_label_count: detected_phase_labels.length,
    detected_phase_labels,
    recommended_future_parser:
      "Parse job notes into scope lines cautiously; always preserve original notes in raw_json / brain_jobs.notes. Do not replace worksheet Sq.Ft."
  };
  if (includeRawSnippets) {
    out.examples_if_raw_snippets_enabled = lines.slice(0, 12);
  }
  return out;
}

/**
 * Proven Moraware site / ship-to style address object under operational `job.address`.
 * Returns null when absent.
 */
export function extractJobSiteAddressFromOperationalJobNode(jobNode) {
  if (!jobNode || typeof jobNode !== "object") return null;
  const addr = jobNode.address;
  if (!addr || typeof addr !== "object") return null;

  const address_line1 = getText(addr.addressLine1) || getText(addr.line1) || getText(addr.street);
  const city = getText(addr.city);
  const state = getText(addr.state);
  const zip = getText(addr.zip) || getText(addr.postalCode);
  const contact_name = getText(addr.contactName) || getText(addr.contact);
  const email = getText(addr.email);
  const cell = getText(addr.cell) || getText(addr.phone);
  const notes = getText(addr.notes);

  if (!address_line1 && !city && !state && !zip && !contact_name && !email && !cell && !notes) return null;

  return {
    address_line1,
    city,
    state,
    zip,
    contact_name,
    email,
    cell,
    notes,
    raw_json: addr
  };
}

function getJobNode(parsedResponse) {
  const jq = parsedResponse?.MorawareResponse?.jobQuery;
  const jobs = asArray(jq?.job);
  return jobs[0] || null;
}

export function normalizeJobOperational(jobId, parsedResponse) {
  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("normalizeJobOperational: jobId required");

  const jobNode = getJobNode(parsedResponse);
  const phasesRaw = asArray(jobNode?.jobPhases?.jobPhase || jobNode?.jobPhase);
  const contactsRaw = asArray(jobNode?.jobContacts?.jobContact || jobNode?.jobContact || jobNode?.contacts?.contact);

  // jobActivity is observed as an array of rows (no obvious container), but keep a few fallbacks.
  const activitiesRaw = asArray(
    jobNode?.jobActivity?.jobActivity ||
      jobNode?.jobActivity?.activity ||
      jobNode?.jobActivity ||
      jobNode?.activities?.activity ||
      jobNode?.activity
  );

  const phases = phasesRaw.map((p) => ({
    jobId: jid,
    phaseName: getText(p?.name) || getText(p?.phaseName),
    phaseId: getAttr(p, "id") || getText(p?.id),
    phaseSeqNum: parsePhaseSeqNumFromNode(p),
    raw: p ?? null
  }));

  const contacts = contactsRaw.map((c) => ({
    jobId: jid,
    contactName: getText(c?.name) || getText(c?.contactName),
    phone: getText(c?.phone),
    cell: getText(c?.cell),
    email: getText(c?.email),
    notes: getText(c?.notes) || getText(c?.note),
    raw: c ?? null
  }));

  const activities = activitiesRaw.map((a, idx) => {
    const typeM = extractActivityTypeMeta(a);
    const statM = extractActivityStatusMeta(a);
    const phM = extractActivityPhaseMeta(a);
    return {
      jobId: jid,
      activityIndex: idx,
      activityType: typeM.activityTypeName || pickActivityType(a),
      activityStatus: statM.activityStatusName || pickActivityStatus(a),
      phaseName: phM.phaseName || pickPhaseName(a),
      startDate: normalizeDateToYmd(getText(a?.startDate)),
      schedTime: getText(a?.schedTime),
      duration: getText(a?.duration),
      description: pickActivityDescription(a),
      notes: pickActivityNotes(a),
      activityTypeId: typeM.activityTypeId,
      activityTypeName: typeM.activityTypeName,
      activityStatusId: statM.activityStatusId,
      activityStatusName: statM.activityStatusName,
      phaseId: phM.phaseId,
      phaseSeqNum: phM.phaseSeqNum,
      raw: a ?? null
    };
  });

  return {
    jobId: jid,
    phases,
    contacts,
    activities,
    raw: {
      job: jobNode ?? null,
      jobQuery: parsedResponse?.MorawareResponse?.jobQuery ?? null
    }
  };
}

export function deriveOperationalSummary(jobId, operational) {
  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("deriveOperationalSummary: jobId required");

  const activities = Array.isArray(operational?.activities) ? operational.activities : [];
  const phases = Array.isArray(operational?.phases) ? operational.phases : [];
  const contacts = Array.isArray(operational?.contacts) ? operational.contacts : [];

  const templateDates = [];
  const installDates = [];

  let hasTemplate = false;
  let hasInstall = false;
  let hasOrderStone = false;
  let hasFabrication = false;
  let hasSaw = false;
  let hasPolish = false;

  let hasCustomerService = false;
  let hasRemake = false;
  let hasRepair = false;
  let hasChange = false;
  let hasSlab = false;

  const noteParts = [];
  const slabCandidates = [];

  const pushDate = (arr, d) => {
    if (!d) return;
    if (!arr.includes(d)) arr.push(d);
  };

  for (const a of activities) {
    const type = String(a?.activityType ?? "").toLowerCase();
    const desc = String(a?.description ?? "");
    const notes = String(a?.notes ?? "");
    const phaseName = String(a?.phaseName ?? "");
    const start = a?.startDate ?? null;

    if (type.includes("template")) {
      hasTemplate = true;
      pushDate(templateDates, start);
    }
    if (type.includes("install")) {
      hasInstall = true;
      pushDate(installDates, start);
    }
    if (type.includes("order stone")) hasOrderStone = true;
    if (type.includes("fabrication")) hasFabrication = true;
    if (type.includes("saw")) hasSaw = true;
    if (type.includes("polish")) hasPolish = true;

    const blob = `${type} ${desc} ${notes}`.toLowerCase();
    if (blob.includes("customer service") || blob.includes(" service")) hasCustomerService = true;
    if (blob.includes("repair")) hasRepair = true;
    if (blob.includes("remake") || String(phaseName).toLowerCase().includes("remake")) hasRemake = true;
    if (
      blob.includes("change order") ||
      blob.includes("revision") ||
      blob.includes("revised") ||
      blob.includes("approved") ||
      blob.includes(" changed") ||
      blob.includes(" change ")
    ) {
      hasChange = true;
    }
    if (blob.includes("slab") || blob.includes("slabs")) hasSlab = true;

    noteParts.push(desc);
    noteParts.push(notes);
    slabCandidates.push(blob);
  }

  for (const p of phases) {
    const pn = String(p?.phaseName ?? "").toLowerCase();
    if (pn.includes("remake")) hasRemake = true;
  }

  const jobNotes = String(operational?.raw?.job?.notes?._text ?? operational?.raw?.job?.notes ?? "").trim();
  if (jobNotes) {
    const blob = jobNotes.toLowerCase();
    if (blob.includes("customer service") || blob.includes(" service")) hasCustomerService = true;
    if (blob.includes("repair")) hasRepair = true;
    if (blob.includes("remake")) hasRemake = true;
    if (
      blob.includes("change order") ||
      blob.includes("revision") ||
      blob.includes("revised") ||
      blob.includes("approved") ||
      blob.includes(" changed") ||
      blob.includes(" change ")
    ) {
      hasChange = true;
    }
    if (blob.includes("slab") || blob.includes("slabs")) hasSlab = true;
    slabCandidates.push(blob);
  }

  const slabNumbers = [];
  const seenSlabs = new Set();
  for (const blob of slabCandidates) {
    for (const v of extractSlabNumbers(blob)) {
      if (seenSlabs.has(v)) continue;
      seenSlabs.add(v);
      slabNumbers.push(v);
    }
  }

  const operationalNotesText = safeConcat([jobNotes, ...noteParts], 20_000);

  return {
    jobId: jid,
    has_template_activity: Boolean(hasTemplate),
    template_dates: templateDates,
    has_install_activity: Boolean(hasInstall),
    install_dates: installDates,
    has_order_stone_activity: Boolean(hasOrderStone),
    has_fabrication_activity: Boolean(hasFabrication),
    has_saw_activity: Boolean(hasSaw),
    has_polish_activity: Boolean(hasPolish),
    has_customer_service_signal: Boolean(hasCustomerService),
    has_remake_signal: Boolean(hasRemake),
    has_repair_signal: Boolean(hasRepair),
    has_change_signal: Boolean(hasChange),
    has_slab_signal: Boolean(hasSlab || slabNumbers.length > 0),
    slab_numbers: slabNumbers,
    activity_count: activities.length,
    phase_count: phases.length,
    contact_count: contacts.length,
    operational_notes_text: operationalNotesText,
    raw: {
      derivedFrom: "jobQuery.includeAll",
      job: operational?.raw?.job ?? null
    }
  };
}

