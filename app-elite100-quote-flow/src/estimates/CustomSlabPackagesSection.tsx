/**
 * Pricing tab — out-of-collection slab packages (internal only).
 * Brain prices: confirmed slabs × cost per slab × cost multiplier (fabrication +
 * install included). The suggestion is area-based, not a cutting layout.
 */
import React from "react";
import type { QuoteFlowSlabPackage, QuoteFlowSlabPackageInput } from "../lib/quoteFlowEstimatesApi";

type Props = {
  packages: QuoteFlowSlabPackageInput[];
  calculated: Record<string, QuoteFlowSlabPackage | undefined>;
  costMultiplier: number | null;
  defaultWastePercent: number;
  roomNamesByPackage: Record<string, string[]>;
  busy: boolean;
  onChange: (next: QuoteFlowSlabPackageInput[]) => void;
};

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function newSlabPackage(defaultWastePercent: number): QuoteFlowSlabPackageInput {
  return {
    id: `slab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    colorName: "",
    supplier: "",
    thickness: "",
    slabLengthIn: null,
    slabWidthIn: null,
    costPerSlab: null,
    wastePercent: defaultWastePercent,
    confirmedSlabQuantity: null,
    quantityOverrideReason: ""
  };
}

export default function CustomSlabPackagesSection(props: Props) {
  const { packages, calculated, costMultiplier, defaultWastePercent, roomNamesByPackage, busy, onChange } = props;

  function update(id: string, patch: Partial<QuoteFlowSlabPackageInput>) {
    onChange(packages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <div className="qf-pricing__controls" data-testid="qf-pricing-slab-packages">
      <h3>Custom slabs</h3>
      <p className="qf-muted">
        For colors outside the Elite 100 collection. Installed price = confirmed slabs × cost per
        slab{costMultiplier ? ` × ${costMultiplier}` : ""} (fabrication and installation included).
        Assign a room to a slab above, then Calculate.
      </p>
      {packages.length === 0 ? <p className="qf-muted">No custom slabs on this estimate.</p> : null}
      <ul className="qf-pricing__room-selections">
        {packages.map((pkg) => {
          const calc = calculated[pkg.id]?.calculated || null;
          const issues = calculated[pkg.id]?.issues || [];
          const rooms = roomNamesByPackage[pkg.id] || [];
          const suggested = calc?.suggestedQuantity ?? null;
          const overridden =
            pkg.confirmedSlabQuantity != null && suggested != null && pkg.confirmedSlabQuantity !== suggested;
          return (
            <li key={pkg.id} data-testid="qf-pricing-slab-card">
              <div className="qf-pricing__controls">
                <label className="qf-pricing__field">
                  Color
                  <input
                    type="text"
                    value={pkg.colorName}
                    disabled={busy}
                    data-testid="qf-pricing-slab-color"
                    onChange={(e) => update(pkg.id, { colorName: e.target.value })}
                  />
                </label>
                <label className="qf-pricing__field">
                  Slab length (in)
                  <input
                    type="number"
                    min={0}
                    value={pkg.slabLengthIn ?? ""}
                    disabled={busy}
                    data-testid="qf-pricing-slab-length"
                    onChange={(e) => update(pkg.id, { slabLengthIn: numOrNull(e.target.value) })}
                  />
                </label>
                <label className="qf-pricing__field">
                  Slab width (in)
                  <input
                    type="number"
                    min={0}
                    value={pkg.slabWidthIn ?? ""}
                    disabled={busy}
                    data-testid="qf-pricing-slab-width"
                    onChange={(e) => update(pkg.id, { slabWidthIn: numOrNull(e.target.value) })}
                  />
                </label>
                <label className="qf-pricing__field">
                  Cost per slab ($)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pkg.costPerSlab ?? ""}
                    disabled={busy}
                    data-testid="qf-pricing-slab-cost"
                    onChange={(e) => update(pkg.id, { costPerSlab: numOrNull(e.target.value) })}
                  />
                </label>
              </div>

              <p className="qf-muted" data-testid="qf-pricing-slab-rooms">
                {rooms.length ? `Used by: ${rooms.join(", ")}` : "Not assigned to a room yet (not charged)."}
              </p>

              {calc ? (
                <p data-testid="qf-pricing-slab-suggestion">
                  {calc.requiredSf.toFixed(1)} SF + {pkg.wastePercent ?? defaultWastePercent}% waste ={" "}
                  {calc.requiredWithWasteSf.toFixed(1)} SF ÷ {calc.slabAreaSf.toFixed(1)} SF per slab →{" "}
                  <strong>suggested {calc.suggestedQuantity} slab{calc.suggestedQuantity === 1 ? "" : "s"}</strong>
                  <span className="qf-muted"> (area estimate, not a cutting layout)</span>
                </p>
              ) : (
                <p className="qf-muted">Calculate to see the suggested slab quantity.</p>
              )}

              <div className="qf-pricing__controls">
                <label className="qf-pricing__field">
                  Confirmed slabs
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={pkg.confirmedSlabQuantity ?? ""}
                    disabled={busy}
                    data-testid="qf-pricing-slab-confirmed"
                    onChange={(e) => {
                      const n = numOrNull(e.target.value);
                      update(pkg.id, { confirmedSlabQuantity: n != null && n > 0 ? Math.floor(n) : null });
                    }}
                  />
                </label>
                {suggested != null && suggested > 0 && pkg.confirmedSlabQuantity !== suggested ? (
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    disabled={busy}
                    data-testid="qf-pricing-slab-use-suggested"
                    onClick={() => update(pkg.id, { confirmedSlabQuantity: suggested, quantityOverrideReason: "" })}
                  >
                    Confirm {suggested} slab{suggested === 1 ? "" : "s"}
                  </button>
                ) : null}
                {overridden ? (
                  <label className="qf-pricing__field">
                    Reason for different quantity
                    <input
                      type="text"
                      value={pkg.quantityOverrideReason || ""}
                      disabled={busy}
                      data-testid="qf-pricing-slab-override-reason"
                      onChange={(e) => update(pkg.id, { quantityOverrideReason: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>

              {calc ? (
                <p data-testid="qf-pricing-slab-total">
                  Installed package: <strong>{money(calc.total)}</strong>
                  {calc.quantityConfirmed ? "" : " (preview — confirm quantity)"}
                  {calc.shared ? ` · shared across ${calc.roomNames.join(", ")}, charged once` : ""}
                </p>
              ) : null}

              {issues.length ? (
                <ul className="qf-pricing__issues" data-testid="qf-pricing-slab-issues">
                  {issues.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}

              <details>
                <summary>More details</summary>
                <div className="qf-pricing__controls">
                  <label className="qf-pricing__field">
                    Waste %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={pkg.wastePercent ?? ""}
                      disabled={busy}
                      data-testid="qf-pricing-slab-waste"
                      onChange={(e) => update(pkg.id, { wastePercent: numOrNull(e.target.value) })}
                    />
                  </label>
                  <label className="qf-pricing__field">
                    Supplier (internal)
                    <input
                      type="text"
                      value={pkg.supplier || ""}
                      disabled={busy}
                      onChange={(e) => update(pkg.id, { supplier: e.target.value })}
                    />
                  </label>
                  <label className="qf-pricing__field">
                    Thickness
                    <input
                      type="text"
                      value={pkg.thickness || ""}
                      disabled={busy}
                      onChange={(e) => update(pkg.id, { thickness: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    disabled={busy || rooms.length > 0}
                    title={rooms.length ? "Move rooms back to Elite 100 first" : undefined}
                    data-testid="qf-pricing-slab-remove"
                    onClick={() => onChange(packages.filter((p) => p.id !== pkg.id))}
                  >
                    Remove slab
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="qf-btn-secondary"
        disabled={busy}
        data-testid="qf-pricing-slab-add"
        onClick={() => onChange([...packages, newSlabPackage(defaultWastePercent)])}
      >
        Add custom slab
      </button>
    </div>
  );
}
