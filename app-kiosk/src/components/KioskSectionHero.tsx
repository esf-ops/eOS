import type { ReactNode } from "react";
import type { KioskSection } from "../lib/kioskConfig";

interface KioskSectionHeroProps {
  section: KioskSection;
  /** Primary action; omitted when the section has nothing to open yet. */
  onPrimary?: () => void;
  primaryLabel?: string;
  /** Optional secondary action (e.g. phone handoff already shown as QR). */
  note?: string;
  /** Extra content (e.g. a QR handoff panel). */
  children?: ReactNode;
}

/**
 * Polished, full-screen presentation panel for a section landing. Used both as
 * the "Open section" launchpad for iframe-backed sections and as the standalone
 * panel when no destination URL is configured yet.
 */
export function KioskSectionHero({
  section,
  onPrimary,
  primaryLabel,
  note,
  children,
}: KioskSectionHeroProps) {
  return (
    <div className={`kiosk-hero kiosk-hero--${section.accent}`}>
      <div className="kiosk-hero-main">
        <p className="kiosk-hero-eyebrow">Elite Stone Showroom</p>
        <h2 className="kiosk-hero-title">{section.title}</h2>
        <p className="kiosk-hero-copy">{section.heroCopy}</p>

        {onPrimary ? (
          <button type="button" className="kiosk-btn kiosk-btn--primary" onClick={onPrimary}>
            {primaryLabel ?? section.actionLabel}
          </button>
        ) : (
          <p className="kiosk-hero-soon">Coming soon to this showroom.</p>
        )}

        {note ? <p className="kiosk-hero-note">{note}</p> : null}
      </div>

      {children ? <div className="kiosk-hero-aside">{children}</div> : null}
    </div>
  );
}
