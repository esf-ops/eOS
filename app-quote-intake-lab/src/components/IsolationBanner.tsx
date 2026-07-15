type Props = {
  /** Queue default, or takeoff workspace simulated/live provenance. */
  variant?: "default" | "takeoff" | "takeoff-simulated" | "takeoff-live";
};

export default function IsolationBanner({ variant = "default" }: Props) {
  const takeoffSimulated = variant === "takeoff" || variant === "takeoff-simulated";
  const takeoffLive = variant === "takeoff-live";
  const takeoff = takeoffSimulated || takeoffLive;

  return (
    <div
      className={`qil-isolation${takeoff ? " is-takeoff" : ""}${takeoffLive ? " is-takeoff-live" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="qil-isolation-mark">LAB</div>
      <div className="qil-isolation-copy">
        {takeoffLive ? (
          <>
            <strong>Live Gemini takeoff</strong>
            <span>
              Isolated loopback only · Approved synthetic fixtures only · Attachment bytes sent only after
              acknowledgment + Run · No production connection · No pricing · No Internal Estimate / Quote
              Library
            </span>
          </>
        ) : takeoffSimulated ? (
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
