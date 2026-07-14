type Props = {
  /** When takeoff review workspace is open — reinforce simulated boundaries. */
  variant?: "default" | "takeoff";
};

export default function IsolationBanner({ variant = "default" }: Props) {
  const takeoff = variant === "takeoff";
  return (
    <div className={`qil-isolation${takeoff ? " is-takeoff" : ""}`} role="status" aria-live="polite">
      <div className="qil-isolation-mark">LAB</div>
      <div className="qil-isolation-copy">
        {takeoff ? (
          <>
            <strong>Simulated takeoff · attachment contents not read</strong>
            <span>No production connection · no Gemini · no pricing · no Internal Estimate / Quote Library</span>
          </>
        ) : (
          <>
            <strong>Quote Intake Lab · fixture data only</strong>
            <span>Not connected to production · no live email, takeoff, pricing, or Quote Library</span>
          </>
        )}
      </div>
    </div>
  );
}
