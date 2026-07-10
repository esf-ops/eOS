import { HOME_COPY } from "../lib/kioskConfig";
import type { KioskSectionId } from "../lib/kioskConfig";
import { KioskHomeSlideshow } from "./KioskHomeSlideshow";
import { KioskNav } from "./KioskNav";
import { KioskTopBar } from "./KioskTopBar";

type NavSectionId = Exclude<KioskSectionId, "home">;

interface KioskHomeProps {
  onNavigate: (section: NavSectionId) => void;
}

/** Full-screen attract/home screen. */
export function KioskHome({ onNavigate }: KioskHomeProps) {
  return (
    <div className="kiosk-home">
      {/* No sectionTitle → ESF logo renders at large size */}
      <KioskTopBar />

      <div className="kiosk-home-body">
        <div className="kiosk-home-intro">
          <h1 className="kiosk-home-headline">{HOME_COPY.headline}</h1>
          <p className="kiosk-home-subhead">{HOME_COPY.subheadline}</p>

          {/* Rotating showroom highlights — navigates to highlighted section on touch */}
          <KioskHomeSlideshow onNavigate={onNavigate} />

          {/* "Touch a category to begin." removed — obvious on a touchscreen kiosk */}
        </div>

        <KioskNav onNavigate={onNavigate} />
      </div>

      {/* No footer on home — KioskFooter renders null without onHome prop */}
    </div>
  );
}
