import EosPanelHead from "../../../../shared/eliteos-ui/EosPanelHead";
import EosSectionCard from "../../../../shared/eliteos-ui/EosSectionCard";
import React from "react";

export interface TakeoffImportChecklistItem {
  key: string;
  label: string;
  complete: boolean;
  detail?: string;
}

interface Props {
  items: TakeoffImportChecklistItem[];
  score: number;
  readyToCalculate: boolean;
  addonsReviewed: boolean;
  onMarkAddonsReviewed: (reviewed: boolean) => void;
  onMarkNotesReviewed: (reviewed: boolean) => void;
  notesReviewed: boolean;
  suggestedAddOnCount: number;
}

export default function TakeoffImportCompletionChecklist({
  items,
  score,
  readyToCalculate,
  addonsReviewed,
  onMarkAddonsReviewed,
  onMarkNotesReviewed,
  notesReviewed,
  suggestedAddOnCount,
}: Props) {
  return (
    <EosSectionCard className="ie-takeoff-checklist eos-takeoff-panel">
      <EosPanelHead
        title="Import completion checklist"
        status={`${score}% · ${readyToCalculate ? "Ready to calculate" : "Complete required fields"}`}
        statusTone={readyToCalculate ? "success" : "warn"}
      />
      <ul className="ie-takeoff-checklist-list eos-checklist-list">
        {items.map((item) => (
          <li key={item.key} className={`ie-takeoff-checklist-item eos-checklist-item${item.complete ? " is-done" : ""}`}>
            <span className="ie-takeoff-checklist-mark eos-checklist-mark" aria-hidden>{item.complete ? "✓" : "○"}</span>
            <span className="ie-takeoff-checklist-label">{item.label}</span>
            {item.detail ? <span className="muted small">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
      {suggestedAddOnCount > 0 ? (
        <label className="ie-takeoff-checklist-ack">
          <input type="checkbox" checked={addonsReviewed} onChange={(e) => onMarkAddonsReviewed(e.target.checked)} />
          I reviewed suggested cutouts/add-ons from the takeoff ({suggestedAddOnCount})
        </label>
      ) : null}
      <label className="ie-takeoff-checklist-ack">
        <input type="checkbox" checked={notesReviewed} onChange={(e) => onMarkNotesReviewed(e.target.checked)} />
        Customer notes reviewed
      </label>
    </EosSectionCard>
  );
}
