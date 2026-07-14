import { FIXTURE_DATA_NOTICE } from "../fixtures/quoteIntakeCases.mjs";

export default function IsolationBanner() {
  return (
    <div className="qil-isolation" role="status" aria-live="polite">
      <div className="qil-isolation-mark">LAB</div>
      <div className="qil-isolation-copy">
        <strong>Quote Intake Lab</strong>
        <span>{FIXTURE_DATA_NOTICE}</span>
      </div>
    </div>
  );
}
