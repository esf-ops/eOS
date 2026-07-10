import { BRAND } from "../lib/kioskConfig";

interface KioskIdleOverlayProps {
  active: boolean;
}

/**
 * A brief, elegant curtain shown while the kiosk returns to the home attract
 * screen after inactivity — replaces an abrupt reload with a soft fade.
 */
export function KioskIdleOverlay({ active }: KioskIdleOverlayProps) {
  return (
    <div
      className={`kiosk-idle-overlay${active ? " kiosk-idle-overlay--active" : ""}`}
      aria-hidden={!active}
    >
      <div className="kiosk-idle-inner">
        <span className="kiosk-idle-mark" aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M4 14.5 12 19l8-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="kiosk-idle-name">{BRAND.showroomName}</p>
      </div>
    </div>
  );
}
