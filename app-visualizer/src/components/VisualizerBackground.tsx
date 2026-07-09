/**
 * Ambient premium backdrop — soft gradient orbs + subtle grain.
 * Purely decorative; no interaction, no data.
 */
export function VisualizerBackground() {
  return (
    <div className="viz-bg" aria-hidden>
      <div className="viz-bg-orb viz-bg-orb-1" />
      <div className="viz-bg-orb viz-bg-orb-2" />
      <div className="viz-bg-orb viz-bg-orb-3" />
      <div className="viz-bg-grain" />
    </div>
  );
}
