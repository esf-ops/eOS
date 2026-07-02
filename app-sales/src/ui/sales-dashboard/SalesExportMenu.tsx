import React, { useRef, useState } from "react";
import { EXPORT_KIND_LABELS, type ExportKind } from "../../lib/salesDashboardExport";
import { useSalesDashboard } from "./SalesDashboardContext";

const TAB_EXPORT_KINDS: ExportKind[] = [
  "visible_table",
  "accounts_attention",
  "colors",
  "data_quality",
  "forecast",
  "quote_pipeline"
];

export default function SalesExportMenu({ kinds = TAB_EXPORT_KINDS }: { kinds?: ExportKind[] }) {
  const { exportDashboardCsv, loading, data } = useSalesDashboard();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  function handleExport(kind: ExportKind) {
    const ok = exportDashboardCsv(kind);
    setMsg(ok ? "Download started" : "No rows to export");
    setOpen(false);
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div className="sd-export-menu" ref={ref}>
      <button
        type="button"
        className="sd-btn sd-btn--ghost"
        onClick={() => setOpen((o) => !o)}
        disabled={loading || !data}
        aria-expanded={open}
      >
        Export{msg ? ` · ${msg}` : ""}
      </button>
      {open ? (
        <div className="sd-export-dropdown" role="menu">
          {kinds.map((kind) => (
            <button key={kind} type="button" className="sd-export-item" role="menuitem" onClick={() => handleExport(kind)}>
              {EXPORT_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
