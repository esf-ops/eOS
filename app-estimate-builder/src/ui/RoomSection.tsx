import { memo, useEffect, useRef, useState } from "react";
import { newId, type DocAction } from "../lib/estimateDocument";
import type { EstimateItem, EstimateRoom, PricedItem } from "../lib/estimateTypes";
import type { QuickAddChoice } from "./AddItemMenu";
import { formatMoney, formatQty } from "./format";

/** One-click adds shown under every room; everything else lives in the full add menu. */
const ROOM_QUICK_ADDS: QuickAddChoice[] = [
  { label: "Countertop", itemType: "countertop", pricingStrategy: "elite_100" },
  { label: "Backsplash", itemType: "backsplash", pricingStrategy: "standard" },
  { label: "Sink", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-sink", qty: 1 } },
  { label: "Note", itemType: "note", pricingStrategy: "text" }
];

const TYPE_LABELS: Record<string, string> = {
  countertop: "Countertop",
  backsplash: "Backsplash",
  vanity: "Vanity",
  cutout: "Sink / cutout",
  outlet: "Outlet cutout",
  edge: "Edge upgrade",
  service: "Service",
  custom: "Custom item",
  note: "Note"
};

const STRATEGY_TAGS: Record<string, string> = {
  elite_100: "Elite 100",
  out_of_collection: "Out-of-Collection",
  full_height: "Full height",
  vanity_program_2026: "Vanity Program"
};

export function itemFallbackLabel(item: EstimateItem): string {
  if (item.label) return item.label;
  if (item.itemType === "custom" && item.inputs.description) return item.inputs.description;
  if (item.itemType === "note") return item.inputs.text || "Note";
  if (item.itemType === "backsplash" && item.pricingStrategy === "full_height") return "Full-height backsplash";
  return TYPE_LABELS[item.itemType] ?? item.itemType;
}

type Props = {
  room: EstimateRoom | null;
  items: EstimateItem[];
  rooms: EstimateRoom[];
  pricedById: Map<string, PricedItem>;
  roomTotal: number;
  isFirstRoom: boolean;
  isLastRoom: boolean;
  stale: boolean;
  dispatch: (a: DocAction) => void;
  onEdit: (id: string) => void;
  onAddItem: (roomId: string | null) => void;
  onQuickAdd: (choice: QuickAddChoice, roomId: string | null) => void;
  onAddNoteBelow: (roomId: string | null, afterId: string) => void;
  focusNoteId: string | null;
  readOnly: boolean;
};

function RoomSection({
  room,
  items,
  rooms,
  pricedById,
  roomTotal,
  isFirstRoom,
  isLastRoom,
  stale,
  dispatch,
  onEdit,
  onAddItem,
  onQuickAdd,
  onAddNoteBelow,
  focusNoteId,
  readOnly
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(room?.name ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const title = room ? room.name : rooms.length ? "Project items" : "Items";
  const pricedCount = items.filter((it) => it.itemType !== "note").length;

  const commitRename = () => {
    if (room && name.trim()) dispatch({ type: "rename_room", id: room.id, name });
    setRenaming(false);
  };

  return (
    <section className="eb-room" aria-label={title}>
      <div className="eb-room-head">
        {renaming && room ? (
          <input
            className="eb-room-rename"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                e.stopPropagation();
                setName(room.name);
                setRenaming(false);
              }
            }}
            aria-label="Room name"
          />
        ) : (
          <h3
            className={room && !readOnly ? "eb-room-title is-editable" : "eb-room-title"}
            onDoubleClick={() => room && !readOnly && (setName(room.name), setRenaming(true))}
            title={room ? "Double-click to rename" : undefined}
          >
            {title}
            {!room && rooms.length ? <span className="eb-muted eb-small"> · not tied to a room</span> : null}
          </h3>
        )}
        <span className="eb-room-count">{pricedCount} item{pricedCount === 1 ? "" : "s"}</span>
        <span className="eb-spacer" />
        <span className={`eb-room-total${stale ? " is-stale" : ""}`}>{formatMoney(roomTotal)}</span>
        {room && !readOnly ? (
          <div className="eb-menu-wrap">
            <button
              type="button"
              className="eb-icon-btn"
              aria-label={`${room.name} room actions`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              •••
            </button>
            {menuOpen ? (
              <>
                <div className="eb-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="eb-menu" role="menu" onClick={() => setMenuOpen(false)}>
                  <button type="button" role="menuitem" onClick={() => (setName(room.name), setRenaming(true))}>
                    Rename room
                  </button>
                  <button type="button" role="menuitem" disabled={isFirstRoom} onClick={() => dispatch({ type: "move_room", id: room.id, direction: "up" })}>
                    Move room up
                  </button>
                  <button type="button" role="menuitem" disabled={isLastRoom} onClick={() => dispatch({ type: "move_room", id: room.id, direction: "down" })}>
                    Move room down
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => dispatch({ type: "remove_room", id: room.id })}
                    title="Items stay on the estimate as project items"
                  >
                    Remove room (keep items)
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {items.length ? (
        <ul className="eb-items">
          {items.map((it, idx) =>
            it.itemType === "note" ? (
              <NoteRow
                key={it.id}
                item={it}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                autoFocus={focusNoteId === it.id}
                dispatch={dispatch}
                readOnly={readOnly}
              />
            ) : (
              <ItemRow
                key={it.id}
                item={it}
                priced={pricedById.get(it.id)}
                rooms={rooms}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                stale={stale}
                dispatch={dispatch}
                onEdit={onEdit}
                onAddNoteBelow={() => onAddNoteBelow(room?.id ?? null, it.id)}
                readOnly={readOnly}
              />
            )
          )}
        </ul>
      ) : null}
      {!readOnly ? (
        <div className="eb-quickadd" role="group" aria-label={`Add to ${title}`}>
          {items.length === 0 ? <span className="eb-quickadd-hint">Add to {room ? room.name : "the estimate"}:</span> : null}
          {ROOM_QUICK_ADDS.map((c) => (
            <button key={c.label} type="button" className="eb-chip" onClick={() => onQuickAdd(c, room?.id ?? null)}>
              + {c.label}
            </button>
          ))}
          <button type="button" className="eb-chip eb-chip-more" onClick={() => onAddItem(room?.id ?? null)}>
            More…
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default memo(RoomSection);

type RowProps = {
  item: EstimateItem;
  priced: PricedItem | undefined;
  rooms: EstimateRoom[];
  isFirst: boolean;
  isLast: boolean;
  stale: boolean;
  dispatch: (a: DocAction) => void;
  onEdit: (id: string) => void;
  onAddNoteBelow: () => void;
  readOnly: boolean;
};

const ItemRow = memo(function ItemRow({ item, priced, rooms, isFirst, isLast, stale, dispatch, onEdit, onAddNoteBelow, readOnly }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = item.label || priced?.description || itemFallbackLabel(item);
  const tag = STRATEGY_TAGS[item.pricingStrategy];
  const warnings = priced?.warnings ?? [];
  const blocking = warnings.filter((w) => w.severity === "block");
  const status = priced?.status ?? "incomplete";
  const qtyLine =
    priced && priced.status === "priced" && priced.quantity != null
      ? `${formatQty(priced.quantity, priced.unit)}${priced.rate != null ? ` × ${formatMoney(priced.rate)}` : ""}`
      : "";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") onEdit(item.id);
    else if (e.altKey && e.key === "ArrowUp" && !readOnly) {
      e.preventDefault();
      dispatch({ type: "move_item", id: item.id, direction: "up" });
    } else if (e.altKey && e.key === "ArrowDown" && !readOnly) {
      e.preventDefault();
      dispatch({ type: "move_item", id: item.id, direction: "down" });
    } else if ((e.key === "Delete" || e.key === "Backspace") && (e.metaKey || e.ctrlKey) && !readOnly) {
      e.preventDefault();
      dispatch({ type: "remove_item", id: item.id });
    }
  };

  return (
    <li
      className={`eb-item eb-item-${status}${stale ? " is-stale" : ""}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => onEdit(item.id)}
      aria-label={`${label}${priced ? `, ${formatMoney(priced.amount)}` : ""}`}
    >
      <div className="eb-item-main">
        <div className="eb-item-title">
          <span className="eb-item-label">{label}</span>
          {tag ? <span className="eb-tag">{tag}</span> : null}
          {item.source.provenance !== "manually_added" ? <span className="eb-tag eb-tag-muted">{provenanceLabel(item.source.provenance)}</span> : null}
        </div>
        <div className="eb-item-sub">
          {qtyLine ? <span>{qtyLine}</span> : null}
          {status === "incomplete" && !blocking.length ? <span className="eb-warn-text">Needs details</span> : null}
          {warnings.slice(0, 2).map((w) => (
            <span key={w.code} className={`eb-warning eb-warning-${w.severity}`} title={w.message}>
              {w.message}
            </span>
          ))}
          {warnings.length > 2 ? <span className="eb-muted">+{warnings.length - 2} more</span> : null}
        </div>
      </div>
      <div className="eb-item-amount">{priced && priced.status === "priced" ? formatMoney(priced.amount) : "—"}</div>
      {!readOnly ? (
        <div className="eb-menu-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="eb-icon-btn"
            aria-label={`Actions for ${label}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            •••
          </button>
          {menuOpen ? (
            <>
              <div className="eb-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="eb-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), onEdit(item.id))}>
                  Edit
                </button>
                <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), onAddNoteBelow())}>
                  Add note below
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    dispatch({ type: "duplicate_item", id: item.id, newId: newId(), now: new Date().toISOString() });
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isFirst}
                  onClick={() => (setMenuOpen(false), dispatch({ type: "move_item", id: item.id, direction: "up" }))}
                >
                  Move up <kbd>⌥↑</kbd>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isLast}
                  onClick={() => (setMenuOpen(false), dispatch({ type: "move_item", id: item.id, direction: "down" }))}
                >
                  Move down <kbd>⌥↓</kbd>
                </button>
                {rooms.length ? (
                  <label className="eb-menu-select">
                    <span>Room</span>
                    <select
                      value={item.roomId ?? ""}
                      onChange={(e) => {
                        setMenuOpen(false);
                        dispatch({ type: "set_item_room", id: item.id, roomId: e.target.value || null });
                      }}
                    >
                      <option value="">Project (no room)</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => (setMenuOpen(false), dispatch({ type: "remove_item", id: item.id }))}
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
});

type NoteRowProps = {
  item: EstimateItem & { itemType: "note" };
  isFirst: boolean;
  isLast: boolean;
  autoFocus: boolean;
  dispatch: (a: DocAction) => void;
  readOnly: boolean;
};

/** QuickBooks-style description line: typed straight into the list, prints on the proposal with no amount. */
const NoteRow = memo(function NoteRow({ item, isFirst, isLast, autoFocus, dispatch, readOnly }: NoteRowProps) {
  const [editing, setEditing] = useState(autoFocus || !item.inputs.text);
  const [text, setText] = useState(item.inputs.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(item.inputs.text), [item.inputs.text]);
  useEffect(() => {
    if (editing && autoFocus) ref.current?.focus();
  }, [editing, autoFocus]);

  const commit = () => {
    const next = text.replace(/\s+$/, "");
    if (!next.trim()) {
      dispatch({ type: "remove_item", id: item.id });
      return;
    }
    if (next !== item.inputs.text) dispatch({ type: "update_item", id: item.id, patch: { inputs: { text: next } }, now: new Date().toISOString() });
    setEditing(false);
  };

  return (
    <li className="eb-item eb-item-note">
      <div className="eb-item-main">
        {editing && !readOnly ? (
          <textarea
            ref={ref}
            className="eb-note-input"
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            value={text}
            placeholder="Type a note for the proposal (e.g. Eased edges / no backsplash)"
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                if (!item.inputs.text) dispatch({ type: "remove_item", id: item.id });
                else {
                  setText(item.inputs.text);
                  setEditing(false);
                }
              }
            }}
            aria-label="Note text"
          />
        ) : (
          <button type="button" className="eb-note-text" onClick={() => !readOnly && setEditing(true)} disabled={readOnly} title="Click to edit note">
            {item.inputs.text}
          </button>
        )}
      </div>
      <div className="eb-item-amount eb-muted eb-small">note</div>
      {!readOnly ? (
        <div className="eb-note-actions">
          <button type="button" className="eb-icon-btn" aria-label="Move note up" disabled={isFirst} onClick={() => dispatch({ type: "move_item", id: item.id, direction: "up" })}>
            ↑
          </button>
          <button type="button" className="eb-icon-btn" aria-label="Move note down" disabled={isLast} onClick={() => dispatch({ type: "move_item", id: item.id, direction: "down" })}>
            ↓
          </button>
          <button type="button" className="eb-icon-btn" aria-label="Delete note" onClick={() => dispatch({ type: "remove_item", id: item.id })}>
            ×
          </button>
        </div>
      ) : null}
    </li>
  );
});

function provenanceLabel(p: string): string {
  switch (p) {
    case "template":
      return "From template";
    case "duplicated":
      return "Copy";
    case "imported_unmodified":
      return "AI Takeoff";
    case "imported_edited":
      return "AI Takeoff · edited";
    default:
      return p;
  }
}
