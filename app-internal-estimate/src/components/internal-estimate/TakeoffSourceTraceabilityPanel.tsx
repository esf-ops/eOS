import React from "react";
import type { GuidedPiece, RoomDraft } from "@quote-lib/quoteTypes";
import {
  ensureTakeoffOriginalDimensions,
  resolveTakeoffImportState,
  takeoffImportStateLabel,
} from "@quote-lib/takeoffImportMeasurements";

export type TakeoffTraceabilityContext = {
  sourcePlanName?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  suggestedAddOns?: Array<{ type: string; label: string; quantity?: number }>;
};

interface Props {
  room?: RoomDraft | null;
  piece?: GuidedPiece | null;
  context?: TakeoffTraceabilityContext;
  open: boolean;
  onToggle: () => void;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtIn(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Number(n).toFixed(1)}″`;
}

export default function TakeoffSourceTraceabilityPanel({ room, piece, context, open, onToggle }: Props) {
  const src = piece?.takeoffImportSource ?? room?.takeoffImportSource;
  if (!src?.importedFromTakeoff) return null;
  const orig = piece ? ensureTakeoffOriginalDimensions(piece) : null;
  const state = piece ? resolveTakeoffImportState(piece) : src.importState ?? "imported_unmodified";

  return (
    <div className="ie-takeoff-trace">
      <button type="button" className="btn secondary btn-sm ie-takeoff-trace-toggle" onClick={onToggle}>
        {open ? "Hide source details" : "Source traceability"}
      </button>
      {open ? (
        <dl className="ie-takeoff-trace-grid">
          <div><dt>Takeoff job</dt><dd>{src.takeoffJobId ?? "—"}</dd></div>
          <div><dt>Plan</dt><dd>{src.sourcePlanName ?? context?.sourcePlanName ?? "—"}</dd></div>
          <div><dt>Page</dt><dd>{src.sourcePage != null ? String(src.sourcePage) : "—"}</dd></div>
          <div><dt>Status</dt><dd>{takeoffImportStateLabel(state)}</dd></div>
          <div><dt>Approved by</dt><dd>{src.approvedBy ?? context?.approvedBy ?? "—"}</dd></div>
          <div><dt>Approved at</dt><dd>{fmtWhen(src.approvedAt ?? context?.approvedAt)}</dd></div>
          {orig ? (
            <>
              <div><dt>Imported dims</dt><dd>{fmtIn(orig.lengthIn)} × {fmtIn(orig.depthIn)}</dd></div>
              <div><dt>Current dims</dt><dd>{fmtIn(piece?.lengthIn)} × {fmtIn(piece?.depthIn)}</dd></div>
            </>
          ) : null}
          {src.sourceNotes ? (
            <div className="ie-takeoff-trace-full"><dt>Source notes</dt><dd>{src.sourceNotes}</dd></div>
          ) : null}
          {(context?.suggestedAddOns?.length ?? 0) > 0 ? (
            <div className="ie-takeoff-trace-full">
              <dt>Suggested add-ons</dt>
              <dd>
                <ul className="ie-takeoff-trace-list">
                  {context!.suggestedAddOns!.map((a, i) => (
                    <li key={`${a.label}-${i}`}>{a.label}{a.quantity != null ? ` × ${a.quantity}` : ""}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
