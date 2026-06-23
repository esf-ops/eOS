import type { CSSProperties } from "react";
import HeadGlyph from "./HeadGlyph";

export type HomeLauncherCardPill = {
  text: string;
  className: string;
};

export type HomeLauncherCardProps = {
  slug: string;
  cardTitle: string;
  category: string;
  description: string;
  tint: string;
  pills: HomeLauncherCardPill[];
  isDefaultHead: boolean;
  canNavigate: boolean;
  roadmapSection: boolean;
  openLabel: string;
  showUrl: boolean;
  url: string | null;
  cardDelayMs: number;
  onOpen: () => void;
};

export default function HomeLauncherCard({
  slug,
  cardTitle,
  category,
  description,
  tint,
  pills,
  isDefaultHead,
  canNavigate,
  roadmapSection,
  showUrl,
  url,
  cardDelayMs,
  openLabel,
  onOpen,
}: HomeLauncherCardProps) {
  return (
    <article
      style={{ "--card-delay": `${cardDelayMs}ms` } as CSSProperties}
      className={`head-card home-cc-card${roadmapSection ? " head-card-roadmap" : " head-card-available"}${!canNavigate && !roadmapSection ? " is-muted" : ""}${isDefaultHead ? " head-card-default" : ""} tint-${tint}`}
    >
      <div className="head-card-top">
        <span className={`head-glyph head-glyph-${tint}`} aria-hidden>
          <HeadGlyph slug={slug} />
        </span>
        <div className="pill-row" aria-label="Status">
          {isDefaultHead ? (
            <span className="pill pill-default" title="Your default tool">Default</span>
          ) : null}
          {pills.map((pill, index) => (
            <span key={`${slug}-${index}-${pill.text}`} className={pill.className}>
              {pill.text}
            </span>
          ))}
        </div>
      </div>
      <p className="head-card-eyebrow">{category}</p>
      <h3 className="head-card-title">{cardTitle}</h3>
      <p className={roadmapSection ? "desc desc-roadmap" : "desc"}>{description}</p>
      {showUrl && url ? (
        <p className="url-subtle" title={url}>
          {url}
        </p>
      ) : null}
      {canNavigate ? (
        <button type="button" className="btn btn-open head-open-btn home-cc-open-btn" onClick={onOpen}>
          <span>{openLabel}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M7 17L17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </button>
      ) : null}
      {!canNavigate && !roadmapSection ? (
        <p className="card-foot muted-note home-cc-card-foot">
          {url ? "Ask your admin for access to open this tool." : null}
        </p>
      ) : null}
      {roadmapSection ? (
        <p className="card-foot muted-note home-cc-card-foot">On the roadmap — not available to open yet.</p>
      ) : null}
    </article>
  );
}
