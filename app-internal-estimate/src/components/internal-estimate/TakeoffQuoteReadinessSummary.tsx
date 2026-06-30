import EosPanelHead from "../../../../shared/eliteos-ui/EosPanelHead";
import EosSectionCard from "../../../../shared/eliteos-ui/EosSectionCard";
import React from "react";
import type { TakeoffQuoteReadinessItem } from "../../lib/takeoffImportWorkflow";

interface Props {
  items: TakeoffQuoteReadinessItem[];
  readyToCalculate: boolean;
}

export default function TakeoffQuoteReadinessSummary({ items, readyToCalculate }: Props) {
  return (
    <EosSectionCard className="ie-takeoff-readiness eos-takeoff-panel" role="status">
      <EosPanelHead
        title="Imported Takeoff Quote Readiness"
        status={readyToCalculate ? "Ready to calculate / save" : "Complete missing items"}
        statusTone={readyToCalculate ? "success" : "warn"}
      />
      <ul className="ie-takeoff-readiness-list eos-checklist-list">
        {items.map((item) => (
          <li key={item.key} className={`ie-takeoff-readiness-item eos-checklist-item${item.complete ? " is-done" : ""}`}>
            <span className="ie-takeoff-readiness-mark eos-checklist-mark" aria-hidden>{item.complete ? "✓" : "○"}</span>
            <span>{item.label}</span>
            {item.detail ? <span className="muted small">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </EosSectionCard>
  );
}
