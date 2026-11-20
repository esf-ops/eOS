import { useCallback, useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";
import { fetchPublicElite100Showroom } from "./lib/publicElite100Api";
import { Elite100ShowroomSection, type Elite100ShowroomItem } from "./lib/elite100Showroom";
import { isKioskOrArreyaMode } from "./lib/publicShowerProgramRoute";
import { isDenseKiosk, useKioskTitle } from "./lib/kioskDense";
import {
  SHOWER_PROGRAM_BASES,
  SHOWER_PROGRAM_BENEFITS,
  SHOWER_PROGRAM_OPTIONS,
  SHOWER_PROGRAM_PROCESS,
  getShowerBase,
  type ShowerWallGroup,
} from "./lib/showerProgram/showerProgramData";
import {
  SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL,
  SHOWER_PROGRAM_FLYER_PDF_URL,
} from "./lib/showerProgram/showerProgramDocuments";
import {
  resolveShowerWallColors,
  SHOWER_PROGRAM_WALL_COLORS,
  type ResolvedShowerWallColor,
} from "./lib/showerProgram/showerProgramWallColors";
import "./lib/showerProgram/showerProgram.css";

type ShowerView =
  | { kind: "landing" }
  | { kind: "bases" }
  | { kind: "base-detail"; baseId: string }
  | { kind: "options" }
  | { kind: "process" }
  | { kind: "guide" };

const GROUP_ORDER: ShowerWallGroup[] = ["Promo", "A", "B", "C"];

function formatDrainLabel(positions: string[]): string {
  if (positions.length === 1 && positions[0] === "Center") return "Center drain";
  if (positions.includes("Left") && positions.includes("Right")) return "Left or right drain";
  return positions.join(" or ");
}

function viewTitle(view: ShowerView): string {
  switch (view.kind) {
    case "bases": return "Shower Bases";
    case "base-detail": return getShowerBase(view.baseId)?.name ?? "Shower Base";
    case "options": return "Program Options";
    case "process": return "How It Works";
    case "guide": return "Program Guide";
    default: return "";
  }
}

function Check() {
  return (
    <svg className="shw-check" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 10.5 8.2 14.5 16 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PublicShowerProgramPage() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const dense = useMemo(() => isDenseKiosk(), []);
  const [viewStack, setViewStack] = useState<ShowerView[]>([{ kind: "landing" }]);
  const [elite100Data, setElite100Data] = useState<Awaited<ReturnType<typeof fetchPublicElite100Showroom>> | null>(null);
  const [wallLightboxItem, setWallLightboxItem] = useState<Elite100ShowroomItem | null>(null);

  const view = viewStack[viewStack.length - 1] ?? { kind: "landing" as const };
  const onLanding = view.kind === "landing";
  // In the kiosk the floating pill shows the current sub-page name (e.g. "Shower Bases").
  useKioskTitle(onLanding ? "Shower Program" : viewTitle(view), dense);

  const navigateTo = useCallback((next: ShowerView) => setViewStack((stack) => [...stack, next]), []);
  const goBack = useCallback(() => setViewStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack)), []);
  const goHome = useCallback(() => setViewStack([{ kind: "landing" }]), []);

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
      "Elite Stone Fabrication Groutless Stone Shower Program — wall colors, bases, and installation process.",
    );
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPublicElite100Showroom()
      .then((payload) => { if (alive) setElite100Data(payload); })
      .catch(() => { /* swatches simply fall back to a plain tile */ });
    return () => { alive = false; };
  }, []);

  const wallColors = useMemo(
    () => resolveShowerWallColors(SHOWER_PROGRAM_WALL_COLORS, elite100Data),
    [elite100Data],
  );

  const rootClass = ["shw", kiosk ? "shw--kiosk" : "", dense ? "shw--dense" : "", onLanding ? "shw--landing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <header className="shw-header">
        <div className="shw-brand">
          {EOS_LOGO_URL ? <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" className="shw-logo" /> : <span className="shw-logo-mark" aria-hidden>ESF</span>}
          <span className="shw-brand-name">Shower Program</span>
        </div>
        {!onLanding ? (
          <nav className="shw-nav" aria-label="Shower program navigation">
            <button type="button" className="shw-pill" onClick={goBack}>← Back</button>
            <button type="button" className="shw-pill" onClick={goHome}>{dense ? "Program Home" : "Overview"}</button>
          </nav>
        ) : null}
      </header>

      <main className="shw-main">
        {view.kind === "landing" ? (
          <Overview colors={wallColors} kiosk={kiosk} onNavigate={navigateTo} onOpenItem={setWallLightboxItem} />
        ) : (
          <section className="shw-page">
            <h2 className="shw-page-title">{viewTitle(view)}</h2>
            {view.kind === "bases" ? <BasesList onSelect={(baseId) => navigateTo({ kind: "base-detail", baseId })} /> : null}
            {view.kind === "base-detail" ? <BaseDetail baseId={view.baseId} /> : null}
            {view.kind === "options" ? <Options /> : null}
            {view.kind === "process" ? <Process /> : null}
            {view.kind === "guide" ? <Guide kiosk={kiosk} /> : null}
          </section>
        )}
      </main>

      {wallLightboxItem ? (
        <PublicElite100ColorLightbox item={wallLightboxItem} kiosk={kiosk} onClose={() => setWallLightboxItem(null)} />
      ) : null}
    </div>
  );
}

/** A program color as a carousel card: the matching Elite 100 item, or a plain card if none was found. */
function colorToItem(c: ResolvedShowerWallColor): Elite100ShowroomItem {
  return (
    c.item ?? {
      catalog_item_id: c.id,
      color_key: c.id,
      color_name: c.colorName,
      material_name: c.supplierLabel,
      display_name: c.colorName,
      price_group: c.group,
      program_status: "elite_100",
    }
  );
}

function Overview({
  colors,
  kiosk,
  onNavigate,
  onOpenItem,
}: {
  colors: ResolvedShowerWallColor[];
  kiosk: boolean;
  onNavigate: (view: ShowerView) => void;
  onOpenItem: (item: Elite100ShowroomItem) => void;
}) {
  return (
    <div className="shw-overview">
      <h1 className="shw-sr-only">The Groutless Stone Shower</h1>
      <div className="shw-rails">
        {GROUP_ORDER.map((g) => {
          const items = colors.filter((c) => c.group === g).map(colorToItem);
          if (!items.length) return null;
          return (
            <Elite100ShowroomSection
              key={g}
              group={{ price_group: g, items }}
              kiosk={kiosk}
              showInventoryMeta={false}
              onOpenItem={onOpenItem}
            />
          );
        })}
      </div>

      <nav className="shw-actions" aria-label="More about the program">
        <button type="button" className="shw-action" onClick={() => onNavigate({ kind: "bases" })}>Shower Bases</button>
        <button type="button" className="shw-action" onClick={() => onNavigate({ kind: "options" })}>Program Options</button>
        <button type="button" className="shw-action" onClick={() => onNavigate({ kind: "process" })}>How It Works</button>
        <button type="button" className="shw-action" onClick={() => onNavigate({ kind: "guide" })}>Program Guide</button>
      </nav>
    </div>
  );
}

function BasesList({ onSelect }: { onSelect: (baseId: string) => void }) {
  return (
    <div className="shw-bases">
      {SHOWER_PROGRAM_BASES.map((base) => (
        <button key={base.id} type="button" className="shw-card shw-base" onClick={() => onSelect(base.id)}>
          {base.dimensionalDrawingUrl ? (
            <span className="shw-base-art"><img src={base.dimensionalDrawingUrl} alt="" loading="lazy" /></span>
          ) : null}
          <span className="shw-base-body">
            <span className="shw-base-size">{base.widthIn}″ × {base.depthIn}″</span>
            <span className="shw-base-meta">{base.heightLabel} · {base.curbConfiguration}</span>
            <span className="shw-base-meta">{formatDrainLabel(base.drainPositions)}</span>
            <span className="shw-base-cta">View details →</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function BaseDetail({ baseId }: { baseId: string }) {
  const base = getShowerBase(baseId);
  if (!base) return <p className="shw-note">Shower base not found.</p>;
  return (
    <div className="shw-detail">
      <div className="shw-card shw-detail-info">
        <h3 className="shw-detail-name">{base.name}</h3>
        <dl className="shw-dl">
          <div><dt>Dimensions</dt><dd>{base.widthIn}″ W × {base.depthIn}″ D</dd></div>
          <div><dt>Height</dt><dd>{base.heightLabel}</dd></div>
          <div><dt>Curb</dt><dd>{base.curbConfiguration}</dd></div>
          <div><dt>Drain</dt><dd>{formatDrainLabel(base.drainPositions)}</dd></div>
          <div><dt>Stock colors</dt><dd>{base.stockColors.join(" · ")}</dd></div>
        </dl>
      </div>
      <div className="shw-detail-art">
        {base.dimensionalDrawingUrl ? (
          <figure className="shw-card shw-figure">
            <figcaption>Dimensional drawing{base.id === "base-60x32" ? " · left drain" : ""}</figcaption>
            <img src={base.dimensionalDrawingUrl} alt={`${base.name} dimensional drawing`} />
          </figure>
        ) : null}
        {base.id === "base-60x32" ? (
          <figure className="shw-card shw-figure">
            <figcaption>Dimensional drawing · right drain</figcaption>
            <img src="/shower-program/bases/60x32-right-drawing.webp" alt='60″ × 32″ shower base, right drain' />
          </figure>
        ) : null}
      </div>
    </div>
  );
}

function Options() {
  return (
    <div className="shw-options">
      {SHOWER_PROGRAM_OPTIONS.map((group) => (
        <section key={group.id} className="shw-card shw-option">
          <h3 className="shw-card-title">{group.title}</h3>
          <ul className="shw-list">
            {group.items.map((item) => <li key={item}><Check />{item}</li>)}
          </ul>
          <p className="shw-option-desc">{group.description}</p>
        </section>
      ))}
    </div>
  );
}

function Process() {
  return (
    <div className="shw-process">
      <ol className="shw-steps">
        {SHOWER_PROGRAM_PROCESS.map((step) => (
          <li key={step.step} className="shw-card shw-step">
            <span className="shw-step-num">{step.step}</span>
            <h3 className="shw-step-title">{step.title}</h3>
            <p className="shw-step-body">{step.body}</p>
          </li>
        ))}
      </ol>
      <h3 className="shw-section-label">Why the Groutless Stone Shower</h3>
      <ul className="shw-benefits">
        {SHOWER_PROGRAM_BENEFITS.map((b) => (
          <li key={b.title}>
            <Check />
            <span><strong>{b.title}</strong><span className="shw-benefit-body">{b.body}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Guide({ kiosk }: { kiosk: boolean }) {
  const [enlarged, setEnlarged] = useState(false);
  return (
    <div className="shw-guide">
      <button type="button" className="shw-card shw-guide-preview" onClick={() => setEnlarged(true)} aria-label="Enlarge the program flyer">
        <img src={SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL} alt="ESF Shower Program flyer" />
        <span className="shw-guide-hint">Tap to enlarge</span>
      </button>
      <div className="shw-guide-side">
        <p className="shw-lead">The program flyer lists every wall color by group, plus bases, drain bodies and options.</p>
        {kiosk ? null : (
          <a className="shw-action" href={SHOWER_PROGRAM_FLYER_PDF_URL} target="_blank" rel="noopener noreferrer">Open PDF <span aria-hidden>→</span></a>
        )}
      </div>
      {enlarged ? (
        <div className="shw-lightbox" role="dialog" aria-modal="true" aria-label="ESF Shower Program flyer" onClick={() => setEnlarged(false)}>
          <button type="button" className="shw-lightbox-close" onClick={() => setEnlarged(false)} aria-label="Close">×</button>
          <img src={SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL} alt="ESF Shower Program flyer" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
