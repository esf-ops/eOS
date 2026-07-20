/**
 * Customer-facing estimate breakdown for Digital Estimate.
 * Mirrors Internal Estimate customer summary presentation (label + amount rows)
 * using published snapshot + server calculation DTOs — never invents prices.
 */

export type BreakdownLine = {
  key: string;
  label: string;
  amount: number | null;
  roomName?: string | null;
  category?: string | null;
  amountLabel: string;
};

export type EstimateBreakdownView = {
  kind: "original" | "updated" | "changes";
  title: string;
  total: number | null;
  totalLabel: string;
  lines: BreakdownLine[];
  emptyMessage?: string;
};

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
} | null): EstimateBreakdownView {
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
    title: "Original estimate",
    total: Number.isFinite(total as number) ? total : null,
    totalLabel: moneyLabel(total),
    lines,
    emptyMessage: lines.length ? undefined : "Original estimate details are not available.",
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
  } | null;
  rooms?: Array<{ id: string; name: string; selectedColorName?: string | null; materialLabel?: string | null }>;
}): EstimateBreakdownView {
  const calc = args.calculation;
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
    title: "Your updated estimate",
    total: Number.isFinite(total as number) ? total : null,
    totalLabel: moneyLabel(total),
    lines,
    emptyMessage: lines.length ? undefined : "Save a selection to refresh your updated estimate.",
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
}): EstimateBreakdownView {
  const lines: BreakdownLine[] = args.changeLines.map((c, i) => {
    let amountLabel = "No change";
    if (c.reviewRequired) amountLabel = "Requires estimator review";
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
    emptyMessage: lines.length ? undefined : "No changes from the original estimate yet.",
  };
}
