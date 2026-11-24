import { useEffect, useState } from "react";

/** Same phone cut-off the kiosk uses (it falls back to the framed layout at this width). */
export const PHONE_MAX_WIDTH = 768;
const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

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
