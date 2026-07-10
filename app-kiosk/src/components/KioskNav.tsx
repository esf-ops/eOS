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
 * Live Inventory card: full-bleed stone rotator.
 * Leads with visually striking stones (not black) so the first impression
 * communicates premium inventory. Bold veining and warm tones read as
 * "real slabs" rather than "color chips" — distinct from the Elite 100 strip.
 * No inventory counts, slab IDs, pricing, or internal metadata exposed.
 */
const SLAB_IMAGES = [
  "/stone/carrara-royale.jpg",      // bold white veining — immediately premium
  "/stone/suede-brown-polished.jpg",// warm earthy luxury
  "/stone/silver-pearl-polished.jpg",// elegant metallic
  "/stone/sicilia.jpg",             // exotic and dramatic
  "/stone/india-black-pearl-polished.jpg", // bold black — shown later in cycle
];

/**
 * Product Catalog card: real Blanco product photography (hero shots).
 * Left panel: sinks on neutral studio background — professional catalog feel.
 * Right panel: faucet product shots on white — clear "accessories" read.
 * No prices, product IDs, or inventory data.
 * Source: app-slab-inventory/public/product-catalog/
 */
const CATALOG_SINKS = [
  "/catalog/sink-hero-a.jpg", // Precis 24" single bowl — clean studio shot
  "/catalog/sink-hero-b.jpg", // Diamond 60/40 double bowl
  "/catalog/sink-hero-c.jpg", // Precis 30" single bowl
];
const CATALOG_FAUCETS = [
  "/catalog/faucet-black.png",     // matte black — bold accent finish
  "/catalog/faucet-stainless.png", // stainless — classic finish
];

/**
 * Visualizer card: single real kitchen photo, no split.
 * classic-kitchen.jpg is real photography (1280x852) with visible countertops.
 * One clean image reads more intentionally than a forced side-by-side split.
 */
const ROOM_IMAGES = ["/rooms/classic-kitchen.jpg"];

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
 * Live Inventory card: full-bleed stone rotator.
 * One dramatic stone surface fills the entire card art area at a time —
 * completely different visual language from the Elite 100 horizontal strip.
 * Reads as "browse real slabs" rather than "browse color chips."
 * Leads with high-contrast, visually striking stones; black appears later.
 */
function SlabInventoryRotator() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--inventory" aria-hidden>
      <KioskCardMediaRotator
        images={SLAB_IMAGES}
        intervalMs={5000}
        objectPosition="center"
        label="Premium stone slab"
      />
    </div>
  );
}

/**
 * Product Catalog card: sink hero (left) + faucet product shot (right).
 * Left panel: professional Blanco sink photography on neutral studio bg —
 *   "object-fit: cover" crops to show the bowl face-on.
 * Right panel: faucet PNG on white bg with "object-fit: contain" so the
 *   full fixture silhouette is always visible, like a real catalog page.
 * Two distinct product types visible simultaneously = "catalog" reads clearly.
 */
function CatalogCollage() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--catalog" aria-hidden>
      <div className="kiosk-collage-panel kiosk-collage-panel--wide">
        <KioskCardMediaRotator
          images={CATALOG_SINKS}
          intervalMs={6000}
          objectPosition="center 30%"
          label="Sink product photo"
        />
      </div>
      <div className="kiosk-collage-divider" aria-hidden />
      <div className="kiosk-collage-panel kiosk-collage-panel--narrow kiosk-collage-panel--product">
        <KioskCardMediaRotator
          images={CATALOG_FAUCETS}
          intervalMs={9000}
          objectFit="contain"
          objectPosition="center"
          label="Faucet product photo"
        />
      </div>
    </div>
  );
}

/**
 * Visualizer card: single real kitchen photo, full-bleed.
 * No split — one clean, premium kitchen read is more intentional than a
 * forced side-by-side composition with mismatched styles.
 * Crop at "center 38%" keeps countertops and island in frame.
 * "Visualize" badge reinforces the interactive CTA.
 */
function VisualizerPhoto() {
  return (
    <div className="kiosk-card-art kiosk-card-art--photo kiosk-card-art--visualizer" aria-hidden>
      <KioskCardMediaRotator
        images={ROOM_IMAGES}
        intervalMs={8000}
        objectPosition="center 38%"
        label="Kitchen showroom"
      />
      <span className="kiosk-card-art-badge" aria-hidden>Visualize</span>
    </div>
  );
}

function CardArt({ accent }: { accent: KioskSection["accent"] }) {
  if (accent === "stone") return <StoneSwatchStrip />;
  if (accent === "catalog") return <CatalogCollage />;
  if (accent === "inventory") return <SlabInventoryRotator />;
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
