import type { CSSProperties } from "react";
import { HomeMotionLayer, useHomeParallax } from "./HomeMotionLayer";
import HeadGlyph from "./HeadGlyph";
import "./homeCommandCenter.css";

export type CommandCenterPulseChip = {
  id: string;
  label: string;
  status: "ready" | "locked" | "roadmap";
};

export type CommandCenterOrbitHead = {
  slug: string;
  title: string;
  category: string;
  tint: string;
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
  orbitHeads: CommandCenterOrbitHead[];
};

function pulseStatusLabel(status: CommandCenterPulseChip["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "locked") return "Assigned elsewhere";
  return "Roadmap";
}

export default function HomeCommandCenterHero({
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
  orbitHeads,
}: HomeCommandCenterHeroProps) {
  const { ref, onPointerMove, onPointerLeave, motionDisabled } = useHomeParallax<HTMLElement>();

  return (
    <section
      className="hero home-cc-hero"
      aria-labelledby="hero-greeting"
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      data-motion-disabled={motionDisabled ? "true" : "false"}
    >
      <HomeMotionLayer depth={1} className="home-cc-motion-aurora" />
      <HomeMotionLayer depth={1.6} className="home-cc-motion-grid" />
      <div className="hero-aurora home-cc-aurora" aria-hidden />
      <div className="hero-spotlight home-cc-spotlight" aria-hidden />

      <div className="hero-grid home-cc-hero-grid">
        <div className="hero-inner home-cc-hero-inner">
          <p className="hero-eyebrow home-cc-eyebrow">eliteOS Command Center · {workspaceName}</p>
          <h1 id="hero-greeting" className="hero-title">{heroGreeting}</h1>
          <p className="hero-motto">Keep the Titans running well.</p>
          <p className="hero-positioning home-cc-positioning">
            Your launchpad for quotes, inventory, install, production, and shop operations — one calm operating layer.
          </p>

          <div className="home-cc-pulse-row" role="list" aria-label="Platform areas">
            {pulseChips.map((chip) => (
              <div
                key={chip.id}
                className={`home-cc-pulse-chip status-${chip.status}`}
                role="listitem"
              >
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
          <div className="hero-workspace-frame home-cc-workspace-frame">
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

          {orbitHeads.length > 0 ? (
            <div className="home-cc-orbit" aria-label="Featured tools">
              {orbitHeads.map((head, index) => (
                <div
                  key={head.slug}
                  className={`home-cc-orbit-card orbit-${index + 1} tint-${head.tint}`}
                  style={{ "--orbit-index": index } as CSSProperties}
                >
                  <span className={`head-glyph head-glyph-${head.tint} home-cc-orbit-glyph`} aria-hidden>
                    <HeadGlyph slug={head.slug} />
                  </span>
                  <span className="home-cc-orbit-title">{head.title}</span>
                  <span className="home-cc-orbit-cat">{head.category}</span>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
