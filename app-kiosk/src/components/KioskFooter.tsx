import { BRAND } from "../lib/kioskConfig";

interface KioskFooterProps {
  showroomSlug: string;
  /** When provided, renders an active Home button. Omit on the home page itself. */
  onHome?: () => void;
}

/** Bottom utility row: optional home button, help line, showroom label. */
export function KioskFooter({ showroomSlug, onHome }: KioskFooterProps) {
  return (
    <footer className="kiosk-footer">
      {/* Left slot: Home button on section pages; empty spacer on home page
          so the center help text stays visually centered. */}
      <div className="kiosk-footer-left">
        {onHome ? (
          <button type="button" className="kiosk-footer-home" onClick={onHome}>
            Home
          </button>
        ) : null}
      </div>

      <p className="kiosk-footer-help">{BRAND.helpLine}</p>

      <div className="kiosk-footer-right">
        <span className="kiosk-footer-slug">
          {BRAND.fabricationName} · {showroomSlug}
        </span>
      </div>
    </footer>
  );
}
