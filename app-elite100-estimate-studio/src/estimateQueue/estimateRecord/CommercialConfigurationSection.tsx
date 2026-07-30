/**
 * Estimate Options — the simplified Internal-Estimate-style commercial surface.
 *
 * Four compact cards, in order:
 *   1. Additional charges and credits (inline table)
 *   2. Account adjustment
 *   3. Bathroom Vanity Program (one-click add/remove)
 *   4. Island waterfall summary (read-only projection of the Takeoff object)
 *
 * This section owns the local edit buffer for those fields and nothing else. It
 * never prices anything, never PATCHes, and never calculates: every mutation
 * computes the complete next state and hands it to the workspace save queue via
 * `onQueueSave`. Server responses update the authoritative summaries beside the
 * inputs without rebuilding them.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ADDITIONAL_LINE_CATEGORIES,
  TEAR_OUT_DEFAULT,
  additionalLineAmount,
  nextLocalLineId,
  readAdditionalLines
} from "./additionalLinesBoundary.mjs";

export type AdditionalLineDraft = {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  role: "charge" | "credit";
  customerVisible: boolean;
  percentageEligible: boolean;
  internalOnly: boolean;
  roomId: string;
  reason: string;
};

export type EstimateAdjustmentDraft = {
  active: boolean;
  percentage: number;
  reason: string;
  source: string;
};

const CATEGORIES = ADDITIONAL_LINE_CATEGORIES;

const MITER_KEYS = [
  { value: "2-3in", label: "2–3 inch" },
  { value: "4in", label: "4 inch" },
  { value: "5in", label: "5 inch" },
  { value: "6in", label: "6 inch" }
];

function money(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function inches(n: number | null | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v}"` : "—";
}

function readAdjustment(commercial: any): EstimateAdjustmentDraft {
  const a = commercial?.estimateAdjustment || {};
  return {
    active: a.active === true,
    percentage: Number(a.percentage) || 0,
    reason: String(a.reason || ""),
    source: String(a.source || "manual")
  };
}

export function CommercialConfigurationSection(props: {
  editable: boolean;
  commercial: any;
  /**
   * Changes only when the buffer must be rebuilt: first load, a different
   * editable revision, or a server-introduced structural object. Totals and
   * polling never change it, so typing is never interrupted.
   */
  hydrationKey: string;
  roomOptions?: Array<{ id: string; name: string }>;
  busy: boolean;
  error: string | null;
  dirty?: boolean;
  measurementsApproved?: boolean;
  saveStatus?: string | null;
  draftExactTotal?: number | null;
  customerDisplayTotal?: number | null;
  onQueueSave: (payload: {
    lines: Array<Record<string, unknown>>;
    adjustment: Record<string, unknown>;
    roomConfigurations?: Record<string, unknown> | null;
  }) => void;
  onRequestAddIslandWaterfall?: (side: "left" | "right") => void;
}) {
  const [lines, setLines] = useState<AdditionalLineDraft[]>(() =>
    readAdditionalLines(props.commercial?.customLines)
  );
  const [adjustment, setAdjustment] = useState<EstimateAdjustmentDraft>(() =>
    readAdjustment(props.commercial)
  );
  /** Vanity add/remove elections layered over the server's governed rows. */
  const [vanityElections, setVanityElections] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hydratedKeyRef = useRef<string | null>(null);

  // The only path that overwrites local inputs.
  useEffect(() => {
    if (hydratedKeyRef.current === props.hydrationKey) return;
    hydratedKeyRef.current = props.hydrationKey;
    setLines(readAdditionalLines(props.commercial?.customLines));
    setAdjustment(readAdjustment(props.commercial));
    setVanityElections({});
  }, [props.hydrationKey, props.commercial]);

  const vanityPrograms: any[] = Array.isArray(props.commercial?.vanityPrograms)
    ? props.commercial.vanityPrograms
    : [];
  const waterfalls: any[] = Array.isArray(props.commercial?.waterfalls)
    ? props.commercial.waterfalls
    : [];
  const adj = props.commercial?.estimateAdjustment || null;
  const editable = props.editable !== false;
  const roomOptions = props.roomOptions || [];

  /** Applied state: a local election wins, otherwise the server's value. */
  function vanityApplied(v: any): boolean {
    const key = String(v?.roomId || "");
    return key in vanityElections ? vanityElections[key] : v?.applied === true;
  }

  const roomConfigurationsPatch = useMemo(() => {
    const patch: Record<string, unknown> = {};
    for (const [roomId, apply] of Object.entries(vanityElections)) {
      if (!roomId) continue;
      patch[roomId] = {
        vanityProgram: apply
          ? { applyProgram: true, useStandardPricing: false }
          : { applyProgram: false, useStandardPricing: true }
      };
    }
    return Object.keys(patch).length ? patch : null;
  }, [vanityElections]);

  /**
   * Every mutation routes through here with the complete next state, so a
   * queued payload can never contain a pre-mutation array.
   */
  function commit(next: {
    lines?: AdditionalLineDraft[];
    adjustment?: EstimateAdjustmentDraft;
    roomConfigurations?: Record<string, unknown> | null;
  }) {
    const nextLines = next.lines ?? lines;
    const nextAdjustment = next.adjustment ?? adjustment;
    const nextRooms =
      next.roomConfigurations !== undefined ? next.roomConfigurations : roomConfigurationsPatch;
    props.onQueueSave({
      lines: nextLines as unknown as Array<Record<string, unknown>>,
      adjustment: {
        active: nextAdjustment.active,
        percentage: nextAdjustment.percentage,
        reason: nextAdjustment.reason,
        source: nextAdjustment.source || "manual"
      },
      roomConfigurations: nextRooms
    });
  }

  /**
   * Server policy, mirrored so the row never shows a state the server will
   * refuse: only customer-visible, non-internal lines take the account
   * percentage, and credits are always categorized as Discount/Credit.
   */
  function reconcileLine(line: AdditionalLineDraft): AdditionalLineDraft {
    const customerVisible = line.internalOnly ? false : line.customerVisible;
    return {
      ...line,
      customerVisible,
      percentageEligible: customerVisible ? line.percentageEligible : false,
      category: line.role === "credit" ? "Discount/Credit" : line.category
    };
  }

  function updateLine(idx: number, patch: Partial<AdditionalLineDraft>) {
    const nextLines = lines.map((l, i) => (i === idx ? reconcileLine({ ...l, ...patch }) : l));
    setLines(nextLines);
    commit({ lines: nextLines });
  }

  function addLine(preset?: Partial<AdditionalLineDraft>) {
    const nextLines = [
      ...lines,
      {
        id: nextLocalLineId(),
        description: "",
        category: "Other",
        quantity: 1,
        unitPrice: 0,
        role: "charge" as const,
        customerVisible: true,
        percentageEligible: true,
        internalOnly: false,
        roomId: "",
        reason: "",
        ...preset
      }
    ];
    setLines(nextLines);
    commit({ lines: nextLines });
  }

  function removeLine(idx: number) {
    const nextLines = lines.filter((_, i) => i !== idx);
    setLines(nextLines);
    commit({ lines: nextLines });
  }

  function moveLine(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= lines.length) return;
    const nextLines = [...lines];
    const [held] = nextLines.splice(idx, 1);
    nextLines.splice(target, 0, held);
    setLines(nextLines);
    commit({ lines: nextLines });
  }

  function updateAdjustment(patch: Partial<EstimateAdjustmentDraft>) {
    const nextAdjustment = { ...adjustment, ...patch };
    setAdjustment(nextAdjustment);
    commit({ adjustment: nextAdjustment });
  }

  function setVanityProgram(roomId: string, apply: boolean) {
    const nextElections = { ...vanityElections, [roomId]: apply };
    setVanityElections(nextElections);
    const patch: Record<string, unknown> = {};
    for (const [id, on] of Object.entries(nextElections)) {
      if (!id) continue;
      patch[id] = {
        vanityProgram: on
          ? { applyProgram: true, useStandardPricing: false }
          : { applyProgram: false, useStandardPricing: true }
      };
    }
    commit({ roomConfigurations: patch });
  }

  const linesImpact = useMemo(
    () => lines.reduce((sum, l) => sum + additionalLineAmount(l), 0),
    [lines]
  );

  return (
    <section
      className="eq-record-section"
      data-testid="eq-commercial-configuration-section"
      data-estimate-options="1"
    >
      <div className="eq-record-section__head">
        <h2 className="eq-ai-section-title">Estimate Options</h2>
        {props.saveStatus ? (
          <span className="eq-muted" data-testid="eq-commercial-status" role="status">
            {props.saveStatus}
          </span>
        ) : null}
      </div>

      <div className="eq-record-section__body">
        {/* 1. Additional charges and credits */}
        <div className="eq-option-card" data-testid="eq-custom-line-items-editor">
          <div className="eq-option-card__head">
            <h3 className="eq-ai-section-title">Additional charges and credits</h3>
            {editable ? (
              <div className="eq-action-row">
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-custom-line"
                  onClick={(e) => {
                    e.preventDefault();
                    addLine();
                  }}
                >
                  Add line
                </button>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-tear-out"
                  onClick={(e) => {
                    e.preventDefault();
                    addLine({
                      description: TEAR_OUT_DEFAULT.description,
                      quantity: TEAR_OUT_DEFAULT.quantity,
                      unitPrice: TEAR_OUT_DEFAULT.unitPrice,
                      category: TEAR_OUT_DEFAULT.category,
                      role: "charge",
                      customerVisible: true,
                      percentageEligible: true
                    });
                  }}
                >
                  Add Tear Out
                </button>
              </div>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <p className="eq-option-empty" data-testid="eq-lines-empty">
              No additional charges or credits.
            </p>
          ) : (
            <table className="eq-lines-table" data-testid="eq-lines-table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Charge / Credit</th>
                  <th scope="col">Customer visible</th>
                  <th scope="col">Apply account %</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Remove</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <React.Fragment key={line.id}>
                    <tr data-testid="eq-custom-line-row" data-line-id={line.id}>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-desc-${line.id}`}>
                          Description
                        </label>
                        <input
                          id={`line-desc-${line.id}`}
                          name={`line-desc-${line.id}`}
                          type="text"
                          data-testid="eq-line-description"
                          disabled={!editable}
                          value={line.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                        />
                      </td>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-qty-${line.id}`}>
                          Quantity
                        </label>
                        <input
                          id={`line-qty-${line.id}`}
                          name={`line-qty-${line.id}`}
                          type="number"
                          min="0"
                          step="1"
                          data-testid="eq-line-quantity"
                          disabled={!editable}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(idx, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-price-${line.id}`}>
                          Unit price
                        </label>
                        <input
                          id={`line-price-${line.id}`}
                          name={`line-price-${line.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          data-testid="eq-line-unit-price"
                          disabled={!editable}
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(idx, { unitPrice: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-role-${line.id}`}>
                          Charge or credit
                        </label>
                        <select
                          id={`line-role-${line.id}`}
                          name={`line-role-${line.id}`}
                          data-testid="eq-line-role"
                          disabled={!editable}
                          value={line.role}
                          onChange={(e) =>
                            updateLine(idx, {
                              role: e.target.value === "credit" ? "credit" : "charge"
                            })
                          }
                        >
                          <option value="charge">Charge</option>
                          <option value="credit">Credit</option>
                        </select>
                      </td>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-visible-${line.id}`}>
                          Customer visible
                        </label>
                        <input
                          id={`line-visible-${line.id}`}
                          name={`line-visible-${line.id}`}
                          type="checkbox"
                          data-testid="eq-line-visible"
                          disabled={!editable}
                          checked={line.customerVisible}
                          onChange={(e) => updateLine(idx, { customerVisible: e.target.checked })}
                        />
                      </td>
                      <td>
                        <label className="eq-visually-hidden" htmlFor={`line-pct-${line.id}`}>
                          Apply account percentage
                        </label>
                        <input
                          id={`line-pct-${line.id}`}
                          name={`line-pct-${line.id}`}
                          type="checkbox"
                          data-testid="eq-line-pct-eligible"
                          disabled={!editable || !line.customerVisible || line.internalOnly}
                          checked={line.percentageEligible}
                          onChange={(e) =>
                            updateLine(idx, { percentageEligible: e.target.checked })
                          }
                        />
                      </td>
                      <td data-testid="eq-line-amount">{money(additionalLineAmount(line))}</td>
                      <td>
                        {editable ? (
                          <button
                            type="button"
                            className="eq-btn-ghost"
                            data-testid="eq-line-remove"
                            aria-label={`Remove ${line.description || "line"}`}
                            onClick={(e) => {
                              e.preventDefault();
                              removeLine(idx);
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={8}>
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          data-testid="eq-line-more-options"
                          aria-expanded={expanded[line.id] === true}
                          onClick={(e) => {
                            e.preventDefault();
                            setExpanded((prev) => ({ ...prev, [line.id]: !prev[line.id] }));
                          }}
                        >
                          {expanded[line.id] ? "Hide options" : "More options"}
                        </button>
                        {expanded[line.id] ? (
                          <div className="eq-line-more" data-testid="eq-line-more-row">
                            <label htmlFor={`line-room-${line.id}`}>Room</label>
                            <select
                              id={`line-room-${line.id}`}
                              name={`line-room-${line.id}`}
                              data-testid="eq-line-room"
                              disabled={!editable}
                              value={line.roomId}
                              onChange={(e) => updateLine(idx, { roomId: e.target.value })}
                            >
                              <option value="">Whole estimate</option>
                              {roomOptions.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>

                            <label htmlFor={`line-category-${line.id}`}>Category</label>
                            <select
                              id={`line-category-${line.id}`}
                              name={`line-category-${line.id}`}
                              data-testid="eq-line-category"
                              disabled={!editable}
                              value={line.category}
                              onChange={(e) => updateLine(idx, { category: e.target.value })}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>

                            <label htmlFor={`line-reason-${line.id}`}>Estimator reason</label>
                            <input
                              id={`line-reason-${line.id}`}
                              name={`line-reason-${line.id}`}
                              type="text"
                              data-testid="eq-line-reason"
                              disabled={!editable}
                              value={line.reason}
                              onChange={(e) => updateLine(idx, { reason: e.target.value })}
                            />

                            <label htmlFor={`line-internal-${line.id}`}>Internal only</label>
                            <input
                              id={`line-internal-${line.id}`}
                              name={`line-internal-${line.id}`}
                              type="checkbox"
                              data-testid="eq-line-internal"
                              disabled={!editable}
                              checked={line.internalOnly}
                              onChange={(e) => updateLine(idx, { internalOnly: e.target.checked })}
                            />

                            <div className="eq-action-row">
                              <button
                                type="button"
                                className="eq-btn-ghost"
                                data-testid="eq-line-move-up"
                                disabled={!editable || idx === 0}
                                onClick={(e) => {
                                  e.preventDefault();
                                  moveLine(idx, -1);
                                }}
                              >
                                Move up
                              </button>
                              <button
                                type="button"
                                className="eq-btn-ghost"
                                data-testid="eq-line-move-down"
                                disabled={!editable || idx === lines.length - 1}
                                onClick={(e) => {
                                  e.preventDefault();
                                  moveLine(idx, 1);
                                }}
                              >
                                Move down
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {lines.length ? (
            <p className="eq-lines-impact" data-testid="eq-lines-impact">
              Additional lines: {money(linesImpact)}
            </p>
          ) : null}
        </div>

        {/* 2. Account adjustment */}
        <div className="eq-option-card" data-testid="eq-estimate-percentage-adjustment">
          <div className="eq-option-card__head">
            <h3 className="eq-ai-section-title">Account adjustment</h3>
          </div>

          <div className="eq-adjustment-controls">
            <label htmlFor="eq-account-adjustment-active">
              <input
                id="eq-account-adjustment-active"
                name="eq-account-adjustment-active"
                type="checkbox"
                data-testid="eq-percentage-active"
                disabled={!editable}
                checked={adjustment.active}
                onChange={(e) => updateAdjustment({ active: e.target.checked })}
              />
              Apply account adjustment
            </label>

            <label htmlFor="eq-account-adjustment-percentage">Percentage</label>
            <input
              id="eq-account-adjustment-percentage"
              name="eq-account-adjustment-percentage"
              type="number"
              step="0.01"
              data-testid="eq-percentage-input"
              disabled={!editable}
              value={adjustment.percentage}
              onChange={(e) => updateAdjustment({ percentage: Number(e.target.value) || 0 })}
            />

            <label htmlFor="eq-account-adjustment-reason">Reason</label>
            <input
              id="eq-account-adjustment-reason"
              name="eq-account-adjustment-reason"
              type="text"
              data-testid="eq-percentage-reason"
              disabled={!editable}
              value={adjustment.reason}
              onChange={(e) => updateAdjustment({ reason: e.target.value })}
            />
          </div>

          {!adj?.active ? (
            <p className="eq-muted" data-testid="eq-adjustment-inactive">
              No account adjustment applied.
            </p>
          ) : (
            <dl
              className="eq-summary-dl eq-summary-dl--grid"
              data-testid="eq-account-adjustment-impact"
            >
              <div>
                <dt>Verified base estimate</dt>
                <dd data-testid="eq-adj-base">{money(adj.verifiedBaseExact)}</dd>
              </div>
              <div>
                <dt>Eligible additional lines</dt>
                <dd data-testid="eq-adj-eligible-charges">
                  {money(adj.eligibleAdditionalChargesExact)}
                </dd>
              </div>
              <div>
                <dt>Account-adjustment basis</dt>
                <dd data-testid="eq-adj-eligible-basis">{money(adj.eligibleBasisExact)}</dd>
              </div>
              <div>
                <dt>Percentage</dt>
                <dd data-testid="eq-adj-percentage">{`${Number(adj.percentage || 0)}%`}</dd>
              </div>
              <div>
                <dt>Exact adjustment</dt>
                <dd data-testid="eq-adj-amount">{money(adj.exactAdjustment)}</dd>
              </div>
              <div>
                <dt>Non-percentage charges/credits</dt>
                <dd data-testid="eq-adj-non-pct">{money(adj.nonPercentageCommercialExact)}</dd>
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
          )}
        </div>

        {/* 3. Bathroom Vanity Program — one decision only */}
        {vanityPrograms.length ? (
          <div className="eq-option-card" data-testid="eq-vanity-program-configuration">
            <div className="eq-option-card__head">
              <h3 className="eq-ai-section-title">Bathroom Vanity Program</h3>
            </div>
            {vanityPrograms.map((v, idx) => {
              const applied = vanityApplied(v);
              return (
                <div
                  key={v.roomId || idx}
                  className="eq-vanity-card"
                  data-testid="eq-vanity-card"
                  data-applied={applied ? "1" : "0"}
                >
                  <strong data-testid="eq-vanity-room">{v.roomName}</strong>

                  <dl
                    className="eq-summary-dl eq-summary-dl--grid"
                    data-testid="eq-vanity-physical-facts"
                  >
                    <div>
                      <dt>Size</dt>
                      <dd data-testid="eq-vanity-size">
                        {`${inches(v.physicalFacts?.widthIn)} × ${inches(v.physicalFacts?.depthIn)}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Bowl configuration</dt>
                      <dd data-testid="eq-vanity-bowl">{v.physicalFacts?.bowlLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt>Sink openings</dt>
                      <dd data-testid="eq-vanity-sink-openings">
                        {v.physicalFacts?.sinkOpenings != null
                          ? `${v.physicalFacts.sinkOpenings} sink opening${
                              Number(v.physicalFacts.sinkOpenings) === 1 ? "" : "s"
                            }`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Backsplash</dt>
                      <dd data-testid="eq-vanity-backsplash">
                        {v.physicalFacts?.backsplashLabel || "—"}
                      </dd>
                    </div>
                  </dl>

                  {!v.eligible ? (
                    <p className="eq-muted" data-testid="eq-vanity-not-eligible">
                      {v.ineligibleReason}
                      {v.ineligibleDetail ? ` ${v.ineligibleDetail}` : ""}
                    </p>
                  ) : (
                    <>
                      <p data-testid="eq-vanity-program-label">
                        {applied ? "Vanity Program added" : "Eligible program"}: {v.programLabel}
                      </p>
                      <p data-testid="eq-vanity-server-price">
                        {applied ? "Current program price" : "Program price"}:{" "}
                        {v.programPrice != null ? money(v.programPrice) : "Updating price…"}
                      </p>
                      {applied && Array.isArray(v.includedScope) && v.includedScope.length ? (
                        <>
                          <p className="eq-muted">Included:</p>
                          <ul data-testid="eq-vanity-included-scope">
                            {v.includedScope.map((s: string) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {editable ? (
                        <div className="eq-action-row">
                          {applied ? (
                            <button
                              type="button"
                              className="eq-btn-secondary"
                              data-testid="eq-vanity-remove"
                              onClick={(e) => {
                                e.preventDefault();
                                setVanityProgram(String(v.roomId || ""), false);
                              }}
                            >
                              Remove Vanity Program
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="eq-btn-primary"
                              data-testid="eq-vanity-apply"
                              onClick={(e) => {
                                e.preventDefault();
                                setVanityProgram(String(v.roomId || ""), true);
                              }}
                            >
                              Add Vanity Program
                            </button>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* 4. Island waterfall summary — references the Takeoff object */}
        <div className="eq-option-card" data-testid="eq-waterfall-configuration">
          <div className="eq-option-card__head">
            <h3 className="eq-ai-section-title">Island waterfalls</h3>
            {editable ? (
              <div className="eq-action-row">
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-left-waterfall-option"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onRequestAddIslandWaterfall?.("left");
                  }}
                >
                  Add left waterfall
                </button>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-add-right-waterfall-option"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onRequestAddIslandWaterfall?.("right");
                  }}
                >
                  Add right waterfall
                </button>
              </div>
            ) : null}
          </div>

          {waterfalls.length === 0 ? (
            <p className="eq-muted" data-testid="eq-waterfall-empty">
              No island waterfalls in this Takeoff. Add one from the island in AI Takeoff Review.
            </p>
          ) : (
            <>
              <p className="eq-footnote" data-testid="eq-waterfall-source-note">
                Waterfall dimensions belong to the island piece in AI Takeoff Review. Edit them
                there; this summary shows the governed price impact.
              </p>
              {waterfalls.map((w) => (
                <div key={w.id} className="eq-waterfall-card" data-testid="eq-waterfall-card">
                  <strong data-testid="eq-waterfall-label">{w.customerOptionLabel}</strong>
                  <dl
                    className="eq-summary-dl eq-summary-dl--grid"
                    data-testid="eq-waterfall-physical-facts"
                  >
                    <div>
                      <dt>Room</dt>
                      <dd data-testid="eq-waterfall-room">{w.roomName}</dd>
                    </div>
                    <div>
                      <dt>Island piece</dt>
                      <dd data-testid="eq-waterfall-piece">{w.pieceLabel}</dd>
                    </div>
                    <div>
                      <dt>Side</dt>
                      <dd data-testid="eq-waterfall-side">{w.side}</dd>
                    </div>
                    <div>
                      <dt>Panel depth</dt>
                      <dd data-testid="eq-waterfall-width">{`${inches(w.panelWidthIn)} panel depth`}</dd>
                    </div>
                    <div>
                      <dt>Finished height</dt>
                      <dd data-testid="eq-waterfall-height">{`${inches(w.panelHeightIn)} finished height`}</dd>
                    </div>
                    <div>
                      <dt>Quantity</dt>
                      <dd data-testid="eq-waterfall-qty">{w.quantity}</dd>
                    </div>
                    <div>
                      <dt>Scope</dt>
                      <dd data-testid="eq-waterfall-optional">
                        {w.customerOptional ? "Customer optional" : "Required"}
                      </dd>
                    </div>
                    <div>
                      <dt>Miter</dt>
                      <dd data-testid="eq-waterfall-miter">
                        {MITER_KEYS.find((m) => m.value === w.miterKey)?.label || w.miterKey || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Backside polish</dt>
                      <dd data-testid="eq-waterfall-polish">{w.backsidePolish ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Estimator note</dt>
                      <dd data-testid="eq-waterfall-note">{w.note || "—"}</dd>
                    </div>
                  </dl>
                  <p className="eq-muted" data-testid="eq-waterfall-price-note">
                    {w.total != null
                      ? `Price impact: ${money(w.total)}`
                      : w.roomWaterfallExactTotal != null
                        ? `Room waterfall price impact: ${money(w.roomWaterfallExactTotal)}`
                        : "Updating price…"}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {props.error ? (
          <div className="eq-state eq-state--error" role="alert" data-testid="eq-commercial-error">
            {props.error}
          </div>
        ) : null}

        {/* Authoritative totals — display only, never calculated in React. */}
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
