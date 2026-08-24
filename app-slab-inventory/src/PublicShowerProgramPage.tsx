import { useCallback, useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";
import { fetchPublicElite100Showroom } from "./lib/publicElite100Api";
import type { Elite100ShowroomItem } from "./lib/elite100ShowroomTypes";
import { isKioskOrArreyaMode } from "./lib/publicShowerProgramRoute";
import {
  SHOWER_INSPIRATION_PHOTOS,
  SHOWER_PROGRAM_BASES,
  SHOWER_PROGRAM_BENEFITS,
  SHOWER_PROGRAM_HERO_IMAGE,
  SHOWER_PROGRAM_OPTIONS,
  SHOWER_PROGRAM_PROCESS,
  SHOWER_WALL_GROUP_FILTERS,
  getShowerBase,
  type ShowerInspirationPhoto,
} from "./lib/showerProgram/showerProgramData";
import {
  SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL,
  SHOWER_PROGRAM_FLYER_PDF_URL,
} from "./lib/showerProgram/showerProgramDocuments";
import {
  buildElite100ColorLookup,
  filterShowerWallColors,
  resolveShowerWallColors,
  SHOWER_PROGRAM_WALL_COLORS,
  type ResolvedShowerWallColor,
} from "./lib/showerProgram/showerProgramWallColors";

type ShowerView =
  | { kind: "landing" }
  | { kind: "inspiration" }
  | { kind: "bases" }
  | { kind: "base-detail"; baseId: string }
  | { kind: "walls" }
  | { kind: "options" }
  | { kind: "process" }
  | { kind: "guide" }
  | { kind: "build-soon" };

function colorSwatchesLabel(colors: readonly string[]): string {
  return colors.join(" · ");
}

function formatDrainLabel(positions: string[]): string {
  if (positions.length === 1 && positions[0] === "Center") return "Center Drain";
  if (positions.includes("Left") && positions.includes("Right")) return "Left or Right Drain";
  return positions.join(" or ");
}

export default function PublicShowerProgramPage() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const [viewStack, setViewStack] = useState<ShowerView[]>([{ kind: "landing" }]);
  const [wallGroup, setWallGroup] = useState<"all" | "Promo" | "A" | "B" | "C">("all");
  const [elite100Data, setElite100Data] = useState<Awaited<ReturnType<typeof fetchPublicElite100Showroom>> | null>(null);
  const [elite100Busy, setElite100Busy] = useState(true);
  const [elite100Error, setElite100Error] = useState<string | null>(null);
  const [inspirationPhoto, setInspirationPhoto] = useState<ShowerInspirationPhoto | null>(null);
  const [wallLightboxItem, setWallLightboxItem] = useState<Elite100ShowroomItem | null>(null);

  const view = viewStack[viewStack.length - 1] ?? { kind: "landing" as const };

  const navigateTo = useCallback((next: ShowerView) => {
    setViewStack((stack) => [...stack, next]);
  }, []);

  const goBack = useCallback(() => {
    setViewStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }, []);

  const goHome = useCallback(() => {
    setViewStack([{ kind: "landing" }]);
  }, []);

  useEffect(() => {
    document.title = "Shower Program · Elite Stone Fabrication";

    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.setAttribute("name", "description");
      document.head.appendChild(desc);
    }
    desc.setAttribute(
      "content",
      "Elite Stone Fabrication Groutless Stone Shower Program — bases, wall collection, and installation process.",
    );
  }, []);

  useEffect(() => {
    let alive = true;
    setElite100Busy(true);
    setElite100Error(null);
    fetchPublicElite100Showroom()
      .then((payload) => {
        if (!alive) return;
        setElite100Data(payload);
      })
      .catch((e) => {
        if (!alive) return;
        setElite100Error(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setElite100Busy(false);
      });
    return () => { alive = false; };
  }, []);

  const wallColors = useMemo(
    () => resolveShowerWallColors(SHOWER_PROGRAM_WALL_COLORS, elite100Data),
    [elite100Data],
  );

  const filteredWalls = useMemo(
    () => filterShowerWallColors(wallColors, wallGroup),
    [wallColors, wallGroup],
  );

  const elite100Lookup = useMemo(
    () => buildElite100ColorLookup(elite100Data),
    [elite100Data],
  );

  const openWallColor = useCallback(
    (color: ResolvedShowerWallColor) => {
      const key = `${color.elite100ColorName.trim().toLowerCase()}::${color.elite100MaterialName.trim().toLowerCase()}`;
      const item = elite100Lookup.get(key);
      if (item) setWallLightboxItem(item);
    },
    [elite100Lookup],
  );

  const onLanding = view.kind === "landing";

  useEffect(() => {
    if (!kiosk || !onLanding) return;
    document.documentElement.classList.add("sp-shower-kiosk-landing-root");
    return () => document.documentElement.classList.remove("sp-shower-kiosk-landing-root");
  }, [kiosk, onLanding]);

  const rootClass = [
    "sp-public-page",
    kiosk ? "sp-public-kiosk" : "",
    kiosk && onLanding ? "sp-public-kiosk-landing" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <header className="sp-public-header">
        <div className="sp-public-header-row">
          <div className="sp-public-brand">
            {EOS_LOGO_URL ? (
              <img src={EOS_LOGO_URL} alt="" className="sp-public-logo" />
            ) : (
              <span className="sp-public-logo-mark" aria-hidden>ESF</span>
            )}
            <div className="sp-public-brand-text">
              <p className="sp-public-eyebrow">Elite Stone Fabrication</p>
              <h1 className="sp-public-title">The Groutless Stone Shower</h1>
              {!onLanding ? (
                <p className="sp-public-subtitle">{viewTitle(view)}</p>
              ) : null}
            </div>
          </div>
          <nav className="sp-public-nav" aria-label="Shower program navigation">
            {!onLanding ? (
              <button type="button" className="sp-nav-btn" onClick={goBack}>
                ← Back
              </button>
            ) : null}
            {!onLanding ? (
              <button type="button" className="sp-nav-btn sp-nav-btn--primary" onClick={goHome}>
                Home
              </button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="sp-public-main">
        {view.kind === "landing" ? (
          <LandingView onNavigate={navigateTo} />
        ) : null}
        {view.kind === "inspiration" ? (
          <InspirationView onOpen={setInspirationPhoto} />
        ) : null}
        {view.kind === "bases" ? (
          <BasesListView onSelect={(baseId) => navigateTo({ kind: "base-detail", baseId })} />
        ) : null}
        {view.kind === "base-detail" ? (
          <BaseDetailView baseId={view.baseId} />
        ) : null}
        {view.kind === "walls" ? (
          <WallsView
            busy={elite100Busy}
            error={elite100Error}
            colors={filteredWalls}
            group={wallGroup}
            onGroupChange={setWallGroup}
            onOpenColor={openWallColor}
          />
        ) : null}
        {view.kind === "options" ? (
          <OptionsView />
        ) : null}
        {view.kind === "process" ? (
          <ProcessView />
        ) : null}
        {view.kind === "guide" ? (
          <GuideView kiosk={kiosk} />
        ) : null}
        {view.kind === "build-soon" ? (
          <BuildSoonView />
        ) : null}
      </main>

      <footer className="sp-public-footer">
        <p>Elite Stone Fabrication · Shower Program · Display only</p>
      </footer>

      {inspirationPhoto ? (
        <InspirationLightbox photo={inspirationPhoto} onClose={() => setInspirationPhoto(null)} kiosk={kiosk} />
      ) : null}

      {wallLightboxItem ? (
        <PublicElite100ColorLightbox
          item={wallLightboxItem}
          kiosk={kiosk}
          onClose={() => setWallLightboxItem(null)}
        />
      ) : null}
    </div>
  );
}

function viewTitle(view: ShowerView): string {
  switch (view.kind) {
    case "inspiration": return "Get Inspired";
    case "bases": return "Shower Bases";
    case "base-detail": return getShowerBase(view.baseId)?.name ?? "Shower Base";
    case "walls": return "Wall Collection";
    case "options": return "Program Options";
    case "process": return "How It Works";
    case "guide": return "Program Guide";
    case "build-soon": return "Build Your Shower";
    default: return "";
  }
}

function LandingView({ onNavigate }: { onNavigate: (view: ShowerView) => void }) {
  return (
    <div className="sp-landing">
      <section className="sp-hero" aria-label="Shower program overview">
        <div className="sp-hero-media">
          <img src={SHOWER_PROGRAM_HERO_IMAGE} alt="" className="sp-hero-img" />
        </div>
        <div className="sp-hero-copy">
          <p className="sp-hero-eyebrow">Elite Stone Fabrication</p>
          <h2 className="sp-hero-title">The Groutless Stone Shower</h2>
          <p className="sp-hero-body">
            A simplified way to create a premium shower using fabricated stone wall panels,
            curated surface selections, stocked base options, and professional installation.
          </p>
          <button type="button" className="sp-link-btn" onClick={() => onNavigate({ kind: "guide" })}>
            View Program Guide →
          </button>
        </div>
      </section>

      <div className="sp-section-grid">
        <SectionCard
          title="Get Inspired"
          body="See real completed ESF shower installations."
          onClick={() => onNavigate({ kind: "inspiration" })}
        />
        <SectionCard
          title="Shower Bases"
          body="Explore stocked sizes, colors, drain configurations, and specifications."
          onClick={() => onNavigate({ kind: "bases" })}
        />
        <SectionCard
          title="Wall Collection"
          body="Browse the curated Shower Program surface collection."
          onClick={() => onNavigate({ kind: "walls" })}
        />
        <SectionCard
          title="How It Works"
          body="Understand the ESF process, project readiness, and available options."
          onClick={() => onNavigate({ kind: "process" })}
        />
        <SectionCard
          title="Program Options"
          body="Drain bodies, corner shelves, niches, and finishing options."
          onClick={() => onNavigate({ kind: "options" })}
        />
        <button
          type="button"
          className="sp-section-card sp-section-card--soon"
          onClick={() => onNavigate({ kind: "build-soon" })}
        >
          <span className="sp-soon-badge">COMING SOON</span>
          <h3 className="sp-section-card-title">Build Your Shower</h3>
          <p className="sp-section-card-body">
            Choose your shower size, wall surface, and design options and preview your finished shower.
          </p>
          <span className="sp-section-card-cta">Learn more →</span>
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sp-section-card" onClick={onClick}>
      <h3 className="sp-section-card-title">{title}</h3>
      <p className="sp-section-card-body">{body}</p>
      <span className="sp-section-card-cta">Explore →</span>
    </button>
  );
}

function InspirationView({ onOpen }: { onOpen: (photo: ShowerInspirationPhoto) => void }) {
  return (
    <div className="sp-gallery-grid">
      {SHOWER_INSPIRATION_PHOTOS.map((photo) => (
        <button
          key={photo.id}
          type="button"
          className="sp-gallery-card"
          onClick={() => onOpen(photo)}
          aria-label={`View ${photo.label}`}
        >
          <img src={photo.imageUrl} alt="" className="sp-gallery-img" loading="lazy" />
          <span className="sp-gallery-label">{photo.label}</span>
        </button>
      ))}
    </div>
  );
}

function InspirationLightbox({
  photo,
  onClose,
  kiosk,
}: {
  photo: ShowerInspirationPhoto;
  onClose: () => void;
  kiosk: boolean;
}) {
  return (
    <div className={`sp-lightbox${kiosk ? " sp-lightbox-kiosk" : ""}`} role="dialog" aria-modal="true" aria-label={photo.label}>
      <button type="button" className="sp-lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <img src={photo.imageUrl} alt={photo.label} className="sp-lightbox-img" />
      <p className="sp-lightbox-caption">{photo.label}</p>
    </div>
  );
}

function BasesListView({ onSelect }: { onSelect: (baseId: string) => void }) {
  return (
    <div className="sp-base-grid">
      {SHOWER_PROGRAM_BASES.map((base) => (
        <button
          key={base.id}
          type="button"
          className="sp-base-card"
          onClick={() => onSelect(base.id)}
        >
          {base.imageUrl ? (
            <div className="sp-base-card-media">
              <img src={base.imageUrl} alt="" className="sp-base-card-img" loading="lazy" />
            </div>
          ) : base.dimensionalDrawingUrl ? (
            <div className="sp-base-card-media sp-base-card-media--drawing">
              <img src={base.dimensionalDrawingUrl} alt="" className="sp-base-card-img sp-base-card-img--drawing" loading="lazy" />
            </div>
          ) : null}
          <div className="sp-base-card-body">
            <h3 className="sp-base-card-size">{base.widthIn}&quot; × {base.depthIn}&quot;</h3>
            <p className="sp-base-card-meta">{base.heightLabel} · {base.curbConfiguration}</p>
            {base.drainPositions.length > 0 ? (
              <p className="sp-base-card-meta">
                Drain: {formatDrainLabel(base.drainPositions)}
              </p>
            ) : null}
            <p className="sp-base-card-colors">Stock Colors: {colorSwatchesLabel(base.stockColors)}</p>
            <span className="sp-base-card-cta">View Details →</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function BaseDetailView({ baseId }: { baseId: string }) {
  const base = getShowerBase(baseId);
  if (!base) {
    return (
      <div className="empty-state">
        <p className="empty-title">Shower base not found</p>
      </div>
    );
  }

  const drawingUrl =
    base.id === "base-60x32"
      ? "/shower-program/bases/60x32-left-drawing.webp"
      : base.dimensionalDrawingUrl;

  return (
    <article className="sp-base-detail">
      {base.imageUrl ? (
        <div className="sp-base-detail-hero">
          <img src={base.imageUrl} alt="" className="sp-base-detail-img" />
        </div>
      ) : null}
      <div className="sp-base-detail-copy">
        <h2 className="sp-base-detail-title">{base.name}</h2>
        <dl className="sp-detail-list">
          <div><dt>Dimensions</dt><dd>{base.widthIn}&quot; W × {base.depthIn}&quot; D</dd></div>
          <div><dt>Height</dt><dd>{base.heightLabel}</dd></div>
          <div><dt>Curb</dt><dd>{base.curbConfiguration}</dd></div>
          <div><dt>Drain</dt><dd>{formatDrainLabel(base.drainPositions)}</dd></div>
          <div><dt>Stock Colors</dt><dd>{colorSwatchesLabel(base.stockColors)}</dd></div>
          <div><dt>Availability</dt><dd>Stocked program base</dd></div>
        </dl>
      </div>
      {drawingUrl ? (
        <figure className="sp-drawing-block">
          <figcaption className="sp-drawing-caption">Dimensional drawing</figcaption>
          <img src={drawingUrl} alt={`${base.name} dimensional drawing`} className="sp-drawing-img" />
        </figure>
      ) : null}
      {base.id === "base-60x32" ? (
        <figure className="sp-drawing-block">
          <figcaption className="sp-drawing-caption">Right drain configuration</figcaption>
          <img
            src="/shower-program/bases/60x32-right-drawing.webp"
            alt='60" × 32" shower base right drain dimensional drawing'
            className="sp-drawing-img"
          />
        </figure>
      ) : null}
    </article>
  );
}

function WallsView({
  busy,
  error,
  colors,
  group,
  onGroupChange,
  onOpenColor,
}: {
  busy: boolean;
  error: string | null;
  colors: ResolvedShowerWallColor[];
  group: "all" | "Promo" | "A" | "B" | "C";
  onGroupChange: (g: "all" | "Promo" | "A" | "B" | "C") => void;
  onOpenColor: (color: ResolvedShowerWallColor) => void;
}) {
  return (
    <div className="sp-walls">
      <div className="sp-filter-bar" role="tablist" aria-label="Wall collection groups">
        {SHOWER_WALL_GROUP_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={group === f.value}
            className={`sp-filter-btn${group === f.value ? " active" : ""}`}
            onClick={() => onGroupChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {busy && !colors.some((c) => c.textureUrl) ? (
        <div className="sp-wall-grid sp-wall-grid--loading" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sp-wall-skeleton" aria-hidden />
          ))}
        </div>
      ) : error ? (
        <div className="banner banner-error" role="alert">{error}</div>
      ) : (
        <div className="sp-wall-grid">
          {colors.map((color) => (
            <button
              key={color.id}
              type="button"
              className="sp-wall-card"
              onClick={() => onOpenColor(color)}
            >
              <div className="sp-wall-swatch">
                {color.textureUrl ? (
                  <img src={color.textureUrl} alt="" className="sp-wall-img" loading="lazy" />
                ) : (
                  <span className="sp-wall-fallback" aria-hidden>{color.colorName.slice(0, 2)}</span>
                )}
              </div>
              <div className="sp-wall-meta">
                <h3 className="sp-wall-name">{color.colorName}</h3>
                <p className="sp-wall-supplier">{color.supplierLabel}</p>
                <span className={`sp-wall-group sp-wall-group--${color.group.toLowerCase()}`}>
                  Group {color.group}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionsView() {
  return (
    <div className="sp-options">
      {SHOWER_PROGRAM_OPTIONS.map((group) => (
        <section key={group.id} className="sp-options-section">
          <h2 className="sp-options-title">{group.title}</h2>
          <p className="sp-options-desc">{group.description}</p>
          <ul className="sp-options-list">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ProcessView() {
  return (
    <div className="sp-process">
      <ol className="sp-process-steps">
        {SHOWER_PROGRAM_PROCESS.map((step) => (
          <li key={step.step} className="sp-process-step">
            <span className="sp-process-num">{step.step}</span>
            <div>
              <h3 className="sp-process-title">{step.title}</h3>
              <p className="sp-process-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="sp-benefits" aria-labelledby="sp-benefits-heading">
        <h2 id="sp-benefits-heading" className="sp-benefits-heading">Why the Groutless Stone Shower</h2>
        <div className="sp-benefits-grid">
          {SHOWER_PROGRAM_BENEFITS.map((b) => (
            <article key={b.title} className="sp-benefit-card">
              <h3 className="sp-benefit-title">{b.title}</h3>
              <p className="sp-benefit-body">{b.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function GuideView({ kiosk }: { kiosk: boolean }) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <div className="sp-guide">
      <p className="sp-guide-intro">
        Reference the official ESF Shower Program flyer for program overview, color groups, and specifications.
      </p>
      <button
        type="button"
        className="sp-guide-preview-wrap"
        onClick={() => setEnlarged(true)}
        aria-label="View program guide full screen"
      >
        <img
          src={SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL}
          alt="ESF Shower Program flyer"
          className="sp-guide-preview-img"
        />
        <span className="sp-guide-preview-hint">Tap to enlarge</span>
      </button>
      <div className="sp-guide-actions">
        <a
          href={SHOWER_PROGRAM_FLYER_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="sp-link-btn sp-guide-pdf-link"
        >
          Open PDF →
        </a>
      </div>
      {enlarged ? (
        <div
          className={`sp-lightbox${kiosk ? " sp-lightbox-kiosk" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="ESF Shower Program flyer"
        >
          <button type="button" className="sp-lightbox-close" onClick={() => setEnlarged(false)} aria-label="Close">
            ×
          </button>
          <img src={SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL} alt="ESF Shower Program flyer" className="sp-lightbox-img" />
        </div>
      ) : null}
    </div>
  );
}

function BuildSoonView() {
  return (
    <div className="sp-build-soon">
      <span className="sp-soon-badge sp-soon-badge--large">COMING SOON</span>
      <h2 className="sp-build-soon-title">Build Your Shower</h2>
      <p className="sp-build-soon-body">
        Choose your shower size, wall surface, and design options and preview your finished shower.
      </p>
    </div>
  );
}
