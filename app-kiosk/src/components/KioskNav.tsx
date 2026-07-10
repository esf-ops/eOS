import { KIOSK_SECTIONS, type KioskSection } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskCardMediaRotator } from "./KioskCardMediaRotator";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskNavProps {
  onNavigate: (section: NavSectionId) => void;
}

// ── Asset lists ─────────────────────────────────────────────────────────────
// All assets are static files copied into app-kiosk/public — no API calls.

/**
 * Real stone texture thumbnails from app-visualizer/public/material-textures/elite100/thumb/
 * Ordered light→dark→warm→cool for visual variety across the strip.
 */
const STONE_SWATCHES = [
  "/stone/white-dove.jpg",
  "/stone/bianco-carrara.jpg",
  "/stone/carrara-royale.jpg",
  "/stone/classic-gray.jpg",
  "/stone/suede-brown-polished.jpg",
  "/stone/india-black-pearl-polished.jpg",
];

/**
 * "Installed" sink-in-countertop photos from app-slab-inventory public product-catalog sinks.
 * These show real products in context - no prices, IDs, or counts.
 */
const CATALOG_IMAGES = [
  "/catalog/sink-a.jpg",
  "/catalog/sink-b.jpg",
  "/catalog/sink-c.jpg",
  "/catalog/sink-d.jpg",
];

/**
 * Elite 100 stone thumbnails reused as slab/remnant stand-ins.
 * Ordered for dramatic contrast: black → gray → beige → white → warm.
 * No inventory counts, slab IDs, pricing, or internal metadata exposed.
 */
const SLAB_IMAGES = [
  "/stone/india-black-pearl-polished.jpg",
  "/stone/classic-gray.jpg",
  "/stone/antique-gray.jpg",
  "/stone/bayshore-sand.jpg",
  "/stone/sicilia.jpg",
  "/stone/silver-pearl-polished.jpg",
  "/stone/carrara-classic.jpg",
  "/stone/white-dove.jpg",
];

/**
 * Kitchen demo-room photos from app-visualizer/public/demo-rooms/
 * Public-safe: they ship with the visualizer app already.
 */
const ROOM_IMAGES = [
  "/rooms/classic-kitchen.jpg",
  "/rooms/modern-kitchen.jpg",
];

// ── Card artwork ─────────────────────────────────────────────────────────────

/** Static stone swatch strip for Elite 100 card — no cycling needed. */
function StoneSwatchStrip() {
  return (
    <div className="kiosk-card-art kiosk-card-art--stone" aria-hidden>
      {STONE_SWATCHES.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          className="kiosk-stone-swatch"
          loading="eager"
          draggable={false}
        />
      ))}
    </div>
  );
}

function CardArt({ accent }: { accent: KioskSection["accent"] }) {
  if (accent === "stone") {
    return <StoneSwatchStrip />;
  }

  if (accent === "catalog") {
    return (
      <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--catalog" aria-hidden>
        <KioskCardMediaRotator
          images={CATALOG_IMAGES}
          intervalMs={5000}
          objectPosition="center 40%"
          label="Sink and faucet preview"
        />
      </div>
    );
  }

  if (accent === "inventory") {
    return (
      <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--inventory" aria-hidden>
        <KioskCardMediaRotator
          images={SLAB_IMAGES}
          intervalMs={4000}
          objectPosition="center"
          label="Stone slab preview"
        />
      </div>
    );
  }

  // "visualizer"
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--visualizer" aria-hidden>
      <KioskCardMediaRotator
        images={ROOM_IMAGES}
        intervalMs={6000}
        objectPosition="center 55%"
        label="Kitchen room preview"
      />
      {/* Small "Visualize" accent badge */}
      <span className="kiosk-card-art-badge" aria-hidden>Visualize</span>
    </div>
  );
}

// ── Nav grid ─────────────────────────────────────────────────────────────────

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
