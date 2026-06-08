import React from "react";
import type { RoomDraft } from "@quote-lib/quoteTypes";

// Mirrors the constant in InternalEstimateApp.tsx — pure data, no logic.
const MATERIAL_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant"
];

export interface CompareGroupsAndNotesStepProps {
  roomDrafts: RoomDraft[];
  setRoomDrafts: React.Dispatch<React.SetStateAction<RoomDraft[]>>;
  customerDisplayGroups: Record<string, boolean>;
  setCustomerDisplayGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  comparisonGroupColorLabels: Record<string, string>;
  setComparisonGroupColorLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Only mixedGroupNote is consumed here; pass the full memo object for forward-compatibility. */
  comparisonScopeMeta: { mixedGroupNote: string | null };
  customerFacingNotes: string;
  setCustomerFacingNotes: React.Dispatch<React.SetStateAction<string>>;
}

export default function CompareGroupsAndNotesStep({
  roomDrafts,
  setRoomDrafts,
  customerDisplayGroups,
  setCustomerDisplayGroups,
  comparisonGroupColorLabels,
  setComparisonGroupColorLabels,
  comparisonScopeMeta,
  customerFacingNotes,
  setCustomerFacingNotes,
}: CompareGroupsAndNotesStepProps) {
  return (
    <section id="sec-compare-notes" className="card">
      <div className="ie-section-head">
        <h2 className="ie-section-title">Compare Group Prices &amp; Notes</h2>
        <p className="ie-section-meta">
          Customer-facing material comparisons per room · Project notes for customer estimate
        </p>
      </div>

      <h3 className="h3">Customer-facing material comparison — by room</h3>
      <p className="muted small" style={{ marginTop: 4, marginBottom: 10 }}>
        Check the alternate material groups to show on the customer PDF for each room. Only rooms with a selection appear in the comparison section. Rooms with no selection are excluded.
      </p>
      {roomDrafts.map((rd) => (
        <div key={rd.id} className="ie-room-compare-block">
          <div className="ie-room-compare-room-label">
            <strong>{rd.name?.trim() || "Room"}</strong>
            <span className="muted small" style={{ marginLeft: 6 }}>· {rd.materialGroup}</span>
          </div>
          <div className="ie-group-compare-grid ie-group-compare-grid-room" role="group" aria-label={`Comparison groups for ${rd.name?.trim() || "Room"}`}>
            {MATERIAL_GROUPS.map((g) => {
              const checked = Boolean(rd.customerComparisonGroups?.includes(g));
              const label = rd.customerComparisonColorLabels?.[g] ?? "";
              return (
                <div key={g} className="ie-group-compare-row">
                  <label className="check ie-group-compare-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setRoomDrafts((prev) =>
                          prev.map((r) => {
                            if (r.id !== rd.id) return r;
                            const current = r.customerComparisonGroups ?? [];
                            const next = e.target.checked
                              ? current.includes(g) ? current : [...current, g]
                              : current.filter((x) => x !== g);
                            return { ...r, customerComparisonGroups: next };
                          })
                        );
                      }}
                    />
                    <span className="ie-group-compare-label">{g}</span>
                  </label>
                  {checked ? (
                    <label className="ie-group-compare-color">
                      <span className="muted small">Optional color label</span>
                      <input
                        value={label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRoomDrafts((prev) =>
                            prev.map((r) => {
                              if (r.id !== rd.id) return r;
                              const cur = r.customerComparisonColorLabels ?? {};
                              return { ...r, customerComparisonColorLabels: { ...cur, [g]: val } };
                            })
                          );
                        }}
                        placeholder="e.g. Aura Taj"
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <details className="ie-global-compare-legacy" style={{ marginTop: 16 }}>
        <summary className="muted small" style={{ cursor: "pointer" }}>
          Apply to all rooms (global shortcut)
        </summary>
        <p className="muted small" style={{ marginTop: 6 }}>
          Check groups below and click Apply to set the same comparison for every room at once. Per-room selections above take precedence on the customer PDF.
        </p>
        <div className="ie-group-compare-grid" role="group" aria-label="Global customer-facing price group comparisons">
          {MATERIAL_GROUPS.map((g) => (
            <div key={g} className="ie-group-compare-row">
              <label className="check ie-group-compare-check">
                <input
                  type="checkbox"
                  checked={Boolean(customerDisplayGroups[g])}
                  onChange={(e) => setCustomerDisplayGroups((prev) => ({ ...prev, [g]: e.target.checked }))}
                />
                <span className="ie-group-compare-label">{g}</span>
              </label>
              {customerDisplayGroups[g] ? (
                <label className="ie-group-compare-color">
                  <span className="muted small">Optional color label</span>
                  <input
                    value={comparisonGroupColorLabels[g] ?? ""}
                    onChange={(e) =>
                      setComparisonGroupColorLabels((prev) => ({ ...prev, [g]: e.target.value }))
                    }
                    placeholder="e.g. Aura Taj"
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => {
            const globalGroups = MATERIAL_GROUPS.filter((g) => customerDisplayGroups[g]);
            setRoomDrafts((prev) =>
              prev.map((r) => ({
                ...r,
                customerComparisonGroups: [...globalGroups],
                customerComparisonColorLabels: Object.fromEntries(
                  globalGroups
                    .filter((g) => comparisonGroupColorLabels[g]?.trim())
                    .map((g) => [g, comparisonGroupColorLabels[g].trim()])
                )
              }))
            );
          }}
        >
          Apply to all rooms
        </button>
      </details>

      {comparisonScopeMeta.mixedGroupNote ? (
        <p className="ie-note-quiet ie-note-info" role="status" style={{ marginTop: 6 }}>
          <span className="ie-note-quiet-dot" aria-hidden />
          {comparisonScopeMeta.mixedGroupNote}
        </p>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <h3 className="h3">Customer-facing project notes</h3>
        <p className="muted small" style={{ marginTop: 4, marginBottom: 6 }}>
          Prints under Project Notes on the customer estimate.
        </p>
        <label className="ie-cfn-field">
          <textarea
            rows={3}
            value={customerFacingNotes}
            onChange={(e) => setCustomerFacingNotes(e.target.value)}
            placeholder="Optional — prints under Project Notes on the customer estimate."
          />
        </label>
      </div>
    </section>
  );
}
