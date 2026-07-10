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

/** How long to wait for an embedded frame before offering a fallback. */
const FRAME_TIMEOUT_MS = 6500;

type Mode = "landing" | "embedded";

export function KioskSectionFrame({
  section,
  showroomSlug,
  onHome,
}: KioskSectionFrameProps) {
  const hasUrl = section.url.trim().length > 0;
  const [mode, setMode] = useState<Mode>("landing");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameTimedOut, setFrameTimedOut] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  // Reset local state whenever the section changes.
  useEffect(() => {
    setMode("landing");
    setFrameLoaded(false);
    setFrameTimedOut(false);
  }, [section.id]);

  // Arm a fallback timer while an embedded frame is loading.
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
                <h3>This experience is taking a moment.</h3>
                <p>
                  If it doesn’t appear, an Elite Stone associate can help you open{" "}
                  <strong>{section.title}</strong>.
                </p>
                <div className="kiosk-frame-fallback-actions">
                  <button type="button" className="kiosk-btn kiosk-btn--primary" onClick={openEmbedded}>
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
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
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
            note="A larger screen isn’t ideal for uploading a room photo — using your phone is easier."
          >
            <KioskQrPanel
              url={visualizerHandoffUrl}
              heading="Open the Visualizer on your phone"
              caption="Scan to upload a room photo from your phone."
            />
          </KioskSectionHero>
        ) : (
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
