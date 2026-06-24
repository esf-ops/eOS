import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  HomeMotionLayer,
  isHomeMotionEnabled,
  useHomeParallax,
  useHomeScrollSequence,
} from "./HomeMotionLayer";
import HeadGlyph from "./HeadGlyph";
import "./homeCommandCenter.css";

export type CommandCenterPulseChip = {
  id: string;
  label: string;
  status: "ready" | "locked" | "roadmap";
};

export type CommandCenterSceneHead = {
  slug: string;
  title: string;
  category: string;
  tint: string;
  slot: "slot-a" | "slot-b" | "slot-c" | "slot-d" | "slot-e";
  depth: "foreground" | "midground" | "background";
  isAssigned: boolean;
};

export type HomeCommandCenterHeroProps = {
  workspaceName: string;
  heroGreeting: string;
  heroIdentityValue: string;
  heroIdentityLabel: string;
  availableCount: number | null;
  roadmapCount: number | null;
  workspaceLogoUrl: string;
  workspaceLogoIsFallback: boolean;
  workspaceInits: string;
  headsLoaded: boolean;
  pulseChips: CommandCenterPulseChip[];
  sceneHeads: CommandCenterSceneHead[];
};

function pulseStatusLabel(status: CommandCenterPulseChip["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "locked") return "Assigned elsewhere";
  return "Roadmap";
}

function StaticHero({
  workspaceName,
  heroGreeting,
  heroIdentityValue,
  heroIdentityLabel,
  availableCount,
  roadmapCount,
  workspaceLogoUrl,
  workspaceLogoIsFallback,
  workspaceInits,
  headsLoaded,
  pulseChips,
}: HomeCommandCenterHeroProps) {
  return (
    <section className="hero home-cc-hero home-cc-hero-static" aria-labelledby="hero-greeting">
      <div className="hero-grid home-cc-hero-grid">
        <div className="hero-inner">
          <p className="hero-eyebrow home-cc-eyebrow">eliteOS Command Center · {workspaceName}</p>
          <h1 id="hero-greeting" className="hero-title">{heroGreeting}</h1>
          <p className="hero-motto">Keep the Titans running well.</p>
          <p className="hero-positioning home-cc-positioning">
            Your launchpad for quotes, inventory, install, production, and shop operations.
          </p>
          <div className="home-cc-pulse-row" role="list" aria-label="Platform areas">
            {pulseChips.map((chip) => (
              <div key={chip.id} className={`home-cc-pulse-chip status-${chip.status}`} role="listitem">
                <span className="home-cc-pulse-dot" aria-hidden />
                <span className="home-cc-pulse-label">{chip.label}</span>
                <span className="home-cc-pulse-status">{pulseStatusLabel(chip.status)}</span>
              </div>
            ))}
          </div>
          <div className="hero-stats home-cc-stats" role="list">
            <div className="hero-stat" role="listitem">
              <span className="hero-stat-value">{!headsLoaded ? "—" : availableCount}</span>
              <span className="hero-stat-label">
                {!headsLoaded || availableCount === 1 ? "Tool available" : "Tools available"}
              </span>
            </div>
            <div className="hero-stat-divider" aria-hidden />
            <div className="hero-stat" role="listitem">
              <span className="hero-stat-value">{!headsLoaded ? "—" : roadmapCount}</span>
              <span className="hero-stat-label">On the roadmap</span>
            </div>
            <div className="hero-stat-divider" aria-hidden />
            <div className="hero-stat" role="listitem">
              <span className="hero-stat-value">{heroIdentityValue}</span>
              <span className="hero-stat-label">{heroIdentityLabel}</span>
            </div>
          </div>
        </div>
        <aside className="hero-workspace home-cc-workspace" aria-label={`Workspace: ${workspaceName}`}>
          <span className="hero-workspace-eyebrow">Workspace</span>
          <div className="hero-workspace-frame">
            {workspaceLogoUrl ? (
              <img
                src={workspaceLogoUrl}
                alt={workspaceLogoIsFallback ? "" : `${workspaceName} logo`}
                className="hero-workspace-logo"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="hero-workspace-initials" aria-hidden>{workspaceInits}</span>
            )}
          </div>
          <div className="hero-workspace-name">{workspaceName}</div>
          <div className="hero-workspace-meta">
            <span className="hero-workspace-platform">on eliteOS</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

/** Phase 1–3 scroll-driven 3D command center (desktop). */
function ScrollSceneHero(props: HomeCommandCenterHeroProps) {
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { motionEnabled } = useHomeScrollSequence(stageRef);
  const { onPointerMove, onPointerLeave } = useHomeParallax<HTMLDivElement>(motionEnabled);

  const {
    workspaceName,
    heroGreeting,
    heroIdentityValue,
    heroIdentityLabel,
    availableCount,
    roadmapCount,
    workspaceLogoUrl,
    workspaceLogoIsFallback,
    workspaceInits,
    headsLoaded,
    pulseChips,
    sceneHeads,
  } = props;

  return (
    <section
      ref={stageRef}
      className="home-cc-scroll-stage"
      aria-labelledby="hero-greeting"
      style={{ "--home-scroll-progress": "0" } as CSSProperties}
      data-phase="online"
    >
      <div
        ref={viewportRef}
        className="home-cc-viewport"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <HomeMotionLayer depth={1} className="home-cc-motion-aurora" />
        <HomeMotionLayer depth={1.4} className="home-cc-motion-grid" />
        <div className="hero-spotlight home-cc-spotlight" aria-hidden />

        <div className="home-cc-scene-rig">
          <svg className="home-cc-scene-rails" viewBox="0 0 800 480" aria-hidden preserveAspectRatio="none">
            <path className="home-cc-rail home-cc-rail-a" d="M120 280 C 260 180, 380 120, 520 160" />
            <path className="home-cc-rail home-cc-rail-b" d="M680 300 C 540 200, 420 140, 300 180" />
            <path className="home-cc-rail home-cc-rail-c" d="M400 380 L 400 120" />
          </svg>

          <div className="home-cc-scene">
            {sceneHeads.map((head) => (
              <div
                key={head.slug}
                className={`home-cc-scene-card ${head.slot} depth-${head.depth}${head.isAssigned ? "" : " is-ghost"}`}
                data-slug={head.slug}
              >
                <span className={`head-glyph head-glyph-${head.tint} home-cc-scene-glyph`} aria-hidden>
                  <HeadGlyph slug={head.slug} />
                </span>
                <span className="home-cc-scene-card-title">{head.title}</span>
                <span className="home-cc-scene-card-cat">{head.category}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="home-cc-hud">
          <div className="home-cc-hud-top">
            <p className="home-cc-system-line">
              <span className="home-cc-system-dot" aria-hidden />
              eliteOS command viewport · {workspaceName}
            </p>
            <p className="hero-eyebrow home-cc-eyebrow home-cc-eyebrow-v2">System online</p>
            <h1 id="hero-greeting" className="hero-title home-cc-title-v2">{heroGreeting}</h1>
            <p className="hero-motto home-cc-motto-v2">Keep the Titans running well.</p>
          </div>

          <div className="home-cc-hud-bottom">
            <div className="home-cc-pulse-row" role="list" aria-label="Platform areas">
              {pulseChips.map((chip) => (
                <div
                  key={chip.id}
                  className={`home-cc-pulse-chip status-${chip.status}`}
                  role="listitem"
                >
                  <span className="home-cc-pulse-dot" aria-hidden />
                  <span className="home-cc-pulse-label">{chip.label}</span>
                </div>
              ))}
            </div>

            <div className="hero-stats home-cc-stats home-cc-stats-compact" role="list">
              <div className="hero-stat" role="listitem">
                <span className="hero-stat-value">{!headsLoaded ? "—" : availableCount}</span>
                <span className="hero-stat-label">
                  {!headsLoaded || availableCount === 1 ? "Tool available" : "Tools available"}
                </span>
              </div>
              <div className="hero-stat-divider" aria-hidden />
              <div className="hero-stat" role="listitem">
                <span className="hero-stat-value">{heroIdentityValue}</span>
                <span className="hero-stat-label">{heroIdentityLabel}</span>
              </div>
            </div>

            <aside className="home-cc-hud-workspace" aria-label={`Workspace: ${workspaceName}`}>
              {workspaceLogoUrl ? (
                <img
                  src={workspaceLogoUrl}
                  alt={workspaceLogoIsFallback ? "" : `${workspaceName} logo`}
                  className="home-cc-hud-logo"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="home-cc-hud-inits" aria-hidden>{workspaceInits}</span>
              )}
              <span className="home-cc-hud-name">{workspaceName}</span>
            </aside>
          </div>
        </div>

        <p className="home-cc-scroll-cue" aria-hidden>
          <span className="home-cc-scroll-cue-icon">↓</span>
          Scroll to launch tools
        </p>
      </div>
    </section>
  );
}

export default function HomeCommandCenterHero(props: HomeCommandCenterHeroProps) {
  const [motionEnabled, setMotionEnabled] = useState(() => isHomeMotionEnabled());

  useEffect(() => {
    const onResize = () => setMotionEnabled(isHomeMotionEnabled());
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!motionEnabled) {
    return <StaticHero {...props} />;
  }

  return <ScrollSceneHero {...props} />;
}
