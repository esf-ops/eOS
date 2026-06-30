import EosMetricCard, { EosMetricGrid } from "@eliteos-ui/EosMetricCard";
import React from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

interface Props {
  computed: TakeoffComputedMeasurements;
}

/** Simplified three-metric measurement summary for the review workflow. */
export default function TakeoffSummaryCards({ computed }: Props) {
  return (
    <EosMetricGrid>
      <EosMetricCard
        label="Countertop"
        value={computed.countertopExactSf.toFixed(2)}
        unit=" sf"
        sub={`Chargeable: ${computed.chargeableCountertopSf} sf`}
      />
      <EosMetricCard
        label="Backsplash"
        value={computed.backsplashExactSf.toFixed(2)}
        unit=" sf"
        sub={`Chargeable: ${computed.chargeableBacksplashSf} sf`}
      />
      <EosMetricCard
        label="Combined"
        value={computed.combinedExactSf.toFixed(2)}
        unit=" sf"
        sub="Countertop + backsplash"
      />
    </EosMetricGrid>
  );
}
