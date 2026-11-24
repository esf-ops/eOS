import { useEffect, useState } from "react";

/** Same phone cut-off the kiosk uses (it falls back to the framed layout at this width). */
export const PHONE_MAX_WIDTH = 768;
/**
 * A phone turned sideways is wider than 768px but only about 400px tall, so it needs the phone layout too.
 * No tablet, desktop or kiosk screen is that short, so those keep their layouts.
 */
export const PHONE_LANDSCAPE_MAX_HEIGHT = 500;
const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px), (orientation: landscape) and (max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px)`;

function matches(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** True on phone-sized screens. Read synchronously on first render so the page never flashes the wide layout first. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState<boolean>(matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}
