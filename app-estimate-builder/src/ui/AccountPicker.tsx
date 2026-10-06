import { useEffect, useRef, useState } from "react";
import type { QbCustomer } from "../lib/estimateTypes";

/**
 * Account type-ahead over the org's QuickBooks customers. Typing free text unlinks the account;
 * picking a result stores its QuickBooks ListID (the Brain re-verifies it at save).
 */
export default function AccountPicker({
  value,
  linked,
  onType,
  onPick,
  search
}: {
  value: string;
  linked: boolean;
  onType: (text: string) => void;
  onPick: (c: QbCustomer) => void;
  search: (q: string, signal: AbortSignal) => Promise<QbCustomer[]>;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<QbCustomer[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    setState("loading");
    const t = window.setTimeout(() => {
      search(q, ctrl.signal)
        .then((rows) => {
          setResults(rows);
          setActive(0);
          setState("idle");
        })
        .catch((e) => {
          if ((e as Error)?.name !== "AbortError") setState("error");
        });
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [query, search]);

  const pick = (c: QbCustomer) => {
    onPick(c);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const showList = open && query.trim().length >= 2;
  return (
    <div className="eb-field eb-account-picker">
      <span>
        Account (QuickBooks customer)
        {linked ? <span className="eb-qb-chip is-linked">Linked to QuickBooks</span> : value ? <span className="eb-qb-chip">Not linked</span> : null}
      </span>
      <input
        value={value}
        placeholder="Start typing a builder or customer…"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onChange={(e) => {
          onType(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!linked && value.trim().length >= 2) {
            setQuery(value);
            setOpen(true);
          }
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul className="eb-account-results" role="listbox" ref={listRef}>
          {state === "loading" && !results.length ? <li className="eb-account-empty">Searching QuickBooks customers…</li> : null}
          {state === "error" ? <li className="eb-account-empty">Couldn’t search QuickBooks customers. Try again.</li> : null}
          {state === "idle" && !results.length ? <li className="eb-account-empty">No QuickBooks customer matches “{query.trim()}”.</li> : null}
          {results.map((c, idx) => (
            <li
              key={c.listId}
              role="option"
              aria-selected={idx === active}
              className={idx === active ? "is-active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(idx)}
            >
              <span>{c.fullName}</span>
              {c.city || c.state ? <span className="eb-muted">{[c.city, c.state].filter(Boolean).join(", ")}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
