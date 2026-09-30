/**
 * Staff-only review of active publications whose pricing basis cannot be established.
 *
 * Read-only: it never pins, republishes, revokes or edits a publication. Customers on these
 * publications keep their published total and see a "contact Elite" message instead of
 * option repricing (see publicationPricingPin.mjs). The evidence below helps staff decide;
 * nothing here is applied automatically.
 *
 * Contains internal pricing evidence — never expose outside authenticated staff routes.
 */
import { sha256CanonicalJson } from "../digitalEstimateToken.mjs";
import { CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID } from "./elite100ConfigDeltaConstants.mjs";
import {
  BUILTIN_ELITE100_RATE_SET_KEY,
  BUILTIN_RATE_SETS,
  resolvePublicationPricingPin
} from "./publicationPricingPin.mjs";

const str = (v) => (v == null ? null : String(v).trim() || null);
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function builtinEnvelopeFingerprint() {
  const set = BUILTIN_RATE_SETS[BUILTIN_ELITE100_RATE_SET_KEY];
  return sha256CanonicalJson({
    engine: CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID,
    rates: { direct: { ...set.rates.direct }, wholesale: { ...set.rates.wholesale } },
    tax: set.materialUseTaxBps / 10000
  });
}

/** Which calculator total the published total equals, if any. Evidence only. */
function basisHint(publishedTotal, calcTotals) {
  const retail = num(calcTotals?.retail ?? calcTotals?.direct);
  const wholesale = num(calcTotals?.wholesale);
  if (publishedTotal == null || (retail == null && wholesale == null)) return "no_calculator_totals";
  const near = (a, b) => a != null && Math.abs(a - b) < 0.5;
  const r = near(retail, publishedTotal);
  const w = near(wholesale, publishedTotal);
  if (r && w) return "matches_both";
  if (r) return "matches_retail_total";
  if (w) return "matches_wholesale_total";
  return "matches_neither";
}

function groupKey(label) {
  const s = String(label || "").trim().toLowerCase().replace(/^group[\s_-]*/, "");
  if (!s) return null;
  if (s === "promo" || s === "remnant") return s;
  return /^[a-f]$/.test(s) ? `group_${s}` : null;
}

/**
 * Material-only cost of the measured area at each built-in basis (incl. use tax). If retail
 * material alone exceeds the published total, retail cannot have been the basis. Evidence only.
 */
function materialOnlyCheck(rooms, publishedTotal) {
  const set = BUILTIN_RATE_SETS[BUILTIN_ELITE100_RATE_SET_KEY];
  const tax = 1 + set.materialUseTaxBps / 10000;
  let direct = 0;
  let wholesale = 0;
  for (const r of rooms) {
    const key = groupKey(r.materialGroup);
    const sf = (r.countertopSqft || 0) + (r.backsplashSqft || 0);
    if (!key || !sf) return null;
    direct += sf * set.rates.direct[key] * tax;
    wholesale += sf * set.rates.wholesale[key] * tax;
  }
  if (!rooms.length) return null;
  const round = (n) => Math.round(n * 100) / 100;
  const out = { retailMaterialOnly: round(direct), wholesaleMaterialOnly: round(wholesale), consistentWith: "unknown" };
  if (publishedTotal != null) {
    if (direct > publishedTotal + 0.5 && wholesale <= publishedTotal + 0.5) out.consistentWith = "wholesale_only";
    else if (wholesale <= publishedTotal + 0.5) out.consistentWith = "either";
    else out.consistentWith = "neither";
  }
  return out;
}

function reviewItem(row, resolution, builtinFp) {
  const pub = row.publication || {};
  const cs = row.customerSnapshot || {};
  const ev = row.pricingEvidence || {};
  const calc = ev.calculationSnapshotCopy && typeof ev.calculationSnapshotCopy === "object" ? ev.calculationSnapshotCopy : {};
  const iu = calc.internal_ui && typeof calc.internal_ui === "object" ? calc.internal_ui : {};
  const publishedTotal = num(cs.totals?.estimatedProjectTotal);
  const measuredRooms = (Array.isArray(iu.estimate_rooms) ? iu.estimate_rooms : []).map((r) => ({
    name: str(r.name ?? r.room_name) || "Room",
    materialGroup: str(r.materialGroup ?? r.material_group),
    countertopSqft: num(r.countertopSqft ?? r.countertop_sqft),
    backsplashSqft: num(r.backsplashSqft ?? r.backsplash_sqft)
  }));
  return {
    publicationId: pub.id,
    quoteNumber: str(pub.quote_number),
    revisionLabel: str(pub.revision_label),
    publishedAt: pub.published_at || null,
    pricingValidThrough: pub.pricing_valid_through || null,
    project: {
      customerName: str(cs.project?.customerName),
      projectName: str(cs.project?.projectName ?? cs.project?.name),
      projectAddress: str(cs.project?.projectAddress)
    },
    publishedTotal,
    publishedScope: {
      rooms: (Array.isArray(cs.rooms) ? cs.rooms : []).map((r) => ({
        name: str(r.name) || "Room",
        material: str(r.materialLabel),
        color: str(r.colorLabel),
        summaryLines: (Array.isArray(r.summaryLines) ? r.summaryLines : []).map(str).filter(Boolean)
      })),
      lineItems: (Array.isArray(cs.lineItems) ? cs.lineItems : []).map((l) => ({
        label: str(l.label ?? l.name ?? l.description),
        amount: num(l.amount ?? l.total)
      }))
    },
    blocker: { code: resolution.code, reason: resolution.reason },
    evidence: {
      recordedPricingBasis: null,
      legacyInternalMaterialBasis: str(iu.internal_material_basis),
      legacyPricingStructure: calc.pricingStructure
        ? { code: str(calc.pricingStructure.code), mode: str(calc.pricingStructure.pricing_mode) }
        : null,
      legacyRetailMarkupPercent: num(calc.retailMarkupPercent),
      calculationEngine: str(calc.pricingEngine),
      calculationPricingVersion: calc.pricingVersion ?? null,
      digitalEstimateEngineVersion: str(ev.calculationEngineVersion),
      calculatorTotals: {
        retail: num(calc.totals?.retail ?? calc.totals?.direct),
        wholesale: num(calc.totals?.wholesale)
      },
      publishedTotalMatches: basisHint(publishedTotal, calc.totals),
      measuredRooms,
      materialOnlyCheck: materialOnlyCheck(measuredRooms, publishedTotal),
      envelopes: Array.isArray(row.envelopes)
        ? row.envelopes.map((e) => ({
            status: e.status || null,
            pricingPolicyFingerprintPresent: Boolean(e.pricingPolicyFingerprint),
            fingerprintMatchesBuiltInRates: e.pricingPolicyFingerprint ? e.pricingPolicyFingerprint === builtinFp : null,
            pricingPolicyVersionId: e.pricingPolicyVersionId || null
          }))
        : null,
      acceptanceCount: row.acceptanceCount ?? null
    },
    customerExperience:
      "Published total shown unchanged; online option changes refused with a contact-Elite message.",
    staffOptions: [
      "Leave as is: the customer can still review the published total and contact Elite.",
      "Republish from Studio after confirming direct/retail vs wholesale; the new publication records its basis and pin."
    ]
  };
}

/**
 * @param {{ organizationId: string, deRepository: { listActivePublicationsWithoutPricingPin: Function }, limit?: number, now?: () => Date }} args
 */
export async function buildPricingBasisReview({ organizationId, deRepository, limit = 200, now = () => new Date() }) {
  if (!organizationId) {
    const e = new Error("organizationId required");
    e.code = "organization_required";
    e.statusCode = 403;
    throw e;
  }
  const rows = await deRepository.listActivePublicationsWithoutPricingPin(organizationId, { limit });
  const builtinFp = builtinEnvelopeFingerprint();
  const items = [];
  let legacyEstablished = 0;
  for (const row of rows) {
    const resolution = resolvePublicationPricingPin(row.pricingEvidence);
    if (resolution.ok) {
      legacyEstablished += 1;
      continue;
    }
    items.push(reviewItem(row, resolution, builtinFp));
  }
  return {
    generatedAt: now().toISOString(),
    scannedUnpinnedActive: rows.length,
    legacyWithEstablishedBasis: legacyEstablished,
    count: items.length,
    items
  };
}
