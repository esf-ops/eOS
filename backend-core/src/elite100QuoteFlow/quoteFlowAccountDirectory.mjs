/**
 * Quote Flow ↔ Account Directory soft-link (optional, non-blocking).
 *
 * Durable link IDs + quote-specific snapshot live on
 * quote_takeoff_jobs.metadata.quoteFlow.accountDirectoryLink.
 * Set Scope copies confirmed link into studio_estimates columns + frozen
 * customerIdentitySnapshot. Account Directory never silently overwrites
 * estimator-edited quote fields and is never required to estimate.
 */

import { isAccountDirectoryUuid, normalizeCustomerIdentitySnapshot } from "../quotes/customerIdentitySnapshot.mjs";
import { sanitizeQueueSourceText } from "./quoteFlowQueueSourceMeta.mjs";

export const ACCOUNT_DIRECTORY_LINK_VERSION = "qf_ad_link_v1";

const INTERNAL_EMAIL_DOMAINS = new Set([
  "elitestonefabrication.com",
  "elitestones.com",
  "eliteosfab.com"
]);

export function emptyAccountDirectoryLink() {
  return {
    version: ACCOUNT_DIRECTORY_LINK_VERSION,
    status: "unlinked", // unlinked | suggested | confirmed
    accountId: null,
    contactId: null,
    locationId: null,
    matchConfidence: null, // exact_email | name | domain | manual | multiple | null
    matchReason: null,
    suggestions: [],
    snapshot: null,
    quoteSnapshot: emptyQuoteIdentitySnapshot(),
    fieldProvenance: {},
    userSet: false,
    updatedAt: null
  };
}

export function emptyQuoteIdentitySnapshot() {
  return {
    accountName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    salesperson: "",
    branch: "",
    projectName: "",
    projectAddress: ""
  };
}

export function isInternalForwardingEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return false;
  const domain = e.split("@").pop();
  return INTERNAL_EMAIL_DOMAINS.has(String(domain || ""));
}

/**
 * Extract candidate customer emails from forwarded body / subject corpus.
 * Skips internal Elite forwarding addresses.
 */
export function extractCustomerEmailCandidates(text) {
  const corpus = String(text || "");
  const found = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const email = String(m[0]).trim().toLowerCase();
    if (!email || isInternalForwardingEmail(email)) continue;
    if (!found.includes(email)) found.push(email);
    if (found.length >= 8) break;
  }
  return found;
}

/**
 * Prefer customer/account labels over forwarding employee sender for matching.
 */
export function resolveQuoteFlowMatchHints(input = {}) {
  const senderLabel = sanitizeQueueSourceText(input.senderLabel, 160);
  const customerLabel = sanitizeQueueSourceText(input.customerLabel, 160);
  const accountLabel = sanitizeQueueSourceText(input.accountLabel, 160);
  const subject = sanitizeQueueSourceText(input.requestSubject || input.subject, 240);
  const body = String(input.sourceEmailBodyPreview || input.bodyPreview || "");
  const emails = extractCustomerEmailCandidates(`${subject}\n${body}`);

  // Do not treat sender as customer when it looks like an internal forwarder
  // or when a distinct customerLabel already exists.
  const senderLooksInternal =
    /@elitestone|elite\s*stone|henely|estimator|quotes@/i.test(senderLabel) ||
    isInternalForwardingEmail(senderLabel);
  const customerHint =
    customerLabel && (!senderLabel || customerLabel !== senderLabel)
      ? customerLabel
      : accountLabel || (!senderLooksInternal ? senderLabel : null) || accountLabel || null;

  return {
    customerHint,
    accountHint: accountLabel || customerHint,
    senderLabel: senderLabel || null,
    forwardingEmployeeHint: senderLooksInternal ? senderLabel : null,
    customerEmailCandidates: emails,
    subject: subject || null
  };
}

function str(v, max = 200) {
  return sanitizeQueueSourceText(v, max) || "";
}

/**
 * Prefill empty quote snapshot fields from AD snapshot. Never overwrite
 * fields marked user_edited in fieldProvenance.
 */
export function mergeQuoteSnapshotFromAccountDirectory({
  quoteSnapshot,
  fieldProvenance = {},
  adSnapshot,
  accountDefaults = {}
}) {
  const base = { ...emptyQuoteIdentitySnapshot(), ...(quoteSnapshot || {}) };
  const prov = fieldProvenance && typeof fieldProvenance === "object" ? { ...fieldProvenance } : {};
  const snap = adSnapshot && typeof adSnapshot === "object" ? adSnapshot : {};
  const defaults = accountDefaults && typeof accountDefaults === "object" ? accountDefaults : {};

  const candidates = {
    accountName: snap.accountDisplayName || defaults.accountName,
    contactName: snap.contactDisplayName || defaults.contactName,
    contactEmail: snap.contactEmail || defaults.contactEmail,
    contactPhone: snap.contactPhone || defaults.contactPhone,
    salesperson: defaults.salesperson || null,
    branch: defaults.branch || null,
    // projectAddress deliberately NOT taken from account location by default
    projectName: defaults.projectName || null,
    projectAddress: null
  };

  const conflicts = [];
  for (const [key, incoming] of Object.entries(candidates)) {
    const next = str(incoming, 240);
    if (!next) continue;
    const provenance = String(prov[key] || "");
    const current = str(base[key], 240);
    if (provenance === "user_edited") {
      if (current && current !== next) {
        conflicts.push({ field: key, current, accountDefault: next });
      }
      continue;
    }
    if (!current) {
      base[key] = next;
      prov[key] = "account_directory";
      continue;
    }
    if (provenance === "account_directory" && current !== next) {
      // Same AD source, never user-edited — safe refresh of AD-derived value.
      base[key] = next;
      continue;
    }
    if (current !== next) {
      conflicts.push({ field: key, current, accountDefault: next });
    }
  }
  return { quoteSnapshot: base, fieldProvenance: prov, conflicts };
}

/**
 * Build / update soft-link from estimator confirm or manual selection.
 */
export function confirmAccountDirectoryLink(existing, args = {}) {
  const prev = existing && typeof existing === "object" ? { ...existing } : emptyAccountDirectoryLink();
  const accountId = String(args.accountId || "").trim();
  if (!isAccountDirectoryUuid(accountId)) {
    const err = new Error("Valid Account Directory account id required");
    err.code = "account_directory_id_invalid";
    err.statusCode = 400;
    throw err;
  }
  const contactId = args.contactId ? String(args.contactId).trim() : null;
  const locationId = args.locationId ? String(args.locationId).trim() : null;
  if (contactId && !isAccountDirectoryUuid(contactId)) {
    const err = new Error("Valid contact id required");
    err.code = "account_directory_contact_invalid";
    err.statusCode = 400;
    throw err;
  }

  const identitySnapshot = normalizeCustomerIdentitySnapshot(args.identitySnapshot) || null;
  const merged = mergeQuoteSnapshotFromAccountDirectory({
    quoteSnapshot: args.quoteSnapshot || prev.quoteSnapshot,
    fieldProvenance: prev.fieldProvenance,
    adSnapshot: identitySnapshot,
    accountDefaults: args.accountDefaults || {}
  });

  return {
    ...prev,
    version: ACCOUNT_DIRECTORY_LINK_VERSION,
    status: "confirmed",
    accountId,
    contactId: contactId || identitySnapshot?.contactId || null,
    locationId: locationId || identitySnapshot?.locationId || null,
    matchConfidence: args.matchConfidence || prev.matchConfidence || "manual",
    matchReason: sanitizeQueueSourceText(args.matchReason || "estimator_confirmed", 160),
    suggestions: [],
    snapshot: identitySnapshot,
    quoteSnapshot: merged.quoteSnapshot,
    fieldProvenance: merged.fieldProvenance,
    conflicts: merged.conflicts,
    userSet: true,
    confirmedByUserId: args.actorUserId || null,
    updatedAt: new Date().toISOString()
  };
}

export function unlinkAccountDirectoryLink(existing, actorUserId = null) {
  const prev = existing && typeof existing === "object" ? existing : emptyAccountDirectoryLink();
  return {
    ...emptyAccountDirectoryLink(),
    // Preserve quote-specific edited fields when unlinking.
    quoteSnapshot: { ...emptyQuoteIdentitySnapshot(), ...(prev.quoteSnapshot || {}) },
    fieldProvenance: Object.fromEntries(
      Object.entries(prev.fieldProvenance || {}).filter(([, v]) => v === "user_edited")
    ),
    userSet: true,
    status: "unlinked",
    updatedAt: new Date().toISOString(),
    unlinkedByUserId: actorUserId || null
  };
}

export function patchQuoteIdentitySnapshot(existing, patch = {}, actorUserId = null) {
  const prev = existing && typeof existing === "object" ? { ...existing } : emptyAccountDirectoryLink();
  const quoteSnapshot = {
    ...emptyQuoteIdentitySnapshot(),
    ...(prev.quoteSnapshot || {})
  };
  const fieldProvenance = { ...(prev.fieldProvenance || {}) };
  const p = patch && typeof patch === "object" ? patch : {};
  for (const key of Object.keys(emptyQuoteIdentitySnapshot())) {
    if (!(key in p)) continue;
    const next = str(p[key], 240);
    if (next === quoteSnapshot[key]) continue;
    quoteSnapshot[key] = next;
    fieldProvenance[key] = "user_edited";
  }
  return {
    ...prev,
    version: ACCOUNT_DIRECTORY_LINK_VERSION,
    quoteSnapshot,
    fieldProvenance,
    userSet: true,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actorUserId || prev.updatedByUserId || null
  };
}

/**
 * Score AD contacts for suggest — exact email is high confidence; never auto-confirm.
 * @param {{ contacts?: Array, accounts?: Array, emailCandidates?: string[], nameHint?: string }} args
 */
export function suggestAccountDirectoryMatches(args = {}) {
  const emails = (args.emailCandidates || []).map((e) => String(e).toLowerCase());
  const nameHint = String(args.nameHint || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  /** @type {Array<object>} */
  const suggestions = [];

  for (const account of Array.isArray(args.accounts) ? args.accounts : []) {
    const accountId = String(account.id || "").trim();
    if (!isAccountDirectoryUuid(accountId)) continue;
    const displayName = String(account.displayName || account.name || "").trim();
    const contacts = Array.isArray(account.contacts) ? account.contacts : [];
    let best = null;
    for (const c of contacts) {
      const email = String(c.email || "")
        .trim()
        .toLowerCase();
      if (email && emails.includes(email)) {
        best = {
          accountId,
          contactId: c.id || null,
          displayName,
          contactDisplayName: c.displayName || null,
          contactEmail: email,
          matchConfidence: "exact_email",
          matchReason: "Exact saved contact email match"
        };
        break;
      }
    }
    if (!best && nameHint && displayName) {
      const norm = displayName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (norm === nameHint || norm.includes(nameHint) || nameHint.includes(norm)) {
        best = {
          accountId,
          contactId: account.primaryContactId || contacts.find((c) => c.isPrimary)?.id || null,
          displayName,
          contactDisplayName: account.primaryContact || null,
          contactEmail: account.primaryEmail || null,
          matchConfidence: "name",
          matchReason: "Account name similarity"
        };
      }
    }
    if (best) suggestions.push(best);
  }

  // Deduplicate by accountId, prefer exact_email
  const byId = new Map();
  for (const s of suggestions) {
    const prev = byId.get(s.accountId);
    if (!prev || (s.matchConfidence === "exact_email" && prev.matchConfidence !== "exact_email")) {
      byId.set(s.accountId, s);
    }
  }
  const list = [...byId.values()].slice(0, 8);
  let status = "unlinked";
  let matchConfidence = null;
  if (list.length === 1 && list[0].matchConfidence === "exact_email") {
    status = "suggested";
    matchConfidence = "exact_email";
  } else if (list.length === 1) {
    status = "suggested";
    matchConfidence = list[0].matchConfidence;
  } else if (list.length > 1) {
    status = "suggested";
    matchConfidence = "multiple";
  }
  return {
    status,
    matchConfidence,
    suggestions: list,
    // Never auto-link — even exact email stays suggested until estimator confirms.
    autoLinked: false
  };
}

export function applySuggestionsToLink(existing, suggestionResult, opts = {}) {
  const prev = existing && typeof existing === "object" ? { ...existing } : emptyAccountDirectoryLink();
  if (prev.status === "confirmed" && prev.userSet === true && opts.force !== true) {
    return prev; // confirmed links survive AI/email/attachment reruns
  }
  const sug = suggestionResult && typeof suggestionResult === "object" ? suggestionResult : {};
  return {
    ...prev,
    version: ACCOUNT_DIRECTORY_LINK_VERSION,
    status: sug.status === "suggested" ? "suggested" : prev.status === "confirmed" ? "confirmed" : "unlinked",
    matchConfidence: sug.matchConfidence || null,
    matchReason:
      sug.suggestions?.length === 1
        ? sug.suggestions[0].matchReason
        : sug.matchConfidence === "multiple"
          ? "Multiple possible Account Directory matches"
          : prev.matchReason,
    suggestions: Array.isArray(sug.suggestions) ? sug.suggestions : [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Merge soft-link across takeoff metadata reruns — confirmed always wins.
 */
export function mergeAccountDirectoryLinkSafe(prevLink, nextLink) {
  const prev = prevLink && typeof prevLink === "object" ? prevLink : null;
  const next = nextLink && typeof nextLink === "object" ? nextLink : null;
  if (!prev) return next;
  if (!next) return prev;
  if (prev.status === "confirmed" && prev.userSet === true) {
    return {
      ...prev,
      // Allow suggestion refresh only when still unconfirmed elsewhere — keep confirmed.
      suggestions: []
    };
  }
  if (next.status === "confirmed" && next.userSet === true) return next;
  return { ...prev, ...next, quoteSnapshot: next.quoteSnapshot || prev.quoteSnapshot };
}

/**
 * Apply confirmed soft-link into official studio estimate scope.
 * Fill-if-empty only for quote fields; IDs + frozen identity snapshot always set when confirmed.
 */
export function applyAccountDirectoryLinkToEstimateScope(scope, link, opts = {}) {
  const base = scope && typeof scope === "object" ? { ...scope } : {};
  const l = link && typeof link === "object" ? link : null;
  if (!l || l.status !== "confirmed" || !isAccountDirectoryUuid(l.accountId)) {
    return base;
  }

  const snap = normalizeCustomerIdentitySnapshot(l.snapshot) || null;
  const qs = l.quoteSnapshot || emptyQuoteIdentitySnapshot();
  const prov = l.fieldProvenance || {};

  const fill = (scopeKey, snapKey, qsKey) => {
    const existing = String(base[scopeKey] || "").trim();
    if (existing && prov[qsKey] === "user_edited") return;
    const fromQs = str(qs[qsKey], 240);
    const fromSnap = snap ? str(snap[snapKey], 240) : "";
    if (!existing) {
      base[scopeKey] = fromQs || fromSnap || existing;
    } else if (!prov[qsKey] || prov[qsKey] === "account_directory") {
      // leave existing unless empty — never silent replace of non-empty
    }
  };

  fill("customerName", "accountDisplayName", "accountName");
  fill("customerContactName", "contactDisplayName", "contactName");
  fill("customerEmail", "contactEmail", "contactEmail");
  fill("customerPhone", "contactPhone", "contactPhone");
  if (!String(base.projectName || "").trim() && qs.projectName) {
    base.projectName = qs.projectName;
  }
  // Project address never from account location unless explicitly empty AND estimator opted in.
  if (!String(base.projectAddress || "").trim() && opts.useAccountLocationAsProjectAddress === true) {
    const addr = snap
      ? [snap.addressLine1, [snap.city, snap.state].filter(Boolean).join(", "), snap.postalCode]
          .filter(Boolean)
          .join(", ")
      : "";
    if (addr) base.projectAddress = addr;
  } else if (!String(base.projectAddress || "").trim() && qs.projectAddress) {
    base.projectAddress = qs.projectAddress;
  }

  base.accountDirectoryAccountId = l.accountId;
  base.accountDirectoryContactId = l.contactId || snap?.contactId || null;
  base.accountDirectoryLocationId = l.locationId || snap?.locationId || null;
  base.customerIdentitySnapshot = snap;
  base.explicitAccountRelink = true;
  base.quoteFlowAccountDirectoryLink = {
    version: ACCOUNT_DIRECTORY_LINK_VERSION,
    status: "confirmed",
    accountId: l.accountId,
    contactId: l.contactId,
    quoteSnapshot: qs,
    fieldProvenance: prov,
    appliedAt: new Date().toISOString()
  };

  // Optional quote-level salesperson/branch snapshots (scope may not have native fields yet).
  if (qs.salesperson) base.salespersonSnapshot = qs.salesperson;
  if (qs.branch) base.branchSnapshot = qs.branch;

  return base;
}

export function summarizeAccountDirectoryLink(link) {
  const l = link && typeof link === "object" ? link : null;
  if (!l) return { status: "unlinked", linked: false };
  return {
    status: l.status || "unlinked",
    linked: l.status === "confirmed" && Boolean(l.accountId),
    accountId: l.accountId || null,
    contactId: l.contactId || null,
    accountName: l.quoteSnapshot?.accountName || l.snapshot?.accountDisplayName || null,
    contactName: l.quoteSnapshot?.contactName || l.snapshot?.contactDisplayName || null,
    matchConfidence: l.matchConfidence || null,
    suggestionCount: Array.isArray(l.suggestions) ? l.suggestions.length : 0,
    userSet: l.userSet === true
  };
}
