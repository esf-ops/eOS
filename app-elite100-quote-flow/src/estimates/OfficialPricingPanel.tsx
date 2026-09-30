/**
 * Estimates modal — Pricing tab (internal only).
 * Uses Quote Flow pricing API + official scope summary. No approval, DE publish, or sold.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  calculateQuoteFlowEstimatePricing,
  fetchQuoteFlowEstimatePricing,
  patchQuoteFlowEstimatePricing,
  type QuoteFlowCustomLineItem,
  type QuoteFlowCustomLineSummary,
  type QuoteFlowEditablePricing,
  type QuoteFlowEdgeStatus,
  type QuoteFlowPricingPayload,
  type QuoteFlowPricingResult,
  type QuoteFlowScopeSummary,
  type QuoteFlowSlabPackage,
  type QuoteFlowSlabPackageInput,
  type QuoteFlowSinkCatalogItem,
  type QuoteFlowSinkRoom,
  type QuoteFlowSinkSelectionInput,
  type QuoteFlowVanityProgram
} from "../lib/quoteFlowEstimatesApi";
import CustomSlabPackagesSection from "./CustomSlabPackagesSection";
import { SinkSelectionsSection } from "./SinkSelectionsSection";

const BASIS_OPTIONS = [
  { value: "wholesale", label: "Wholesale" },
  { value: "direct", label: "Direct" },
  { value: "retail", label: "Retail" }
] as const;

const GROUP_OPTIONS = [
  { value: "Group Promo", label: "Promo" },
  { value: "Group A", label: "A" },
  { value: "Group B", label: "B" },
  { value: "Group C", label: "C" },
  { value: "Group D", label: "D" },
  { value: "Group E", label: "E" },
  { value: "Group F", label: "F" },
  { value: "Remnant", label: "Remnant" }
] as const;

const CATEGORY_OPTIONS = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "install", label: "Install" },
  { value: "sink/cutout", label: "Sink / cutout" },
  { value: "edge", label: "Edge" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" }
] as const;

const EDGE_OPTIONS = [
  { token: "edge_eased", label: "Eased" },
  { token: "edge_large_eased", label: "Large Eased" },
  { token: "edge_full_bullnose", label: "Full Bullnose" },
  { token: "edge_large_ogee", label: "Large Ogee" },
  { token: "edge_bevel", label: "Bevel" },
  { token: "edge_small_ogee", label: "Small Ogee" },
  { token: "edge_crescent", label: "Crescent" },
  { token: "edge_knife", label: "Knife" }
] as const;

type StartingRoomSelection = {
  roomId: string;
  roomName: string;
  materialGroupOverride: string;
  /** Custom slab package id; empty = Elite 100 collection pricing. */
  slabPackageId: string;
  colorNameOverride: string;
  colorTbd: boolean;
  /** Documented price-group exception (Brain allows it only for authorized estimators). */
  exceptionOn: boolean;
  exceptionGroup: string;
  exceptionReason: string;
  hadException: boolean;
  edgeProfileToken: string;
  includeBacksplash: boolean;
  backsplashSqft: number;
  hasSinkCutout: boolean;
  hasWaterfallGeometry: boolean;
};

/** Mirrors Brain's Elite 100 color key so the pick list and the saved color agree. */
function colorKey(name: string): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function groupLabel(group: string): string {
  return GROUP_OPTIONS.find((o) => o.value === group)?.label || group;
}

type StartingSelectionsState = {
  colorName: string;
  colorTbd: boolean;
  edgeProfileToken: string;
  tearout: boolean;
  seededFromStartingConfiguration: boolean;
  rooms: StartingRoomSelection[];
};

function emptyStartingSelections(): StartingSelectionsState {
  return {
    colorName: "",
    colorTbd: false,
    edgeProfileToken: "",
    tearout: false,
    seededFromStartingConfiguration: false,
    rooms: []
  };
}

type Props = {
  authToken: string;
  estimateId: string;
  estimateName?: string | null;
  customerLabel?: string | null;
  disabled?: boolean;
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function emptyPricing(): QuoteFlowEditablePricing {
  return {
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    materialGroupLabel: "Promo",
    estimateWideAdjustment: {
      active: false,
      percentage: 0,
      reason: "",
      source: "manual",
      editable: true
    },
    internalMarkupPercent: 0,
    internalMarkupEditable: false
  };
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const abs = Math.abs(Number(n)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${Number(n) < 0 ? "-" : ""}$${abs}`;
}

function newLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `qf-cli-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `qf-cli-${Date.now().toString(36)}`;
}

function createLine(visibility: "customer" | "internal"): QuoteFlowCustomLineItem {
  return {
    id: newLineId(),
    label: "",
    type: "charge",
    visibility,
    quantity: 1,
    unitAmount: 0,
    amount: 0,
    category: "other",
    note: "",
    sortOrder: Date.now()
  };
}

function lineAmount(line: QuoteFlowCustomLineItem): number {
  if (line.type === "note") return 0;
  const qty = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
  const unit = Math.abs(Number(line.unitAmount) || 0);
  return Math.round(unit * qty * 100) / 100;
}

function summarizeLocal(lines: QuoteFlowCustomLineItem[]): QuoteFlowCustomLineSummary {
  let customerFacingChargesTotal = 0;
  let customerFacingCreditsTotal = 0;
  let internalOnlyChargesTotal = 0;
  let internalOnlyCreditsTotal = 0;
  let noteOnlyCount = 0;
  let netCustomAdjustment = 0;
  for (const line of lines) {
    if (line.type === "note") {
      noteOnlyCount += 1;
      continue;
    }
    const amt = lineAmount(line);
    if (line.visibility === "customer") {
      if (line.type === "credit") {
        customerFacingCreditsTotal += amt;
        netCustomAdjustment -= amt;
      } else {
        customerFacingChargesTotal += amt;
        netCustomAdjustment += amt;
      }
    } else if (line.type === "credit") {
      internalOnlyCreditsTotal += amt;
      netCustomAdjustment -= amt;
    } else {
      internalOnlyChargesTotal += amt;
      netCustomAdjustment += amt;
    }
  }
  return {
    customerFacingChargesTotal: Math.round(customerFacingChargesTotal * 100) / 100,
    customerFacingCreditsTotal: Math.round(customerFacingCreditsTotal * 100) / 100,
    internalOnlyChargesTotal: Math.round(internalOnlyChargesTotal * 100) / 100,
    internalOnlyCreditsTotal: Math.round(internalOnlyCreditsTotal * 100) / 100,
    noteOnlyCount,
    netCustomAdjustment: Math.round(netCustomAdjustment * 100) / 100
  };
}

function pricingFingerprint(
  p: QuoteFlowEditablePricing,
  lines: QuoteFlowCustomLineItem[],
  selections: StartingSelectionsState,
  vanityElections: Record<string, boolean> = {},
  slabPackages: QuoteFlowSlabPackageInput[] = [],
  sinkEdits: Record<string, QuoteFlowSinkSelectionInput> = {}
): string {
  try {
    return JSON.stringify({
      vanityElections,
      slabPackages,
      sinkEdits,
      pricingBasis: p.pricingBasis,
      materialGroup: p.materialGroup,
      estimateWideAdjustment: p.estimateWideAdjustment,
      internalMarkupPercent: p.internalMarkupPercent,
      selections: {
        colorName: selections.colorName,
        colorTbd: selections.colorTbd,
        edgeProfileToken: selections.edgeProfileToken,
        tearout: selections.tearout,
        rooms: selections.rooms.map((r) => ({
          roomId: r.roomId,
          materialGroupOverride: r.materialGroupOverride,
          slabPackageId: r.slabPackageId,
          colorNameOverride: r.colorNameOverride,
          colorTbd: r.colorTbd,
          exceptionOn: r.exceptionOn,
          exceptionGroup: r.exceptionGroup,
          exceptionReason: r.exceptionReason,
          edgeProfileToken: r.edgeProfileToken,
          includeBacksplash: r.includeBacksplash
        }))
      },
      customLineItems: lines.map((l) => ({
        id: l.id,
        label: l.label,
        type: l.type,
        visibility: l.visibility,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        category: l.category,
        note: l.note,
        sortOrder: l.sortOrder
      }))
    });
  } catch {
    return "";
  }
}

function LineItemsGroup(props: {
  title: string;
  helper: string;
  visibility: "customer" | "internal";
  lines: QuoteFlowCustomLineItem[];
  busy: boolean;
  onChange: (id: string, patch: Partial<QuoteFlowCustomLineItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const { title, helper, visibility, lines, busy, onChange, onRemove, onAdd } = props;
  const group = lines.filter((l) => l.visibility === visibility);
  return (
    <div
      className="qf-pricing__line-group"
      data-testid={`qf-pricing-lines-${visibility}`}
    >
      <div className="qf-pricing__line-group-head">
        <div>
          <h4>{title}</h4>
          <p className="qf-muted">{helper}</p>
        </div>
        <button
          type="button"
          className="qf-btn-secondary"
          disabled={busy}
          data-testid={`qf-pricing-add-${visibility}-line`}
          onClick={onAdd}
        >
          {visibility === "customer" ? "Add customer-facing line item" : "Add internal-only line item"}
        </button>
      </div>
      {group.length === 0 ? (
        <p className="qf-muted">No {visibility === "customer" ? "customer-facing" : "internal-only"} line items yet.</p>
      ) : (
        <ul className="qf-pricing__line-list">
          {group.map((line) => (
            <li key={line.id} className="qf-pricing__line-row" data-testid="qf-pricing-line-row">
              <span
                className={
                  visibility === "customer"
                    ? "qf-pricing__visibility-badge is-customer"
                    : "qf-pricing__visibility-badge is-internal"
                }
              >
                {visibility === "customer" ? "Customer" : "Internal"}
              </span>
              <label className="qf-pricing__field">
                Description
                <input
                  type="text"
                  value={line.label}
                  disabled={busy}
                  data-testid="qf-pricing-line-label"
                  onChange={(e) => onChange(line.id || "", { label: e.target.value })}
                />
              </label>
              <label className="qf-pricing__field">
                Type
                <select
                  value={line.type}
                  disabled={busy}
                  data-testid="qf-pricing-line-type"
                  onChange={(e) =>
                    onChange(line.id || "", {
                      type: e.target.value as QuoteFlowCustomLineItem["type"]
                    })
                  }
                >
                  <option value="charge">Charge</option>
                  <option value="credit">Credit</option>
                  <option value="note">Note</option>
                </select>
              </label>
              {line.type !== "note" ? (
                <>
                  <label className="qf-pricing__field">
                    Qty
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={line.quantity ?? 1}
                      disabled={busy}
                      data-testid="qf-pricing-line-qty"
                      onChange={(e) =>
                        onChange(line.id || "", { quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="qf-pricing__field">
                    Unit amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitAmount ?? 0}
                      disabled={busy}
                      data-testid="qf-pricing-line-unit"
                      onChange={(e) =>
                        onChange(line.id || "", { unitAmount: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <div className="qf-pricing__line-amount" data-testid="qf-pricing-line-amount">
                    <span className="qf-stat__label">Amount</span>
                    <span className="qf-stat__value">{money(lineAmount(line))}</span>
                  </div>
                </>
              ) : (
                <p className="qf-muted">Note does not change total</p>
              )}
              <label className="qf-pricing__field">
                Category
                <select
                  value={line.category || "other"}
                  disabled={busy}
                  data-testid="qf-pricing-line-category"
                  onChange={(e) => onChange(line.id || "", { category: e.target.value })}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="qf-pricing__field">
                Note
                <input
                  type="text"
                  value={line.note || ""}
                  disabled={busy}
                  data-testid="qf-pricing-line-note"
                  onChange={(e) => onChange(line.id || "", { note: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="qf-btn-secondary"
                disabled={busy}
                data-testid="qf-pricing-line-remove"
                onClick={() => onRemove(line.id || "")}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OfficialPricingPanel(props: Props) {
  const { authToken, estimateId, estimateName, customerLabel, disabled = false } = props;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pricing, setPricing] = useState<QuoteFlowEditablePricing>(emptyPricing());
  const [customLines, setCustomLines] = useState<QuoteFlowCustomLineItem[]>([]);
  const [savedFp, setSavedFp] = useState("");
  const [scopeSummary, setScopeSummary] = useState<QuoteFlowScopeSummary | null>(null);
  const [lastCalculation, setLastCalculation] = useState<QuoteFlowPricingResult | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [calculationNotes, setCalculationNotes] = useState<string[]>([]);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [pricingStale, setPricingStale] = useState(false);
  const [scopeChangedSinceCalculation, setScopeChangedSinceCalculation] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<QuoteFlowEdgeStatus | null>(null);
  const [serverSummary, setServerSummary] = useState<QuoteFlowCustomLineSummary | null>(null);
  const [selections, setSelections] = useState<StartingSelectionsState>(emptyStartingSelections());
  const [vanityPrograms, setVanityPrograms] = useState<QuoteFlowVanityProgram[]>([]);
  /** Unsaved add/remove decisions by room; only changed rooms are sent to Brain. */
  const [vanityElections, setVanityElections] = useState<Record<string, boolean>>({});
  const [slabPackages, setSlabPackages] = useState<QuoteFlowSlabPackageInput[]>([]);
  const [sinkRooms, setSinkRooms] = useState<QuoteFlowSinkRoom[]>([]);
  const [sinkCatalog, setSinkCatalog] = useState<QuoteFlowSinkCatalogItem[]>([]);
  const [programSinkTypes, setProgramSinkTypes] = useState<Array<{ value: string; label: string }>>([]);
  /** Unsaved sink decisions by room; only changed rooms are sent to Brain. */
  const [sinkEdits, setSinkEdits] = useState<Record<string, QuoteFlowSinkSelectionInput>>({});
  const [orphanedPackageRooms, setOrphanedPackageRooms] = useState<string[]>([]);
  const [colorCatalog, setColorCatalog] = useState<Array<{ colorName: string; group: string }>>([]);
  const [canApplyException, setCanApplyException] = useState(false);
  const [colorConflicts, setColorConflicts] = useState<string[]>([]);
  const [slabCalculated, setSlabCalculated] = useState<Record<string, QuoteFlowSlabPackage | undefined>>({});
  const [slabRules, setSlabRules] = useState<{ costMultiplier: number | null; defaultWastePercent: number }>({
    costMultiplier: null,
    defaultWastePercent: 20
  });

  const dirty =
    pricingFingerprint(pricing, customLines, selections, vanityElections, slabPackages, sinkEdits) !== savedFp;
  const colorGroupByKey = useMemo(
    () => new Map(colorCatalog.map((c) => [colorKey(c.colorName), c.group])),
    [colorCatalog]
  );
  const colorGroupFor = (name: string) => colorGroupByKey.get(colorKey(name)) || null;
  const estimateColorGroup = selections.colorTbd ? null : colorGroupFor(selections.colorName);
  const slabRoomNames = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const r of selections.rooms) {
      if (!r.slabPackageId) continue;
      (out[r.slabPackageId] ||= []).push(r.roomName || r.roomId);
    }
    return out;
  }, [selections.rooms]);
  const localSummary = useMemo(() => summarizeLocal(customLines), [customLines]);

  function applyPayload(payload: QuoteFlowPricingPayload) {
    const next = {
      ...emptyPricing(),
      ...(payload.editablePricing || {})
    };
    const lines = Array.isArray(payload.customLineItems) ? payload.customLineItems : [];
    const ss = payload.startingSelections || {};
    const knownPackageIds = new Set((payload.slabPackages?.packages || []).map((p) => String(p.id || "")));
    const savedSelections: StartingSelectionsState = {
      colorName: String(ss.colorName || ""),
      colorTbd: ss.colorTbd === true,
      edgeProfileToken: String(ss.edgeProfileToken || ""),
      tearout: ss.tearout === true,
      seededFromStartingConfiguration: ss.seededFromStartingConfiguration === true,
      rooms: Array.isArray(ss.rooms)
        ? ss.rooms.map((r) => ({
            roomId: String(r.roomId || ""),
            roomName: String(r.roomName || r.roomId || "Room"),
            materialGroupOverride: String(r.materialGroupOverride || ""),
            slabPackageId: String(r.slabPackageId || ""),
            colorNameOverride: String(r.colorNameOverride || ""),
            colorTbd: r.colorTbd === true || (!r.colorNameOverride && Boolean(r.materialGroupOverride)),
            exceptionOn: Boolean(r.priceGroupException?.group),
            exceptionGroup: String(r.priceGroupException?.group || ""),
            exceptionReason: String(r.priceGroupException?.reason || ""),
            hadException: Boolean(r.priceGroupException?.group),
            edgeProfileToken: String(r.edgeProfileToken || ""),
            includeBacksplash: r.includeBacksplash === true,
            backsplashSqft: Number(r.backsplashSqft) || 0,
            hasSinkCutout: r.hasSinkCutout === true,
            hasWaterfallGeometry: r.hasWaterfallGeometry === true
          }))
        : []
    };
    // A room pointing at a package that no longer exists falls back to Elite 100; staff must save to persist it.
    const orphanedRooms = savedSelections.rooms.filter(
      (r) => r.slabPackageId && !knownPackageIds.has(r.slabPackageId)
    );
    const nextSelections: StartingSelectionsState = orphanedRooms.length
      ? {
          ...savedSelections,
          rooms: savedSelections.rooms.map((r) =>
            r.slabPackageId && !knownPackageIds.has(r.slabPackageId) ? { ...r, slabPackageId: "" } : r
          )
        }
      : savedSelections;
    setOrphanedPackageRooms(orphanedRooms.map((r) => r.roomName || r.roomId));
    setColorCatalog(Array.isArray(payload.colorPriceGroups?.colors) ? payload.colorPriceGroups.colors : []);
    setCanApplyException(payload.colorPriceGroups?.canApplyException === true);
    setColorConflicts(
      (payload.colorPriceGroups?.rooms || [])
        .filter((r) => r.status === "conflict")
        .map((r) => `${r.roomName}: ${r.colorName} is ${r.colorGroupLabel} but priced as ${r.pricedGroup}`)
    );
    setPricing(next);
    setCustomLines(lines);
    setSelections(nextSelections);
    setVanityPrograms(Array.isArray(payload.vanityPrograms) ? payload.vanityPrograms : []);
    setVanityElections({});
    setSinkRooms(Array.isArray(payload.sinkSelections?.rooms) ? payload.sinkSelections.rooms : []);
    setSinkCatalog(Array.isArray(payload.sinkSelections?.catalog) ? payload.sinkSelections.catalog : []);
    setProgramSinkTypes(
      Array.isArray(payload.sinkSelections?.programSinkTypes) ? payload.sinkSelections.programSinkTypes : []
    );
    setSinkEdits({});
    const slabServer = payload.slabPackages?.packages || [];
    const nextSlabs: QuoteFlowSlabPackageInput[] = slabServer.map((p) => ({
      id: p.id,
      colorName: p.colorName || "",
      supplier: p.supplier || "",
      thickness: p.thickness || "",
      label: p.label,
      slabLengthIn: p.slabLengthIn || null,
      slabWidthIn: p.slabWidthIn || null,
      costPerSlab: p.costPerSlab || null,
      wastePercent: p.wastePercent ?? null,
      confirmedSlabQuantity: p.confirmedSlabQuantity ?? null,
      quantityOverrideReason: p.quantityOverrideReason || ""
    }));
    setSlabPackages(nextSlabs);
    setSlabCalculated(Object.fromEntries(slabServer.map((p) => [p.id, p])));
    setSlabRules({
      costMultiplier: payload.slabPackages?.costMultiplier ?? null,
      defaultWastePercent: payload.slabPackages?.defaultWastePercent ?? 20
    });
    setSavedFp(pricingFingerprint(next, lines, savedSelections, {}, nextSlabs));
    setScopeSummary(payload.scopeSummary || null);
    setLastCalculation(payload.lastCalculation || null);
    setBlockers(Array.isArray(payload.blockers) ? payload.blockers : []);
    setCalculationNotes(Array.isArray(payload.calculationNotes) ? payload.calculationNotes : []);
    setStaleReason(payload.staleReason || null);
    setPricingStale(payload.pricingStale === true);
    setScopeChangedSinceCalculation(payload.scopeChangedSinceCalculation === true);
    setEdgeStatus(payload.edgeStatus || payload.lastCalculation?.edgeStatus || null);
    setServerSummary(payload.customLineSummary || payload.lastCalculation?.customLineItems?.summary || null);
  }

  // A session token refresh must not reload the draft and discard unsaved edits.
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetchQuoteFlowEstimatePricing(authTokenRef.current, estimateId);
        if (cancelled) return;
        applyPayload(res);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [estimateId]);

  const summaryCards = useMemo(() => {
    const s = scopeSummary;
    return [
      {
        label: "Countertop SF",
        value: s?.countertopSf != null && Number(s.countertopSf) > 0 ? Number(s.countertopSf).toFixed(1) : "—"
      },
      {
        label: "Backsplash SF",
        value: s?.backsplashSf != null && Number(s.backsplashSf) > 0 ? Number(s.backsplashSf).toFixed(1) : "—"
      },
      {
        label: "Open edge LF",
        value: s?.openEdgeLf != null ? Number(s.openEdgeLf).toFixed(1) : "0.0"
      },
      {
        label: "Rooms",
        value: s?.roomCount != null ? String(s.roomCount) : "—"
      },
      {
        label: "Pieces",
        value: s?.pieceCount != null ? String(s.pieceCount) : "—"
      }
    ];
  }, [scopeSummary]);

  function draftBody() {
    return {
      pricingBasis: pricing.pricingBasis,
      materialGroup: estimateColorGroup || pricing.materialGroup,
      estimateWideAdjustment: pricing.estimateWideAdjustment,
      ...(pricing.internalMarkupEditable
        ? { internalMarkupPercent: pricing.internalMarkupPercent }
        : {}),
      colorName: selections.colorTbd ? "" : selections.colorName,
      colorTbd: selections.colorTbd,
      edgeProfileToken: selections.edgeProfileToken || null,
      addOns: { tearout: selections.tearout ? 1 : 0 },
      roomSelections: selections.rooms.map((r) => ({
        roomId: r.roomId,
        materialGroupOverride: r.materialGroupOverride || null,
        slabPackageId: r.slabPackageId || null,
        colorNameOverride: r.colorTbd ? "" : r.colorNameOverride,
        colorTbd: r.colorTbd,
        ...(canApplyException && (r.exceptionOn || r.hadException)
          ? {
              priceGroupException: r.exceptionOn
                ? { group: r.exceptionGroup, reason: r.exceptionReason }
                : null
            }
          : {}),
        edgeProfileToken: r.edgeProfileToken || null,
        includeBacksplash: r.includeBacksplash
      })),
      customLineItems: customLines.map((l, i) => ({
        ...l,
        amount: lineAmount(l),
        sortOrder: l.sortOrder ?? i
      })),
      slabPackages,
      ...(Object.keys(vanityElections).length
        ? {
            vanityPrograms: Object.entries(vanityElections).map(([roomId, apply]) => ({
              roomId,
              apply
            }))
          }
        : {}),
      ...(Object.keys(sinkEdits).length ? { sinkSelections: Object.values(sinkEdits) } : {})
    };
  }

  function setVanityElection(v: QuoteFlowVanityProgram, apply: boolean) {
    const roomId = String(v.roomId || "");
    if (!roomId) return;
    setVanityElections((prev) => {
      const next = { ...prev };
      if (apply === v.applied) delete next[roomId];
      else next[roomId] = apply;
      return next;
    });
    setNotice(null);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchQuoteFlowEstimatePricing(authToken, estimateId, draftBody());
      applyPayload(res);
      setNotice(["Pricing draft saved.", ...(res.colorPriceGroupNotices || [])].join(" "));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function calculate() {
    setCalculating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await calculateQuoteFlowEstimatePricing(authToken, estimateId, draftBody());
      applyPayload(res);
      setNotice(["Pricing calculated.", ...(res.colorPriceGroupNotices || [])].join(" "));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCalculating(false);
    }
  }

  function updateLine(id: string, patch: Partial<QuoteFlowCustomLineItem>) {
    setCustomLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        if (next.type === "note") {
          next.unitAmount = 0;
          next.amount = 0;
          next.quantity = 1;
        } else {
          next.amount = lineAmount(next);
        }
        return next;
      })
    );
    setNotice(null);
  }

  const ewa = pricing.estimateWideAdjustment;
  const busy = disabled || loading || saving || calculating;
  const missingGroup = !String(pricing.materialGroup || "").trim();
  const missingBasis = !String(pricing.pricingBasis || "").trim();
  const localBlockers = [
    ...blockers,
    ...(missingGroup ? ["Select a pricing group before calculating."] : []),
    ...(missingBasis ? ["Select a pricing basis before calculating."] : [])
  ];
  const displaySummary = serverSummary && !dirty ? serverSummary : localSummary;
  const edge = edgeStatus || lastCalculation?.edgeStatus || null;

  return (
    <section className="qf-pricing" data-testid="qf-official-pricing-panel">
      <header className="qf-pricing__header">
        <h2 data-testid="qf-pricing-title">Pricing &amp; Selections</h2>
        <p className="qf-muted" data-testid="qf-pricing-helper">
          Pricing basis/group plus Starting Configuration for this official estimate. Physical
          scope (dimensions, open edge LF, cutouts) stays on the Scope tab.
        </p>
        <p className="qf-pricing__internal" data-testid="qf-pricing-internal-only">
          Internal pricing only — Direct/Wholesale rate books; no public/partner markup.
        </p>
        <p className="qf-muted" data-testid="qf-pricing-review-not-active">
          Starting Configuration is the baseline for a future Digital Estimate. Allowed Customer
          Choices are not built yet. After pricing, use Review then Digital Estimate to publish.
        </p>
      </header>

      <div className="qf-pricing__meta" data-testid="qf-pricing-estimate-meta">
        {estimateName ? <p className="qf-pricing__job">{estimateName}</p> : null}
        {customerLabel ? <p className="qf-muted">{customerLabel}</p> : null}
      </div>

      <div className="qf-pricing__summary" data-testid="qf-pricing-scope-summary">
        {summaryCards.map((c) => (
          <div key={c.label} className="qf-pricing__summary-card">
            <span className="qf-stat__value">{c.value}</span>
            <span className="qf-stat__label">{c.label}</span>
          </div>
        ))}
      </div>

      {edge ? (
        <div className="qf-pricing__edge" data-testid="qf-pricing-edge-status">
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{Number(edge.openEdgeLf || 0).toFixed(1)}</span>
            <span className="qf-stat__label">Open edge LF</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-profile">
            <span className="qf-stat__value">{edge.profileDisplay || "Not selected"}</span>
            <span className="qf-stat__label">Edge profile</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-charge">
            <span className="qf-stat__value">
              {edge.chargeStatus === "pending"
                ? "Pending"
                : edge.chargeStatus === "included"
                  ? "Included / no charge"
                  : edge.chargeStatus === "charged"
                    ? money(edge.edgeAmount)
                    : "—"}
            </span>
            <span className="qf-stat__label">Edge charge</span>
          </div>
          {edge.profileSelected && edge.edgeLfPriced != null ? (
            <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-lf">
              <span className="qf-stat__value">{Number(edge.edgeLfPriced).toFixed(1)}</span>
              <span className="qf-stat__label">Edge LF priced</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <p className="qf-muted">Loading pricing…</p> : null}

      {error ? (
        <div className="qf-error-box" role="alert" data-testid="qf-pricing-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-pricing-notice">
          {notice}
        </p>
      ) : null}

      {colorConflicts.length ? (
        <div className="qf-error-box" role="alert" data-testid="qf-pricing-color-group-conflict">
          {colorConflicts.join("; ")}. Elite 100 colors are priced at their own group — save pricing to apply it,
          then recalculate. Review approval is blocked until then.
        </div>
      ) : null}

      {scopeChangedSinceCalculation ? (
        <div className="qf-pricing__stale" data-testid="qf-pricing-scope-changed" role="status">
          Scope changed since last calculation
        </div>
      ) : null}
      {pricingStale && !scopeChangedSinceCalculation && staleReason ? (
        <div className="qf-pricing__stale" data-testid="qf-pricing-stale" role="status">
          {staleReason}
        </div>
      ) : null}

      {localBlockers.length > 0 ? (
        <ul className="qf-pricing__blockers" data-testid="qf-pricing-blockers">
          {localBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}

      <div className="qf-pricing__controls" data-testid="qf-pricing-controls">
        <h3>Pricing draft</h3>
        <label className="qf-pricing__field">
          Pricing basis
          <select
            value={pricing.pricingBasis || "wholesale"}
            disabled={busy}
            aria-label="Pricing basis"
            data-testid="qf-pricing-basis"
            onChange={(e) => {
              setPricing({ ...pricing, pricingBasis: e.target.value });
              setNotice(null);
            }}
          >
            {BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="qf-pricing__field">
          Price group
          <select
            value={estimateColorGroup || pricing.materialGroup || "Group Promo"}
            disabled={busy || Boolean(estimateColorGroup)}
            title={estimateColorGroup ? `Set by ${selections.colorName} (Elite 100 ${groupLabel(estimateColorGroup)})` : undefined}
            aria-label="Price group"
            data-testid="qf-pricing-price-group"
            onChange={(e) => {
              setPricing({ ...pricing, materialGroup: e.target.value });
              setNotice(null);
            }}
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="qf-pricing__ewa" data-testid="qf-pricing-ewa">
          <label className="qf-pricing__check">
            <input
              type="checkbox"
              checked={Boolean(ewa?.active)}
              disabled={busy || ewa?.editable === false}
              onChange={(e) =>
                setPricing({
                  ...pricing,
                  estimateWideAdjustment: {
                    ...(ewa || {}),
                    active: e.target.checked,
                    source: "manual"
                  }
                })
              }
            />
            Estimate-wide adjustment
          </label>
          {ewa?.active ? (
            <>
              <label className="qf-pricing__field">
                Increase by (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={ewa?.percentage ?? 0}
                  disabled={busy || ewa?.editable === false}
                  data-testid="qf-pricing-ewa-pct"
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      estimateWideAdjustment: {
                        ...(ewa || {}),
                        percentage: Number(e.target.value) || 0,
                        active: true,
                        source: "manual"
                      }
                    })
                  }
                />
              </label>
              {Number(ewa?.percentage) < 0 || Number(ewa?.percentage) > 100 ? (
                <p className="qf-error" role="alert" data-testid="qf-pricing-ewa-pct-error">
                  Increase by must be between 0% and 100%. For a discount, add a customer-facing
                  credit line instead.
                </p>
              ) : null}
              <label className="qf-pricing__field">
                Reason
                <input
                  type="text"
                  value={ewa?.reason || ""}
                  disabled={busy || ewa?.editable === false}
                  data-testid="qf-pricing-ewa-reason"
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      estimateWideAdjustment: {
                        ...(ewa || {}),
                        reason: e.target.value,
                        active: true,
                        source: "manual"
                      }
                    })
                  }
                />
              </label>
              <p className="qf-muted" data-testid="qf-pricing-ewa-hint">
                Adds this percentage to the estimate total. Discounts are not supported here. Customers can
                accept an adjusted quote as is; any change goes back to staff for a revised quote.
              </p>
            </>
          ) : null}
        </div>
      </div>

      <div className="qf-pricing__selections" data-testid="qf-pricing-starting-selections">
        <h3>Starting Configuration</h3>
        <p className="qf-muted">
          What the initial commercial estimate includes. Open/exposed edge LF stays on Scope —
          edge profile here is the selected treatment/product.
        </p>
        {selections.seededFromStartingConfiguration ? (
          <p className="qf-notice" data-testid="qf-pricing-seeded-banner">
            Seeded from Starting Configuration / confirmed customer requests — editable for this
            revision.
          </p>
        ) : null}
        <div className="qf-pricing__controls">
          <label className="qf-pricing__field">
            Exact color
            <input
              type="text"
              list="qf-elite100-colors"
              value={selections.colorTbd ? "" : selections.colorName}
              disabled={busy || selections.colorTbd}
              placeholder="Calacatta Fioressa"
              data-testid="qf-pricing-color-name"
              onChange={(e) => {
                setSelections({ ...selections, colorName: e.target.value });
                setNotice(null);
              }}
            />
            {estimateColorGroup ? (
              <span className="qf-muted" data-testid="qf-pricing-color-group">
                Elite 100 {groupLabel(estimateColorGroup)} — sets the estimate price group
              </span>
            ) : null}
          </label>
          <datalist id="qf-elite100-colors" data-testid="qf-pricing-color-options">
            {colorCatalog.map((c) => (
              <option key={c.colorName} value={c.colorName}>
                {`${c.colorName} · ${groupLabel(c.group)}`}
              </option>
            ))}
          </datalist>
          <label className="qf-pricing__check">
            <input
              type="checkbox"
              checked={selections.colorTbd}
              disabled={busy}
              data-testid="qf-pricing-color-tbd"
              onChange={(e) => {
                setSelections({
                  ...selections,
                  colorTbd: e.target.checked,
                  colorName: e.target.checked ? "" : selections.colorName
                });
                setNotice(null);
              }}
            />
            Color TBD
          </label>
          <label className="qf-pricing__field">
            Edge profile
            <select
              value={selections.edgeProfileToken}
              disabled={busy}
              data-testid="qf-pricing-edge-profile-token"
              onChange={(e) => {
                setSelections({ ...selections, edgeProfileToken: e.target.value });
                setNotice(null);
              }}
            >
              <option value="">—</option>
              {EDGE_OPTIONS.map((o) => (
                <option key={o.token} value={o.token}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="qf-pricing__check">
            <input
              type="checkbox"
              checked={selections.tearout}
              disabled={busy}
              data-testid="qf-pricing-tearout"
              onChange={(e) => {
                setSelections({ ...selections, tearout: e.target.checked });
                setNotice(null);
              }}
            />
            Include tear-out
          </label>
        </div>
        {orphanedPackageRooms.length > 0 ? (
          <p className="qf-muted" role="status" data-testid="qf-pricing-orphaned-package">
            {orphanedPackageRooms.join(", ")} referenced a custom slab package that no longer exists; switched to Elite
            100 collection. Save the pricing draft to keep this.
          </p>
        ) : null}
        {selections.rooms.length > 0 ? (
          <ul className="qf-pricing__room-selections" data-testid="qf-pricing-room-selections">
            {selections.rooms.map((room) => {
              const roomColor = room.colorTbd
                ? ""
                : room.colorNameOverride || (selections.colorTbd ? "" : selections.colorName);
              const roomColorGroup = room.slabPackageId ? null : colorGroupFor(roomColor);
              const setRoom = (patch: Partial<StartingRoomSelection>) => {
                setSelections({
                  ...selections,
                  rooms: selections.rooms.map((r) => (r.roomId === room.roomId ? { ...r, ...patch } : r))
                });
                setNotice(null);
              };
              return (
              <li key={room.roomId} data-testid="qf-pricing-room-selection-row">
                <h4>{room.roomName || room.roomId}</h4>
                <div className="qf-pricing__controls">
                  <label className="qf-pricing__field">
                    Material
                    <select
                      value={room.slabPackageId}
                      disabled={busy}
                      data-testid="qf-pricing-room-material-source"
                      onChange={(e) => {
                        setSelections({
                          ...selections,
                          rooms: selections.rooms.map((r) =>
                            r.roomId === room.roomId ? { ...r, slabPackageId: e.target.value } : r
                          )
                        });
                        setNotice(null);
                      }}
                    >
                      <option value="">Elite 100 collection</option>
                      {slabPackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          Custom slab — {p.colorName || "unnamed"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {room.slabPackageId ? null : (
                  <label className="qf-pricing__field">
                    Material group override
                    <select
                      value={
                        room.exceptionOn && room.exceptionGroup
                          ? room.exceptionGroup
                          : roomColorGroup
                            ? room.colorNameOverride
                              ? roomColorGroup
                              : ""
                            : room.materialGroupOverride
                      }
                      disabled={busy || Boolean(roomColorGroup)}
                      data-testid="qf-pricing-room-material-group"
                      onChange={(e) => setRoom({ materialGroupOverride: e.target.value })}
                    >
                      <option value="">Inherit estimate default</option>
                      {GROUP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  )}
                  {room.slabPackageId ? null : (
                  <label className="qf-pricing__field">
                    Color override
                    <input
                      type="text"
                      list="qf-elite100-colors"
                      value={room.colorTbd ? "" : room.colorNameOverride}
                      disabled={busy || room.colorTbd}
                      data-testid="qf-pricing-room-color"
                      onChange={(e) => setRoom({ colorNameOverride: e.target.value })}
                    />
                  </label>
                  )}
                  {roomColorGroup ? (
                    <div className="qf-pricing__field" data-testid="qf-pricing-room-color-group">
                      <span className="qf-muted">
                        {room.exceptionOn && room.exceptionGroup
                          ? `Priced as ${groupLabel(room.exceptionGroup)} under a documented exception — ${roomColor} is Elite 100 ${groupLabel(roomColorGroup)}.`
                          : `Priced at ${groupLabel(roomColorGroup)} — the Elite 100 group for ${roomColor}.`}
                      </span>
                      {canApplyException ? (
                        <>
                          <label className="qf-pricing__check">
                            <input
                              type="checkbox"
                              checked={room.exceptionOn}
                              disabled={busy}
                              data-testid="qf-pricing-room-group-exception"
                              onChange={(e) => setRoom({ exceptionOn: e.target.checked })}
                            />
                            Price-group exception
                          </label>
                          {room.exceptionOn ? (
                            <>
                              <select
                                value={room.exceptionGroup}
                                disabled={busy}
                                aria-label="Exception price group"
                                data-testid="qf-pricing-room-group-exception-group"
                                onChange={(e) => setRoom({ exceptionGroup: e.target.value })}
                              >
                                <option value="">Choose group…</option>
                                {GROUP_OPTIONS.filter((o) => o.value !== roomColorGroup).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={room.exceptionReason}
                                disabled={busy}
                                placeholder="Reason (required, e.g. contract or account agreement)"
                                aria-label="Exception reason"
                                data-testid="qf-pricing-room-group-exception-reason"
                                onChange={(e) => setRoom({ exceptionReason: e.target.value })}
                              />
                            </>
                          ) : null}
                        </>
                      ) : room.hadException ? (
                        <span className="qf-muted" data-testid="qf-pricing-room-group-exception-readonly">
                          Exception reason: {room.exceptionReason}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="qf-pricing__field">
                    Room edge profile
                    <select
                      value={room.edgeProfileToken}
                      disabled={busy}
                      data-testid="qf-pricing-room-edge"
                      onChange={(e) => {
                        setSelections({
                          ...selections,
                          rooms: selections.rooms.map((r) =>
                            r.roomId === room.roomId
                              ? { ...r, edgeProfileToken: e.target.value }
                              : r
                          )
                        });
                        setNotice(null);
                      }}
                    >
                      <option value="">Inherit estimate default</option>
                      {EDGE_OPTIONS.map((o) => (
                        <option key={o.token} value={o.token}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="qf-pricing__check">
                    <input
                      type="checkbox"
                      checked={room.includeBacksplash}
                      disabled={busy}
                      data-testid="qf-pricing-room-backsplash"
                      onChange={(e) => {
                        setSelections({
                          ...selections,
                          rooms: selections.rooms.map((r) =>
                            r.roomId === room.roomId
                              ? { ...r, includeBacksplash: e.target.checked }
                              : r
                          )
                        });
                        setNotice(null);
                      }}
                    />
                    Include backsplash
                    {room.backsplashSqft > 0
                      ? ` (${room.backsplashSqft.toFixed(1)} SF from Scope)`
                      : ""}
                  </label>
                  {room.hasSinkCutout ? (
                    <p className="qf-muted" data-testid="qf-pricing-room-sink-hint">
                      Sink cutout present on Scope — choose the sink under Sinks below.
                    </p>
                  ) : null}
                  {room.hasWaterfallGeometry ? (
                    <p className="qf-muted" data-testid="qf-pricing-room-waterfall-hint">
                      Waterfall panel geometry exists on Scope — commercial waterfall selection
                      stays tied to that physical geometry.
                    </p>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="qf-muted">No rooms on official scope yet.</p>
        )}
      </div>

      <CustomSlabPackagesSection
        packages={slabPackages}
        calculated={slabCalculated}
        costMultiplier={slabRules.costMultiplier}
        defaultWastePercent={slabRules.defaultWastePercent}
        roomNamesByPackage={slabRoomNames}
        busy={busy}
        onChange={(next) => {
          setSlabPackages(next);
          setNotice(null);
        }}
      />

      <SinkSelectionsSection
        rooms={sinkRooms}
        catalog={sinkCatalog}
        programSinkTypes={programSinkTypes}
        edits={sinkEdits}
        busy={busy}
        onChange={(roomId, next) => {
          setSinkEdits((prev) => ({ ...prev, [roomId]: next }));
          setNotice(null);
        }}
      />

      {vanityPrograms.length > 0 ? (
        <div className="qf-pricing__controls" data-testid="qf-pricing-vanity-programs">
          <h3>Bathroom Vanity Program</h3>
          <p className="qf-muted">
            Eligibility and program price come from Scope and the pricing calculator. Save draft or
            Calculate to apply a change.
          </p>
          <ul className="qf-pricing__room-selections">
            {vanityPrograms.map((v, idx) => {
              const roomId = String(v.roomId || "");
              const pending = Object.prototype.hasOwnProperty.call(vanityElections, roomId);
              const applied = pending ? vanityElections[roomId] : v.applied;
              const facts = v.physicalFacts || {};
              return (
                <li
                  key={roomId || idx}
                  data-testid="qf-pricing-vanity-card"
                  data-applied={applied ? "1" : "0"}
                >
                  <h4>{v.roomName}</h4>
                  <p className="qf-muted" data-testid="qf-pricing-vanity-facts">
                    {facts.widthIn ? `${facts.widthIn}"` : "—"} ×{" "}
                    {facts.depthIn ? `${facts.depthIn}"` : "—"}
                    {facts.bowlLabel ? ` · ${facts.bowlLabel}` : ""}
                    {facts.backsplashLabel ? ` · ${facts.backsplashLabel}` : ""}
                  </p>
                  {v.eligible ? (
                    <>
                      <p data-testid="qf-pricing-vanity-label">
                        {applied ? "Vanity Program added" : "Eligible program"}: {v.programLabel}
                      </p>
                      <p data-testid="qf-pricing-vanity-price">
                        Program price:{" "}
                        {pending || v.programPrice == null
                          ? "Calculate to update"
                          : money(v.programPrice)}
                      </p>
                      {applied && Array.isArray(v.includedScope) && v.includedScope.length ? (
                        <ul data-testid="qf-pricing-vanity-included">
                          {v.includedScope.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="qf-muted" data-testid="qf-pricing-vanity-not-eligible">
                      {v.ineligibleReason}
                      {v.ineligibleDetail ? ` ${v.ineligibleDetail}` : ""}
                    </p>
                  )}
                  {applied ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      disabled={busy}
                      data-testid="qf-pricing-vanity-remove"
                      onClick={() => setVanityElection(v, false)}
                    >
                      Remove Vanity Program
                    </button>
                  ) : v.eligible ? (
                    <button
                      type="button"
                      className="qf-btn-secondary"
                      disabled={busy}
                      data-testid="qf-pricing-vanity-apply"
                      onClick={() => setVanityElection(v, true)}
                    >
                      Add Vanity Program
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="qf-pricing__custom-lines" data-testid="qf-pricing-custom-lines">
        <h3>Custom line items</h3>
        <LineItemsGroup
          title="Customer-facing line items"
          helper="Customer-facing items may appear on the customer quote later."
          visibility="customer"
          lines={customLines}
          busy={busy}
          onChange={updateLine}
          onRemove={(id) => {
            setCustomLines((prev) => prev.filter((l) => l.id !== id));
            setNotice(null);
          }}
          onAdd={() => {
            setCustomLines((prev) => [...prev, createLine("customer")]);
            setNotice(null);
          }}
        />
        <LineItemsGroup
          title="Internal-only line items"
          helper="Internal-only items stay inside eliteOS."
          visibility="internal"
          lines={customLines}
          busy={busy}
          onChange={updateLine}
          onRemove={(id) => {
            setCustomLines((prev) => prev.filter((l) => l.id !== id));
            setNotice(null);
          }}
          onAdd={() => {
            setCustomLines((prev) => [...prev, createLine("internal")]);
            setNotice(null);
          }}
        />

        <div className="qf-pricing__line-summary" data-testid="qf-pricing-line-summary">
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.customerFacingChargesTotal)}</span>
            <span className="qf-stat__label">Customer-facing charges</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.customerFacingCreditsTotal)}</span>
            <span className="qf-stat__label">Customer-facing credits</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.internalOnlyChargesTotal)}</span>
            <span className="qf-stat__label">Internal-only charges</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.internalOnlyCreditsTotal)}</span>
            <span className="qf-stat__label">Internal-only credits</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{displaySummary.noteOnlyCount ?? 0}</span>
            <span className="qf-stat__label">Notes</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-net-custom">
            <span className="qf-stat__value">{money(displaySummary.netCustomAdjustment)}</span>
            <span className="qf-stat__label">Net custom adjustment</span>
          </div>
        </div>
      </div>

      <div className="qf-pricing__actions">
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-pricing-save-draft"
          disabled={busy || (!dirty && !colorConflicts.length)}
          onClick={() => void saveDraft()}
        >
          {saving ? "Saving…" : "Save pricing draft"}
        </button>
        <button
          type="button"
          className="qf-btn-primary"
          data-testid="qf-pricing-calculate"
          disabled={busy || missingGroup || missingBasis}
          onClick={() => void calculate()}
        >
          {calculating ? "Calculating…" : "Calculate pricing"}
        </button>
      </div>

      <div className="qf-pricing__result" data-testid="qf-pricing-result">
        <h3>Latest calculation</h3>
        {lastCalculation?.available ? (
          <>
            <div className="qf-pricing__result-cards">
              <div className="qf-pricing__result-card" data-testid="qf-pricing-total">
                <span className="qf-stat__value">
                  {money(lastCalculation.estimatedTotal ?? lastCalculation.exactInternalTotal)}
                </span>
                <span className="qf-stat__label">Estimated total</span>
              </div>
              {lastCalculation.customLineItems?.summary?.netCustomAdjustment != null ? (
                <div className="qf-pricing__result-card" data-testid="qf-pricing-result-custom-net">
                  <span className="qf-stat__value">
                    {money(lastCalculation.customLineItems.summary.netCustomAdjustment)}
                  </span>
                  <span className="qf-stat__label">Custom adjustment in calc</span>
                </div>
              ) : null}
              {lastCalculation.breakdown?.billedStoneSf != null ? (
                <div className="qf-pricing__result-card">
                  <span className="qf-stat__value">
                    {Number(lastCalculation.breakdown.billedStoneSf).toFixed(1)}
                  </span>
                  <span className="qf-stat__label">Billed stone SF</span>
                </div>
              ) : null}
            </div>
            {lastCalculation.cutoutLines?.length ? (
              <ul className="qf-pricing__cutouts" data-testid="qf-pricing-cutout-lines">
                {lastCalculation.cutoutLines.map((line, idx) => (
                  <li key={`${line.label}-${idx}`}>
                    <span>{line.label}</span>
                    <span>
                      {line.amount != null
                        ? money(line.amount)
                        : line.quantity != null
                          ? `×${line.quantity}`
                          : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {lastCalculation.linePreview?.length ? (
              <ul className="qf-pricing__lines" data-testid="qf-pricing-line-preview">
                {lastCalculation.linePreview.map((line, idx) => (
                  <li key={`${line.label}-${idx}`}>
                    <span>{line.label}</span>
                    <span>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {lastCalculation.calculatedAt ? (
              <p className="qf-muted">
                Calculated {new Date(lastCalculation.calculatedAt).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p className="qf-muted" data-testid="qf-pricing-no-result">
            No calculation yet. Save a pricing draft, then Calculate pricing.
          </p>
        )}
        {calculationNotes.length > 0 ? (
          <ul className="qf-pricing__notes" data-testid="qf-pricing-notes">
            {calculationNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
