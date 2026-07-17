import React from "react";

type Props = {
  caseId: string;
  onBackToQueue: () => void;
};

/**
 * Milestone 1 placeholder — routes from Open Estimate without building takeoff/pricing.
 */
export default function EstimateWorkspacePlaceholder({ caseId, onBackToQueue }: Props) {
  return (
    <div className="eq-workspace" data-testid="estimate-workspace-placeholder">
      <header className="eq-header">
        <div>
          <h1 className="eq-title">Estimate workspace</h1>
          <p className="eq-subtitle">
            Placeholder for case <code>{caseId}</code>. AI Takeoff, pricing, and Digital Estimate
            publishing are intentionally not built yet.
          </p>
        </div>
        <div className="eq-header-actions">
          <button type="button" className="eq-btn-secondary" onClick={onBackToQueue}>
            Back to Estimate Queue
          </button>
        </div>
      </header>
      <div className="eq-state" role="status">
        <p>
          This case is ready for a future estimate workspace. Use the Estimate Queue to sync the inbox,
          inspect intake status, and open cases from here.
        </p>
      </div>
    </div>
  );
}
