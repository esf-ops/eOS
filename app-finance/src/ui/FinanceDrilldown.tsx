import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  index: string;
  kicker: string;
  title: string;
  period?: string | null;
  value?: ReactNode;
  valueLabel?: string;
  lead?: string;
  children: ReactNode;
  onClose: () => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export default function FinanceDrilldown({
  index,
  kicker,
  title,
  period,
  value,
  valueLabel,
  lead,
  children,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 210);
  };

  useEffect(() => {
    const priorFocus = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const priorOverflow = document.body.style.overflow;
    const priorHtmlOverflow = document.documentElement.style.overflow;
    const priorPosition = document.body.style.position;
    const priorTop = document.body.style.top;
    const priorWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.documentElement.style.overflow = priorHtmlOverflow;
      document.body.style.position = priorPosition;
      document.body.style.top = priorTop;
      document.body.style.width = priorWidth;
      window.removeEventListener("keydown", onKeyDown);
      window.scrollTo(0, scrollY);
      priorFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={`fin-drilldown-backdrop${closing ? " is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        className="fin-drilldown"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-drilldown-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          const scroller = scrollRef.current;
          if (!scroller) return;
          if (event.key === "PageDown") {
            event.preventDefault();
            scroller.scrollBy({ top: scroller.clientHeight * 0.85, behavior: "auto" });
          } else if (event.key === "PageUp") {
            event.preventDefault();
            scroller.scrollBy({ top: -scroller.clientHeight * 0.85, behavior: "auto" });
          } else if (event.key === "Home" && event.currentTarget === event.target) {
            event.preventDefault();
            scroller.scrollTo({ top: 0, behavior: "auto" });
          } else if (event.key === "End" && event.currentTarget === event.target) {
            event.preventDefault();
            scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
          }
        }}
      >
        <div className="fin-drilldown-grain" aria-hidden="true" />
        <aside className="fin-drilldown-rail" aria-hidden="true">
          <strong>{index}</strong>
          <i />
          <small>Governed finance</small>
        </aside>
        <button
          ref={closeRef}
          type="button"
          className="fin-drilldown-close"
          onClick={requestClose}
          aria-label={`Close ${title}`}
        >
          <span aria-hidden="true" />
          Close
        </button>
        <div ref={scrollRef} className="fin-drilldown-scroll" tabIndex={0}>
          <header className="fin-drilldown-heading">
            <div>
              <p className="fin-kicker">{kicker}</p>
              <h2 id="fin-drilldown-title">{title}</h2>
              {period ? <p className="fin-drilldown-period">{period}</p> : null}
            </div>
            {value != null ? (
              <div className="fin-drilldown-value">
                <strong>{value}</strong>
                {valueLabel ? <span>{valueLabel}</span> : null}
              </div>
            ) : null}
          </header>
          {lead ? <p className="fin-drilldown-lead">{lead}</p> : null}
          {children}
          <footer className="fin-drilldown-foot">
            <span>
              <i />
              Governed Finance facts
            </span>
            <small>Esc or click outside to close</small>
          </footer>
        </div>
      </section>
    </div>
  );
}
