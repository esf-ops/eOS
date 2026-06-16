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

function importReadinessCopy(importPlan: TakeoffImportPlan): { value: string; sub: string; accent: "green" | "yellow" | "default" } {
  const importDisabledNote =
    "Import to Internal Estimate remains disabled until a future release.";

  if (!importPlan.canImport) {
    const statusBlocked = importPlan.blockedReason?.includes('set to "reviewed"')
      || importPlan.blockedReason?.includes("Takeoff status");
    return {
      value: "Blocked",
      accent: "yellow",
      sub: statusBlocked
        ? `Approve this takeoff after resolving validation issues. ${importDisabledNote}`
        : `${importPlan.blockedReason ?? "Resolve validation issues first."} ${importDisabledNote}`,
    };
  }

  if (importPlan.warnings.length > 0) {
    return {
      value: "Preview only",
      accent: "yellow",
      sub: `Import plan mapped with ${importPlan.warnings.length} warning${importPlan.warnings.length !== 1 ? "s" : ""}. ${importDisabledNote}`,
    };
  }

  return {
    value: "Preview only",
    accent: "default",
    sub: `Mapped for preview only. ${importDisabledNote}`,
  };
}

export default function TakeoffSummaryCards({ computed, importPlan }: Props) {
  const importState = importReadinessCopy(importPlan);

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
        value={importState.value}
        accent={importState.accent}
        sub={importState.sub}
      />
    </div>
  );
}
