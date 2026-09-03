/**
 * Quote Flow — customer-requested selections (email → Review → Set Scope).
 * AI/deterministic extraction produces requests, not official scope.
 * Only estimator-confirmed items apply into studio estimate scope.
 */
import { createHash, randomUUID } from "node:crypto";
import { fetchEliteProgramMaterialColors } from "../quotes/materialColorsCatalog.js";
import { sanitizeQueueSourceText } from "./quoteFlowQueueSourceMeta.mjs";

export const REQUESTED_SELECTIONS_VERSION = "qf_requested_selections_v1";
export const SOURCE_EMAIL_BODY_MAX = 4000;

const EDGE_ALIASES = [
  { re: /\beased\b/i, token: "edge_eased", label: "Eased" },
  { re: /\bbevel(?:ed)?\b/i, token: "edge_bevel", label: "Bevel" },
  { re: /\bmitre(?:d)?\b|\bmiter(?:ed)?\b/i, token: "edge_miter", label: "Mitered" },
  { re: /\bbullnose\b/i, token: "edge_full_bullnose", label: "Bullnose" },
  { re: /\bknife\b/i, token: "edge_knife", label: "Knife" },
  { re: /\bcrescent\b/i, token: "edge_crescent", label: "Crescent" }
];

const GROUP_RE =
  /\bgroup\s*([a-f]|promo)\b|\b([a-f])\s+group\b|\bpromo\b(?=\s+(?:throughout|in|for|laundry|kitchen|bath))/gi;

export function boundSourceEmailBody(text, max = SOURCE_EMAIL_BODY_MAX) {
  return sanitizeQueueSourceText(text, max);
}

export function normalizeCatalogColorKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMaterialGroupLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/_/g, " ");
  if (/promo/.test(lower)) return "Group Promo";
  if (/remnant/.test(lower)) return "Remnant";
  const letter = lower.match(/\bgroup\s*([a-f])\b/) || lower.match(/^([a-f])$/);
  if (letter) return `Group ${String(letter[1]).toUpperCase()}`;
  if (/^group\s+/i.test(raw)) return raw.replace(/\s+/g, " ");
  return raw;
}

function makeSourceRef(body, opts = {}) {
  return {
    type: "email_body",
    messageKey: String(opts.messageKey || "").trim() || null,
    excerpt: sanitizeQueueSourceText(body, 240)
  };
}

export function createSelectionItem(partial = {}) {
  return {
    id: String(partial.id || `sel_${randomUUID().replace(/-/g, "").slice(0, 12)}`),
    kind: partial.kind || "addon",
    status: partial.status || "proposed",
    mentionStatus: partial.mentionStatus || "explicitly_stated",
    customerRawText: sanitizeQueueSourceText(partial.customerRawText, 320),
    roomHint: sanitizeQueueSourceText(partial.roomHint, 80),
    roomId: partial.roomId || null,
    confidence: partial.confidence || "medium",
    resolved: partial.resolved && typeof partial.resolved === "object" ? partial.resolved : null,
    confirmation:
      partial.confirmation && typeof partial.confirmation === "object" ? partial.confirmation : null,
    geometryReviewRequired: partial.geometryReviewRequired === true,
    sourceRefs: Array.isArray(partial.sourceRefs) ? partial.sourceRefs.slice(0, 5) : []
  };
}

function normalizeRoomHint(hint) {
  const t = String(hint || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (/primary\s+bath/.test(t)) return "primary bath";
  if (/guest\s+bath/.test(t)) return "guest bath";
  if (/bath/.test(t)) return "bath";
  if (/kitchen/.test(t)) return "kitchen";
  if (/laundry/.test(t)) return "laundry";
  if (/island/.test(t)) return "island";
  return t;
}

function inferRoomHint(windowText) {
  return normalizeRoomHint(windowText);
}

export function extractRequestedSelectionsFromEmailBody(bodyText, opts = {}) {
  const body = String(bodyText || "").trim();
  const subject = String(opts.subject || "").trim();
  const corpus = `${subject}\n${body}`.trim();
  const sourceRef = makeSourceRef(corpus, opts);
  const items = [];

  if (!corpus) {
    return {
      extractionVersion: REQUESTED_SELECTIONS_VERSION,
      extractedAt: new Date().toISOString(),
      sourceType: "email_body",
      messageKey: String(opts.messageKey || "").trim() || null,
      items: [],
      mentionSummary: {
        tear_out: "not_mentioned",
        waterfall: "not_mentioned",
        backsplash: "not_mentioned",
        edge: "not_mentioned"
      }
    };
  }

  let tearMention = "not_mentioned";
  if (/\b(?:no|without|exclude|excluding)\s+tear[-\s]?outs?\b/i.test(corpus)) {
    tearMention = "explicitly_stated";
    items.push(
      createSelectionItem({
        kind: "tear_out",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "No tear-out",
        confidence: "high",
        resolved: {
          displayLabel: "Tear-out excluded",
          addonKey: "tearout",
          quantity: 0,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  } else if (
    /\b(?:include|with|needs?|request(?:ed)?|please)\b[\s\w,]{0,40}\btear[-\s]?outs?\b|\btear[-\s]?outs?\b/i.test(
      corpus
    )
  ) {
    tearMention = "explicitly_stated";
    items.push(
      createSelectionItem({
        kind: "tear_out",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "Include tear-out",
        confidence: "high",
        resolved: {
          displayLabel: "Tear-out requested",
          addonKey: "tearout",
          quantity: 1,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  }

  let edgeMention = "not_mentioned";
  for (const edge of EDGE_ALIASES) {
    if (edge.re.test(corpus) && /\bedge\b/i.test(corpus)) {
      edgeMention = "explicitly_stated";
      items.push(
        createSelectionItem({
          kind: "edge",
          status: "proposed",
          mentionStatus: "explicitly_stated",
          customerRawText: edge.label,
          confidence: "high",
          resolved: {
            displayLabel: edge.label,
            edgeProfileToken: edge.token,
            matchConfidence: "high"
          },
          sourceRefs: [sourceRef]
        })
      );
      break;
    }
  }

  let backsplashMention = "not_mentioned";
  if (/\b(?:no|without|exclude)\s+(?:backsplash|bs)\b|\bbacksplash\s*(?:not|none)\b/i.test(corpus)) {
    backsplashMention = "explicitly_stated";
    items.push(
      createSelectionItem({
        kind: "backsplash",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "No backsplash",
        confidence: "high",
        resolved: {
          displayLabel: "No backsplash",
          includeBacksplash: false,
          backsplashHeightIn: null,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  } else if (
    /\bfull[-\s]?height\b[\s\w]{0,20}\bbacksplash\b|\bbacksplash\b[\s\w]{0,20}\bfull[-\s]?height\b/i.test(
      corpus
    )
  ) {
    backsplashMention = "explicitly_stated";
    items.push(
      createSelectionItem({
        kind: "backsplash",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "Full-height backsplash",
        confidence: "high",
        resolved: {
          displayLabel: "Full-height backsplash",
          includeBacksplash: true,
          backsplashHeightMode: "full_height",
          backsplashHeightIn: null,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  } else if (
    /\b(?:standard\s+)?4\s*(?:"|''|″|in(?:ch(?:es)?)?)\s*backsplash\b|\bbacksplash\b[\s\w]{0,12}\b4\s*(?:"|''|″|in)/i.test(
      corpus
    )
  ) {
    backsplashMention = "explicitly_stated";
    items.push(
      createSelectionItem({
        kind: "backsplash",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: 'Standard 4" backsplash',
        confidence: "high",
        resolved: {
          displayLabel: 'Standard 4" backsplash',
          includeBacksplash: true,
          backsplashHeightMode: "standard_4",
          backsplashHeightIn: 4,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  } else {
    const hm = corpus.match(/\b(\d{1,2})\s*(?:"|''|″|in(?:ch(?:es)?)?)\s*backsplash\b/i);
    if (hm) {
      const h = Number(hm[1]) || null;
      backsplashMention = "explicitly_stated";
      items.push(
        createSelectionItem({
          kind: "backsplash",
          status: "proposed",
          mentionStatus: "explicitly_stated",
          customerRawText: hm[0],
          confidence: "medium",
          resolved: {
            displayLabel: h ? `${h}" backsplash` : "Custom backsplash",
            includeBacksplash: true,
            backsplashHeightMode: "custom",
            backsplashHeightIn: h,
            matchConfidence: "medium"
          },
          sourceRefs: [sourceRef]
        })
      );
    }
  }

  let waterfallMention = "not_mentioned";
  if (/\bwaterfall\b/i.test(corpus)) {
    waterfallMention = "explicitly_stated";
    const sideMatch = corpus.match(
      /\b(left|right|both)\b[\s\w,]{0,24}\bwaterfall\b|\bwaterfall\b[\s\w,]{0,24}\b(left|right|both)\b/i
    );
    const side = sideMatch ? String(sideMatch[1] || sideMatch[2] || "").toLowerCase() : null;
    const island = /\bisland\b/i.test(corpus);
    const raw = sanitizeQueueSourceText(
      [side ? `${side} waterfall` : "Waterfall", island ? "on island" : null].filter(Boolean).join(" "),
      160
    );
    items.push(
      createSelectionItem({
        kind: "waterfall",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: raw,
        roomHint: island ? "island" : null,
        confidence: "high",
        geometryReviewRequired: true,
        resolved: {
          displayLabel: `${raw} — geometry review required`,
          waterfallRequested: true,
          side: side || null,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  }

  if (
    /\bstainless\b[\s\w]{0,20}\b(?:kitchen\s+)?sink\b|\bkitchen\s+sink\b[\s\w]{0,20}\bstainless\b/i.test(
      corpus
    )
  ) {
    items.push(
      createSelectionItem({
        kind: "sink",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "Stainless kitchen sink",
        roomHint: "kitchen",
        confidence: "high",
        resolved: {
          displayLabel: "Stainless sink",
          addonKey: "qty-ss",
          quantity: 1,
          sinkRole: "kitchen",
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  }
  if (
    /\brectangular\b[\s\w]{0,24}\b(?:vanity\s+)?sinks?\b|\bvanity\s+sinks?\b[\s\w]{0,24}\brectangular\b/i.test(
      corpus
    )
  ) {
    items.push(
      createSelectionItem({
        kind: "sink",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "Rectangular vanity sinks",
        roomHint: "bath",
        confidence: "high",
        resolved: {
          displayLabel: "Rectangular vanity sink",
          addonKey: "qty-v-rect",
          quantity: 1,
          sinkRole: "vanity",
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  } else if (/\boval\b[\s\w]{0,24}\b(?:vanity\s+)?sinks?\b/i.test(corpus)) {
    items.push(
      createSelectionItem({
        kind: "sink",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: "Oval vanity sinks",
        roomHint: "bath",
        confidence: "high",
        resolved: {
          displayLabel: "Oval vanity sink",
          addonKey: "qty-v-oval",
          quantity: 1,
          sinkRole: "vanity",
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  }

  const groupHits = [];
  let gm;
  const groupScanner = new RegExp(GROUP_RE.source, "gi");
  while ((gm = groupScanner.exec(corpus)) !== null) {
    const letter = String(gm[1] || gm[2] || (/\bpromo\b/i.test(gm[0]) ? "promo" : "")).toLowerCase();
    if (!letter) continue;
    const start = Math.max(0, gm.index - 40);
    const end = Math.min(corpus.length, gm.index + gm[0].length + 60);
    groupHits.push({ letter, window: corpus.slice(start, end), raw: gm[0] });
  }
  for (const hit of groupHits) {
    const groupLabel = normalizeMaterialGroupLabel(
      hit.letter === "promo" ? "Group Promo" : `Group ${hit.letter.toUpperCase()}`
    );
    items.push(
      createSelectionItem({
        kind: "material",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: hit.raw,
        roomHint: inferRoomHint(hit.window),
        confidence: "high",
        resolved: {
          displayLabel: groupLabel,
          materialGroup: groupLabel,
          colorName: null,
          colorTbd: true,
          matchConfidence: "high"
        },
        sourceRefs: [sourceRef]
      })
    );
  }

  // Case-sensitive color capture: do NOT use /i — [A-Z] must stay uppercase-only.
  const materialClauses = [
    ...corpus.matchAll(
      /([A-Z][A-Za-z0-9][A-Za-z0-9'’\-]*(?:\s+[A-Z][A-Za-z0-9'’\-]*){0,3})\s+(?:in|for)\s+(?:the\s+)?(kitchen|bath(?:room)?s?|primary\s+bath|guest\s+bath|laundry|island)\b/g
    )
  ];
  // Fallback: "quote/use … Calacatta Laza" optionally followed by room phrase.
  for (const m of corpus.matchAll(
    /(?:quote|use|specify|want|need)\s+(?:this\s+in\s+|in\s+)?([A-Z][A-Za-z0-9][A-Za-z0-9'’\-]*(?:\s+[A-Z][A-Za-z0-9'’\-]*){0,3})(?=\s*[.,;]|\s+in\s+|\s+for\s+|\s+and\s+|$)/g
  )) {
    const after = corpus.slice(m.index + m[0].length, m.index + m[0].length + 48);
    const roomAfter = after.match(
      /^\s+in\s+(?:the\s+)?(kitchen|bath(?:room)?s?|primary\s+bath|guest\s+bath|laundry|island)\b/i
    );
    materialClauses.push(Object.assign([m[0], m[1], roomAfter?.[1] || null], { index: m.index }));
  }
  const seenMaterialKeys = new Set();
  for (const m of materialClauses) {
    const colorRaw = sanitizeQueueSourceText(m[1], 80);
    if (!colorRaw) continue;
    if (
      /^(Please|Group|Stainless|Rectangular|Include|Price|Eased|Bevel|Waterfall|Tear|Primary|Guest)\b/i.test(
        colorRaw
      )
    ) {
      continue;
    }
    if (colorRaw.split(/\s+/).length > 4) continue;
    const key = normalizeCatalogColorKey(colorRaw);
    if (!key || seenMaterialKeys.has(key)) continue;
    if (/^group\s*[a-f]$/i.test(colorRaw)) continue;
    seenMaterialKeys.add(key);
    const roomHint =
      normalizeRoomHint(sanitizeQueueSourceText(m[2], 40)) ||
      inferRoomHint(
        `${m[0]} ${corpus.slice(
          (m.index || 0) + String(m[0] || "").length,
          (m.index || 0) + String(m[0] || "").length + 48
        )}`
      );
    items.push(
      createSelectionItem({
        kind: "material",
        status: "proposed",
        mentionStatus: "explicitly_stated",
        customerRawText: colorRaw,
        roomHint: roomHint && /group/i.test(roomHint) ? null : roomHint,
        confidence: "medium",
        resolved: null,
        sourceRefs: [sourceRef]
      })
    );
  }

  if (
    /\bsomething\s+white\b|\bwhite\s+with\s+gray\s+veins\b|\blight\s+colored?\s+(?:stone|quartz|material)\b/i.test(
      corpus
    )
  ) {
    const vague = corpus.match(
      /\bsomething\s+white(?:\s+with\s+gray\s+veins)?\b|\bwhite\s+with\s+gray\s+veins\b|\blight\s+colored?\s+(?:stone|quartz|material)\b/i
    );
    items.push(
      createSelectionItem({
        kind: "material",
        status: "unresolved",
        mentionStatus: "unresolved",
        customerRawText: vague?.[0] || "Vague material request",
        confidence: "low",
        resolved: null,
        sourceRefs: [sourceRef]
      })
    );
  }

  return {
    extractionVersion: REQUESTED_SELECTIONS_VERSION,
    extractedAt: new Date().toISOString(),
    sourceType: "email_body",
    messageKey: String(opts.messageKey || "").trim() || null,
    items,
    mentionSummary: {
      tear_out: tearMention,
      waterfall: waterfallMention,
      backsplash: backsplashMention,
      edge: edgeMention
    }
  };
}

export function resolveRequestedSelectionsAgainstCatalog(extraction, colors = []) {
  const list = Array.isArray(colors) ? colors : [];
  const byKey = new Map();
  for (const c of list) {
    const name = String(c.colorName || c.displayName || "").trim();
    const key = normalizeCatalogColorKey(name);
    if (key) byKey.set(key, c);
  }

  const items = (Array.isArray(extraction?.items) ? extraction.items : []).map((item) => {
    if (item.kind !== "material") return item;
    if (item.resolved?.materialGroup && item.resolved?.colorTbd === true) return item;
    const raw = String(item.customerRawText || "").trim();
    const key = normalizeCatalogColorKey(raw);
    const hit = byKey.get(key);
    if (hit) {
      const group = normalizeMaterialGroupLabel(hit.priceGroupLabel || hit.priceGroupCode);
      return {
        ...item,
        status: item.status === "unresolved" ? "proposed" : item.status,
        mentionStatus: "explicitly_stated",
        confidence: "high",
        resolved: {
          displayLabel: group ? `${hit.colorName} · ${group}` : String(hit.colorName),
          catalogColorId: hit.id || null,
          colorName: String(hit.colorName || raw),
          materialGroup: group,
          colorTbd: false,
          matchConfidence: "high"
        }
      };
    }
    let contains = null;
    for (const [k, c] of byKey.entries()) {
      if (key && (key.includes(k) || k.includes(key))) {
        contains = c;
        break;
      }
    }
    if (contains && key.length >= 6) {
      const group = normalizeMaterialGroupLabel(contains.priceGroupLabel || contains.priceGroupCode);
      return {
        ...item,
        status: "proposed",
        confidence: "medium",
        resolved: {
          displayLabel: group ? `${contains.colorName} · ${group}` : String(contains.colorName),
          catalogColorId: contains.id || null,
          colorName: String(contains.colorName || raw),
          materialGroup: group,
          colorTbd: false,
          matchConfidence: "medium"
        }
      };
    }
    if (item.resolved?.materialGroup) return item;
    return {
      ...item,
      status: item.status === "proposed" ? "unresolved" : item.status,
      mentionStatus:
        item.mentionStatus === "explicitly_stated" ? "unresolved" : item.mentionStatus,
      resolved: null
    };
  });

  return { ...extraction, items, resolvedAt: new Date().toISOString() };
}

export function mergeRequestedSelections(existingRequested, incoming) {
  const prev = existingRequested && typeof existingRequested === "object" ? existingRequested : {};
  const next = incoming && typeof incoming === "object" ? { ...incoming } : {};
  const prevItems = Array.isArray(prev.items) ? prev.items : [];
  const nextItems = Array.isArray(next.items) ? next.items : [];
  const confirmed = prevItems.filter((i) => i?.status === "confirmed" || i?.confirmation?.confirmedAt);
  const rejected = prevItems.filter((i) => i?.status === "rejected");
  const fingerprint = (item) =>
    [
      String(item?.kind || ""),
      normalizeCatalogColorKey(item?.customerRawText),
      normalizeCatalogColorKey(item?.roomHint),
      String(item?.resolved?.addonKey || item?.resolved?.edgeProfileToken || "")
    ].join("|");
  const protectedFp = new Set([...confirmed, ...rejected].map(fingerprint));
  const mergedIncoming = nextItems.filter((i) => !protectedFp.has(fingerprint(i)));
  return {
    ...prev,
    ...next,
    items: [...confirmed, ...rejected, ...mergedIncoming].slice(0, 80),
    extractionVersion: next.extractionVersion || prev.extractionVersion || REQUESTED_SELECTIONS_VERSION
  };
}

export function applyEstimatorSelectionAction(existingRequested, args) {
  const base =
    existingRequested && typeof existingRequested === "object" ? { ...existingRequested } : { items: [] };
  const items = Array.isArray(base.items) ? [...base.items] : [];
  const id = String(args.selectionId || "").trim();
  const idx = items.findIndex((i) => String(i?.id) === id);
  if (idx < 0) {
    const err = new Error("Selection not found");
    err.code = "selection_not_found";
    err.statusCode = 404;
    throw err;
  }
  const item = { ...items[idx] };
  const action = String(args.action || "").trim();
  const now = new Date().toISOString();
  const actor = String(args.actorUserId || "").trim() || null;
  const patch = args.patch && typeof args.patch === "object" ? args.patch : {};

  if (action === "reject") {
    item.status = "rejected";
    item.confirmation = { confirmedByUserId: actor, confirmedAt: now, action: "reject" };
  } else if (action === "unresolve") {
    item.status = "unresolved";
    item.resolved = null;
    item.confirmation = { confirmedByUserId: actor, confirmedAt: now, action: "unresolve" };
  } else if (action === "confirm" || action === "update") {
    const nextResolved = {
      ...(item.resolved && typeof item.resolved === "object" ? item.resolved : {}),
      ...(patch.resolved && typeof patch.resolved === "object" ? patch.resolved : {})
    };
    if (patch.roomHint != null) item.roomHint = sanitizeQueueSourceText(patch.roomHint, 80);
    if (patch.roomId != null) item.roomId = String(patch.roomId || "").trim() || null;
    if (patch.customerRawText != null) {
      item.customerRawText = sanitizeQueueSourceText(patch.customerRawText, 320);
    }
    if (patch.geometryReviewRequired != null) {
      item.geometryReviewRequired = patch.geometryReviewRequired === true;
    }
    item.resolved = Object.keys(nextResolved).length ? nextResolved : item.resolved;
    item.status = action === "confirm" ? "confirmed" : item.status === "confirmed" ? "confirmed" : "proposed";
    item.confirmation = {
      confirmedByUserId: actor,
      confirmedAt: now,
      action,
      confirmedValue: item.resolved
    };
  } else {
    const err = new Error("Invalid selection action");
    err.code = "selection_action_invalid";
    err.statusCode = 400;
    throw err;
  }
  items[idx] = item;
  return { ...base, items, updatedAt: now };
}

export function addManualRequestedSelection(existingRequested, itemPartial, actorUserId = null) {
  const base =
    existingRequested && typeof existingRequested === "object" ? { ...existingRequested } : { items: [] };
  const items = Array.isArray(base.items) ? [...base.items] : [];
  items.push(
    createSelectionItem({
      ...itemPartial,
      status: itemPartial.status || "confirmed",
      mentionStatus: "explicitly_stated",
      confidence: "high",
      confirmation: {
        confirmedByUserId: actorUserId || null,
        confirmedAt: new Date().toISOString(),
        action: "manual_add"
      }
    })
  );
  return { ...base, items: items.slice(0, 80), updatedAt: new Date().toISOString() };
}

export function matchRoomHintToRooms(hint, rooms = []) {
  const h = String(hint || "").toLowerCase().trim();
  if (!h) return [];
  const scored = [];
  for (const room of Array.isArray(rooms) ? rooms : []) {
    const name = String(room?.name || "").toLowerCase();
    if (!name) continue;
    if (h === "bath" && /bath/.test(name)) scored.push(room);
    else if (h === "kitchen" && /kitchen/.test(name)) scored.push(room);
    else if (h === "laundry" && /laundry/.test(name)) scored.push(room);
    else if (h === "island" && /island|kitchen/.test(name)) scored.push(room);
    else if (h.includes("primary") && /primary|master/.test(name)) scored.push(room);
    else if (h.includes("guest") && /guest|bath\s*2|bath\s*ii/.test(name)) scored.push(room);
    else if (name.includes(h) || h.includes(name)) scored.push(room);
  }
  return scored;
}

export function applyConfirmedSelectionsToScope(scope, requestedSelections, opts = {}) {
  const base = scope && typeof scope === "object" ? { ...scope } : {};
  const rooms = Array.isArray(base.rooms) ? base.rooms.map((r) => ({ ...r })) : [];
  const addOns = base.addOns && typeof base.addOns === "object" ? { ...base.addOns } : {};
  const warnings = Array.isArray(base.customerRequestedWarnings)
    ? [...base.customerRequestedWarnings]
    : [];
  const items = Array.isArray(requestedSelections?.items) ? requestedSelections.items : [];
  const confirmed = items.filter((i) => i?.status === "confirmed");
  const takeoffRooms = Array.isArray(opts.roomsFromTakeoff) ? opts.roomsFromTakeoff : rooms;

  let materialGroup = base.materialGroup || null;
  let colorName = base.colorName || "";
  let colorTbd = base.colorTbd === true;
  let edgeProfileToken = base.edgeProfileToken || null;
  const applied = [];

  for (const item of confirmed) {
    const resolved = item.resolved && typeof item.resolved === "object" ? item.resolved : {};
    if (item.kind === "material") {
      const group = normalizeMaterialGroupLabel(resolved.materialGroup);
      const color = sanitizeQueueSourceText(resolved.colorName, 120);
      const targets = matchRoomHintToRooms(item.roomHint, takeoffRooms);
      if (targets.length) {
        for (const target of targets) {
          const idx = rooms.findIndex((r) => String(r.id) === String(target.id));
          if (idx < 0) continue;
          rooms[idx] = {
            ...rooms[idx],
            ...(group ? { materialGroupOverride: group } : {}),
            ...(color ? { colorNameOverride: color } : {})
          };
        }
        // Seed quote-level color/group from kitchen (or first) room-scoped selection so
        // Internal Estimate header fields open populated — room overrides still win per room.
        const primary =
          /kitchen/i.test(String(item.roomHint || "")) ||
          targets.some((t) => /kitchen/i.test(String(t?.name || "")));
        if (color && (primary || !colorName)) {
          colorName = color;
          colorTbd = resolved.colorTbd === true;
        }
        if (group && (primary || !materialGroup)) {
          materialGroup = group;
        }
      } else {
        if (group) materialGroup = group;
        if (color) {
          colorName = color;
          colorTbd = resolved.colorTbd === true;
        } else if (resolved.colorTbd === true) {
          colorTbd = true;
        }
      }
      applied.push({ kind: "material", id: item.id, label: resolved.displayLabel || item.customerRawText });
    } else if (item.kind === "edge" && resolved.edgeProfileToken) {
      edgeProfileToken = String(resolved.edgeProfileToken);
      for (let i = 0; i < rooms.length; i += 1) {
        const pieces = Array.isArray(rooms[i].pieces)
          ? rooms[i].pieces.map((p) => ({ ...p, edgeProfileToken }))
          : rooms[i].pieces;
        rooms[i] = { ...rooms[i], pieces };
      }
      applied.push({ kind: "edge", id: item.id, label: resolved.displayLabel || "Edge" });
    } else if (item.kind === "tear_out" && resolved.addonKey === "tearout") {
      const qty = Number(resolved.quantity);
      addOns.tearout = Number.isFinite(qty) ? qty : 1;
      applied.push({ kind: "tear_out", id: item.id, label: resolved.displayLabel || "Tear-out" });
    } else if (item.kind === "sink" && resolved.addonKey) {
      const key = String(resolved.addonKey);
      const qty = Math.max(1, Number(resolved.quantity) || 1);
      addOns[key] = Math.max(Number(addOns[key]) || 0, qty);
      applied.push({ kind: "sink", id: item.id, label: resolved.displayLabel || key });
    } else if (item.kind === "backsplash") {
      const targets = matchRoomHintToRooms(item.roomHint, takeoffRooms);
      const applyTo = targets.length ? targets : takeoffRooms;
      for (const target of applyTo) {
        const idx = rooms.findIndex((r) => String(r.id) === String(target.id));
        if (idx < 0) continue;
        rooms[idx] = {
          ...rooms[idx],
          includeBacksplash: resolved.includeBacksplash !== false,
          ...(resolved.backsplashHeightIn != null
            ? { backsplashHeightIn: Number(resolved.backsplashHeightIn) }
            : {}),
          ...(resolved.backsplashHeightMode
            ? { backsplashHeightMode: String(resolved.backsplashHeightMode) }
            : {})
        };
      }
      applied.push({ kind: "backsplash", id: item.id, label: resolved.displayLabel || "Backsplash" });
    } else if (item.kind === "waterfall") {
      warnings.push({
        code: "waterfall_geometry_review_required",
        selectionId: item.id,
        message:
          resolved.displayLabel ||
          item.customerRawText ||
          "Customer requested a waterfall — confirm panel geometry before pricing."
      });
      applied.push({ kind: "waterfall", id: item.id, label: "Waterfall review required" });
    }
  }

  return {
    ...base,
    rooms,
    addOns,
    ...(materialGroup ? { materialGroup } : {}),
    colorName: colorName || base.colorName || "",
    colorTbd,
    ...(edgeProfileToken ? { edgeProfileToken } : {}),
    customerRequestedSelections: {
      version: REQUESTED_SELECTIONS_VERSION,
      appliedAt: new Date().toISOString(),
      applied,
      items: confirmed
    },
    customerRequestedWarnings: warnings
  };
}

export async function buildResolvedRequestedSelections(args = {}) {
  const extracted = extractRequestedSelectionsFromEmailBody(args.bodyText, {
    subject: args.subject,
    messageKey: args.messageKey
  });
  let colors = Array.isArray(args.colors) ? args.colors : null;
  if (!colors && typeof args.getSupabase === "function") {
    try {
      const db = args.getSupabase();
      const cat = await fetchEliteProgramMaterialColors(db);
      colors = Array.isArray(cat?.colors) ? cat.colors : [];
    } catch {
      colors = [];
    }
  }
  return resolveRequestedSelectionsAgainstCatalog(extracted, colors || []);
}

export function hashSourceEmailBody(body) {
  const s = String(body || "");
  if (!s) return null;
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 32);
}

export function summarizeRequestedSelections(requested) {
  const items = Array.isArray(requested?.items) ? requested.items : [];
  const confirmed = items.filter((i) => i.status === "confirmed").length;
  const unresolved = items.filter((i) => i.status === "unresolved" || !i.resolved).length;
  const needsReview = items.filter(
    (i) => i.geometryReviewRequired || i.status === "proposed" || i.status === "unresolved"
  ).length;
  return {
    total: items.length,
    confirmed,
    unresolved,
    needsReview,
    resolved: items.filter((i) => i.resolved && i.status !== "rejected").length
  };
}
