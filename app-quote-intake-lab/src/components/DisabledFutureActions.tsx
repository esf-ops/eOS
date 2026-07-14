const ACTIONS = [
  { id: "classify", label: "Run AI classification", phase: "Phase 3" },
  { id: "takeoff", label: "Run takeoff", phase: "Phase 4" },
  { id: "missing", label: "Request missing information", phase: "Phase 7" },
  { id: "review-takeoff", label: "Review takeoff", phase: "Phase 4–5" },
  { id: "approve", label: "Approve lab quote", phase: "Phase 8" },
  { id: "promote", label: "Promote to Quote Library", phase: "Phase 10" },
  { id: "send", label: "Send response", phase: "Phase 8–9" }
] as const;

export default function DisabledFutureActions() {
  return (
    <section className="qil-actions" aria-label="Future actions (disabled)">
      <div className="qil-section-title">
        <h3>Future actions</h3>
        <p>Visible for workflow validation only — all disabled in Phase 1.</p>
      </div>
      <div className="qil-actions-grid">
        {ACTIONS.map((action) => (
          <button key={action.id} type="button" className="qil-action-btn" disabled title={`${action.phase} — not available`}>
            <span>{action.label}</span>
            <small>{action.phase} · disabled</small>
          </button>
        ))}
      </div>
    </section>
  );
}
