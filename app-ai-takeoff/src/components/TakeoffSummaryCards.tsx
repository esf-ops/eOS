import React from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import type { TakeoffImportPlan } from "@takeoff-core/takeoffImportPlanner.mjs";

interface Props {
  computed: TakeoffComputedMeasurements;
  importPlan: TakeoffImportPlan;
}

function SummaryCard({
  label,
  value,
  unit,
  sub,
  accent
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: "green" | "yellow" | "default";
}) {
  return (
    <div className={`summary-card${accent ? ` summary-card--${accent}` : ""}`}>
      <div className="summary-card-label">{label}</div>
      <div className="summary-card-value">
        {value}
        {unit && <span className="summary-card-unit">{unit}</span>}
      </div>
      {sub && <div className="summary-card-sub">{sub}</div>}
    </div>
  );
}

export default function TakeoffSummaryCards({ computed, importPlan }: Props) {
  const importReady = importPlan.canImport && importPlan.warnings.length === 0;
  const importAccent = importPlan.canImport
    ? importPlan.warnings.length === 0
      ? "green"
      : "yellow"
    : "yellow";
  const importLabel = importPlan.canImport
    ? importPlan.warnings.length === 0
      ? "Ready"
      : `Ready with ${importPlan.warnings.length} warning${importPlan.warnings.length !== 1 ? "s" : ""}`
    : "Blocked";

  return (
    <div className="summary-grid">
      <SummaryCard
        label="Countertop — exact"
        value={computed.countertopExactSf.toFixed(2)}
        unit=" sf"
        sub={`Chargeable: ${computed.chargeableCountertopSf} sf`}
      />
      <SummaryCard
        label="Backsplash — exact"
        value={computed.backsplashExactSf.toFixed(2)}
        unit=" sf"
        sub={`Chargeable: ${computed.chargeableBacksplashSf} sf`}
      />
      <SummaryCard
        label="Combined — exact"
        value={computed.combinedExactSf.toFixed(2)}
        unit=" sf"
        sub="Countertop + backsplash"
      />
      <SummaryCard
        label="Import readiness"
        value={importLabel}
        accent={importAccent}
        sub={importPlan.canImport ? "Status: reviewed" : importPlan.blockedReason ?? "—"}
      />
    </div>
  );
}
