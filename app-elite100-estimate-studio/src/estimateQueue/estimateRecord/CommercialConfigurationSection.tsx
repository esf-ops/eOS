/**
 * Commercial Configuration — custom lines, percentage, vanity, waterfall.
 * Saves via updateScope + calculate; never prices in the browser.
 */
import React, { useEffect, useMemo, useState } from "react";

/** Tear Out preset — governed ELITE100_TEAROUT rate (server validates). */
const TEAR_OUT_DEFAULT = 750;

export type CommercialLineDraft = {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  customerVisible: boolean;
  percentageEligible: boolean;
  commercialRole: string;
  roomId?: string | null;
  reason?: string;
};

export type EstimateAdjustmentDraft = {
  active: boolean;
  percentage: number;
  reason: string;
  source: string;
};

const CATEGORIES = [
  "Service",
  "Tear-out",
  "Delivery",
  "Extra trip",
  "Field measure",
  "Crane",
  "Plumbing",
  "Fabrication",
  "Installation",
  "Discount/Credit",
  "Other"
];

const ROLES = [
  { value: "customer_charge", label: "Charge" },
  { value: "credit", label: "Credit" },
  { value: "discount", label: "Discount" },
  { value: "internal_only", label: "Internal only" }
];

// Visible in main row only — internal_only lives under More options
const MAIN_ROLES = ROLES.filter((r) => r.value !== "internal_only");

const MITER_KEYS = [
  { value: "2-3in", label: "2–3 inch" },
  { value: "4in", label: "4 inch" },
  { value: "5in", label: "5 inch" },
  { value: "6in", label: "6 inch" }
];

const TRIP_CONFIRM_RE = /trip|kitchen/i;

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

function vanityPackageLabel(code: string | null | undefined): string {
  const raw = String(code || "").trim();
  const m = raw.match(/^(\d+)_([SD])$/i);
  if (!m) {
    if (/vanity program/i.test(raw)) return raw;
    if (raw === "standard") return "Standard vanity pricing";
    return raw || "Governed Vanity Program";
  }
  const bowl = m[2].toUpperCase() === "D" ? "Double" : "Single";
  return `${m[1]}-inch ${bowl}-Bowl Vanity Program`;
}

function lineAmount(line: CommercialLineDraft): number {
  const raw = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  if (line.commercialRole === "credit" || line.commercialRole === "discount") {
    return raw > 0 ? -raw : raw;
  }
  return raw;
}

type VanityDraft = {
  roomId: string;
  roomName: string;
  applyProgram: boolean;
  additionalTrips: number;
  tripConfirmed?: boolean;
  physicalFacts: {
    widthIn: number | null;
    depthIn: number | null;
    quantity: number;
    bowlCount: number | null;
    sinkOpenings: number | null;
    backsplash: string | null;
    sameTrip: boolean;
  };
  eligible: boolean | null;
  eligibilityReasons: string[];
  selectedProgram: string | null;
  selectedProgramLabel: string | null;
  permittedMaterials: string[];
  permittedSinkUpgrades: string[];
  permittedEdgeUpgrades: string[];
  includedScope: string[];
  serverPrice: number | null;
  warnings: string[];
};

type WaterfallDraft = {
  id: string;
  roomId: string;
  roomName: string;
  pieceId: string;
  pieceLabel: string;
  side: string;
  panelWidthIn: number;
  legHeightIn: number;
  quantity: number;
  backsidePolish: boolean;
  customerOptional: boolean;
  includedInScope: boolean;
  miterKey: string;
  estimatorNote: string;
  total: number | null;
};

function mapVanity(c: any): VanityDraft[] {
  return (c?.vanityPrograms || []).map((v: any) => {
    const facts = v.physicalFacts || {};
    const selectedProgram = v.selectedProgram ? String(v.selectedProgram) : null;
    const additionalTrips = Number(v.additionalTrips) || 0;
    const eligible = v.eligible == null ? null : Boolean(v.eligible);
    const eligibilityReasons: string[] = Array.isArray(v.eligibilityReasons)
      ? v.eligibilityReasons.map(String)
      : [];
    const needsTripConfirm =
      eligible == null && eligibilityReasons.some((r) => TRIP_CONFIRM_RE.test(r));
    // Confirmed same-trip Takeoff facts resolve eligibility — do not re-ask.
    const tripConfirmed =
      eligible === true ||
      Boolean(v.tripConfirmed) ||
      Boolean(v.sameTripConfirmed) ||
      (!needsTripConfirm && additionalTrips === 0 && facts.sameTrip === true);
    const applyProgram =
      v.applyProgram != null
        ? Boolean(v.applyProgram)
        : v.useStandardPricing === true
          ? false
          : Boolean(selectedProgram);
    return {
      roomId: String(v.roomId || ""),
      roomName: String(v.roomName || "Room"),
      applyProgram,
      additionalTrips,
      tripConfirmed,
      physicalFacts: {
        widthIn: facts.widthIn != null ? Number(facts.widthIn) : null,
        depthIn: facts.depthIn != null ? Number(facts.depthIn) : null,
        quantity: Number(facts.quantity) || 1,
        bowlCount: facts.bowlCount != null ? Number(facts.bowlCount) : null,
        sinkOpenings: facts.sinkOpenings != null ? Number(facts.sinkOpenings) : null,
        backsplash: facts.backsplash != null ? String(facts.backsplash) : null,
        sameTrip: facts.sameTrip !== false && Number(v.additionalTrips || 0) === 0
      },
      eligible,
      eligibilityReasons,
      selectedProgram,
      selectedProgramLabel:
        v.selectedProgramLabel != null
          ? String(v.selectedProgramLabel)
          : selectedProgram
            ? vanityPackageLabel(selectedProgram)
            : null,
      permittedMaterials: Array.isArray(v.permittedMaterials)
        ? v.permittedMaterials.map(String)
        : Array.isArray(v.permittedCustomerOptions)
          ? v.permittedCustomerOptions.filter((o: any) => /material/i.test(String(o))).map(String)
          : [],
      permittedSinkUpgrades: Array.isArray(v.permittedSinkUpgrades)
        ? v.permittedSinkUpgrades.map(String)
        : [],
      permittedEdgeUpgrades: Array.isArray(v.permittedEdgeUpgrades)
        ? v.permittedEdgeUpgrades.map(String)
        : [],
      includedScope: Array.isArray(v.includedScope)
        ? v.includedScope.map(String)
        : applyProgram
          ? [
              "vanity top",
              "included backsplash",
              "vanity sink opening",
              "included white oval sink"
            ]
          : [],
      serverPrice: v.serverPrice != null ? Number(v.serverPrice) : null,
      warnings: Array.isArray(v.warnings) ? v.warnings.map(String) : []
    };
  });
}

function mapWaterfalls(c: any): WaterfallDraft[] {
  return (c?.waterfalls || []).map((w: any) => ({
    id: String(w.id || newId()),
    roomId: String(w.roomId || ""),
    roomName: String(w.roomName || "Room"),
    pieceId: String(w.pieceId || ""),
    pieceLabel: String(w.pieceLabel || w.pieceId || "Island"),
    side: String(w.side || "left"),
    panelWidthIn: Number(w.panelWidthIn) || 36,
    legHeightIn: Number(w.panelHeightIn || w.legHeightIn) || 36,
    quantity: Number(w.quantity) || 1,
    backsidePolish: Boolean(w.backsidePolish),
    customerOptional: Boolean(w.customerOptional),
    includedInScope: w.includedInScope !== false,
    miterKey: String(w.miterKey || "2-3in"),
    estimatorNote: String(w.estimatorNote || ""),
    total: w.total != null ? Number(w.total) : null
  }));
}

export function CommercialConfigurationSection(props: {
  editable: boolean;
  commercial: any;
  busy: boolean;
  error: string | null;
  dirty?: boolean;
  measurementsApproved?: boolean;
  roomOptions?: Array<{ id: string; name: string }>;
  saveStatus?: string | null;
  draftExactTotal?: number | null;
  customerDisplayTotal?: number | null;
  onDirtyChange?: (
    dirty: boolean,
    payload?: {
      customLineItems: CommercialLineDraft[];
      estimateWideAdjustment: EstimateAdjustmentDraft;
      roomConfigurations?: Record<string, unknown>;
    }
  ) => void;
  onSave: (payload: {
    customLineItems: CommercialLineDraft[];
    estimateWideAdjustment: EstimateAdjustmentDraft;
    roomConfigurations?: Record<string, unknown>;
  }) => void | Promise<void>;
  onRequestAddIslandWaterfall?: (side: "left" | "right") => void;
}) {
  const [lines, setLines] = useState<CommercialLineDraft[]>([]);
  const [adjustment, setAdjustment] = useState<EstimateAdjustmentDraft>({
    active: false,
    percentage: 0,
    reason: "",
    source: "manual"
  });
  const [vanityRooms, setVanityRooms] = useState<VanityDraft[]>([]);
  const [waterfalls, setWaterfalls] = useState<WaterfallDraft[]>([]);
  const [dirty, setDirty] = useState(false);

  function buildPayload(
    nextLines = lines,
    nextAdj = adjustment,
    nextVanity = vanityRooms,
    nextWaterfalls = waterfalls
  ) {
    const roomConfigurations: Record<string, unknown> = {};
    for (const v of nextVanity) {
      if (!v.roomId) continue;
      roomConfigurations[v.roomId] = {
        ...(typeof roomConfigurations[v.roomId] === "object"
          ? (roomConfigurations[v.roomId] as object)
          : {}),
        vanityProgram: {
          useStandardPricing: !v.applyProgram,
          selectedProgram: v.applyProgram ? v.selectedProgram || null : null,
          additionalTrips: v.additionalTrips,
          sameTripConfirmed: v.tripConfirmed === true || v.eligible === true,
          bowlCount: v.physicalFacts?.bowlCount ?? null,
          permittedCustomerOptions: [
            ...v.permittedMaterials,
            ...v.permittedSinkUpgrades,
            ...v.permittedEdgeUpgrades
          ],
          permittedMaterials: v.permittedMaterials,
          permittedSinkUpgrades: v.permittedSinkUpgrades,
          permittedEdgeUpgrades: v.permittedEdgeUpgrades
        }
      };
    }
    for (const w of nextWaterfalls) {
      if (!w.roomId) continue;
      const prev = (roomConfigurations[w.roomId] as Record<string, unknown>) || {};
      const existing = Array.isArray(prev.waterfalls) ? [...(prev.waterfalls as object[])] : [];
      existing.push({
        id: w.id,
        targetPieceId: w.pieceId || undefined,
        side: w.side,
        panelWidthIn: w.panelWidthIn,
        legHeightIn: w.legHeightIn,
        quantity: w.quantity,
        backsidePolish: w.backsidePolish,
        customerOptional: w.customerOptional,
        includedInScope: w.includedInScope,
        miterKey: w.miterKey,
        estimatorNote: w.estimatorNote
      });
      roomConfigurations[w.roomId] = { ...prev, waterfalls: existing };
    }
    return {
      customLineItems: nextLines,
      estimateWideAdjustment: nextAdj,
      roomConfigurations
    };
  }

  function markDirty(
    nextLines?: CommercialLineDraft[],
    nextAdj?: EstimateAdjustmentDraft,
    nextVanity?: VanityDraft[],
    nextWaterfalls?: WaterfallDraft[]
  ) {
    setDirty(true);
    const payload = buildPayload(
      nextLines ?? lines,
      nextAdj ?? adjustment,
      nextVanity ?? vanityRooms,
      nextWaterfalls ?? waterfalls
    );
    props.onDirtyChange?.(true, payload);
  }

  useEffect(() => {
    const c = props.commercial;
    if (!c) return;
    setLines(
      (c.customLines || []).map((l: any) => ({
        id: String(l.id),
        description: String(l.description || ""),
        category: String(l.category || "Other"),
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPriceExact ?? l.unitPrice) || 0,
        customerVisible: l.customerVisible !== false && !l.internalOnly,
        percentageEligible: l.percentageEligible !== false,
        commercialRole: String(l.commercialRole || "customer_charge"),
        roomId: l.roomId || null,
        reason: String(l.reason || "")
      }))
    );
    const adj = c.estimateAdjustment || {};
    setAdjustment({
      active: Boolean(adj.active),
      percentage: Number(adj.percentage) || 0,
      reason: String(adj.reason || ""),
      source: String(adj.source || "manual")
    });
    setVanityRooms(mapVanity(c));
    setWaterfalls(mapWaterfalls(c));
    setDirty(false);
    props.onDirtyChange?.(false);
  }, [props.commercial]);

  function updateLine(idx: number, patch: Partial<CommercialLineDraft>) {
    setLines((prev) => {
      const next = prev.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      markDirty(next);
      return next;
    });
  }

  function moveLine(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= lines.length) return;
    markDirty();
    setLines((prev) => {
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  }

  function addLine(preset?: "tearout") {
    setLines((prev) => {
      const row: CommercialLineDraft =
        preset === "tearout"
          ? {
              id: newId(),
              description: "Tear Out",
              category: "Tear-out",
              quantity: 1,
              unitPrice: TEAR_OUT_DEFAULT,
              customerVisible: true,
              percentageEligible: true,
              commercialRole: "customer_charge",
              reason: "Tear Out"
            }
          : {
              id: newId(),
              description: "",
              category: "Service",
              quantity: 1,
              unitPrice: 0,
              customerVisible: true,
              percentageEligible: true,
              commercialRole: "customer_charge",
              reason: ""
            };
      const next = [...prev, row];
      markDirty(next);
      return next;
    });
  }

  async function save() {
    try {
      await props.onSave(buildPayload());
      setDirty(false);
      props.onDirtyChange?.(false);
    } catch {
      // Parent owns the error message; remain dirty so Saved cannot appear after failure.
      setDirty(true);
      props.onDirtyChange?.(true, buildPayload());
    }
  }

  const adj = props.commercial?.estimateAdjustment;
  const roomOptions = props.roomOptions || [];

  const customerPreviewLines = useMemo(
    () => lines.filter((l) => l.customerVisible && l.commercialRole !== "internal_only"),
    [lines]
  );

  const linesTotal = useMemo(() => lines.reduce((sum, l) => sum + lineAmount(l), 0), [lines]);

  // Derive display status from saveStatus prop or local state
  const derivedStatus = (() => {
    if (props.saveStatus === "Calculation updating…") return "Updating price…";
    if (props.saveStatus != null) return props.saveStatus;
    if (!props.editable) return "Read-only";
    if (props.busy) return "Saving…";
    if (props.error) return "Save failed";
    if (dirty || props.dirty) return "Unsaved changes";
    return "Saved";
  })();

  const isSaved = derivedStatus === "Saved";
  const isFailed = derivedStatus === "Save failed";
  const showSaveButton = props.editable && (dirty || props.dirty || isFailed);

  const isSpahn =
    /spahn/i.test(adjustment.reason) || adjustment.source === "trusted_account";

  function vanityAutoProgram(v: VanityDraft): string | null {
    if (v.physicalFacts.bowlCount === 2) return "61_D";
    if (v.physicalFacts.bowlCount === 1) return "37_S";
    return null;
  }

  return (
    <section
      className="eq-record-section"
      data-testid="eq-commercial-configuration-section"
      data-editable={props.editable ? "1" : "0"}
      data-dirty={dirty || props.dirty ? "1" : "0"}
    >
      {/* eq-option-card__head — section header row */}
      <div className="eq-record-section__head eq-option-card__head">
        <div>
          <h2 className="eq-ai-section-title">Estimate Options</h2>
          <p className="eq-record-section__subtitle">
            Configure charges, account pricing, programs, and optional scope.
          </p>
        </div>
        <span
          className="eq-record-section__status eq-status-badge"
          data-testid="eq-commercial-status"
        >
          {derivedStatus}
        </span>
      </div>

      <div className="eq-record-section__body">

        {/* ── Card 1: Additional charges and credits ──────────────────────── */}
        <div className="eq-option-card" data-testid="eq-custom-line-items-editor">
          <div className="eq-option-card__head">
            <h3 className="eq-option-card__title">Additional charges and credits</h3>
            {props.editable && lines.length > 0 ? (
              <div className="eq-option-controls-row">
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-custom-line"
                  onClick={() => addLine()}
                >
                  Add line
                </button>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-tear-out"
                  onClick={() => addLine("tearout")}
                >
                  Add Tear Out
                </button>
              </div>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <div className="eq-option-empty" data-testid="eq-lines-empty">
              <p className="eq-muted">No additional lines have been added.</p>
              {props.editable ? (
                <div className="eq-option-controls-row">
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="eq-add-custom-line"
                    onClick={() => addLine()}
                  >
                    Add line
                  </button>
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="eq-add-tear-out"
                    onClick={() => addLine("tearout")}
                  >
                    Add Tear Out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <table className="eq-ai-piece-table eq-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Charge / Credit</th>
                    <th>Customer visible</th>
                    <th>Apply account %</th>
                    <th>Amount</th>
                    {props.editable ? <th>Remove</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <React.Fragment key={line.id}>
                      <tr data-testid="eq-custom-line-row" data-line-id={line.id}>
                        {/* Description */}
                        <td>
                          {props.editable ? (
                            <input
                              value={line.description}
                              aria-label="Line description"
                              data-testid="eq-line-description"
                              onChange={(e) => updateLine(idx, { description: e.target.value })}
                            />
                          ) : (
                            <span data-testid="eq-line-description">{line.description || "—"}</span>
                          )}
                        </td>
                        {/* Qty */}
                        <td>
                          {props.editable ? (
                            <input
                              type="number"
                              value={line.quantity}
                              aria-label="Line quantity"
                              onChange={(e) =>
                                updateLine(idx, { quantity: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span>{line.quantity}</span>
                          )}
                        </td>
                        {/* Unit price */}
                        <td>
                          {props.editable ? (
                            <input
                              type="number"
                              step="0.01"
                              value={line.unitPrice}
                              aria-label="Line unit price"
                              onChange={(e) =>
                                updateLine(idx, { unitPrice: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span>{money(line.unitPrice)}</span>
                          )}
                        </td>
                        {/* Charge/Credit — charge/credit/discount only; internal lives in More options */}
                        <td>
                          {props.editable ? (
                            <select
                              value={
                                line.commercialRole === "internal_only"
                                  ? "customer_charge"
                                  : line.commercialRole
                              }
                              aria-label="Charge or credit"
                              data-testid="eq-line-role"
                              onChange={(e) => {
                                const role = e.target.value;
                                updateLine(idx, {
                                  commercialRole: role,
                                  customerVisible: true,
                                  percentageEligible:
                                    role === "internal_only" ? false : line.percentageEligible
                                });
                              }}
                            >
                              {MAIN_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span data-testid="eq-line-role">
                              {ROLES.find((r) => r.value === line.commercialRole)?.label ||
                                line.commercialRole}
                            </span>
                          )}
                        </td>
                        {/* Customer visible */}
                        <td>
                          {props.editable ? (
                            <input
                              type="checkbox"
                              disabled={line.commercialRole === "internal_only"}
                              checked={line.customerVisible}
                              aria-label="Customer visible"
                              data-testid="eq-line-visible"
                              onChange={(e) =>
                                updateLine(idx, {
                                  customerVisible: e.target.checked,
                                  commercialRole: e.target.checked
                                    ? line.commercialRole === "internal_only"
                                      ? "customer_charge"
                                      : line.commercialRole
                                    : "internal_only"
                                })
                              }
                            />
                          ) : (
                            <span>{line.customerVisible ? "Yes" : "No"}</span>
                          )}
                        </td>
                        {/* Apply account % */}
                        <td>
                          {props.editable ? (
                            <input
                              type="checkbox"
                              disabled={!line.customerVisible}
                              checked={line.percentageEligible}
                              aria-label="Percentage eligible"
                              data-testid="eq-line-pct-eligible"
                              onChange={(e) =>
                                updateLine(idx, { percentageEligible: e.target.checked })
                              }
                            />
                          ) : (
                            <span data-testid="eq-line-pct-eligible">
                              {line.percentageEligible ? "Yes" : "No"}
                            </span>
                          )}
                        </td>
                        {/* Amount */}
                        <td data-testid="eq-line-amount">{money(lineAmount(line))}</td>
                        {/* Remove */}
                        {props.editable ? (
                          <td>
                            <button
                              type="button"
                              className="eq-btn-ghost"
                              data-testid="eq-line-remove"
                              onClick={() => {
                                markDirty();
                                setLines((prev) => prev.filter((_, i) => i !== idx));
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>

                      {/* More options expandable row — room, internal role, category, reason, reorder */}
                      {props.editable ? (
                        <tr className="eq-line-more-row">
                          <td colSpan={8}>
                            <details className="eq-line-more">
                              <summary className="eq-line-more__toggle">More options</summary>
                              <div className="eq-line-more__body">
                                <label className="eq-line-more__field">
                                  Room
                                  <select
                                    value={line.roomId || ""}
                                    aria-label="Room assignment"
                                    onChange={(e) =>
                                      updateLine(idx, { roomId: e.target.value || null })
                                    }
                                  >
                                    <option value="">Whole estimate</option>
                                    {roomOptions.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="eq-line-more__field eq-inline-label">
                                  <input
                                    type="checkbox"
                                    checked={line.commercialRole === "internal_only"}
                                    data-testid="eq-line-internal"
                                    onChange={(e) => {
                                      const internal = e.target.checked;
                                      updateLine(idx, {
                                        commercialRole: internal ? "internal_only" : "customer_charge",
                                        customerVisible: !internal,
                                        percentageEligible: internal
                                          ? false
                                          : line.percentageEligible
                                      });
                                    }}
                                  />
                                  Internal only
                                </label>
                                <label className="eq-line-more__field">
                                  Category
                                  <select
                                    value={line.category}
                                    aria-label="Line category"
                                    onChange={(e) => updateLine(idx, { category: e.target.value })}
                                  >
                                    {CATEGORIES.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="eq-line-more__field">
                                  Reason
                                  <input
                                    value={line.reason || ""}
                                    aria-label="Estimator reason"
                                    data-testid="eq-line-reason"
                                    onChange={(e) => updateLine(idx, { reason: e.target.value })}
                                  />
                                </label>
                                <div className="eq-line-more__reorder">
                                  <button
                                    type="button"
                                    className="eq-btn-ghost"
                                    data-testid="eq-line-move-up"
                                    disabled={idx === 0}
                                    onClick={() => moveLine(idx, -1)}
                                  >
                                    ↑ Move up
                                  </button>
                                  <button
                                    type="button"
                                    className="eq-btn-ghost"
                                    data-testid="eq-line-move-down"
                                    disabled={idx === lines.length - 1}
                                    onClick={() => moveLine(idx, 1)}
                                  >
                                    ↓ Move down
                                  </button>
                                </div>
                              </div>
                            </details>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Customer preview — only when visible lines exist */}
              {customerPreviewLines.length > 0 ? (
                <div className="eq-customer-preview" data-testid="eq-customer-line-preview">
                  <h4 className="eq-option-card__subtitle">Customer-visible lines</h4>
                  <ul className="eq-ai-price-groups">
                    {customerPreviewLines.map((l) => (
                      <li key={l.id}>
                        <span>{l.description || "(untitled)"}</span>
                        <span>{money(lineAmount(l))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* eq-options-footer — card-level impact sum */}
              <div className="eq-option-card__footer">
                <span className="eq-lines-impact" data-testid="eq-lines-impact">
                  {linesTotal >= 0 ? `+${money(linesTotal)}` : money(linesTotal)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Card 2: Account adjustment ──────────────────────────────────── */}
        <div className="eq-option-card" data-testid="eq-estimate-percentage-adjustment">
          <div className="eq-option-card__head">
            <h3 className="eq-option-card__title">Account adjustment</h3>
          </div>
          <p className="eq-option-card__desc">
            Apply an account-specific percentage to eligible customer-visible estimate lines. The
            customer will see adjusted line amounts, not a separate surcharge.
          </p>

          {props.editable ? (
            <div className="eq-option-controls-row">
              <label className="eq-inline-label eq-inline-label--check" htmlFor="eq-percentage-active">
                <input
                  id="eq-percentage-active"
                  name="percentage-active"
                  type="checkbox"
                  checked={adjustment.active}
                  data-testid="eq-percentage-active"
                  onChange={(e) => {
                    const next = { ...adjustment, active: e.target.checked };
                    setAdjustment(next);
                    markDirty(undefined, next);
                  }}
                />
                Apply adjustment
              </label>
              <label className="eq-inline-label" htmlFor="eq-percentage-input">
                Percentage
                <input
                  id="eq-percentage-input"
                  name="percentage"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={adjustment.percentage}
                  disabled={!adjustment.active}
                  data-testid="eq-percentage-input"
                  onChange={(e) => {
                    const next = {
                      ...adjustment,
                      percentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      source: "manual"
                    };
                    setAdjustment(next);
                    markDirty(undefined, next);
                  }}
                />
              </label>
              <label className="eq-inline-label" htmlFor="eq-percentage-reason">
                Reason
                <input
                  id="eq-percentage-reason"
                  name="percentage-reason"
                  value={adjustment.reason}
                  disabled={!adjustment.active}
                  data-testid="eq-percentage-reason"
                  onChange={(e) => {
                    const next = { ...adjustment, reason: e.target.value };
                    setAdjustment(next);
                    markDirty(undefined, next);
                  }}
                />
              </label>
            </div>
          ) : (
            <dl
              className="eq-summary-dl eq-summary-dl--grid"
              data-testid="eq-percentage-readonly-summary"
            >
              <div>
                <dt>Active</dt>
                <dd data-testid="eq-percentage-active">{adjustment.active ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Percentage</dt>
                <dd data-testid="eq-percentage-input">
                  {Number(adjustment.percentage || 0).toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd data-testid="eq-percentage-reason">{adjustment.reason || "—"}</dd>
              </div>
            </dl>
          )}

          {/* eq-badge — Spahn & Rose when applicable; never show raw "manual" */}
          {isSpahn ? (
            <span className="eq-badge" data-testid="eq-badge">
              Spahn &amp; Rose account pricing
            </span>
          ) : null}

          {!adjustment.active ? (
            <p className="eq-muted">No account adjustment applied.</p>
          ) : adj ? (
            <>
              {/* Impact chip */}
              <div className="eq-adj-chip-row">
                <span className="eq-adj-chip">
                  {Number(adj.percentage || 0).toFixed(2)}% Account adjustment{" "}
                  {adj.exactAdjustment != null
                    ? (Number(adj.exactAdjustment) >= 0 ? "+" : "") + money(adj.exactAdjustment)
                    : ""}
                </span>
              </div>
              {/* Calc grid */}
              <dl
                className="eq-summary-dl eq-summary-dl--grid"
                data-testid="eq-account-adjustment-impact"
              >
                <div>
                  <dt>Verified base estimate</dt>
                  <dd data-testid="eq-adj-base">
                    {money(adj.verifiedBaseExact ?? adj.baseExactTotal)}
                  </dd>
                </div>
                <div>
                  <dt>Eligible additional lines</dt>
                  <dd data-testid="eq-adj-eligible-charges">
                    {money(adj.eligibleAdditionalChargesExact ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>Adjustment basis</dt>
                  <dd data-testid="eq-adj-eligible-basis">
                    {money(adj.eligibleBasisExact ?? adj.baseExactTotal)}
                  </dd>
                </div>
                <div>
                  <dt>Adjustment impact</dt>
                  <dd data-testid="eq-adj-amount">{money(adj.exactAdjustment)}</dd>
                </div>
                <div>
                  <dt>Non-percentage credits</dt>
                  <dd data-testid="eq-adj-non-pct">
                    {money(adj.nonPercentageCommercialExact ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>Updated exact total</dt>
                  <dd data-testid="eq-adj-adjusted">{money(adj.adjustedExactTotal)}</dd>
                </div>
                <div>
                  <dt>Customer display total</dt>
                  <dd data-testid="eq-adj-display">{money(adj.customerDisplayTotal)}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>

        {/* ── Card 3: Bathroom Vanity Program ─────────────────────────────── */}
        <div className="eq-option-card" data-testid="eq-vanity-program-configuration">
          <div className="eq-option-card__head">
            <h3 className="eq-option-card__title">Bathroom Vanity Program</h3>
          </div>

          {vanityRooms.length === 0 ? (
            <p className="eq-muted" data-testid="eq-vanity-lifecycle-msg">
              {props.commercial?.scopeDetection?.vanityDetected
                ? "Bathroom vanity detected. Approve measurements to evaluate Vanity Program eligibility."
                : "No vanity/bath rooms detected from Takeoff yet."}
            </p>
          ) : (
            vanityRooms.map((v, idx) => {
              const needsTripConfirm =
                v.eligible == null &&
                v.eligibilityReasons.some((r) => TRIP_CONFIRM_RE.test(r)) &&
                !v.tripConfirmed;

              // Show as fact when eligible or no trip-related ambiguity
              const showTripFact =
                v.eligible === true ||
                v.tripConfirmed === true ||
                !v.eligibilityReasons.some((r) => TRIP_CONFIRM_RE.test(r));

              const statusLabel = v.applyProgram
                ? "Applied"
                : v.eligible === true
                  ? "Eligible"
                  : v.eligible === false
                    ? "Not eligible"
                    : "Needs confirmation";

              const autoProgram = vanityAutoProgram(v);
              const packageChoices = Array.from(
                new Set(
                  [autoProgram, v.selectedProgram, "37_S", "61_D"].filter(Boolean) as string[]
                )
              ).filter((code) => {
                if (v.physicalFacts.bowlCount === 1) return /_S$/i.test(code);
                if (v.physicalFacts.bowlCount === 2) return /_D$/i.test(code);
                return true;
              });
              const visibleReasons = needsTripConfirm
                ? v.eligibilityReasons.filter((r) => !TRIP_CONFIRM_RE.test(r))
                : v.eligibilityReasons;

              return (
                <div key={v.roomId || idx} className="eq-vanity-card" data-testid="eq-vanity-card">
                  <div className="eq-vanity-card__head">
                    <strong>{v.roomName}</strong>
                    <span
                      className={`eq-status-badge eq-status-badge--vanity eq-status-badge--${
                        statusLabel === "Needs confirmation"
                          ? "needs"
                          : statusLabel === "Not eligible"
                            ? "not"
                            : statusLabel.toLowerCase()
                      }`}
                      data-testid="eq-vanity-eligibility-state"
                    >
                      {statusLabel}
                    </span>
                    {v.applyProgram && v.serverPrice != null ? (
                      <span className="eq-option-impact" data-testid="eq-vanity-impact">
                        Bathroom Vanity Program +{money(v.serverPrice)}
                      </span>
                    ) : null}
                  </div>

                  {/* Compact horizontal summary — eq-summary-dl--grid */}
                  <dl
                    className="eq-summary-dl eq-summary-dl--grid"
                    data-testid="eq-vanity-physical-facts"
                  >
                    <div>
                      <dt>Size</dt>
                      <dd>
                        {v.physicalFacts.widthIn != null && v.physicalFacts.depthIn != null
                          ? `${v.physicalFacts.widthIn}" × ${v.physicalFacts.depthIn}"`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Sink openings</dt>
                      <dd>
                        {v.physicalFacts.sinkOpenings != null
                          ? `${v.physicalFacts.sinkOpenings} sink opening${
                              Number(v.physicalFacts.sinkOpenings) === 1 ? "" : "s"
                            }`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Bowl</dt>
                      <dd>
                        {v.physicalFacts.bowlCount === 2
                          ? "Double bowl"
                          : v.physicalFacts.bowlCount === 1
                            ? "Single bowl"
                            : v.physicalFacts.bowlCount != null
                              ? String(v.physicalFacts.bowlCount)
                              : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Backsplash</dt>
                      <dd>
                        {v.physicalFacts.backsplash
                          ? /backsplash/i.test(v.physicalFacts.backsplash)
                            ? v.physicalFacts.backsplash
                            : `${v.physicalFacts.backsplash} backsplash`
                          : "From Takeoff"}
                      </dd>
                    </div>
                    {showTripFact ? (
                      <div>
                        <dt>Trip</dt>
                        <dd>
                          {v.physicalFacts.sameTrip ? "Same trip as kitchen" : "Separate trip"}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {/* Same-trip confirmation needed */}
                  {props.editable && needsTripConfirm ? (
                    <div className="eq-vanity-trip-confirm" data-testid="eq-vanity-trip-confirm">
                      <p className="eq-footnote">Same-trip status needs confirmation.</p>
                      <p className="eq-option-card__subtitle">Confirm same-trip installation:</p>
                      <div className="eq-option-controls-row">
                        <button
                          type="button"
                          className="eq-btn-secondary"
                          data-testid="eq-vanity-same-trip"
                          onClick={() => {
                            markDirty();
                            setVanityRooms((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      additionalTrips: 0,
                                      tripConfirmed: true,
                                      eligible: true,
                                      physicalFacts: { ...row.physicalFacts, sameTrip: true }
                                    }
                                  : row
                              )
                            );
                          }}
                        >
                          Same trip
                        </button>
                        <button
                          type="button"
                          className="eq-btn-secondary"
                          data-testid="eq-vanity-separate-trip"
                          onClick={() => {
                            markDirty();
                            setVanityRooms((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      additionalTrips: 1,
                                      tripConfirmed: true,
                                      eligible: false,
                                      physicalFacts: { ...row.physicalFacts, sameTrip: false }
                                    }
                                  : row
                              )
                            );
                          }}
                        >
                          Separate trip
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Eligibility reasons — skip trip copy when actionable confirm is shown */}
                  {!v.applyProgram && visibleReasons.length > 0 ? (
                    <ul data-testid="eq-vanity-eligibility-reasons" className="eq-footnote-list">
                      {visibleReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Eligible and NOT yet applied */}
                  {v.eligible === true && !v.applyProgram ? (
                    <div className="eq-vanity-eligible-offer" data-testid="eq-vanity-eligible-offer">
                      <p className="eq-footnote">Eligible program</p>
                      {props.editable && packageChoices.length > 1 ? (
                        <label className="eq-inline-label" htmlFor={`eq-vanity-package-${idx}`}>
                          Program package
                          <select
                            id={`eq-vanity-package-${idx}`}
                            name={`vanity-package-${idx}`}
                            value={v.selectedProgram || autoProgram || packageChoices[0]}
                            data-testid="eq-vanity-package"
                            onChange={(e) => {
                              markDirty();
                              setVanityRooms((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        selectedProgram: e.target.value,
                                        selectedProgramLabel: vanityPackageLabel(e.target.value)
                                      }
                                    : row
                                )
                              );
                            }}
                          >
                            {packageChoices.map((code) => (
                              <option key={code} value={code}>
                                {vanityPackageLabel(code)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p data-testid="eq-vanity-package">
                          {vanityPackageLabel(v.selectedProgram || autoProgram) ||
                            "Governed Vanity Program"}
                        </p>
                      )}
                      {(v.includedScope.length > 0
                        ? v.includedScope
                        : [
                            "vanity top",
                            "included backsplash",
                            "vanity sink opening",
                            "included white oval sink"
                          ]
                      ).length > 0 ? (
                        <>
                          <p className="eq-footnote">Includes:</p>
                          <ul data-testid="eq-vanity-included-scope">
                            {(v.includedScope.length
                              ? v.includedScope
                              : [
                                  "vanity top",
                                  "included backsplash",
                                  "vanity sink opening",
                                  "included white oval sink"
                                ]
                            ).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p data-testid="eq-vanity-server-price">
                        Program price:{" "}
                        {v.serverPrice != null ? money(v.serverPrice) : "Updating program price…"}
                      </p>
                      {props.editable ? (
                        <button
                          type="button"
                          className="eq-btn-primary"
                          data-testid="eq-vanity-apply"
                          onClick={() => {
                            markDirty();
                            setVanityRooms((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      applyProgram: true,
                                      selectedProgram:
                                        row.selectedProgram ||
                                        autoProgram ||
                                        (row.physicalFacts.bowlCount === 2 ? "61_D" : "37_S"),
                                      selectedProgramLabel: vanityPackageLabel(
                                        row.selectedProgram ||
                                          autoProgram ||
                                          (row.physicalFacts.bowlCount === 2 ? "61_D" : "37_S")
                                      ),
                                      includedScope:
                                        row.includedScope.length > 0
                                          ? row.includedScope
                                          : [
                                              "vanity top",
                                              "included backsplash",
                                              "vanity sink opening",
                                              "included white oval sink"
                                            ],
                                      serverPrice: row.serverPrice ?? 1850
                                    }
                                  : row
                              )
                            );
                          }}
                        >
                          Apply Vanity Program
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Applied state */}
                  {v.applyProgram ? (
                    <div className="eq-vanity-applied">
                      <p data-testid="eq-vanity-package">
                        {v.selectedProgramLabel ||
                          vanityPackageLabel(v.selectedProgram) ||
                          "Governed Vanity Program"}
                      </p>
                      {v.includedScope.length > 0 ? (
                        <>
                          <p className="eq-footnote">Includes:</p>
                          <ul data-testid="eq-vanity-included-scope">
                            {v.includedScope.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p data-testid="eq-vanity-server-price">
                        Current program price:{" "}
                        {v.serverPrice != null ? money(v.serverPrice) : "Updating program price…"}
                      </p>
                      {props.editable ? (
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          data-testid="eq-vanity-remove"
                          onClick={() => {
                            markDirty();
                            setVanityRooms((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      applyProgram: false,
                                      permittedMaterials: [],
                                      permittedSinkUpgrades: [],
                                      permittedEdgeUpgrades: []
                                    }
                                  : row
                              )
                            );
                          }}
                        >
                          Remove program
                        </button>
                      ) : null}

                      {/* Customer choices — only shown when applied */}
                      {props.editable ? (
                        <div
                          className="eq-vanity-customer-choices"
                          data-testid="eq-vanity-permitted-options"
                        >
                          <h4 className="eq-option-card__subtitle">Customer choices</h4>
                          <label className="eq-inline-label eq-inline-label--check">
                            <input
                              type="checkbox"
                              checked={v.permittedMaterials.length > 0}
                              data-testid="eq-vanity-allow-materials"
                              onChange={(e) => {
                                markDirty();
                                setVanityRooms((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? {
                                          ...row,
                                          permittedMaterials: e.target.checked
                                            ? ["Group Promo materials"]
                                            : []
                                        }
                                      : row
                                  )
                                );
                              }}
                            />
                            Allow eligible material upgrades
                          </label>
                          {v.permittedMaterials.length > 0 ? (
                            <p className="eq-upgrade-list" data-testid="eq-vanity-materials-list">
                              {v.permittedMaterials.join(", ")}
                            </p>
                          ) : null}

                          <label className="eq-inline-label eq-inline-label--check">
                            <input
                              type="checkbox"
                              checked={v.permittedSinkUpgrades.length > 0}
                              data-testid="eq-vanity-allow-sinks"
                              onChange={(e) => {
                                markDirty();
                                setVanityRooms((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? {
                                          ...row,
                                          permittedSinkUpgrades: e.target.checked
                                            ? [
                                                "Oval bisque",
                                                "rectangular white",
                                                "rectangular bisque"
                                              ]
                                            : []
                                        }
                                      : row
                                  )
                                );
                              }}
                            />
                            Allow sink upgrades
                          </label>
                          {v.permittedSinkUpgrades.length > 0 ? (
                            <p className="eq-upgrade-list" data-testid="eq-vanity-sinks-list">
                              {v.permittedSinkUpgrades.join(", ")}
                            </p>
                          ) : null}

                          <label className="eq-inline-label eq-inline-label--check">
                            <input
                              type="checkbox"
                              checked={v.permittedEdgeUpgrades.length > 0}
                              data-testid="eq-vanity-allow-edges"
                              onChange={(e) => {
                                markDirty();
                                setVanityRooms((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? {
                                          ...row,
                                          permittedEdgeUpgrades: e.target.checked
                                            ? ["Eased", "Small Ogee"]
                                            : []
                                        }
                                      : row
                                  )
                                );
                              }}
                            />
                            Allow edge upgrades
                          </label>
                          {v.permittedEdgeUpgrades.length > 0 ? (
                            <p className="eq-upgrade-list" data-testid="eq-vanity-edges-list">
                              {v.permittedEdgeUpgrades.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className="eq-vanity-customer-choices"
                          data-testid="eq-vanity-permitted-upgrades"
                        >
                          {v.permittedMaterials.length > 0 ? (
                            <p className="eq-footnote">
                              Materials: {v.permittedMaterials.join(", ")}
                            </p>
                          ) : null}
                          {v.permittedSinkUpgrades.length > 0 ? (
                            <p className="eq-footnote">
                              Sink upgrades: {v.permittedSinkUpgrades.join(", ")}
                            </p>
                          ) : null}
                          {v.permittedEdgeUpgrades.length > 0 ? (
                            <p className="eq-footnote">
                              Edge upgrades: {v.permittedEdgeUpgrades.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {v.warnings.length > 0 ? (
                    <ul data-testid="eq-vanity-warnings">
                      {v.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* ── Card 4: Island waterfalls ────────────────────────────────────── */}
        <div className="eq-option-card" data-testid="eq-waterfall-configuration">
          <div className="eq-option-card__head">
            <h3 className="eq-option-card__title">Island waterfalls</h3>
          </div>

          {(() => {
            const detection = props.commercial?.scopeDetection || {};
            const islandLabel: string = detection.islandLabel || "Kitchen Island";

            if (waterfalls.length === 0) {
              if (detection.islandDetected) {
                return (
                  <div data-testid="eq-waterfall-lifecycle-msg">
                    <p className="eq-option-card__subtitle">{islandLabel}</p>
                    <p className="eq-muted">No waterfall included.</p>
                    {props.editable ? (
                      <div className="eq-option-controls-row">
                        <button
                          type="button"
                          className="eq-btn-secondary"
                          data-testid="eq-add-left-waterfall-option"
                          onClick={() => props.onRequestAddIslandWaterfall?.("left")}
                        >
                          Add left waterfall
                        </button>
                        <button
                          type="button"
                          className="eq-btn-secondary"
                          data-testid="eq-add-right-waterfall-option"
                          onClick={() => props.onRequestAddIslandWaterfall?.("right")}
                        >
                          Add right waterfall
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <p className="eq-muted" data-testid="eq-waterfall-lifecycle-msg">
                  No waterfalls are included. Add one from an island in Takeoff.
                </p>
              );
            }

            return waterfalls.map((w, idx) => {
              const sideLabel = w.side.charAt(0).toUpperCase() + w.side.slice(1);
              return (
                <div key={w.id} className="eq-waterfall-card" data-testid="eq-waterfall-card">
                  <div className="eq-option-card__head">
                    <strong data-testid="eq-waterfall-label">
                      {w.pieceLabel || w.roomName} — {sideLabel} Waterfall
                    </strong>
                    {w.total != null ? (
                      <span className="eq-option-impact" data-testid="eq-waterfall-impact">
                        {w.pieceLabel || "Waterfall"} +{money(w.total)}
                      </span>
                    ) : null}
                  </div>

                  <p className="eq-footnote">Physical scope:</p>
                  <dl
                    className="eq-summary-dl eq-summary-dl--grid"
                    data-testid="eq-waterfall-physical-facts"
                  >
                    <div>
                      <dt>Room</dt>
                      <dd data-testid="eq-waterfall-room">{w.roomName}</dd>
                    </div>
                    <div>
                      <dt>Piece</dt>
                      <dd data-testid="eq-waterfall-piece">{w.pieceLabel}</dd>
                    </div>
                    <div>
                      <dt>Side</dt>
                      <dd data-testid="eq-waterfall-side">{w.side}</dd>
                    </div>
                    <div>
                      <dt>Panel depth</dt>
                      <dd data-testid="eq-waterfall-width">{`${w.panelWidthIn}" panel depth`}</dd>
                    </div>
                    <div>
                      <dt>Finished height</dt>
                      <dd data-testid="eq-waterfall-height">{`${w.legHeightIn}" finished height`}</dd>
                    </div>
                    <div>
                      <dt>Panels</dt>
                      <dd data-testid="eq-waterfall-qty">
                        {w.quantity} panel{w.quantity === 1 ? "" : "s"}
                      </dd>
                    </div>
                  </dl>

                  <p className="eq-footnote">Commercial choices:</p>
                  <div
                    className="eq-waterfall-editor"
                    data-testid="eq-waterfall-commercial-controls"
                  >
                    {props.editable ? (
                      <>
                        <div className="eq-option-controls-row">
                          <label className="eq-inline-label eq-inline-label--check">
                            <input
                              type="radio"
                              name={`wf-scope-${w.id}`}
                              checked={!w.customerOptional}
                              data-testid="eq-waterfall-required"
                              onChange={() => {
                                markDirty();
                                setWaterfalls((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, customerOptional: false } : row
                                  )
                                );
                              }}
                            />
                            Required
                          </label>
                          <label className="eq-inline-label eq-inline-label--check">
                            <input
                              type="radio"
                              name={`wf-scope-${w.id}`}
                              checked={w.customerOptional}
                              data-testid="eq-waterfall-optional"
                              onChange={() => {
                                markDirty();
                                setWaterfalls((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, customerOptional: true } : row
                                  )
                                );
                              }}
                            />
                            Customer optional
                          </label>
                        </div>

                        <label className="eq-inline-label" htmlFor={`eq-waterfall-miter-${w.id}`}>
                          Miter
                          <select
                            id={`eq-waterfall-miter-${w.id}`}
                            name={`waterfall-miter-${w.id}`}
                            value={w.miterKey}
                            data-testid="eq-waterfall-miter"
                            onChange={(e) => {
                              markDirty();
                              setWaterfalls((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, miterKey: e.target.value } : row
                                )
                              );
                            }}
                          >
                            {MITER_KEYS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="eq-inline-label eq-inline-label--check">
                          <input
                            type="checkbox"
                            checked={w.backsidePolish}
                            data-testid="eq-waterfall-polish"
                            onChange={(e) => {
                              markDirty();
                              setWaterfalls((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, backsidePolish: e.target.checked } : row
                                )
                              );
                            }}
                          />
                          Backside polish
                        </label>

                        <label className="eq-inline-label" htmlFor={`eq-waterfall-note-${w.id}`}>
                          Customer-visible note
                          <input
                            id={`eq-waterfall-note-${w.id}`}
                            name={`waterfall-note-${w.id}`}
                            value={w.estimatorNote}
                            data-testid="eq-waterfall-note"
                            onChange={(e) => {
                              markDirty();
                              setWaterfalls((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, estimatorNote: e.target.value } : row
                                )
                              );
                            }}
                          />
                        </label>
                      </>
                    ) : (
                      <dl className="eq-summary-dl eq-summary-dl--grid">
                        <div>
                          <dt>Scope</dt>
                          <dd data-testid="eq-waterfall-optional">
                            {w.customerOptional ? "Customer optional" : "Required"}
                          </dd>
                        </div>
                        <div>
                          <dt>Miter</dt>
                          <dd data-testid="eq-waterfall-miter">
                            {MITER_KEYS.find((m) => m.value === w.miterKey)?.label ||
                              w.miterKey ||
                              "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Backside polish</dt>
                          <dd data-testid="eq-waterfall-polish">
                            {w.backsidePolish ? "Yes" : "No"}
                          </dd>
                        </div>
                        <div>
                          <dt>Customer-visible note</dt>
                          <dd data-testid="eq-waterfall-note">{w.estimatorNote || "—"}</dd>
                        </div>
                      </dl>
                    )}
                  </div>

                  <p className="eq-muted" data-testid="eq-waterfall-price-note">
                    {w.total != null
                      ? `Current price: ${money(w.total)}`
                      : "Updating price…"}
                  </p>
                </div>
              );
            });
          })()}
        </div>

        {/* Error */}
        {props.error ? (
          <div
            className="eq-state eq-state--error"
            role="alert"
            data-testid="eq-commercial-error"
          >
            {props.error}
          </div>
        ) : null}

        {/* Save now button — hidden when Saved and not dirty */}
        {showSaveButton ? (
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="eq-save-commercial-changes"
              disabled={props.busy}
              onClick={save}
            >
              {props.busy ? "Saving…" : "Save now"}
            </button>
            <span className="eq-muted" data-testid="eq-commercial-save-state">
              {isFailed ? "Try saving again." : dirty || props.dirty ? "Unsaved changes" : ""}
            </span>
          </div>
        ) : (
          <span style={{ display: "none" }} data-testid="eq-commercial-save-state">
            {isSaved ? "Saved" : ""}
          </span>
        )}

        {/* eq-options-footer — bottom totals; display props only, never calculated in React */}
        <div className="eq-options-footer">
          <dl className="eq-summary-dl eq-summary-dl--grid">
            <div>
              <dt>Current draft estimate</dt>
              <dd data-testid="eq-options-draft-total">
                {props.draftExactTotal != null
                  ? money(props.draftExactTotal)
                  : adj?.adjustedExactTotal != null
                    ? money(adj.adjustedExactTotal)
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Customer display total</dt>
              <dd data-testid="eq-options-display-total">
                {props.customerDisplayTotal != null
                  ? money(props.customerDisplayTotal)
                  : adj?.customerDisplayTotal != null
                    ? money(adj.customerDisplayTotal)
                    : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

export function EstimateRevisionHistory(props: {
  revisions: Array<{
    revision: number;
    status: string;
    createdAt?: string | null;
    approvedAt?: string | null;
    publishedAt?: string | null;
    supersededAt?: string | null;
    isActivePublication?: boolean;
    countertopSf?: number | null;
    backsplashSf?: number | null;
    edgeLf?: number | null;
    openingsSummary?: string | null;
    displayTotal?: number | null;
    exactTotal?: number | null;
    summary?: string | null;
    basedOnRevision?: number | null;
    customLinesSummary?: string | null;
    percentageSummary?: string | null;
    vanitySummary?: string | null;
    waterfallSummary?: string | null;
    customerActivity?: string | null;
    changedItemCount?: number | null;
  }>;
  comparison?: any;
  onViewSnapshot?: (revision: number) => void;
  onCompare?: (revision: number) => void;
}) {
  return (
    <section className="eq-record-section" data-testid="eq-revision-history-section">
      <div className="eq-record-section__head">
        <h2 className="eq-ai-section-title">Revision History</h2>
      </div>
      <div className="eq-record-section__body">
        {props.revisions.length === 0 ? (
          <p className="eq-muted" data-testid="eq-revision-history-empty">
            Revisions appear after the first estimate is created.
          </p>
        ) : (
          <div className="eq-revision-cards" data-testid="eq-revision-list">
            {props.revisions.map((r) => (
              <article
                key={r.revision}
                className="eq-revision-card"
                data-testid="eq-revision-item"
                data-revision={r.revision}
                data-active={r.isActivePublication ? "1" : "0"}
              >
                <header className="eq-revision-card__head">
                  <strong>
                    R{r.revision}
                    {r.isActivePublication
                      ? " — Published and active"
                      : ` — ${r.status}`}
                  </strong>
                  {r.basedOnRevision != null ? (
                    <span className="eq-muted">Based on R{r.basedOnRevision}</span>
                  ) : null}
                </header>
                <dl className="eq-summary-dl eq-summary-dl--grid">
                  <div>
                    <dt>Created</dt>
                    <dd>{r.createdAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>Approved</dt>
                    <dd>{r.approvedAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>Published</dt>
                    <dd>{r.publishedAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>Superseded</dt>
                    <dd>{r.supersededAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>Countertop</dt>
                    <dd>
                      {r.countertopSf != null ? `${Number(r.countertopSf).toFixed(2)} SF` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Backsplash</dt>
                    <dd>
                      {r.backsplashSf != null ? `${Number(r.backsplashSf).toFixed(2)} SF` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Edge</dt>
                    <dd>{r.edgeLf != null ? `${Number(r.edgeLf).toFixed(2)} LF` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Openings</dt>
                    <dd>{r.openingsSummary || "—"}</dd>
                  </div>
                  <div>
                    <dt>Starting total</dt>
                    <dd>{r.displayTotal != null ? money(r.displayTotal) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Custom lines</dt>
                    <dd>{r.customLinesSummary || "None"}</dd>
                  </div>
                  <div>
                    <dt>Percentage</dt>
                    <dd>{r.percentageSummary || "None"}</dd>
                  </div>
                  <div>
                    <dt>Vanity Program</dt>
                    <dd>{r.vanitySummary || "None"}</dd>
                  </div>
                  <div>
                    <dt>Waterfalls</dt>
                    <dd>{r.waterfallSummary || "None"}</dd>
                  </div>
                  <div>
                    <dt>Customer activity</dt>
                    <dd>{r.customerActivity || "—"}</dd>
                  </div>
                  <div>
                    <dt>Changed items</dt>
                    <dd>{r.changedItemCount != null ? r.changedItemCount : "—"}</dd>
                  </div>
                </dl>
                {r.summary ? <p className="eq-muted">{r.summary}</p> : null}
                <div className="eq-action-row">
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="eq-view-snapshot"
                    onClick={() => props.onViewSnapshot?.(r.revision)}
                  >
                    View Snapshot
                  </button>
                  <button
                    type="button"
                    className="eq-btn-ghost"
                    data-testid="eq-compare-revision"
                    onClick={() => props.onCompare?.(r.revision)}
                  >
                    Compare
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {props.comparison ? (
          <div className="eq-revision-comparison" data-testid="eq-revision-comparison-summary">
            <h3 className="eq-ai-section-title">Revision comparison</h3>
            <ul className="eq-ai-change-list">
              {(props.comparison.changedItems || []).map((c: any, i: number) => (
                <li key={`${c.kind}-${i}`} data-testid="eq-comparison-change">
                  <span>{c.label}</span>
                  <span>
                    {String(c.from)} → {String(c.to)}
                  </span>
                </li>
              ))}
            </ul>
            {props.comparison.previousExactTotal != null ? (
              <dl className="eq-summary-dl eq-summary-dl--grid">
                <div>
                  <dt>Previous exact</dt>
                  <dd>{money(props.comparison.previousExactTotal)}</dd>
                </div>
                <div>
                  <dt>Revised exact</dt>
                  <dd>{money(props.comparison.revisedExactTotal)}</dd>
                </div>
                <div>
                  <dt>Exact difference</dt>
                  <dd>{money(props.comparison.exactDifference)}</dd>
                </div>
                <div>
                  <dt>Previous display</dt>
                  <dd>{money(props.comparison.previousDisplayTotal)}</dd>
                </div>
                <div>
                  <dt>Revised display</dt>
                  <dd>{money(props.comparison.revisedDisplayTotal)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
