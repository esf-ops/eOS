import { KIOSK_SECTIONS, type KioskSection } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskNavProps {
  onNavigate: (section: NavSectionId) => void;
}

/** Abstract, image-free artwork per section — pure CSS/SVG, safe & lightweight. */
function CardArt({ accent }: { accent: KioskSection["accent"] }) {
  if (accent === "stone") {
    return (
      <div className="kiosk-card-art kiosk-card-art--stone" aria-hidden>
        <span className="swatch swatch-1" />
        <span className="swatch swatch-2" />
        <span className="swatch swatch-3" />
        <span className="swatch swatch-4" />
      </div>
    );
  }
  if (accent === "catalog") {
    return (
      <div className="kiosk-card-art kiosk-card-art--catalog" aria-hidden>
        <svg viewBox="0 0 120 80" fill="none" preserveAspectRatio="xMidYMid meet">
          <rect x="14" y="40" width="44" height="26" rx="8" stroke="currentColor" strokeWidth="2.4" />
          <path d="M22 40c0-9 6-15 14-15s14 6 14 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M78 20v26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M78 20c9 0 16 5 16 12h-16" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          <rect x="72" y="56" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </div>
    );
  }
  if (accent === "inventory") {
    return (
      <div className="kiosk-card-art kiosk-card-art--inventory" aria-hidden>
        <span className="slab slab-1" />
        <span className="slab slab-2" />
        <span className="slab slab-3" />
      </div>
    );
  }
  return (
    <div className="kiosk-card-art kiosk-card-art--visualizer" aria-hidden>
      <svg viewBox="0 0 120 80" fill="none" preserveAspectRatio="xMidYMid meet">
        <rect x="16" y="16" width="88" height="48" rx="10" stroke="currentColor" strokeWidth="2.4" />
        <path d="M16 50l22-18 18 14 14-12 34 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="46" cy="32" r="6" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    </div>
  );
}

export function KioskNav({ onNavigate }: KioskNavProps) {
  return (
    <nav className="kiosk-cards" aria-label="Showroom categories">
      {KIOSK_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`kiosk-card kiosk-card--${section.accent}`}
          onClick={() => onNavigate(section.slug)}
        >
          <CardArt accent={section.accent} />
          <span className="kiosk-card-body">
            <span className="kiosk-card-title">{section.title}</span>
            <span className="kiosk-card-copy">{section.cardCopy}</span>
          </span>
          <span className="kiosk-card-cue" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      ))}
    </nav>
  );
}
