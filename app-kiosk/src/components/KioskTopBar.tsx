import { BRAND } from "../lib/kioskConfig";

interface KioskTopBarProps {
  /** Section title shown to the right of the brand. Omit on home. */
  sectionTitle?: string;
  /** Home button handler. Omit to hide the button (e.g. already on home). */
  onHome?: () => void;
}

function BrandMark() {
  return (
    <span className="kiosk-brand-mark" aria-hidden>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M4 14.5 12 19l8-4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function KioskTopBar({ sectionTitle, onHome }: KioskTopBarProps) {
  return (
    <header className="kiosk-topbar">
      <div className="kiosk-brand">
        <BrandMark />
        <span className="kiosk-brand-text">
          <span className="kiosk-brand-name">{BRAND.showroomName}</span>
          <span className="kiosk-brand-sub">{BRAND.poweredBy}</span>
        </span>
      </div>

      {sectionTitle ? (
        <div className="kiosk-topbar-section" aria-live="polite">
          <span className="kiosk-topbar-divider" aria-hidden />
          <span className="kiosk-topbar-section-title">{sectionTitle}</span>
        </div>
      ) : null}

      {onHome ? (
        <button type="button" className="kiosk-home-btn" onClick={onHome}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 11.5 12 5l8 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6 10.5V19h12v-8.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Home</span>
        </button>
      ) : null}
    </header>
  );
}
