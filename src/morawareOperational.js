function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
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
  return getText(act?.activityType?.name) || getText(act?.activityType) || getText(act?.type?.name) || getText(act?.type);
}

function pickActivityStatus(act) {
  return getText(act?.status?.name) || getText(act?.status);
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

  const activities = activitiesRaw.map((a, idx) => ({
    jobId: jid,
    activityIndex: idx,
    activityType: pickActivityType(a),
    activityStatus: pickActivityStatus(a),
    phaseName: pickPhaseName(a),
    startDate: normalizeDateToYmd(getText(a?.startDate)),
    schedTime: getText(a?.schedTime),
    duration: getText(a?.duration),
    description: getText(a?.description),
    notes: pickActivityNotes(a),
    raw: a ?? null
  }));

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

