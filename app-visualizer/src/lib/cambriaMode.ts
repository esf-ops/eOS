/** Detect Cambria-only mode for the standalone visualizer head. */

export function isCambriaVisualizerMode(): boolean {
  if (typeof window === "undefined") return false;
  const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/cambria" || path.endsWith("/cambria")) return true;
  const q = new URLSearchParams(window.location.search);
  return q.get("mode") === "cambria" || q.get("collection") === "cambria";
}

export function isArreyaOrKioskQuery(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.get("arreya") === "1" || q.get("kiosk") === "1";
}
