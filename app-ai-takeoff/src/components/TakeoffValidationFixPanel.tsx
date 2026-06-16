/**
 * TakeoffValidationFixPanel — one-click fixes for common approval blockers.
 *
 * Currently supports cutout-like labels misplaced in area.exclusions[].
 */
import React, { useMemo } from "react";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffValidationResult } from "@takeoff-core/takeoffValidator.mjs";
import {
  applyCutoutExclusionFix,
  listFixableValidationIssues,
} from "@takeoff-core/takeoffValidationFixes.mjs";

type CutoutExclusionFixAction = "move_to_cutouts" | "move_to_notes" | "remove";

export interface TakeoffValidationFixPanelProps {
  editDraft: TakeoffResult;
  validation: TakeoffValidationResult;
  onApplyDraft: (draft: TakeoffResult) => void;
}

export default function TakeoffValidationFixPanel({
  editDraft,
  validation,
  onApplyDraft,
}: TakeoffValidationFixPanelProps) {
  const issues = useMemo(
    () => listFixableValidationIssues(editDraft, validation),
    [editDraft, validation]
  );

  if (issues.length === 0) return null;

  const applyFix = (issue: (typeof issues)[number], action: CutoutExclusionFixAction) => {
    const next = applyCutoutExclusionFix(editDraft, issue, action);
    onApplyDraft(next);
  };

  return (
    <div className="validation-fix-panel lab-card">
      <div className="validation-fix-header">
        <h3 className="validation-fix-title">Fix validation issues</h3>
        <p className="validation-fix-desc">
          These blockers can be corrected here without editing raw JSON. After applying a fix,
          totals recompute automatically — save your reviewed draft before approving.
        </p>
      </div>
      <ul className="validation-fix-list">
        {issues.map((issue) => (
          <li key={issue.id} className="validation-fix-item">
            <div className="validation-fix-item-main">
              <span className="validation-fix-item-title">{issue.title}</span>
              <span className="validation-fix-item-path">{issue.path}</span>
              <p className="validation-fix-item-message">{issue.message}</p>
            </div>
            <div className="validation-fix-actions">
              <button
                type="button"
                className="btn secondary validation-fix-btn"
                onClick={() => applyFix(issue, "move_to_cutouts")}
              >
                Move to cutouts
              </button>
              <button
                type="button"
                className="btn secondary validation-fix-btn"
                onClick={() => applyFix(issue, "move_to_notes")}
              >
                Move to notes
              </button>
              <button
                type="button"
                className="btn secondary validation-fix-btn"
                onClick={() => applyFix(issue, "remove")}
              >
                Remove from exclusions
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
