import EosMetricCard, { EosMetricGrid } from "@eliteos-ui/EosMetricCard";
import React, { useState } from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

interface Props {
  computed: TakeoffComputedMeasurements;
  /** Optional math consistency notes for Advanced (not shown in main summary). */
  consistencyOk?: boolean;
}

export default function TakeoffMeasurementSummarySimple({ computed, consistencyOk = true }: Props) {
  const [calcOpen, setCalcOpen] = useState(false);
  const totalBs = computed.backsplashExactSf + computed.fhbExactSf;

  return (
    <section className="takeoff-measurement-summary" aria-label="Measurement summary">
      <div className="takeoff-measurement-summary-head">
        <h3 className="takeoff-measurement-summary-title">Measurement summary</h3>
        <button
          type="button"
          className="takeoff-calc-help-btn"
          onClick={() => setCalcOpen((o) => !o)}
          aria-expanded={calcOpen}
        >
          How this is calculated
        </button>
      </div>

      {calcOpen ? (
        <div className="takeoff-calc-help-panel muted small">
          <ul className="takeoff-calc-help-list">
            <li>Countertop sf = length × depth ÷ 144</li>
            <li>Backsplash sf = linear inches × height inches ÷ 144, or reviewed manual sf when provided</li>
            <li>Combined sf = countertop + backsplash (including full-height panels)</li>
            <li>Chargeable sf rounds up to the next whole square foot</li>
            <li>Cutouts do not reduce material square footage</li>
            <li>Excluded rooms and pieces are not counted</li>
            <li>AI estimates are not authoritative — eliteOS recomputes from reviewed dimensions</li>
          </ul>
        </div>
      ) : null}

      {!consistencyOk ? (
        <p className="takeoff-math-warn muted small" role="note">
          Math consistency issue detected — see Items to review or Advanced diagnostics.
        </p>
      ) : null}

      <EosMetricGrid>
        <EosMetricCard
          label="Countertop"
          value={computed.countertopExactSf.toFixed(2)}
          unit=" sf"
          sub={`Chargeable: ${computed.chargeableCountertopSf} sf`}
        />
        <EosMetricCard
          label="Backsplash"
          value={totalBs.toFixed(2)}
          unit=" sf"
          sub={`Chargeable: ${computed.chargeableBacksplashSf} sf${computed.fhbExactSf > 0 ? ` · incl. ${computed.fhbExactSf.toFixed(2)} sf full-height` : ""}`}
        />
        <EosMetricCard
          label="Combined"
          value={computed.combinedExactSf.toFixed(2)}
          unit=" sf"
          sub="Countertop + backsplash"
        />
      </EosMetricGrid>
    </section>
  );
}
