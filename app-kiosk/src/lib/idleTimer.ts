/**
 * Idle timer for kiosk attract-mode return.
 *
 * After `timeoutMs` of no user interaction (touch / pointer / key / wheel), the
 * `onIdle` callback fires so the shell can gracefully transition back to the
 * home attract screen. Any interaction resets the timer.
 *
 * `enabled` lets the caller pause the timer (e.g. while already on home).
 */

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "pointermove",
  "touchstart",
  "touchmove",
  "mousedown",
  "keydown",
  "wheel",
  "click",
];

export function useIdleTimer(
  timeoutMs: number,
  onIdle: () => void,
  enabled: boolean = true,
): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;

    const reset = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    // Passive listeners: we only observe activity, never block scrolling/touch.
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }

    // Restart the countdown whenever the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisible);

    reset();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, reset);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeoutMs, enabled]);
}
