import { useMemo, useState } from "react";
import type { MaterialColor } from "../lib/estimateTypes";

const MAX_RESULTS = 40;

function groupLabel(label: string): string {
  return /^group\b/i.test(label) ? label : `Group ${label}`;
}

/** Elite 100 color search. Group labels come from the Brain catalog; no prices are shown or held here. */
export default function MaterialPicker({
  colors,
  valueId,
  valueName,
  recentIds,
  onPick,
  disabled
}: {
  colors: MaterialColor[];
  valueId: string | null;
  valueName: string;
  recentIds: string[];
  onPick: (color: MaterialColor) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors]);
  const selected = valueId ? byId.get(valueId) ?? null : null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recents = recentIds.map((id) => byId.get(id)).filter((c): c is MaterialColor => Boolean(c));
      return { recents, matches: [] as MaterialColor[] };
    }
    const terms = q.split(/\s+/);
    const matches = colors
      .filter((c) => {
        const hay = `${c.colorName} ${c.priceGroupLabel} ${c.supplier ?? ""} ${c.materialType ?? ""}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, MAX_RESULTS);
    return { recents: [] as MaterialColor[], matches };
  }, [byId, colors, query, recentIds]);

  const pick = (c: MaterialColor) => {
    onPick(c);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="eb-material">
      {selected || valueName ? (
        <div className="eb-material-selected">
          <span className="eb-material-name">{selected?.colorName ?? valueName}</span>
          {selected ? <span className="eb-tag">{groupLabel(selected.priceGroupLabel)}</span> : <span className="eb-warn-text eb-small">Not in catalog</span>}
          {selected?.supplier ? <span className="eb-muted eb-small">{selected.supplier}</span> : null}
          {!disabled ? (
            <button type="button" className="eb-link" onClick={() => setOpen((o) => !o)}>
              Change
            </button>
          ) : null}
        </div>
      ) : null}
      {(!selected && !valueName) || open ? (
        <div className="eb-material-search">
          <input
            autoFocus={open}
            placeholder={`Search ${colors.length} Elite 100 colors…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            aria-label="Search Elite 100 colors"
            onKeyDown={(e) => {
              const first = results.matches[0] ?? results.recents[0];
              if (e.key === "Enter" && first) {
                e.preventDefault();
                pick(first);
              }
            }}
          />
          {results.recents.length ? (
            <div className="eb-material-group">
              <span className="eb-material-group-label">Recent</span>
              <div className="eb-material-chips">
                {results.recents.map((c) => (
                  <button key={c.id} type="button" className="eb-chip" onClick={() => pick(c)}>
                    {c.colorName} <span className="eb-muted">· {groupLabel(c.priceGroupLabel)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {query.trim() ? (
            results.matches.length ? (
              <ul className="eb-material-results" role="listbox">
                {results.matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={c.id === valueId} onClick={() => pick(c)}>
                      <span>{c.colorName}</span>
                      <span className="eb-muted eb-small">
                        {groupLabel(c.priceGroupLabel)}
                        {c.supplier ? ` · ${c.supplier}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="eb-muted eb-small">No Elite 100 color matches. For a material outside the collection, switch to Out-of-Collection.</p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
