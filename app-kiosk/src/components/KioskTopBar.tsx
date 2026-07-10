import { BRAND } from "../lib/kioskConfig";

interface KioskTopBarProps {
  /** Section title shown to the right of the brand. Omit on home. */
  sectionTitle?: string;
  /** Home button handler. Omit to hide the button (e.g. already on home). */
  onHome?: () => void;
}

/**
 * ESF logo image — sourced from /public/esf-logo.png (500×150 RGBA PNG).
 * Copied from app-quote/src/lib/customerEstimate/assets/esf-horizontal-logo.png.
 * Falls back gracefully to the text brand if the image fails to load.
 */
function EsfLogo({ large }: { large?: boolean }) {
  return (
    <div className={`kiosk-esf-logo${large ? " kiosk-esf-logo--large" : ""}`}>
      <img
        src="/esf-logo.png"
        alt="Elite Stone Fabrication"
        draggable={false}
        onError={(e) => {
          // If the PNG fails, show the text fallback by hiding the img.
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const fallback = e.currentTarget.nextElementSibling;
          if (fallback) (fallback as HTMLElement).style.display = "flex";
        }}
      />
      {/* Text fallback — hidden when PNG loads, shown on error. */}
      <span className="kiosk-esf-logo-fallback" style={{ display: "none" }}>
        <span className="kiosk-brand-mark" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M4 14.5 12 19l8-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="kiosk-brand-name">Elite Stone Fabrication</span>
      </span>
    </div>
  );
}

export function KioskTopBar({ sectionTitle, onHome }: KioskTopBarProps) {
  const isHome = !sectionTitle && !onHome;

  return (
    <header className="kiosk-topbar">
      <div className="kiosk-brand">
        <EsfLogo large={isHome} />
        <span className="kiosk-brand-sub">{BRAND.poweredBy}</span>
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
            <path d="M4 11.5 12 5l8 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 10.5V19h12v-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Home</span>
        </button>
      ) : null}
    </header>
  );
}
