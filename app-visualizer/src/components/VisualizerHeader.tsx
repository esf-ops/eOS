import { POWERED_BY } from "../lib/config";
import { resolveCambriaShowcaseReturnUrl } from "../lib/cambriaReturnUrl";

type VisualizerHeaderProps = {
  productName?: string;
  /** When true, show Cambria wordmark (Cambria mode only). */
  cambriaMode?: boolean;
};

export function VisualizerHeader({
  productName = "Elite Stone Visualizer",
  cambriaMode = false,
}: VisualizerHeaderProps) {
  function handleBack() {
    window.location.assign(resolveCambriaShowcaseReturnUrl());
  }

  return (
    <header className="viz-topbar">
      <div className="viz-brand">
        {cambriaMode ? (
          <img
            className="viz-cambria-logo"
            src="/brand/cambria-h-rev-rgb-cusa-nav.svg"
            alt="Cambria"
            draggable={false}
          />
        ) : (
          <span className="viz-brand-mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M4 14.5 12 19l8-4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <span className="viz-brand-text">
          <span className="viz-brand-name">{productName}</span>
          <span className="viz-brand-sub">
            {cambriaMode ? "Hosted by Elite Stone · Powered by slabOS" : POWERED_BY}
          </span>
        </span>
      </div>

      {cambriaMode ? (
        <button type="button" className="viz-cambria-back" onClick={handleBack}>
          ← Back to Cambria Showcase
        </button>
      ) : null}
    </header>
  );
}
