interface KioskFooterProps {
  /** When provided, renders the Home button. Omit on the home page itself. */
  onHome?: () => void;
}

/**
 * Bottom utility row.
 *
 * On section pages: renders the Home pill button (same visual style as the
 * former top-right Home button — white pill, home icon, Elite red accent).
 * On the home page (onHome omitted): renders nothing.
 *
 * Removed: "Need help?" helper text, showroom slug label.
 * These were unnecessary UI clutter on a 65-inch touchscreen kiosk.
 */
export function KioskFooter({ onHome }: KioskFooterProps) {
  if (!onHome) return null;

  return (
    <footer className="kiosk-footer kiosk-footer--section">
      <button type="button" className="kiosk-home-btn kiosk-home-btn--footer" onClick={onHome}>
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
    </footer>
  );
}
