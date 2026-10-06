import { useMemo, useRef, useState } from "react";
import type { EstimateCatalog, EstimateRoom, ItemType, PricingStrategy } from "../lib/estimateTypes";

export type QuickAddChoice = {
  label: string;
  itemType: ItemType;
  pricingStrategy: PricingStrategy;
  inputs?: Record<string, unknown>;
  hint?: string;
  group?: string;
};

function buildChoices(catalog: EstimateCatalog): QuickAddChoice[] {
  const choices: QuickAddChoice[] = [
    { group: "Countertops", label: "Elite 100 countertop", itemType: "countertop", pricingStrategy: "elite_100", hint: "Square feet + Elite 100 color" },
    {
      group: "Countertops",
      label: "Out-of-Collection countertop",
      itemType: "countertop",
      pricingStrategy: "out_of_collection",
      hint: "Custom slab — Custom Quote pricing"
    },
    { group: "Vanities", label: "Vanity (Vanity Program)", itemType: "vanity", pricingStrategy: "vanity_program_2026", hint: "Size, bowls, side splash" },
    { group: "Backsplash", label: "Backsplash", itemType: "backsplash", pricingStrategy: "standard", hint: "Standard 4\" splash" },
    { group: "Backsplash", label: "Full-height backsplash", itemType: "backsplash", pricingStrategy: "full_height" }
  ];
  for (const c of catalog.cutouts) {
    choices.push({ group: "Sinks & cutouts", label: c.label, itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: c.code, qty: 1 } });
  }
  choices.push({ group: "Sinks & cutouts", label: "Electrical outlet cutout", itemType: "outlet", pricingStrategy: "addon_catalog" });
  choices.push(
    { group: "Fabrication", label: "Upgraded edge", itemType: "edge", pricingStrategy: "edge_v2", inputs: { edgeMode: "upgraded" } },
    { group: "Fabrication", label: "Mitered edge", itemType: "edge", pricingStrategy: "edge_v2", inputs: { edgeMode: "mitered" } }
  );
  for (const s of catalog.services) {
    choices.push({ group: "Services", label: s.label, itemType: "service", pricingStrategy: "service_catalog", inputs: { serviceCode: s.code, qty: 1 } });
  }
  choices.push(
    { group: "Other", label: "Custom item", itemType: "custom", pricingStrategy: "custom_line", hint: "Any priced line" },
    { group: "Other", label: "Credit / discount", itemType: "custom", pricingStrategy: "custom_line", inputs: { category: "credit" } },
    { group: "Other", label: "Note", itemType: "note", pricingStrategy: "text", hint: "Text line on the proposal — no price" }
  );
  return choices;
}

export default function AddItemMenu({
  catalog,
  rooms,
  initialRoomId,
  onPick,
  onClose
}: {
  catalog: EstimateCatalog;
  rooms: EstimateRoom[];
  initialRoomId: string | null;
  onPick: (choice: QuickAddChoice, roomId: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const listRef = useRef<HTMLUListElement>(null);
  const all = useMemo(() => buildChoices(catalog), [catalog]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => `${c.label} ${c.group ?? ""} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [all, query]);

  const pick = (idx: number) => {
    const c = filtered[idx];
    if (c) onPick(c, roomId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="eb-overlay" onClick={onClose}>
      <div className="eb-palette" role="dialog" aria-modal="true" aria-label="Add item" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="eb-palette-head">
          <input
            autoFocus
            className="eb-palette-search"
            placeholder="Add an item… (countertop, sink, trip, vanity)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            aria-label="Search item types"
            aria-controls="eb-palette-list"
            aria-activedescendant={filtered[active] ? `eb-choice-${active}` : undefined}
          />
          <label className="eb-palette-room">
            <span>Room</span>
            <select value={roomId ?? ""} onChange={(e) => setRoomId(e.target.value || null)}>
              <option value="">Project (no room)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="eb-palette-list" id="eb-palette-list" role="listbox" ref={listRef}>
          {filtered.length === 0 ? <li className="eb-palette-empty">No matching item types.</li> : null}
          {filtered.map((c, idx) => {
            const header = c.group && c.group !== lastGroup ? c.group : null;
            lastGroup = c.group ?? lastGroup;
            return (
              <li key={`${c.group}-${c.label}`} role="presentation">
                {header ? <div className="eb-palette-group">{header}</div> : null}
                <button
                  type="button"
                  id={`eb-choice-${idx}`}
                  role="option"
                  aria-selected={idx === active}
                  className={idx === active ? "is-active" : ""}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(idx)}
                >
                  <span>{c.label}</span>
                  {c.hint ? <span className="eb-palette-hint">{c.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="eb-palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> add
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
