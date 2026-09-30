import type {
  QuoteFlowSinkCatalogItem,
  QuoteFlowSinkRoom,
  QuoteFlowSinkSelectionInput
} from "../lib/quoteFlowEstimatesApi";

const KIND_ELIGIBILITY: Record<"kitchen" | "vanity", string[]> = {
  kitchen: ["kitchen", "bar_prep", "laundry_utility"],
  vanity: ["vanity", "bar_prep"]
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function catalogForRoom(room: QuoteFlowSinkRoom, catalog: QuoteFlowSinkCatalogItem[]) {
  const kinds: Array<"kitchen" | "vanity"> = [
    ...(room.kitchenOpenings > 0 ? (["kitchen"] as const) : []),
    ...(room.vanityOpenings > 0 ? (["vanity"] as const) : [])
  ];
  return catalog.filter((p) =>
    kinds.every((k) => KIND_ELIGIBILITY[k].some((t) => p.roomEligibility.includes(t)))
  );
}

function selectValue(room: QuoteFlowSinkRoom, edit: QuoteFlowSinkSelectionInput | undefined): string {
  if (room.vanityProgramApplied) return edit?.sinkType || room.programSinkType || "oval_white";
  const mode = edit?.mode ?? room.decision?.mode ?? "";
  if (mode === "customer_provided") return "customer_provided";
  if (mode === "catalog") return `catalog:${edit?.productId ?? room.decision?.productId ?? ""}`;
  return "";
}

/**
 * Staff choose the sink for every room with a sink cutout before approval:
 * a catalog sink (its price replaces the generic sink add-on; the cutout is
 * charged once) or customer-provided. Vanity Program rooms choose the program
 * sink type. Brain validates every choice.
 */
export function SinkSelectionsSection(props: {
  rooms: QuoteFlowSinkRoom[];
  catalog: QuoteFlowSinkCatalogItem[];
  programSinkTypes: Array<{ value: string; label: string }>;
  edits: Record<string, QuoteFlowSinkSelectionInput>;
  busy: boolean;
  onChange: (roomId: string, next: QuoteFlowSinkSelectionInput) => void;
}) {
  const { rooms, catalog, programSinkTypes, edits, busy, onChange } = props;
  if (!rooms.length) return null;
  return (
    <div className="qf-pricing__controls" data-testid="qf-pricing-sinks">
      <h3>Sinks</h3>
      <p className="qf-muted">
        Choose the sink for each room with a sink cutout before approval. A catalog sink&apos;s
        price replaces the generic sink add-on; the cutout is charged once. The customer sees this
        sink as included and can switch online for the difference in price.
      </p>
      <ul className="qf-pricing__room-selections">
        {rooms.map((room) => {
          const edit = edits[room.roomId];
          const value = selectValue(room, edit);
          const openings = [
            room.kitchenOpenings > 0 ? `${room.kitchenOpenings} kitchen sink cutout${room.kitchenOpenings > 1 ? "s" : ""}` : null,
            room.vanityOpenings > 0 ? `${room.vanityOpenings} vanity/bar sink cutout${room.vanityOpenings > 1 ? "s" : ""}` : null
          ]
            .filter(Boolean)
            .join(" · ");
          const needsDecision = !room.vanityProgramApplied && !value;
          return (
            <li
              key={room.roomId}
              data-testid="qf-pricing-sink-room"
              data-room-id={room.roomId}
              data-needs-decision={needsDecision ? "1" : "0"}
            >
              <h4>{room.roomName}</h4>
              <p className="qf-muted">{openings}</p>
              {room.vanityProgramApplied ? (
                <label>
                  Vanity Program sink (included in the program price)
                  <select
                    value={value}
                    disabled={busy}
                    data-testid="qf-pricing-sink-program-type"
                    onChange={(e) =>
                      onChange(room.roomId, { roomId: room.roomId, mode: "program", sinkType: e.target.value })
                    }
                  >
                    {programSinkTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Sink
                  <select
                    value={value}
                    disabled={busy}
                    data-testid="qf-pricing-sink-select"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "customer_provided") {
                        onChange(room.roomId, { roomId: room.roomId, mode: "customer_provided" });
                      } else if (v.startsWith("catalog:")) {
                        onChange(room.roomId, {
                          roomId: room.roomId,
                          mode: "catalog",
                          productId: v.slice("catalog:".length)
                        });
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a sink…
                    </option>
                    <option value="customer_provided">Customer-provided sink (cutout only)</option>
                    {catalogForRoom(room, catalog).map((p) => (
                      <option key={p.productId} value={`catalog:${p.productId}`}>
                        {p.displayName} — {money(p.sellPrice)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsDecision ? (
                <p className="qf-pricing__warning" data-testid="qf-pricing-sink-required">
                  Required before approval.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
