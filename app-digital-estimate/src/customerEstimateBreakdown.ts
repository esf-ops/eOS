/**
 * Customer-facing estimate breakdown for Digital Estimate.
 * Mirrors Internal Estimate customer summary presentation (label + amount rows)
 * using published snapshot + server calculation DTOs — never invents prices.
 */

import type {
  PublicRoomPricing,
  PublicRoomPricingChanges,
} from "./publicConfigApi";

export type BreakdownLine = {
  key: string;
  label: string;
  amount: number | null;
  roomName?: string | null;
  category?: string | null;
  amountLabel: string;
  indent?: boolean;
  emphasis?: boolean;
};

export type EstimateBreakdownView = {
  kind: "original" | "updated" | "changes";
  title: string;
  total: number | null;
  totalLabel: string;
  lines: BreakdownLine[];
  emptyMessage?: string;
};

export type BreakdownRoomGroup = {
  roomName: string | null;
  lines: BreakdownLine[];
};

/**
 * Groups flat breakdown lines into room-scannable sections, preserving first-seen room order.
 * Lines without a roomName (project-level summary/custom lines) are grouped last under a
 * headerless "Project" bucket so the UI can render them without a room heading.
 */
export function groupBreakdownLinesByRoom(lines: BreakdownLine[]): BreakdownRoomGroup[] {
  const order: Array<string | null> = [];
  const byRoom = new Map<string | null, BreakdownLine[]>();
  for (const line of lines) {
    const roomKey = line.roomName || null;
    if (!byRoom.has(roomKey)) {
      byRoom.set(roomKey, []);
      order.push(roomKey);
    }
    byRoom.get(roomKey)!.push(line);
  }
  // Render project-level (no room) lines last, after every named room section.
  const named = order.filter((k) => k !== null);
  const projectLines = byRoom.get(null);
  const orderedKeys = projectLines ? [...named, null] : named;
  return orderedKeys.map((roomName) => ({ roomName, lines: byRoom.get(roomName) || [] }));
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(n)));
}

function moneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return formatMoney(n);
}

function roomHierarchyLines(pricing: PublicRoomPricing): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  for (const [roomIndex, room] of (pricing.rooms || []).entries()) {
    const roomName = room.roomName || `Room ${roomIndex + 1}`;
    lines.push(
      {
        key: `${pricing.kind}-room-${roomIndex}-countertop`,
        label: "Countertop",
        amount: room.countertopAmount,
        amountLabel: moneyLabel(room.countertopAmount),
        roomName,
      },
      {
        key: `${pricing.kind}-room-${roomIndex}-backsplash`,
        label: "Backsplash",
        amount: room.backsplashAmount,
        amountLabel: moneyLabel(room.backsplashAmount),
        roomName,
      },
      {
        key: `${pricing.kind}-room-${roomIndex}-addons`,
        label: "Add-ons",
        amount: room.addOnsAmount,
        amountLabel: moneyLabel(room.addOnsAmount),
        roomName,
      },
    );
    for (const [lineIndex, addOn] of (room.addOnLines || []).entries()) {
      lines.push({
        key: `${pricing.kind}-room-${roomIndex}-addon-${lineIndex}`,
        label: addOn.label || "Item",
        amount: addOn.amount,
        amountLabel: moneyLabel(addOn.amount),
        roomName,
        category: addOn.category || null,
        indent: true,
      });
    }
    lines.push({
      key: `${pricing.kind}-room-${roomIndex}-total`,
      label: `${roomName} total`,
      amount: room.roomTotal,
      amountLabel: moneyLabel(room.roomTotal),
      roomName,
      emphasis: true,
    });
  }
  for (const [index, line] of (pricing.projectAddOns || []).entries()) {
    lines.push({
      key: `${pricing.kind}-project-${index}`,
      label: line.label || "Project item",
      amount: line.amount,
      amountLabel: moneyLabel(line.amount),
      roomName: null,
      category: "Project",
    });
  }
  return lines;
}

export function buildRoomHierarchyBreakdown(
  kind: "original" | "updated",
  pricing: PublicRoomPricing,
): EstimateBreakdownView {
  const total =
    pricing.projectTotal != null && Number.isFinite(Number(pricing.projectTotal))
      ? Number(pricing.projectTotal)
      : (pricing.rooms || []).reduce(
          (sum, room) => sum + (Number(room.roomTotal) || 0),
          0,
        ) +
        (pricing.projectAddOns || []).reduce(
          (sum, line) => sum + (Number(line.amount) || 0),
          0,
        );
  const lines = roomHierarchyLines({ ...pricing, kind });
  lines.push({
    key: `${kind}-project-total`,
    label: kind === "original" ? "Published estimate" : "Your estimate",
    amount: total,
    amountLabel: moneyLabel(total),
    roomName: null,
    emphasis: true,
  });
  return {
    kind,
    title: kind === "original" ? "Published estimate" : "Your estimate",
    total,
    totalLabel: moneyLabel(total),
    lines,
  };
}

/**
 * Original estimate = immutable published customer snapshot line items + room summaries.
 */
export function buildOriginalBreakdown(estimate: {
  lineItems?: Array<{ label?: string; amount?: number | null }>;
  rooms?: Array<{
    name?: string;
    materialLabel?: string | null;
    colorLabel?: string | null;
    summaryLines?: string[];
  }>;
  totals?: { estimatedProjectTotal?: number | null };
  roomPricing?: PublicRoomPricing | null;
} | null): EstimateBreakdownView {
  if (estimate?.roomPricing?.rooms?.length) {
    return buildRoomHierarchyBreakdown("original", estimate.roomPricing);
  }
  const lines: BreakdownLine[] = [];
  const rooms = estimate?.rooms || [];
  for (const [i, room] of rooms.entries()) {
    const roomName = room.name || `Room ${i + 1}`;
    const materialBits = [room.colorLabel, room.materialLabel].filter(Boolean).join(" · ");
    if (materialBits) {
      lines.push({
        key: `orig-room-mat-${i}`,
        label: materialBits,
        amount: null,
        roomName,
        category: "Material",
        amountLabel: "",
      });
    }
    for (const [j, s] of (room.summaryLines || []).entries()) {
      // Never surface SF numbers if present in legacy snapshots — filter numeric SF phrases.
      if (/\b\d+(\.\d+)?\s*sf\b/i.test(s)) continue;
      lines.push({
        key: `orig-room-sum-${i}-${j}`,
        label: s,
        amount: null,
        roomName,
        category: "Scope",
        amountLabel: "",
      });
    }
  }
  for (const [i, li] of (estimate?.lineItems || []).entries()) {
    const amount = li.amount != null ? Number(li.amount) : null;
    lines.push({
      key: `orig-li-${i}`,
      label: li.label || "Item",
      amount: Number.isFinite(amount as number) ? amount : null,
      category: "Summary",
      amountLabel: moneyLabel(amount),
    });
  }
  const total =
    estimate?.totals?.estimatedProjectTotal != null
      ? Number(estimate.totals.estimatedProjectTotal)
      : null;
  return {
    kind: "original",
    title: "Published estimate",
    total: Number.isFinite(total as number) ? total : null,
    totalLabel: moneyLabel(total),
    lines,
    emptyMessage: lines.length ? undefined : "Published estimate details are not available.",
  };
}

function customerFriendlyOptionLabel(optionKey: string | undefined, displayLabel: string | undefined): string {
  const key = String(optionKey || "");
  const label = String(displayLabel || "").trim();
  // Prefer server room-specific cutout / product labels (e.g. "Kitchen — Sink cutout").
  if (/—\s*(Sink|Bar\/prep|Vanity|Laundry)\s+sink\s+cutout/i.test(label)) return label;
  if (/^(Customer-provided sink|ESF Sink\s*—|No sink)/i.test(label)) return label;
  // Legacy workbook / qty-* labels only when the display text is still opaque.
  if (/^qty-sink/i.test(key) && /kitchen sink cutouts?/i.test(label)) return "Sink cutout";
  if (/^qty-bar/i.test(key) && /vanity\/?bar sink cutouts?/i.test(label)) return "Vanity / bar sink cutout";
  if (/^qty-sink/i.test(key) && !label) return "Sink cutout";
  if (/^qty-bar/i.test(key) && !label) return "Vanity / bar sink cutout";
  if (/esf stainless kitchen sink/i.test(label)) return "ESF sink";
  if (/^Option:\s*/i.test(label)) return label.replace(/^Option:\s*/i, "");
  return label || "Item";
}

/**
 * Updated estimate from server calculation public DTO (options + custom lines + rooms).
 */
export function buildUpdatedBreakdown(args: {
  calculation?: {
    configuredDisplayTotal?: number | null;
    options?: Array<{
      optionKey?: string;
      displayLabel?: string;
      quantity?: number;
      visiblePrice?: number | null;
      included?: boolean;
    }>;
    customFacingLines?: Array<{ label?: string; amount?: number | null }>;
    rooms?: Array<{ roomKey?: string; displayName?: string; selectedMaterialLabel?: string }>;
    customerConfigurationSummary?: {
      lines?: Array<{ label?: string; amount?: number | null; roomName?: string | null }>;
    } | null;
    roomPricing?: PublicRoomPricing | null;
  } | null;
  rooms?: Array<{ id: string; name: string; selectedColorName?: string | null; materialLabel?: string | null }>;
}): EstimateBreakdownView {
  const calc = args.calculation;
  if (calc?.roomPricing?.rooms?.length) {
    return buildRoomHierarchyBreakdown("updated", calc.roomPricing);
  }
  const lines: BreakdownLine[] = [];

  const summaryLines = calc?.customerConfigurationSummary?.lines;
  if (Array.isArray(summaryLines) && summaryLines.length) {
    for (const [i, row] of summaryLines.entries()) {
      const amount = row.amount != null ? Number(row.amount) : null;
      lines.push({
        key: `upd-sum-${i}`,
        label: customerFriendlyOptionLabel(undefined, row.label),
        amount: Number.isFinite(amount as number) ? amount : null,
        roomName: row.roomName || null,
        category: "Summary",
        amountLabel: moneyLabel(amount),
      });
    }
  } else {
    for (const [i, room] of (calc?.rooms || []).entries()) {
      const roomName = room.displayName || args.rooms?.find((r) => r.id === room.roomKey)?.name || "Room";
      if (room.selectedMaterialLabel) {
        lines.push({
          key: `upd-mat-${i}`,
          label: room.selectedMaterialLabel,
          amount: null,
          roomName,
          category: "Material",
          amountLabel: "",
        });
      }
    }
    for (const [i, opt] of (calc?.options || []).entries()) {
      if (opt.included) continue;
      const amount = opt.visiblePrice != null ? Number(opt.visiblePrice) : null;
      const friendly = customerFriendlyOptionLabel(opt.optionKey, opt.displayLabel);
      const category = /^qty-sink|^qty-bar/i.test(String(opt.optionKey || ""))
        ? "Cutout"
        : /^sink:|^faucet:|^accessory:|^specialty:/i.test(String(opt.optionKey || ""))
          ? "Product"
          : "Option";
      lines.push({
        key: `upd-opt-${opt.optionKey || i}`,
        label: friendly,
        amount: Number.isFinite(amount as number) ? amount : null,
        category,
        amountLabel: moneyLabel(amount),
      });
    }
    for (const [i, li] of (calc?.customFacingLines || []).entries()) {
      const amount = li.amount != null ? Number(li.amount) : null;
      lines.push({
        key: `upd-custom-${i}`,
        label: li.label || "Item",
        amount: Number.isFinite(amount as number) ? amount : null,
        category: "Custom",
        amountLabel: moneyLabel(amount),
      });
    }
  }

  const total =
    calc?.configuredDisplayTotal != null ? Number(calc.configuredDisplayTotal) : null;
  return {
    kind: "updated",
    title: "Your estimate",
    total: Number.isFinite(total as number) ? total : null,
    totalLabel: moneyLabel(total),
    lines,
    emptyMessage: lines.length ? undefined : "Save a selection to refresh your estimate.",
  };
}

/**
 * Changes = only differences with dollar effect (from room choice deltas).
 */
export function buildChangesBreakdown(args: {
  changeLines: Array<{
    roomName: string;
    category: string;
    originalLabel: string;
    newLabel: string;
    delta: number | null;
    reviewRequired?: boolean;
    pending?: boolean;
  }>;
  displayTotalDelta?: number | null;
  roomPricingChanges?: PublicRoomPricingChanges | null;
}): EstimateBreakdownView {
  if (args.roomPricingChanges?.rows) {
    const lines: BreakdownLine[] = [];
    const roomOrder: string[] = [];
    const byRoom = new Map<string, PublicRoomPricingChanges["rows"]>();
    for (const row of args.roomPricingChanges.rows) {
      if (!byRoom.has(row.roomName)) {
        byRoom.set(row.roomName, []);
        roomOrder.push(row.roomName);
      }
      byRoom.get(row.roomName)!.push(row);
    }
    for (const roomName of roomOrder) {
      const rows = byRoom.get(roomName) || [];
      for (const [index, row] of rows.entries()) {
        lines.push({
          key: `chg-room-${roomOrder.indexOf(roomName)}-${index}`,
          label: `${row.originalLabel} → ${row.updatedLabel}`,
          amount: row.amountDelta,
          amountLabel:
            row.status === "review_required"
              ? "Elite will confirm this option and price."
              : row.amountDelta == null
                ? "—"
                : row.amountDelta < 0
                  ? `−${formatMoney(Math.abs(row.amountDelta))}`
                  : row.amountDelta > 0
                    ? `+${formatMoney(row.amountDelta)}`
                    : "No change",
          roomName,
          category: row.categoryLabel,
        });
      }
      const roomDelta = rows.every((row) => row.amountDelta != null)
        ? rows.reduce((sum, row) => sum + Number(row.amountDelta || 0), 0)
        : null;
      lines.push({
        key: `chg-room-${roomOrder.indexOf(roomName)}-total`,
        label: `${roomName} total change`,
        amount: roomDelta,
        amountLabel: moneyLabel(roomDelta),
        roomName,
        emphasis: true,
      });
    }
    const total =
      args.roomPricingChanges.totalDelta != null
        ? Number(args.roomPricingChanges.totalDelta)
        : null;
    lines.push({
      key: "chg-project-total",
      label: "Difference from published estimate",
      amount: total,
      amountLabel:
        total == null
          ? "—"
          : total < 0
            ? `−${formatMoney(Math.abs(total))}`
            : total > 0
              ? `+${formatMoney(total)}`
              : "No change",
      roomName: null,
      emphasis: true,
    });
    return {
      kind: "changes",
      title: "Changes",
      total,
      totalLabel:
        total == null
          ? "—"
          : total < 0
            ? `−${formatMoney(Math.abs(total))}`
            : total > 0
              ? `+${formatMoney(total)}`
              : "No change",
      lines,
      emptyMessage: lines.length ? undefined : "No changes from the published estimate yet.",
    };
  }
  const lines: BreakdownLine[] = args.changeLines.map((c, i) => {
    let amountLabel = "No change";
    if (c.reviewRequired) amountLabel = "Elite will confirm this option and price.";
    else if (c.delta != null && Number.isFinite(c.delta) && Math.abs(c.delta) >= 0.005) {
      amountLabel = c.delta < 0 ? `−${formatMoney(Math.abs(c.delta))}` : `+${formatMoney(c.delta)}`;
    }
    if (c.pending) {
      amountLabel = amountLabel === "No change" ? "Pending (not saved)" : `${amountLabel} · pending`;
    }
    return {
      key: `chg-${i}`,
      label: `${c.category}: ${c.originalLabel} → ${c.newLabel}`,
      amount: c.delta,
      roomName: c.roomName,
      category: c.category,
      amountLabel,
    };
  });
  const total =
    args.displayTotalDelta != null ? Number(args.displayTotalDelta) : null;
  return {
    kind: "changes",
    title: "Changes",
    total: Number.isFinite(total as number) ? total : null,
    totalLabel:
      total == null
        ? "—"
        : Math.abs(total) < 0.005
          ? "No change"
          : total < 0
            ? `−${formatMoney(Math.abs(total))}`
            : `+${formatMoney(total)}`,
    lines,
    emptyMessage: lines.length ? undefined : "No changes from the published estimate yet.",
  };
}
