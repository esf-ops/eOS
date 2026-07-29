/**
 * Commercial Configuration — custom lines, percentage, vanity, waterfall.
 * Saves via updateScope + calculate; never prices in the browser.
 */
import React, { useEffect, useState } from "react";

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

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function CommercialConfigurationSection(props: {
  editable: boolean;
  commercial: any;
  busy: boolean;
  error: string | null;
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
  const [vanityRooms, setVanityRooms] = useState<
    Array<{ roomId: string; roomName: string; useStandardPricing: boolean; additionalTrips: number }>
  >([]);
  const [waterfalls, setWaterfalls] = useState<
    Array<{
      id: string;
      roomId: string;
      roomName: string;
      pieceId: string;
      side: string;
      legHeightIn: number;
      backsidePolish: boolean;
      customerOptional: boolean;
      miterKey: string;
    }>
  >([]);

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
    setVanityRooms(
      (c.vanityPrograms || []).map((v: any) => ({
        roomId: String(v.roomId || ""),
        roomName: String(v.roomName || "Room"),
        useStandardPricing: Boolean(v.useStandardPricing || v.selectedProgram),
        additionalTrips: Number(v.additionalTrips) || 0
      }))
    );
    setWaterfalls(
      (c.waterfalls || []).map((w: any) => ({
        id: String(w.id || newId()),
        roomId: String(w.roomId || ""),
        roomName: String(w.roomName || "Room"),
        pieceId: String(w.pieceId || ""),
        side: String(w.side || "left"),
        legHeightIn: Number(w.panelHeightIn) || 36,
        backsidePolish: Boolean(w.backsidePolish),
        customerOptional: Boolean(w.customerOptional),
        miterKey: String(w.miterKey || "2-3in")
      }))
    );
  }, [props.commercial]);

  function addLine(preset?: "tearout") {
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
          useStandardPricing: v.useStandardPricing,
          additionalTrips: v.additionalTrips
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
        legHeightIn: w.legHeightIn,
        backsidePolish: w.backsidePolish,
        customerOptional: w.customerOptional,
        miterKey: w.miterKey
      });
      roomConfigurations[w.roomId] = { ...prev, waterfalls: existing };
    }
    props.onSave({
      customLineItems: lines,
      estimateWideAdjustment: adjustment,
      roomConfigurations
    });
  }

  const adj = props.commercial?.estimateAdjustment;

  return (
    <section
      className="eq-record-section"
      data-testid="eq-commercial-configuration-section"
      data-editable={props.editable ? "1" : "0"}
    >
      <div className="eq-record-section__head">
        <h2 className="eq-ai-section-title">Commercial Configuration</h2>
        <span className="eq-record-section__status" data-testid="eq-commercial-status">
          {props.editable ? "Editable" : "Read-only for this revision"}
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
                <dt>Adjustment percentage</dt>
                <dd data-testid="eq-adj-pct">{Number(adj.percentage).toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Adjustment exact amount</dt>
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
            </dl>
            <p className="eq-footnote">
              Distributed across eligible customer lines — customers do not see a separate surcharge
              line.
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
                  <th>Visible</th>
                  <th>% eligible</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.id} data-testid="eq-custom-line-row">
                    <td>
                      <input
                        disabled={!props.editable}
                        value={line.description}
                        aria-label="Line description"
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, description: v } : l))
                          );
                        }}
                      />
                    </td>
                    <td>
                      <select
                        disabled={!props.editable}
                        value={line.category}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, category: v } : l))
                          );
                        }}
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
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, quantity: v } : l))
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!props.editable}
                        value={line.unitPrice}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, unitPrice: v } : l))
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!props.editable}
                        checked={line.customerVisible}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? {
                                    ...l,
                                    customerVisible: v,
                                    commercialRole: v ? "customer_charge" : "internal_only"
                                  }
                                : l
                            )
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!props.editable}
                        checked={line.percentageEligible}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, percentageEligible: v } : l
                            )
                          );
                        }}
                      />
                    </td>
                    <td>
                      {props.editable ? (
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {props.editable ? (
            <div className="eq-action-row">
              <button type="button" className="eq-btn-secondary" data-testid="eq-add-custom-line" onClick={() => addLine()}>
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
            </div>
          ) : null}
        </div>

        <h3 className="eq-ai-section-title">Estimate-wide percentage</h3>
        <div className="eq-percentage-editor" data-testid="eq-estimate-percentage-adjustment">
          <label>
            Active
            <input
              type="checkbox"
              disabled={!props.editable}
              checked={adjustment.active}
              onChange={(e) => setAdjustment((a) => ({ ...a, active: e.target.checked }))}
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
              onChange={(e) =>
                setAdjustment((a) => ({
                  ...a,
                  percentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  source: "manual"
                }))
              }
            />
          </label>
          <label>
            Reason
            <input
              disabled={!props.editable}
              value={adjustment.reason}
              data-testid="eq-percentage-reason"
              onChange={(e) => setAdjustment((a) => ({ ...a, reason: e.target.value }))}
            />
          </label>
        </div>

        <h3 className="eq-ai-section-title">Vanity Program</h3>
        <div data-testid="eq-vanity-program-configuration">
          {vanityRooms.length === 0 ? (
            <p className="eq-muted">No vanity/bath rooms detected from Takeoff yet.</p>
          ) : (
            vanityRooms.map((v, idx) => (
              <div key={v.roomId || idx} className="eq-vanity-card" data-testid="eq-vanity-card">
                <strong>{v.roomName}</strong>
                <label>
                  Apply Vanity Program
                  <input
                    type="checkbox"
                    disabled={!props.editable}
                    checked={v.useStandardPricing}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setVanityRooms((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, useStandardPricing: checked } : row
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
                    disabled={!props.editable || !v.useStandardPricing}
                    value={v.additionalTrips}
                    onChange={(e) => {
                      const n = Math.max(0, Number(e.target.value) || 0);
                      setVanityRooms((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, additionalTrips: n } : row))
                      );
                    }}
                  />
                </label>
              </div>
            ))
          )}
        </div>

        <h3 className="eq-ai-section-title">Waterfalls</h3>
        <div data-testid="eq-waterfall-configuration">
          {waterfalls.length === 0 ? (
            <p className="eq-muted">
              No approved waterfall geometry. Add waterfall facts on an editable measurement
              revision, then configure here.
            </p>
          ) : (
            waterfalls.map((w) => (
              <div key={w.id} className="eq-waterfall-card" data-testid="eq-waterfall-card">
                <strong>
                  {w.roomName} — {w.side} waterfall
                </strong>
                <span>
                  Height {w.legHeightIn}″ · Miter {w.miterKey}
                  {w.backsidePolish ? " · Backside polish" : ""}
                  {w.customerOptional ? " · Customer optional" : " · Required"}
                </span>
              </div>
            ))
          )}
          {props.editable ? (
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-add-waterfall-stub"
              onClick={() =>
                setWaterfalls((prev) => [
                  ...prev,
                  {
                    id: newId(),
                    roomId: vanityRooms[0]?.roomId || "",
                    roomName: "Kitchen",
                    pieceId: "",
                    side: "left",
                    legHeightIn: 36,
                    backsidePolish: false,
                    customerOptional: true,
                    miterKey: "2-3in"
                  }
                ])
              }
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
    displayTotal?: number | null;
    summary?: string | null;
    basedOnRevision?: number | null;
  }>;
  comparison?: any;
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
          <ul className="eq-revision-list" data-testid="eq-revision-list">
            {props.revisions.map((r) => (
              <li key={r.revision} data-testid="eq-revision-item" data-revision={r.revision}>
                <strong>
                  R{r.revision}
                  {r.isActivePublication ? " — Published and active" : ` — ${r.status}`}
                </strong>
                {r.basedOnRevision != null ? (
                  <span> Based on R{r.basedOnRevision}</span>
                ) : null}
                <div className="eq-muted">
                  {r.countertopSf != null ? `${Number(r.countertopSf).toFixed(2)} SF countertop · ` : ""}
                  {r.backsplashSf != null ? `${Number(r.backsplashSf).toFixed(2)} SF backsplash · ` : ""}
                  {r.displayTotal != null ? money(r.displayTotal) : ""}
                </div>
                {r.summary ? <p>{r.summary}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {props.comparison ? (
          <div data-testid="eq-revision-comparison-summary">
            <h3 className="eq-ai-section-title">Revision comparison</h3>
            <ul>
              {(props.comparison.changedItems || []).map((c: any, i: number) => (
                <li key={`${c.kind}-${i}`}>
                  {c.label}: {String(c.from)} → {String(c.to)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
