import React from "react";
import type { TakeoffQuoteReadinessItem } from "../../lib/takeoffImportWorkflow";

interface Props {
  items: TakeoffQuoteReadinessItem[];
  readyToCalculate: boolean;
}

export default function TakeoffQuoteReadinessSummary({ items, readyToCalculate }: Props) {
  return (
    <div className="ie-takeoff-readiness card" role="status">
      <div className="ie-takeoff-readiness-head">
        <h2 className="ie-section-title" style={{ margin: 0 }}>Imported Takeoff Quote Readiness</h2>
        <span className={`ie-takeoff-readiness-pill${readyToCalculate ? " is-ready" : ""}`}>
          {readyToCalculate ? "Ready to calculate / save" : "Complete missing items"}
        </span>
      </div>
      <ul className="ie-takeoff-readiness-list">
        {items.map((item) => (
          <li key={item.key} className={`ie-takeoff-readiness-item${item.complete ? " is-done" : ""}`}>
            <span className="ie-takeoff-readiness-mark" aria-hidden>{item.complete ? "✓" : "○"}</span>
            <span>{item.label}</span>
            {item.detail ? <span className="muted small">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
