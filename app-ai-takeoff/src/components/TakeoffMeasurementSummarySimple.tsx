import EosMetricCard, { EosMetricGrid } from "@eliteos-ui/EosMetricCard";
import React from "react";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

interface Props {
  computed: TakeoffComputedMeasurements;
}

export default function TakeoffMeasurementSummarySimple({ computed }: Props) {
  return (
    <section className="takeoff-measurement-summary" aria-label="Measurement summary">
      <h3 className="takeoff-measurement-summary-title">Measurement summary</h3>
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
    </section>
  );
}
