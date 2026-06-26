import React from "react";
import type { TakeoffMeasurementDeltaResult } from "@quote-lib/takeoffImportMeasurements";

interface Props {
  deltas: TakeoffMeasurementDeltaResult;
}

function fmtSf(n: number) {
  return `${Number(n).toFixed(2)} sf`;
}

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)} sf`;
}

function Row({
  label,
  imported,
  current,
  delta,
}: {
  label: string;
  imported: number;
  current: number;
  delta: number;
}) {
  if (imported <= 0 && current <= 0) return null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{fmtSf(imported)}</td>
      <td>{fmtSf(current)}</td>
      <td className={Math.abs(delta) > 0.001 ? "ie-takeoff-delta-changed" : undefined}>{fmtDelta(delta)}</td>
    </tr>
  );
}

export default function TakeoffMeasurementComparisonPanel({ deltas }: Props) {
  const { imported, current, delta, exceedsThreshold, thresholdSf } = deltas;
  return (
    <div className="ie-takeoff-compare card">
      <div className="ie-takeoff-compare-head">
        <h2 className="ie-section-title" style={{ margin: 0 }}>Imported vs current measurements</h2>
        {exceedsThreshold ? (
          <span className="ie-takeoff-compare-warn" role="status">
            Delta exceeds {thresholdSf} sf — review edited measurements
          </span>
        ) : null}
      </div>
      <table className="ie-takeoff-compare-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Imported</th>
            <th scope="col">Current</th>
            <th scope="col">Delta</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Countertop" imported={imported.countertopSqft} current={current.countertopSqft} delta={delta.countertopSqft} />
          <Row label="Standard BS" imported={imported.standardBacksplashSqft} current={current.standardBacksplashSqft} delta={delta.standardBacksplashSqft} />
          <Row label="High BS" imported={imported.highBacksplashSqft} current={current.highBacksplashSqft} delta={delta.highBacksplashSqft} />
          <Row label="FHBS" imported={imported.fullHeightBacksplashSqft} current={current.fullHeightBacksplashSqft} delta={delta.fullHeightBacksplashSqft} />
          <Row label="Combined" imported={imported.combinedSqft} current={current.combinedSqft} delta={delta.combinedSqft} />
        </tbody>
      </table>
    </div>
  );
}
