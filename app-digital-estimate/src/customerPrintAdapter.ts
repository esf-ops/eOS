/**
 * Customer-safe print model for Digital Estimate.
 * Maps the latest successfully saved authoritative DTO — never recalculates.
 */

import type { PublicRoomPricing } from "./publicConfigApi.ts";
import type { LovableRoom } from "./lovableViewModel.ts";
import { summarizeSideSplashSelections } from "./sideSplashSummary.ts";

export type DigitalEstimatePrintSelection = {
  label: string;
  value: string;
};

export type DigitalEstimatePrintAddOnLine = {
  label: string;
  amount: number | null;
};

export type DigitalEstimatePrintRoom = {
  roomName: string;
  selections: DigitalEstimatePrintSelection[];
  countertopAmount: number | null;
  backsplashAmount: number | null;
  addOnsAmount: number | null;
  addOnLines: DigitalEstimatePrintAddOnLine[];
  roomTotal: number | null;
};

export type DigitalEstimatePrintProjectLine = {
  label: string;
  amount: number | null;
};

export type DigitalEstimatePrintModel = {
  brandTitle: string;
  documentTitle: string;
  quoteNumber: string | null;
  revisionLabel: string | null;
  estimateDate: string;
  pricingValidThrough: string | null;
  customerName: string;
  projectName: string | null;
  projectAddress: string | null;
  statusLabel: string;
  rooms: DigitalEstimatePrintRoom[];
  projectLines: DigitalEstimatePrintProjectLine[];
  estimateTotal: number | null;
  estimateTotalLabel: string;
  projectNote: string | null;
  reviewNotice: string;
  disclaimer: string;
};

function moneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(n)));
}

function roomSelections(room: LovableRoom): DigitalEstimatePrintSelection[] {
  const out: DigitalEstimatePrintSelection[] = [];
  const color = room.colors.find((c) => c.id === room.selectedColorId) || room.colors[0];
  if (color?.name || room.selectedColorName) {
    out.push({
      label: "Material",
      value: [color?.name || room.selectedColorName, color?.pricingGroupLabel]
        .filter(Boolean)
        .join(" — "),
    });
  }
  if (room.backsplashSummary) {
    out.push({ label: "Backsplash", value: room.backsplashSummary });
  }
  if (room.sideSplashPieces.length) {
    out.push({
      label: "Side splash",
      value: summarizeSideSplashSelections(room.sideSplashPieces),
    });
  }
  if (room.sinkSummary) out.push({ label: "Sink", value: room.sinkSummary });
  if (room.faucetSummary) out.push({ label: "Faucet", value: room.faucetSummary });
  if (room.accessoriesSummary && room.accessoriesSummary !== "None selected") {
    out.push({ label: "Accessories", value: room.accessoriesSummary });
  }
  if (room.edgeSummary) out.push({ label: "Edge", value: room.edgeSummary });
  if (room.specialtySummary && room.specialtySummary !== "None selected") {
    out.push({ label: "Specialty", value: room.specialtySummary });
  }
  return out;
}

/**
 * Build a print model from the latest saved estimate authority.
 * Does not invent amounts — only copies server DTO fields + customer-safe labels.
 */
export function buildDigitalEstimatePrintModel(args: {
  rooms: LovableRoom[];
  roomPricing: PublicRoomPricing | null | undefined;
  estimateTotal: number | null;
  customerName: string;
  projectName: string | null;
  projectAddress: string | null;
  quoteNumber: string | null;
  revisionLabel?: string | null;
  pricingValidThrough: string | null;
  projectNote?: string | null;
  estimateDate?: string;
}): DigitalEstimatePrintModel {
  const pricing = args.roomPricing;
  const rooms: DigitalEstimatePrintRoom[] = (args.rooms || []).map((room) => {
    const match =
      (pricing?.rooms || []).find(
        (r) =>
          String(r.roomName || "").toLowerCase() === String(room.name || "").toLowerCase() ||
          String(r.roomLabel || "").toLowerCase() === String(room.name || "").toLowerCase(),
      ) || null;
    return {
      roomName: room.name,
      selections: roomSelections(room),
      countertopAmount: match?.countertopAmount ?? null,
      backsplashAmount: match?.backsplashAmount ?? null,
      addOnsAmount: match?.addOnsAmount ?? null,
      addOnLines: Array.isArray(match?.addOnLines)
        ? match!.addOnLines.map((l) => ({
            label: String(l.label || "Item"),
            amount: l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : null,
          }))
        : [],
      roomTotal: match?.roomTotal ?? null,
    };
  });

  const projectLines: DigitalEstimatePrintProjectLine[] = Array.isArray(pricing?.projectAddOns)
    ? pricing!.projectAddOns.map((l) => ({
        label: String(l.label || "Project item"),
        amount: l.amount != null && Number.isFinite(Number(l.amount)) ? Number(l.amount) : null,
      }))
    : [];

  const total =
    args.estimateTotal != null && Number.isFinite(Number(args.estimateTotal))
      ? Number(args.estimateTotal)
      : pricing?.projectTotal != null && Number.isFinite(Number(pricing.projectTotal))
        ? Number(pricing.projectTotal)
        : null;

  return {
    brandTitle: "Elite Stone Fabrication",
    documentTitle: "Estimate",
    quoteNumber: args.quoteNumber,
    revisionLabel: args.revisionLabel || null,
    estimateDate: args.estimateDate || new Date().toLocaleDateString("en-US"),
    pricingValidThrough: args.pricingValidThrough,
    customerName: args.customerName,
    projectName: args.projectName,
    projectAddress: args.projectAddress,
    statusLabel: "Your estimate",
    rooms,
    projectLines,
    estimateTotal: total,
    estimateTotalLabel: moneyLabel(total),
    projectNote: args.projectNote?.trim() || null,
    reviewNotice: "Submitted selections remain subject to Elite review — not final acceptance.",
    disclaimer:
      "This estimate is for planning purposes. Final pricing is confirmed by Elite Stone Fabrication after review.",
  };
}

export { moneyLabel as printMoneyLabel };
