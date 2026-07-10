import { useEffect, useRef, useState } from "react";
import { publicBaseUrl, type KioskSection } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskFooter } from "./KioskFooter";
import { KioskQrPanel } from "./KioskQrPanel";
import { KioskSectionHero } from "./KioskSectionHero";
import { KioskTopBar } from "./KioskTopBar";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskSectionFrameProps {
  section: KioskSection;
  showroomSlug: string;
  onHome: () => void;
  onNavigate: (section: NavSectionId) => void;
}

/** How long to wait for an embedded frame before surfacing the fallback. */
const FRAME_TIMEOUT_MS = 8000;

/** Dev-only diagnostics — stripped from production builds by Vite. */
const DEV = import.meta.env.DEV === true;

type Mode = "landing" | "embedded";

/**
 * Sections with kind "iframe-or-hero" and a configured URL embed immediately —
 * no click required. Handoff sections (Visualizer) and URL-less sections always
 * start on the hero launchpad.
 *
 * FIX: previous code always defaulted to "landing", requiring a button click
 * even when a URL was fully configured via env vars.
 */
function initialMode(section: KioskSection): Mode {
  return section.kind === "iframe-or-hero" && section.url.trim().length > 0
    ? "embedded"
    : "landing";
}

export function KioskSectionFrame({
  section,
  showroomSlug,
  onHome,
}: KioskSectionFrameProps) {
  const hasUrl = section.url.trim().length > 0;
  const [mode, setMode] = useState<Mode>(() => initialMode(section));
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameTimedOut, setFrameTimedOut] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  // On section navigation: reset state and auto-advance to embedded when URL is present.
  useEffect(() => {
    const next = initialMode(section);
    setMode(next);
    setFrameLoaded(false);
    setFrameTimedOut(false);

    if (DEV) {
      const urlOrigin = (() => {
        if (!section.url) return "(none)";
        try { return new URL(section.url).origin; } catch { return section.url; }
      })();
      console.log("[kiosk/section]", {
        id: section.id,
        hasUrl,
        urlOrigin,
        startingMode: next,
      });
    }
    // section.id is the correct dep: re-run only when a different section is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  // Arm the timeout fallback while a frame is loading.
  useEffect(() => {
    if (mode !== "embedded" || frameLoaded) return;
    timeoutRef.current = window.setTimeout(
      () => setFrameTimedOut(true),
      FRAME_TIMEOUT_MS,
    );
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [mode, frameLoaded]);

  const openEmbedded = () => {
    setFrameLoaded(false);
    setFrameTimedOut(false);
    setMode("embedded");
  };

  const visualizerHandoffUrl =
    section.id === "visualizer"
      ? section.url || `${publicBaseUrl()}/showroom/${showroomSlug}/visualizer`
      : section.url;

  return (
    <div className="kiosk-section">
      <KioskTopBar sectionTitle={section.title} onHome={onHome} />

      <div className="kiosk-section-body">
        {mode === "embedded" && hasUrl ? (
          <div className="kiosk-frame-wrap">
            {!frameLoaded ? (
              <div className="kiosk-frame-loading" aria-live="polite">
                <span className="kiosk-spinner" aria-hidden />
                <p>Loading {section.title}…</p>
              </div>
            ) : null}

            {frameTimedOut && !frameLoaded ? (
              <div className="kiosk-frame-fallback" role="alert">
                <h3>This is taking longer than expected.</h3>
                <p>
                  The page may be blocked from embedding. You can open{" "}
                  <strong>{section.title}</strong> directly.
                </p>
                <div className="kiosk-frame-fallback-actions">
                  {hasUrl ? (
                    <a
                      href={section.url}
                      className="kiosk-btn kiosk-btn--primary"
                      target="_top"
                      rel="noopener"
                    >
                      Open full screen
                    </a>
                  ) : null}
                  <button type="button" className="kiosk-btn kiosk-btn--ghost" onClick={openEmbedded}>
                    Try again
                  </button>
                  <button type="button" className="kiosk-btn kiosk-btn--ghost" onClick={() => setMode("landing")}>
                    Back
                  </button>
                </div>
                <p className="kiosk-frame-fallback-url">
                  {section.url.replace(/^https?:\/\//, "")}
                </p>
              </div>
            ) : null}

            <iframe
              key={section.url}
              className={`kiosk-frame${frameLoaded ? " kiosk-frame--ready" : ""}`}
              src={section.url}
              title={section.title}
              onLoad={() => setFrameLoaded(true)}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-pointer-lock"
            />

            <button type="button" className="kiosk-frame-back" onClick={() => setMode("landing")}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Back</span>
            </button>
          </div>
        ) : section.kind === "handoff" ? (
          <KioskSectionHero
            section={section}
            onPrimary={openEmbedded}
            primaryLabel={section.actionLabel}
            note="A larger screen isn't ideal for uploading a room photo — using your phone is easier."
          >
            <KioskQrPanel
              url={visualizerHandoffUrl}
              heading="Open the Visualizer on your phone"
              caption="Scan to upload a room photo from your phone."
            />
          </KioskSectionHero>
        ) : (
          // URL-less hero launchpad (section not yet configured).
          <KioskSectionHero
            section={section}
            onPrimary={hasUrl ? openEmbedded : undefined}
            primaryLabel={hasUrl ? `Open ${section.title}` : undefined}
          />
        )}
      </div>

      <KioskFooter showroomSlug={showroomSlug} onHome={onHome} />
    </div>
  );
}
