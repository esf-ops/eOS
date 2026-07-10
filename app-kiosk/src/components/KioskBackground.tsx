/**
 * Ambient premium showroom backdrop — soft stone gradient, drifting orbs, and a
 * faint grain. Purely decorative. Respects prefers-reduced-motion via CSS.
 */
export function KioskBackground() {
  return (
    <div className="kiosk-bg" aria-hidden>
      <div className="kiosk-bg-orb kiosk-bg-orb-1" />
      <div className="kiosk-bg-orb kiosk-bg-orb-2" />
      <div className="kiosk-bg-orb kiosk-bg-orb-3" />
      <div className="kiosk-bg-veins" />
      <div className="kiosk-bg-grain" />
    </div>
  );
}
