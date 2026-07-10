import { KIOSK_SECTIONS, type KioskSection } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskNavProps {
  onNavigate: (section: NavSectionId) => void;
}

// ── Static card artwork ───────────────────────────────────────────────────────
// Every card is fully static — no timers, rotators, or continuous animation.
// All assets live in app-kiosk/public.

const STONE_SWATCHES = [
  "/stone/white-dove.jpg",
  "/stone/bianco-carrara.jpg",
  "/stone/carrara-royale.jpg",
  "/stone/classic-gray.jpg",
  "/stone/suede-brown-polished.jpg",
  "/stone/india-black-pearl-polished.jpg",
];

/** Elite 100 card: six-color static swatch strip showing tonal range. */
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

/**
 * Live Inventory card: single static premium slab surface.
 * Silver Pearl reads as real inventory — dramatic veining, polished finish.
 * No animation, no rotation.
 */
function SlabInventoryPhoto() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--inventory" aria-hidden>
      <img
        src="/stone/silver-pearl-polished.jpg"
        alt=""
        className="kiosk-static-img"
        loading="eager"
        draggable={false}
      />
      <span className="kiosk-rotator-veil" aria-hidden />
    </div>
  );
}

/**
 * Product Catalog card: one black sink (left) + one stainless faucet (right).
 * Static two-panel — no timers, no rotation, no crossfade.
 */
function CatalogCollage() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--catalog" aria-hidden>
      <div className="kiosk-collage-panel kiosk-collage-panel--wide">
        <img
          src="/catalog/sink-hero-a.jpg"
          alt=""
          className="kiosk-static-img"
          style={{ objectPosition: "center 30%" }}
          loading="eager"
          draggable={false}
        />
      </div>
      <div className="kiosk-collage-divider" aria-hidden />
      <div className="kiosk-collage-panel kiosk-collage-panel--narrow kiosk-collage-panel--product">
        <img
          src="/catalog/faucet-stainless.png"
          alt=""
          className="kiosk-static-img kiosk-static-img--contain"
          loading="eager"
          draggable={false}
        />
      </div>
    </div>
  );
}

/**
 * Visualizer card: single real kitchen photo, fully static.
 * Crop at center 38% keeps countertops and island in frame.
 */
function VisualizerPhoto() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--visualizer" aria-hidden>
      <img
        src="/rooms/classic-kitchen.jpg"
        alt=""
        className="kiosk-static-img"
        style={{ objectPosition: "center 38%" }}
        loading="eager"
        draggable={false}
      />
      <span className="kiosk-rotator-veil" aria-hidden />
      <span className="kiosk-card-art-badge" aria-hidden>Visualize</span>
    </div>
  );
}

function CardArt({ accent }: { accent: KioskSection["accent"] }) {
  if (accent === "stone")     return <StoneSwatchStrip />;
  if (accent === "catalog")   return <CatalogCollage />;
  if (accent === "inventory") return <SlabInventoryPhoto />;
  return <VisualizerPhoto />;
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
        </button>
      ))}
    </nav>
  );
}
