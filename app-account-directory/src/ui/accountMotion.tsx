import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode
} from "react";

const completedMotionKeys = new Set<string>();

export function motionIsReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(motionIsReduced);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function useViewportOnce<T extends HTMLElement>(
  key: string,
  options: IntersectionObserverInit = { threshold: 0.01, rootMargin: "0px 0px -4% 0px" }
) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => reduced || completedMotionKeys.has(key));

  useEffect(() => {
    if (reduced || completedMotionKeys.has(key)) {
      completedMotionKeys.add(key);
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      completedMotionKeys.add(key);
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      completedMotionKeys.add(key);
      setVisible(true);
      observer.disconnect();
    }, { threshold: 0, rootMargin: "80px", ...options });
    observer.observe(node);
    const fallback = window.setTimeout(() => {
      if (completedMotionKeys.has(key)) return;
      completedMotionKeys.add(key);
      setVisible(true);
      observer.disconnect();
    }, 160);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [key, options.rootMargin, options.threshold, reduced]);

  return { ref, visible, reduced };
}

export function AccountReveal({
  motionKey,
  delay = 0,
  className = "",
  children,
  ...props
}: {
  motionKey: string;
  delay?: number;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const { ref, visible } = useViewportOnce<HTMLElement>(motionKey);
  return (
    <section
      ref={ref}
      className={`ad-reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--ad-delay": `${delay}ms` } as CSSProperties}
      {...props}
    >
      {children}
    </section>
  );
}

export function AnimatedNumber({
  value,
  format,
  animationKey,
  className,
  duration = 820
}: {
  value: number | null | undefined;
  format: (value: number | null | undefined) => string;
  animationKey: string;
  className?: string;
  duration?: number;
}) {
  const exact = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const { ref, visible, reduced } = useViewportOnce<HTMLSpanElement>(`number:${animationKey}`);
  const [display, setDisplay] = useState<number | null>(() =>
    reduced || completedMotionKeys.has(`number:${animationKey}`) ? exact : exact == null ? null : 0
  );

  useEffect(() => {
    if (exact == null) {
      setDisplay(null);
      return;
    }
    if (!visible || reduced) {
      if (visible || reduced) setDisplay(exact);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (time: number) => {
      if (!start) start = time;
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(progress === 1 ? exact : exact * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, exact, reduced, visible]);

  const finalLabel = format(exact);
  return (
    <span ref={ref} className={className} aria-label={finalLabel}>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
