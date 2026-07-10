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
 * Elite 100 card: light→warm→dark strip — shows tonal range at a glance.
 * From app-visualizer/public/material-textures/elite100/thumb/
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
 * Live Inventory card: premium/dramatic stones that read as "Group E/F" quality.
 * Ordered dark→warm→metallic→bold-white so adjacent swatches contrast strongly.
 * No inventory counts, slab IDs, pricing, or internal metadata exposed.
 */
const PREMIUM_SLAB_SWATCHES = [
  "/stone/india-black-pearl-polished.jpg",
  "/stone/sicilia.jpg",
  "/stone/suede-brown-polished.jpg",
  "/stone/silver-pearl-polished.jpg",
  "/stone/carrara-royale.jpg",
];

/**
 * Product Catalog card: "installed" sink-in-countertop photos.
 * Split into two interleaved sets so the two collage panels crossfade
 * at different intervals — left and right sides never change simultaneously.
 * From app-slab-inventory/public/product-catalog/sinks/installed.jpg files.
 * No prices, product IDs, or inventory data.
 */
const CATALOG_LEFT = ["/catalog/sink-a.jpg", "/catalog/sink-c.jpg"];
const CATALOG_RIGHT = ["/catalog/sink-b.jpg", "/catalog/sink-d.jpg"];

/**
 * Visualizer card: two different kitchen styles shown side-by-side.
 * This "split" composition reads immediately as "see it different ways."
 * From app-visualizer/public/demo-rooms/
 */
const ROOM_LEFT = "/rooms/classic-kitchen.jpg";
const ROOM_RIGHT = "/rooms/modern-kitchen.jpg";

// ── Card artwork ─────────────────────────────────────────────────────────────

/** Elite 100 card: 6 stone swatches in a horizontal strip. */
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
 * Live Inventory card: 5 premium dramatic stones shown as a swatch strip.
 * Immediately shows variety — no black rectangle, no waiting for rotation.
 * Dark, exotic, warm, metallic, bold-white stones communicate premium value.
 */
function PremiumSlabStrip() {
  return (
    <div className="kiosk-card-art kiosk-card-art--stone kiosk-card-art--premium-slabs" aria-hidden>
      {PREMIUM_SLAB_SWATCHES.map((src) => (
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
 * Product Catalog card: two sink-in-countertop photos shown simultaneously.
 * Left panel (60%) and right panel (40%) crossfade independently on different
 * intervals so both sides are never changing at the same time.
 * "Product variety at a glance" — readable from across the showroom.
 */
function CatalogCollage() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--catalog" aria-hidden>
      <div className="kiosk-collage-panel kiosk-collage-panel--wide">
        <KioskCardMediaRotator
          images={CATALOG_LEFT}
          intervalMs={6000}
          objectPosition="center 28%"
          label="Sink preview left"
        />
      </div>
      <div className="kiosk-collage-divider" aria-hidden />
      <div className="kiosk-collage-panel kiosk-collage-panel--narrow">
        <KioskCardMediaRotator
          images={CATALOG_RIGHT}
          intervalMs={8500}
          objectPosition="center 32%"
          label="Sink preview right"
        />
      </div>
    </div>
  );
}

/**
 * Visualizer card: two kitchen rooms side by side.
 * The split composition reads immediately as "compare different styles" —
 * the core idea of the visualizer tool.
 * The red "Visualize" badge reinforces the interactive CTA.
 */
function VisualizerRoomPair() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--visualizer" aria-hidden>
      <div className="kiosk-collage-panel">
        <KioskCardMediaRotator
          images={[ROOM_LEFT]}
          objectPosition="center 38%"
          label="Classic kitchen"
        />
      </div>
      <div className="kiosk-collage-divider kiosk-collage-divider--vivid" aria-hidden />
      <div className="kiosk-collage-panel">
        <KioskCardMediaRotator
          images={[ROOM_RIGHT]}
          objectPosition="center 42%"
          label="Modern kitchen"
        />
      </div>
      <span className="kiosk-card-art-badge" aria-hidden>Visualize</span>
    </div>
  );
}

function CardArt({ accent }: { accent: KioskSection["accent"] }) {
  if (accent === "stone") return <StoneSwatchStrip />;
  if (accent === "catalog") return <CatalogCollage />;
  if (accent === "inventory") return <PremiumSlabStrip />;
  return <VisualizerRoomPair />;
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
