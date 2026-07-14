/**
 * Missing-information rules for Elite 100 intake (Phase 3).
 * Does not inspect attachment bytes — filename/MIME signals only.
 */

const PLAN_NAME_RE = /\b(plan|plans|measurement|measurements|layout|drawing|takeoff)\b/i;
const PLAN_EXT_RE = /\.(pdf|png|jpe?g|webp|tif{1,2}|dxf|dwg)$/i;
const UNSUPPORTED_PLAN_HINT_RE = /\.(exe|html?|js|zip|rar|7z)$/i;

/**
 * @param {object} args
 * @param {Record<string, any>} args.fieldsByKey
 * @param {Array<{ filename: string, contentType?: string }>} args.attachments
 * @param {{ email?: string }} args.from
 */
export function evaluateMissingInformation({ fieldsByKey, attachments, from }) {
  /** @type {Array<{ key: string, severity: string, label: string, detail: string, resolved: boolean }>} */
  const items = [];

  const planSignal = detectPlanAttachmentSignal(attachments ?? []);
  if (planSignal.kind === "absent") {
    items.push({
      key: "readable_plan_attachment",
      severity: "quote_blocking",
      label: "Readable plan / measurement attachment",
      detail: "No attachment filename suggests a plan or measurement document.",
      resolved: false
    });
  } else if (planSignal.kind === "unresolved") {
    items.push({
      key: "readable_plan_attachment",
      severity: "estimator_review",
      label: "Readable plan / measurement attachment",
      detail: planSignal.detail,
      resolved: false
    });
  } else {
    items.push({
      key: "readable_plan_attachment",
      severity: "quote_blocking",
      label: "Readable plan / measurement attachment",
      detail:
        "Plan-like filename present; contents were not inspected (no OCR / takeoff in Phase 3).",
      resolved: true
    });
  }

  const color = fieldsByKey.requestedColorText;
  const eliteText = fieldsByKey.elite100OrPriceGroupText;
  const hasColorOrGroup = !!(color && !color.unknown && color.value) || !!(eliteText && !eliteText.unknown && eliteText.value);
  items.push({
    key: "requested_color_or_price_group",
    severity: "quote_blocking",
    label: "Requested color or acceptable price-group instruction",
    detail: hasColorOrGroup
      ? "Color or price-group text extracted from the message."
      : "No explicit color or price-group instruction found.",
    resolved: hasColorOrGroup
  });

  const sf = fieldsByKey.statedSquareFootage;
  const hasSf = !!(sf && !sf.unknown && sf.value != null);
  // Plan-like attachment may supply future takeoff — still not blocking-resolved for SF unless SF stated
  items.push({
    key: "total_sf_or_measurements",
    severity: "quote_blocking",
    label: "Total square footage or measurements sufficient for future takeoff",
    detail: hasSf
      ? "Stated square footage found in the message (not calculated)."
      : planSignal.kind === "present_unverified"
        ? "No stated SF; plan-like attachment may support future takeoff (unread)."
        : "No stated square footage and no plan-like attachment for future takeoff.",
    resolved: hasSf || planSignal.kind === "present_unverified"
  });

  const sinks = fieldsByKey.sinkCutoutCount;
  const hasSinks = !!(sinks && !sinks.unknown && sinks.value != null);
  items.push({
    key: "sink_cutout_count",
    severity: "quote_blocking",
    label: "Sink cutout count",
    detail: hasSinks ? "Sink cutout count stated." : "Sink cutout count not stated.",
    resolved: hasSinks
  });

  const edge = fieldsByKey.edgeProfile;
  const hasEdge = !!(edge && !edge.unknown && edge.value);
  items.push({
    key: "edge_profile",
    severity: "quote_blocking",
    label: "Edge profile",
    detail: hasEdge ? "Edge profile stated." : "Edge profile not stated.",
    resolved: hasEdge
  });

  pushAdmin(items, "customer_account", "Customer / account", fieldsByKey.customerAccount);
  pushAdmin(items, "project_name", "Project name", fieldsByKey.projectName);
  pushAdmin(items, "project_address", "Project address", fieldsByKey.projectAddress);

  const email = String(from?.email ?? "");
  const hasContact = Boolean(email && email.includes("@"));
  items.push({
    key: "sender_contact",
    severity: "helpful_but_not_blocking",
    label: "Sender contact information",
    detail: hasContact ? "Sender email present." : "Sender email missing.",
    resolved: hasContact
  });

  return items.filter((i) => !i.resolved || i.key === "readable_plan_attachment");
}

/**
 * Public missing keys used on the case row (unresolved only).
 * @param {ReturnType<typeof evaluateMissingInformation>} items
 */
export function missingKeysForCase(items) {
  return items.filter((i) => !i.resolved).map((i) => i.key);
}

function pushAdmin(items, key, label, field) {
  const ok = !!(field && !field.unknown && field.value);
  items.push({
    key,
    severity: "helpful_but_not_blocking",
    label,
    detail: ok ? `${label} present.` : `${label} not stated.`,
    resolved: ok
  });
}

/**
 * @param {Array<{ filename: string, contentType?: string }>} attachments
 */
export function detectPlanAttachmentSignal(attachments) {
  if (!attachments?.length) return { kind: "absent" };

  let sawPlanName = false;
  for (const a of attachments) {
    const name = String(a.filename ?? "");
    const mime = String(a.contentType ?? "").toLowerCase();
    if (UNSUPPORTED_PLAN_HINT_RE.test(name) || mime.includes("javascript") || mime === "text/html") {
      if (PLAN_NAME_RE.test(name)) {
        return {
          kind: "unresolved",
          detail: `Attachment “${name}” looks plan-related but MIME/extension is unsupported for readable plans.`
        };
      }
    }
    if (PLAN_NAME_RE.test(name) || (PLAN_EXT_RE.test(name) && /\b(kitchen|bath|counter|island)\b/i.test(name))) {
      sawPlanName = true;
    }
  }
  if (sawPlanName) return { kind: "present_unverified" };
  // PDF without plan keywords — unresolved (may or may not be a plan)
  const anyPdf = attachments.some((a) => /\.pdf$/i.test(a.filename || "") || /pdf/i.test(a.contentType || ""));
  if (anyPdf) {
    return {
      kind: "unresolved",
      detail: "PDF attachment present, but filename does not confirm a readable plan. Contents not inspected."
    };
  }
  return { kind: "absent" };
}
