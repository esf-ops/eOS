import { useEffect, useState } from "react";
import type { KioskSection } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskBackground } from "./KioskBackground";
import { KioskHome } from "./KioskHome";
import { KioskIdleOverlay } from "./KioskIdleOverlay";
import { KioskSectionFrame } from "./KioskSectionFrame";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskShellProps {
  showroomSlug: string;
  section: KioskSection | null;
  idleReturning: boolean;
  onHome: () => void;
  onNavigate: (section: NavSectionId) => void;
}

/**
 * Top-level presentation surface. Owns the full-screen frame, the ambient
 * background, and the cross-fade between the home attract screen and a section.
 */
export function KioskShell({
  showroomSlug,
  section,
  idleReturning,
  onHome,
  onNavigate,
}: KioskShellProps) {
  // `viewKey` drives the enter animation so each Home/Section swap re-triggers
  // the cinematic transition rather than snapping.
  const viewKey = section ? `section:${section.id}` : "home";
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [viewKey]);

  return (
    <div
      className={`kiosk-app${idleReturning ? " kiosk-app--idle-return" : ""}`}
      data-view={section ? "section" : "home"}
    >
      <KioskBackground />

      <div
        key={viewKey}
        className={`kiosk-view${entered ? " kiosk-view--in" : ""}`}
      >
        {section ? (
          <KioskSectionFrame
            section={section}
            showroomSlug={showroomSlug}
            onHome={onHome}
            onNavigate={onNavigate}
          />
        ) : (
          <KioskHome showroomSlug={showroomSlug} onNavigate={onNavigate} />
        )}
      </div>

      <KioskIdleOverlay active={idleReturning} />
    </div>
  );
}
