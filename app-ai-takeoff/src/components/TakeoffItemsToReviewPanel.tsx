import EosSectionCard from "@eliteos-ui/EosSectionCard";
import React from "react";
import {
  REVIEW_GROUP_LABELS,
  REVIEW_GROUP_ORDER,
  groupReviewItems,
  totalReviewItemCount,
  type ReviewItemGroup,
} from "../lib/takeoffWorkflowUi";
import type { ApprovalBlocker } from "./TakeoffImportReadinessPanel";

interface SuggestedAddOn {
  label: string;
  reviewRequired?: boolean;
}

interface Props {
  blockers: ApprovalBlocker[];
  suggestedAddOns?: SuggestedAddOn[];
}

export default function TakeoffItemsToReviewPanel({ blockers, suggestedAddOns = [] }: Props) {
  const grouped = groupReviewItems(blockers, suggestedAddOns);
  const total = totalReviewItemCount(grouped);

  return (
    <EosSectionCard className="takeoff-items-review lab-card" id="takeoff-items-to-review">
      <h3 className="takeoff-items-review-title">Items to review</h3>

      {total === 0 ? (
        <p className="takeoff-items-review-empty">No blockers. Ready to approve.</p>
      ) : (
        <div className="takeoff-items-review-groups">
          {REVIEW_GROUP_ORDER.map((groupKey: ReviewItemGroup) => {
            const items = grouped[groupKey];
            if (items.length === 0) return null;
            return (
              <div key={groupKey} className="takeoff-items-review-group">
                <div className="takeoff-items-review-group-label">{REVIEW_GROUP_LABELS[groupKey]}</div>
                <ul className="takeoff-items-review-list">
                  {items.map((item, i) => (
                    <li key={`${groupKey}-${item.code ?? i}`}>{item.message}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </EosSectionCard>
  );
}
