import { BRAND } from "../lib/kioskConfig";

interface KioskFooterProps {
  showroomSlug: string;
  /** Optional home handler; when present renders a Home utility button. */
  onHome?: () => void;
}

/** Bottom utility row: home affordance, help line, and showroom label. */
export function KioskFooter({ showroomSlug, onHome }: KioskFooterProps) {
  return (
    <footer className="kiosk-footer">
      <div className="kiosk-footer-left">
        {onHome ? (
          <button type="button" className="kiosk-footer-home" onClick={onHome}>
            Home
          </button>
        ) : (
          <span className="kiosk-footer-home kiosk-footer-home--static">Home</span>
        )}
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
