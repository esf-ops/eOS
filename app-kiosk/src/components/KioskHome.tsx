import { HOME_COPY } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskFooter } from "./KioskFooter";
import { KioskHomeSlideshow } from "./KioskHomeSlideshow";
import { KioskNav } from "./KioskNav";
import { KioskTopBar } from "./KioskTopBar";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskHomeProps {
  showroomSlug: string;
  onNavigate: (section: NavSectionId) => void;
}

/** Full-screen attract/home screen. */
export function KioskHome({ showroomSlug, onNavigate }: KioskHomeProps) {
  return (
    <div className="kiosk-home">
      {/* No onHome prop → no Home button; no sectionTitle → ESF logo is large */}
      <KioskTopBar />

      <div className="kiosk-home-body">
        <div className="kiosk-home-intro">
          <h1 className="kiosk-home-headline">{HOME_COPY.headline}</h1>
          <p className="kiosk-home-subhead">{HOME_COPY.subheadline}</p>

          {/* Rotating showroom highlights — navigates to the highlighted section on touch */}
          <KioskHomeSlideshow onNavigate={onNavigate} />

          <p className="kiosk-home-footnote">{HOME_COPY.footnote}</p>
        </div>

        <KioskNav onNavigate={onNavigate} />
      </div>

      {/* No onHome prop → no dead Home button in footer */}
      <KioskFooter showroomSlug={showroomSlug} />
    </div>
  );
}
