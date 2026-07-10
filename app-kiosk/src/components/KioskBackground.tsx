/**
 * Ambient premium showroom backdrop.
 *
 * Layer order (bottom → top):
 *   1. ESF facility aerial photo  — blurred, home-only, very slow zoom
 *   2. Facility wash               — graduated porcelain overlay for readability
 *   3. Ambient orbs                — red/gold glow accents
 *   4. Stone veining               — faint directional texture sweep
 *   5. Grain                       — micro noise for material warmth
 *
 * The facility photo and wash are hidden on section views via
 * [data-view="home"] CSS selector — no JS required.
 * All motion effects respect prefers-reduced-motion.
 */
export function KioskBackground() {
  return (
    <div className="kiosk-bg" aria-hidden>
      {/* Facility aerial — home-only environmental background */}
      <div className="kiosk-bg-facility" />
      <div className="kiosk-bg-facility-wash" />

      <div className="kiosk-bg-orb kiosk-bg-orb-1" />
      <div className="kiosk-bg-orb kiosk-bg-orb-2" />
      <div className="kiosk-bg-orb kiosk-bg-orb-3" />
      <div className="kiosk-bg-orb kiosk-bg-orb-4" />
      <div className="kiosk-bg-veins" />
      <div className="kiosk-bg-grain" />
    </div>
  );
}
