import { POWERED_BY, PRODUCT_NAME } from "../lib/config";

export function VisualizerHeader() {
  return (
    <header className="viz-topbar">
      <div className="viz-brand">
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
        <span className="viz-brand-text">
          <span className="viz-brand-name">{PRODUCT_NAME}</span>
          <span className="viz-brand-sub">{POWERED_BY}</span>
        </span>
      </div>
    </header>
  );
}
