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

const MITER_KEYS = [
  { value: "2-3in", label: "2–3 inch" },
  { value: "4in", label: "4 inch" },
  { value: "5in", label: "5 inch" },
  { value: "6in", label: "6 inch" }
];

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
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
  permittedMaterials: string[];
  permittedSinkUpgrades: string[];
  permittedEdgeUpgrades: string[];
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
    const applyProgram = v.useStandardPricing !== true && Boolean(v.selectedProgram || v.applyProgram !== false);
    return {
      roomId: String(v.roomId || ""),
      roomName: String(v.roomName || "Room"),
      applyProgram: v.applyProgram != null ? Boolean(v.applyProgram) : applyProgram || v.useStandardPricing === false,
      additionalTrips: Number(v.additionalTrips) || 0,
      physicalFacts: {
        widthIn: facts.widthIn != null ? Number(facts.widthIn) : null,
        depthIn: facts.depthIn != null ? Number(facts.depthIn) : null,
        quantity: Number(facts.quantity) || 1,
        bowlCount: facts.bowlCount != null ? Number(facts.bowlCount) : null,
        sinkOpenings: facts.sinkOpenings != null ? Number(facts.sinkOpenings) : null,
        backsplash: facts.backsplash != null ? String(facts.backsplash) : null,
        sameTrip: facts.sameTrip !== false && Number(v.additionalTrips || 0) === 0
      },
      eligible: v.eligible == null ? null : Boolean(v.eligible),
      eligibilityReasons: Array.isArray(v.eligibilityReasons) ? v.eligibilityReasons.map(String) : [],
      selectedProgram: v.selectedProgram ? String(v.selectedProgram) : null,
      permittedMaterials: Array.isArray(v.permittedCustomerOptions)
        ? v.permittedCustomerOptions.filter((o: any) => /material/i.test(String(o))).map(String)
        : ["Group Promo materials"],
      permittedSinkUpgrades: ["Oval bisque", "Rectangular white", "Rectangular bisque"],
      permittedEdgeUpgrades: ["Eased", "Small Ogee"],
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
  roomOptions?: Array<{ id: string; name: string }>;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (payload: {
    customLineItems: CommercialLineDraft[];
    estimateWideAdjustment: EstimateAdjustmentDraft;
    roomConfigurations?: Record<string, unknown>;
  }) => void;
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

  function markDirty() {
    setDirty(true);
    props.onDirtyChange?.(true);
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
    markDirty();
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
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

  function addLine(preset?: "tearout" | "crane" | "credit" | "internal") {
    markDirty();
    if (preset === "tearout") {
      setLines((prev) => [
        ...prev,
        {
          id: newId(),
          description: "Tear Out",
          category: "Tear-out",
          quantity: 1,
          unitPrice: TEAR_OUT_DEFAULT,
          customerVisible: true,
          percentageEligible: true,
          commercialRole: "customer_charge",
          reason: "Tear Out preset"
        }
      ]);
      return;
    }
    if (preset === "crane") {
      setLines((prev) => [
        ...prev,
        {
          id: newId(),
          description: "Crane",
          category: "Crane",
          quantity: 1,
          unitPrice: 350,
          customerVisible: true,
          percentageEligible: true,
          commercialRole: "customer_charge",
          reason: "Job-site crane"
        }
      ]);
      return;
    }
    if (preset === "credit") {
      setLines((prev) => [
        ...prev,
        {
          id: newId(),
          description: "Courtesy credit",
          category: "Discount/Credit",
          quantity: 1,
          unitPrice: 100,
          customerVisible: true,
          percentageEligible: false,
          commercialRole: "credit",
          reason: "Estimator credit"
        }
      ]);
      return;
    }
    if (preset === "internal") {
      setLines((prev) => [
        ...prev,
        {
          id: newId(),
          description: "Internal material hold",
          category: "Other",
          quantity: 1,
          unitPrice: 200,
          customerVisible: false,
          percentageEligible: false,
          commercialRole: "internal_only",
          reason: "Internal only — never customer-named"
        }
      ]);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        description: "",
        category: "Service",
        quantity: 1,
        unitPrice: 0,
        customerVisible: true,
        percentageEligible: true,
        commercialRole: "customer_charge",
        reason: ""
      }
    ]);
  }

  function save() {
    const roomConfigurations: Record<string, unknown> = {};
    for (const v of vanityRooms) {
      if (!v.roomId) continue;
      roomConfigurations[v.roomId] = {
        ...(typeof roomConfigurations[v.roomId] === "object"
          ? (roomConfigurations[v.roomId] as object)
          : {}),
        vanityProgram: {
          // useStandardPricing true opts OUT of Vanity Program.
          useStandardPricing: !v.applyProgram,
          additionalTrips: v.additionalTrips,
          permittedCustomerOptions: [
            ...v.permittedMaterials,
            ...v.permittedSinkUpgrades,
            ...v.permittedEdgeUpgrades
          ]
        }
      };
    }
    for (const w of waterfalls) {
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
    props.onSave({
      customLineItems: lines,
      estimateWideAdjustment: adjustment,
      roomConfigurations
    });
    setDirty(false);
    props.onDirtyChange?.(false);
  }

  const adj = props.commercial?.estimateAdjustment;
  const roomOptions = props.roomOptions || [];
  const eligibleSummary = useMemo(() => {
    const eligible = lines.filter((l) => l.percentageEligible && l.customerVisible);
    return eligible.map((l) => ({
      id: l.id,
      description: l.description || "(untitled)",
      amount: lineAmount(l)
    }));
  }, [lines]);

  const customerPreviewLines = useMemo(
    () => lines.filter((l) => l.customerVisible && l.commercialRole !== "internal_only"),
    [lines]
  );

  return (
    <section
      className="eq-record-section"
      data-testid="eq-commercial-configuration-section"
      data-editable={props.editable ? "1" : "0"}
      data-dirty={dirty || props.dirty ? "1" : "0"}
    >
      <div className="eq-record-section__head">
        <h2 className="eq-ai-section-title">Commercial Configuration</h2>
        <span className="eq-record-section__status" data-testid="eq-commercial-status">
          {props.editable
            ? dirty || props.dirty
              ? "Unsaved changes"
              : "Editable"
            : "Read-only for this revision"}
        </span>
      </div>
      <div className="eq-record-section__body">
        {adj?.active ? (
          <div className="eq-commercial-adjustment-summary" data-testid="eq-percentage-reconciliation">
            <h3 className="eq-ai-section-title">Estimate-wide percentage (internal)</h3>
            <dl className="eq-summary-dl eq-summary-dl--grid">
              <div>
                <dt>Base exact total</dt>
                <dd data-testid="eq-adj-base">{money(adj.baseExactTotal)}</dd>
              </div>
              <div>
                <dt>Eligible basis</dt>
                <dd data-testid="eq-adj-eligible-basis">
                  {money(adj.eligibleBasisExact ?? adj.baseExactTotal)}
                </dd>
              </div>
              <div>
                <dt>Percentage</dt>
                <dd data-testid="eq-adj-pct">{Number(adj.percentage).toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Exact adjustment</dt>
                <dd data-testid="eq-adj-amount">{money(adj.exactAdjustment)}</dd>
              </div>
              <div>
                <dt>Adjusted exact total</dt>
                <dd data-testid="eq-adj-adjusted">{money(adj.adjustedExactTotal)}</dd>
              </div>
              <div>
                <dt>Customer display total</dt>
                <dd data-testid="eq-adj-display">{money(adj.customerDisplayTotal)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd data-testid="eq-adj-source">{adj.source}</dd>
              </div>
              <div>
                <dt>Presentation</dt>
                <dd data-testid="eq-adj-presentation">Distributed across eligible lines</dd>
              </div>
            </dl>
            <p className="eq-footnote">
              Customers never see a separate surcharge or markup line — eligible line amounts already
              include the percentage.
            </p>
          </div>
        ) : null}

        <h3 className="eq-ai-section-title">Custom line items</h3>
        <div className="eq-commercial-lines" data-testid="eq-custom-line-items-editor">
          {lines.length === 0 ? (
            <p className="eq-muted">No custom lines yet.</p>
          ) : (
            <table className="eq-ai-piece-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Amount</th>
                  <th>Role</th>
                  <th>Room</th>
                  <th>Visible</th>
                  <th>% eligible</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.id} data-testid="eq-custom-line-row" data-line-id={line.id}>
                    <td>
                      <input
                        disabled={!props.editable}
                        value={line.description}
                        aria-label="Line description"
                        data-testid="eq-line-description"
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        disabled={!props.editable}
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
                    </td>
                    <td>
                      <input
                        type="number"
                        disabled={!props.editable}
                        value={line.quantity}
                        aria-label="Line quantity"
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!props.editable}
                        value={line.unitPrice}
                        aria-label="Line unit price"
                        onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td data-testid="eq-line-amount">{money(lineAmount(line))}</td>
                    <td>
                      <select
                        disabled={!props.editable}
                        value={line.commercialRole}
                        aria-label="Charge or credit"
                        data-testid="eq-line-role"
                        onChange={(e) => {
                          const role = e.target.value;
                          updateLine(idx, {
                            commercialRole: role,
                            customerVisible: role !== "internal_only",
                            percentageEligible:
                              role === "internal_only" ? false : line.percentageEligible
                          });
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        disabled={!props.editable}
                        value={line.roomId || ""}
                        aria-label="Room assignment"
                        onChange={(e) => updateLine(idx, { roomId: e.target.value || null })}
                      >
                        <option value="">Whole estimate</option>
                        {roomOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!props.editable || line.commercialRole === "internal_only"}
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
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!props.editable || !line.customerVisible}
                        checked={line.percentageEligible}
                        aria-label="Percentage eligible"
                        data-testid="eq-line-pct-eligible"
                        onChange={(e) => updateLine(idx, { percentageEligible: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!props.editable}
                        value={line.reason || ""}
                        aria-label="Estimator reason"
                        data-testid="eq-line-reason"
                        onChange={(e) => updateLine(idx, { reason: e.target.value })}
                      />
                    </td>
                    <td>
                      {props.editable ? (
                        <div className="eq-action-row">
                          <button
                            type="button"
                            className="eq-btn-ghost"
                            data-testid="eq-line-move-up"
                            disabled={idx === 0}
                            onClick={() => moveLine(idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="eq-btn-ghost"
                            data-testid="eq-line-move-down"
                            disabled={idx === lines.length - 1}
                            onClick={() => moveLine(idx, 1)}
                          >
                            ↓
                          </button>
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
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {props.editable ? (
            <div className="eq-action-row">
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="eq-add-custom-line"
                onClick={() => addLine()}
              >
                Add custom line
              </button>
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="eq-add-tear-out"
                onClick={() => addLine("tearout")}
              >
                Add Tear Out
              </button>
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="eq-add-crane"
                onClick={() => addLine("crane")}
              >
                Add Crane $350
              </button>
              <button
                type="button"
                className="eq-btn-ghost"
                data-testid="eq-add-credit"
                onClick={() => addLine("credit")}
              >
                Add credit
              </button>
              <button
                type="button"
                className="eq-btn-ghost"
                data-testid="eq-add-internal"
                onClick={() => addLine("internal")}
              >
                Add internal-only
              </button>
            </div>
          ) : null}
        </div>

        <div className="eq-customer-preview" data-testid="eq-customer-line-preview">
          <h3 className="eq-ai-section-title">Customer-visible line preview</h3>
          <ul className="eq-ai-price-groups">
            {customerPreviewLines.map((l) => (
              <li key={l.id}>
                <span>{l.description || "(untitled)"}</span>
                <span>{money(lineAmount(l))}</span>
              </li>
            ))}
          </ul>
          <p className="eq-footnote">Internal-only lines are excluded from this preview.</p>
        </div>

        <h3 className="eq-ai-section-title">Estimate-wide percentage</h3>
        <div className="eq-percentage-editor" data-testid="eq-estimate-percentage-adjustment">
          <label>
            Active
            <input
              type="checkbox"
              disabled={!props.editable}
              checked={adjustment.active}
              data-testid="eq-percentage-active"
              onChange={(e) => {
                markDirty();
                setAdjustment((a) => ({ ...a, active: e.target.checked }));
              }}
            />
          </label>
          <label>
            Percentage
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              disabled={!props.editable}
              value={adjustment.percentage}
              data-testid="eq-percentage-input"
              onChange={(e) => {
                markDirty();
                setAdjustment((a) => ({
                  ...a,
                  percentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  source: "manual"
                }));
              }}
            />
          </label>
          <label>
            Reason
            <input
              disabled={!props.editable}
              value={adjustment.reason}
              data-testid="eq-percentage-reason"
              onChange={(e) => {
                markDirty();
                setAdjustment((a) => ({ ...a, reason: e.target.value }));
              }}
            />
          </label>
          <label>
            Source
            <input
              readOnly
              value={adjustment.source}
              data-testid="eq-percentage-source"
            />
          </label>
          <p className="eq-muted" data-testid="eq-percentage-presentation">
            Presentation: distributed (same factor on each eligible line)
          </p>
          {eligibleSummary.length > 0 ? (
            <div data-testid="eq-percentage-eligible-summary">
              <h4 className="eq-ai-section-title">Eligible lines</h4>
              <ul className="eq-ai-price-groups">
                {eligibleSummary.map((l) => (
                  <li key={l.id}>
                    <span>{l.description}</span>
                    <span>{money(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <h3 className="eq-ai-section-title">Vanity Program</h3>
        <div data-testid="eq-vanity-program-configuration">
          {vanityRooms.length === 0 ? (
            <p className="eq-muted">No vanity/bath rooms detected from Takeoff yet.</p>
          ) : (
            vanityRooms.map((v, idx) => (
              <div key={v.roomId || idx} className="eq-vanity-card" data-testid="eq-vanity-card">
                <strong>{v.roomName}</strong>
                <dl className="eq-summary-dl eq-summary-dl--grid" data-testid="eq-vanity-physical-facts">
                  <div>
                    <dt>Width</dt>
                    <dd>{v.physicalFacts.widthIn != null ? `${v.physicalFacts.widthIn}″` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Depth</dt>
                    <dd>{v.physicalFacts.depthIn != null ? `${v.physicalFacts.depthIn}″` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Bowl count</dt>
                    <dd>{v.physicalFacts.bowlCount ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Sink openings</dt>
                    <dd>{v.physicalFacts.sinkOpenings ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Backsplash</dt>
                    <dd>{v.physicalFacts.backsplash || "From Takeoff"}</dd>
                  </div>
                  <div>
                    <dt>Trip fact</dt>
                    <dd>{v.physicalFacts.sameTrip ? "Same trip" : "Separate trip"}</dd>
                  </div>
                </dl>
                <p className="eq-footnote">Physical facts come from Takeoff and are not customer-editable.</p>
                <div className="eq-vanity-eligibility" data-testid="eq-vanity-eligibility">
                  <span>
                    Eligibility:{" "}
                    {v.eligible == null ? "Review required" : v.eligible ? "Eligible" : "Not eligible"}
                  </span>
                  {v.eligibilityReasons.length > 0 ? (
                    <ul>
                      {v.eligibilityReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <label>
                  Apply Vanity Program
                  <input
                    type="checkbox"
                    disabled={!props.editable}
                    checked={v.applyProgram}
                    data-testid="eq-vanity-apply"
                    onChange={(e) => {
                      markDirty();
                      const checked = e.target.checked;
                      setVanityRooms((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                applyProgram: checked,
                                selectedProgram: checked ? row.selectedProgram || "standard" : null
                              }
                            : row
                        )
                      );
                    }}
                  />
                </label>
                <label>
                  Selected package
                  <input
                    readOnly
                    value={v.applyProgram ? v.selectedProgram || "Governed Vanity Program" : "Not applied"}
                    data-testid="eq-vanity-package"
                  />
                </label>
                <label>
                  Same-trip confirmation
                  <input
                    type="checkbox"
                    disabled={!props.editable || !v.applyProgram}
                    checked={v.additionalTrips === 0}
                    data-testid="eq-vanity-same-trip"
                    onChange={(e) => {
                      markDirty();
                      setVanityRooms((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                additionalTrips: e.target.checked ? 0 : Math.max(1, row.additionalTrips),
                                physicalFacts: { ...row.physicalFacts, sameTrip: e.target.checked }
                              }
                            : row
                        )
                      );
                    }}
                  />
                </label>
                <label>
                  Additional trips
                  <input
                    type="number"
                    min={0}
                    disabled={!props.editable || !v.applyProgram}
                    value={v.additionalTrips}
                    data-testid="eq-vanity-trips"
                    onChange={(e) => {
                      markDirty();
                      const n = Math.max(0, Number(e.target.value) || 0);
                      setVanityRooms((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                additionalTrips: n,
                                physicalFacts: { ...row.physicalFacts, sameTrip: n === 0 }
                              }
                            : row
                        )
                      );
                    }}
                  />
                </label>
                <div data-testid="eq-vanity-permitted-options">
                  <h4 className="eq-ai-section-title">Permitted customer upgrades</h4>
                  <p className="eq-muted">Materials: {v.permittedMaterials.join(", ")}</p>
                  <p className="eq-muted">Sink upgrades: {v.permittedSinkUpgrades.join(", ")}</p>
                  <p className="eq-muted">Edge upgrades: {v.permittedEdgeUpgrades.join(", ")}</p>
                </div>
                {v.serverPrice != null ? (
                  <p data-testid="eq-vanity-server-price">
                    Package total (server): {money(v.serverPrice)}
                  </p>
                ) : (
                  <p className="eq-muted">Package total calculated on save.</p>
                )}
                {v.warnings.length > 0 ? (
                  <ul data-testid="eq-vanity-warnings">
                    {v.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </div>

        <h3 className="eq-ai-section-title">Waterfalls</h3>
        <div data-testid="eq-waterfall-configuration">
          {waterfalls.length === 0 ? (
            <p className="eq-muted">
              No approved waterfall geometry. Add waterfall facts on an editable measurement revision,
              then configure required vs customer-optional here.
            </p>
          ) : (
            waterfalls.map((w, idx) => (
              <div key={w.id} className="eq-waterfall-card" data-testid="eq-waterfall-card">
                <strong data-testid="eq-waterfall-label">
                  {w.roomName} — {w.side} waterfall
                </strong>
                <div className="eq-waterfall-editor">
                  <label>
                    Room
                    <input disabled value={w.roomName} readOnly />
                  </label>
                  <label>
                    Related piece
                    <input
                      disabled={!props.editable}
                      value={w.pieceLabel}
                      data-testid="eq-waterfall-piece"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, pieceLabel: e.target.value, pieceId: e.target.value }
                              : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Side / location
                    <select
                      disabled={!props.editable}
                      value={w.side}
                      data-testid="eq-waterfall-side"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, side: e.target.value } : row))
                        );
                      }}
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="both">Both</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label>
                    Panel width (in)
                    <input
                      type="number"
                      disabled={!props.editable}
                      value={w.panelWidthIn}
                      data-testid="eq-waterfall-width"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, panelWidthIn: Number(e.target.value) || 0 } : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Panel height (in)
                    <input
                      type="number"
                      disabled={!props.editable}
                      value={w.legHeightIn}
                      data-testid="eq-waterfall-height"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, legHeightIn: Number(e.target.value) || 0 } : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Quantity / legs
                    <input
                      type="number"
                      min={1}
                      disabled={!props.editable}
                      value={w.quantity}
                      data-testid="eq-waterfall-qty"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) } : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Miter height
                    <select
                      disabled={!props.editable}
                      value={w.miterKey}
                      data-testid="eq-waterfall-miter"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, miterKey: e.target.value } : row))
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
                  <label>
                    Backside polish
                    <input
                      type="checkbox"
                      disabled={!props.editable}
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
                  </label>
                  <label>
                    Customer optional
                    <input
                      type="checkbox"
                      disabled={!props.editable}
                      checked={w.customerOptional}
                      data-testid="eq-waterfall-optional"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, customerOptional: e.target.checked } : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Include in approved scope
                    <input
                      type="checkbox"
                      disabled={!props.editable}
                      checked={w.includedInScope}
                      data-testid="eq-waterfall-included"
                      onChange={(e) => {
                        markDirty();
                        setWaterfalls((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, includedInScope: e.target.checked } : row
                          )
                        );
                      }}
                    />
                  </label>
                  <label>
                    Estimator note
                    <input
                      disabled={!props.editable}
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
                </div>
                <p className="eq-muted" data-testid="eq-waterfall-price-note">
                  Material, tax, labor ($600/leg), polish ($225), and miter are calculated by the
                  server on save — not in the browser.
                  {w.total != null ? ` Last server total: ${money(w.total)}` : ""}
                </p>
              </div>
            ))
          )}
          {props.editable ? (
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-add-waterfall"
              onClick={() => {
                markDirty();
                setWaterfalls((prev) => [
                  ...prev,
                  {
                    id: newId(),
                    roomId: roomOptions[0]?.id || vanityRooms[0]?.roomId || "kitchen",
                    roomName: roomOptions[0]?.name || "Kitchen",
                    pieceId: "island",
                    pieceLabel: "Kitchen Island",
                    side: "left",
                    panelWidthIn: 36,
                    legHeightIn: 36,
                    quantity: 1,
                    backsidePolish: true,
                    customerOptional: true,
                    includedInScope: true,
                    miterKey: "2-3in",
                    estimatorNote: "",
                    total: null
                  }
                ]);
              }}
            >
              Add waterfall configuration
            </button>
          ) : null}
        </div>

        {props.error ? (
          <div className="eq-state eq-state--error" role="alert" data-testid="eq-commercial-error">
            {props.error}
          </div>
        ) : null}

        {props.editable ? (
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="eq-save-commercial-changes"
              disabled={props.busy}
              onClick={save}
            >
              {props.busy ? "Saving…" : "Save commercial changes"}
            </button>
            <span className="eq-muted" data-testid="eq-commercial-save-state">
              {dirty || props.dirty ? "Dirty — save to recalculate" : "Saved"}
            </span>
          </div>
        ) : null}
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
