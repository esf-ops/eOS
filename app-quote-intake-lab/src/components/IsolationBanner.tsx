export default function IsolationBanner() {
  return (
    <div className="qil-isolation" role="status" aria-live="polite">
      <div className="qil-isolation-mark">LAB</div>
      <div className="qil-isolation-copy">
        <strong>Quote Intake Lab · fixture data only</strong>
        <span>Not connected to production · no live email, takeoff, pricing, or Quote Library</span>
      </div>
    </div>
  );
}
