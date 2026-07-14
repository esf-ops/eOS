const ACTIONS = [
  { id: "missing", label: "Request missing information", phase: "Phase 7" },
  { id: "accept-takeoff", label: "Accept takeoff snapshot", phase: "Phase 4B.3" },
  { id: "approve", label: "Approve lab quote", phase: "Phase 8" },
  { id: "promote", label: "Promote to Quote Library", phase: "Phase 10" },
  { id: "send", label: "Send response", phase: "Phase 8–9" }
] as const;

export default function DisabledFutureActions() {
  return (
    <section className="qil-actions qil-actions-muted" aria-label="Future actions (disabled placeholders)">
      <details className="qil-actions-details">
        <summary>
          Future actions <span>(placeholders · disabled)</span>
        </summary>
        <p className="qil-actions-help">Workflow placeholders only. No production action is available in Phase 1.</p>
        <div className="qil-actions-grid">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="qil-action-btn"
              disabled
              title={`${action.phase} — not available`}
            >
              <span>{action.label}</span>
              <small>{action.phase}</small>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
