import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks which workflow section is in view and toggles `.is-active` on matching
 * `[data-ie-rail-section]` buttons via the DOM — avoids React re-renders of the
 * parent page on every scroll intersection update.
 */
export function useWorkflowRailScrollSpy(sectionIds: readonly string[], effectDeps: unknown[]) {
  const activeRef = useRef<string | null>(null);
  const rafRef = useRef(0);

  const setActiveSection = useCallback(
    (sectionId: string | null) => {
      if (!sectionId || sectionId === activeRef.current) return;
      activeRef.current = sectionId;
      for (const id of sectionIds) {
        const el = document.querySelector<HTMLElement>(`[data-ie-rail-section="${CSS.escape(id)}"]`);
        if (!el) continue;
        const on = id === sectionId;
        el.classList.toggle("is-active", on);
        if (on) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      }
    },
    [sectionIds]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const targets: HTMLElement[] = [];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) targets.push(el);
    }
    if (!targets.length) return;

    const visibility = new Map<string, number>();

    const pickAndApply = () => {
      let bestId: string | null = null;
      let bestRatio = 0;
      for (const id of sectionIds) {
        const ratio = visibility.get(id) ?? 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      }
      if (bestId) setActiveSection(bestId);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          visibility.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(pickAndApply);
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    targets.forEach((el) => observer.observe(el));
    pickAndApply();

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls when section targets remount
  }, [sectionIds, setActiveSection, ...effectDeps]);

  return setActiveSection;
}
