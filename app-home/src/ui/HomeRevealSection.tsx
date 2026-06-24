import React, { useEffect, useRef, useState } from "react";

type HomeRevealSectionProps = {
  children: React.ReactNode;
  className?: string;
  /** Optional delay before reveal animation starts (ms). */
  delayMs?: number;
  "aria-label"?: string;
};

/**
 * One-shot scroll reveal for Home Launcher sections.
 * Opacity + small translateY only — no sticky, no scroll-linked progress.
 */
export default function HomeRevealSection({
  children,
  className = "",
  delayMs = 0,
  "aria-label": ariaLabel
}: HomeRevealSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style = delayMs > 0 ? ({ "--reveal-delay": `${delayMs}ms` } as React.CSSProperties) : undefined;

  return (
    <section
      ref={ref}
      className={`home-reveal${revealed ? " is-revealed" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}
