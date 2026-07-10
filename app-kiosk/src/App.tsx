import { useCallback, useEffect, useMemo, useState } from "react";
import { KioskShell } from "./components/KioskShell";
import { IDLE_TIMEOUT_MS, getSection } from "./lib/kioskConfig";
import { useIdleTimer } from "./lib/idleTimer";
import {
  DEFAULT_SHOWROOM_SLUG,
  useKioskRouter,
  type KioskRoute,
} from "./lib/kioskRoutes";

export function App() {
  const { route, navigate } = useKioskRouter();
  const [idleReturning, setIdleReturning] = useState(false);

  const onHome = route.section === null;

  const goHome = useCallback(
    (opts?: { fromIdle?: boolean }) => {
      const next: KioskRoute = {
        showroomSlug: route.showroomSlug || DEFAULT_SHOWROOM_SLUG,
        section: null,
      };
      if (opts?.fromIdle) {
        // Clean transition instead of an abrupt reload.
        setIdleReturning(true);
        window.setTimeout(() => setIdleReturning(false), 900);
      }
      navigate(next);
    },
    [navigate, route.showroomSlug],
  );

  const goToSection = useCallback(
    (section: NonNullable<KioskRoute["section"]>) => {
      navigate({
        showroomSlug: route.showroomSlug || DEFAULT_SHOWROOM_SLUG,
        section,
      });
    },
    [navigate, route.showroomSlug],
  );

  // Return to the attract/home screen after inactivity. Only armed while a
  // section is open (home is already the attract screen).
  useIdleTimer(IDLE_TIMEOUT_MS, () => goHome({ fromIdle: true }), !onHome);

  const activeSection = useMemo(
    () => (route.section ? getSection(route.section) : undefined),
    [route.section],
  );

  // Keep the app locked to the viewport; sections scroll internally if needed.
  useEffect(() => {
    document.documentElement.classList.toggle("kiosk-on-home", onHome);
  }, [onHome]);

  return (
    <KioskShell
      showroomSlug={route.showroomSlug}
      section={activeSection ?? null}
      idleReturning={idleReturning}
      onHome={() => goHome()}
      onNavigate={goToSection}
    />
  );
}
