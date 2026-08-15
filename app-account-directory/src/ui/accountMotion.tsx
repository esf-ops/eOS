import {
  useEffect,
  useRef,
  useState,
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
  motionKey: _motionKey,
  delay: _delay = 0,
  className = "",
  children,
  ...props
}: {
  motionKey: string;
  delay?: number;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className={className} {...props}>
      {children}
    </section>
  );
}

export function AnimatedNumber({
  value,
  format,
  animationKey: _animationKey,
  className
}: {
  value: number | null | undefined;
  format: (value: number | null | undefined) => string;
  animationKey: string;
  className?: string;
  duration?: number;
}) {
  const exact = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const finalLabel = format(exact);
  return (
    <span className={className} aria-label={finalLabel}>
      {finalLabel}
    </span>
  );
}
