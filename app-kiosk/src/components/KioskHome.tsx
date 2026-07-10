import { BRAND, HOME_COPY } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskFooter } from "./KioskFooter";
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
      <KioskTopBar />

      <div className="kiosk-home-body">
        <div className="kiosk-home-intro">
          <p className="kiosk-home-eyebrow">{BRAND.fabricationName}</p>
          <h1 className="kiosk-home-headline">{HOME_COPY.headline}</h1>
          <p className="kiosk-home-subhead">{HOME_COPY.subheadline}</p>
          <p className="kiosk-home-footnote">{HOME_COPY.footnote}</p>
        </div>

        <KioskNav onNavigate={onNavigate} />
      </div>

      <KioskFooter showroomSlug={showroomSlug} />
    </div>
  );
}
