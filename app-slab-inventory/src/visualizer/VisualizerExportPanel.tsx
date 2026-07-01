import { useState } from "react";
import type { ExportMeta } from "./types";
import {
  buildExportSummary,
  deleteVisualizerSession,
  listVisualizerSessions,
  loadVisualizerSession,
  saveVisualizerSession,
  type SaveSessionInput,
} from "./sessionStorage";

type VisualizerExportPanelProps = {
  exportMeta: ExportMeta;
  onExportMetaChange: (patch: Partial<ExportMeta>) => void;
  colorName: string | null;
  materialName: string | null;
  priceGroup: string | null;
  canExport: boolean;
  onExportBranded: () => void;
  onExportPlain: () => void;
  onCopySummary: () => void;
  getSessionPayload: () => Promise<Omit<SaveSessionInput, "name">>;
  onLoadSession: (sessionId: string) => void;
};

export function VisualizerExportPanel({
  exportMeta,
  onExportMetaChange,
  colorName,
  materialName,
  priceGroup,
  canExport,
  onExportBranded,
  onExportPlain,
  onCopySummary,
  getSessionPayload,
  onLoadSession,
}: VisualizerExportPanelProps) {
  const [sessionName, setSessionName] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [sessions, setSessions] = useState(() => listVisualizerSessions());

  const refreshSessions = () => setSessions(listVisualizerSessions());

  const handleSave = async () => {
    const payload = await getSessionPayload();
    const result = saveVisualizerSession({
      ...payload,
      name: sessionName || exportMeta.projectName || "Visualizer session",
    });
    refreshSessions();
    setSaveNotice(
      result.photoOmitted
        ? "Session saved (photo too large for browser storage — reload sample or re-upload)."
        : "Session saved locally.",
    );
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleLoad = (id: string) => {
    const session = loadVisualizerSession(id);
    if (!session) return;
    onLoadSession(id);
    refreshSessions();
  };

  const handleDelete = (id: string) => {
    deleteVisualizerSession(id);
    refreshSessions();
  };

  const summaryPreview = buildExportSummary(exportMeta, colorName, materialName);

  return (
    <section className="pv-panel pv-panel-export">
      <h3 className="pv-panel-title">Export &amp; save</h3>

      <label className="pv-field">
        <span>Project name</span>
        <input
          type="text"
          value={exportMeta.projectName}
          placeholder="e.g. Smith kitchen remodel"
          onChange={(e) => onExportMetaChange({ projectName: e.target.value })}
        />
      </label>
      <label className="pv-field">
        <span>Customer name</span>
        <input
          type="text"
          value={exportMeta.customerName}
          placeholder="Optional"
          onChange={(e) => onExportMetaChange({ customerName: e.target.value })}
        />
      </label>
      <label className="pv-field">
        <span>Note</span>
        <textarea
          rows={2}
          value={exportMeta.note}
          placeholder="Optional presentation note"
          onChange={(e) => onExportMetaChange({ note: e.target.value })}
        />
      </label>

      {colorName ? (
        <div className="pv-export-spec" aria-live="polite">
          <strong>{colorName}</strong>
          {materialName ? <span>{materialName}</span> : null}
          {priceGroup ? <span>Group {priceGroup}</span> : null}
        </div>
      ) : null}

      <div className="pv-btn-row pv-export-actions">
        <button type="button" className="btn primary pv-download-btn" disabled={!canExport} onClick={onExportBranded}>
          Download presentation
        </button>
        <button type="button" className="btn secondary btn-sm" disabled={!canExport} onClick={onExportPlain}>
          Plain export
        </button>
      </div>
      <button type="button" className="btn secondary btn-sm pv-copy-summary" disabled={!colorName} onClick={onCopySummary}>
        Copy color summary
      </button>
      <p className="pv-panel-hint">Presentation export includes ESF branding and project details.</p>

      <div className="pv-session-block">
        <h4 className="pv-subpanel-title">Saved sessions</h4>
        <div className="pv-session-save-row">
          <input
            type="text"
            className="pv-session-name"
            placeholder="Session name"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
          />
          <button type="button" className="btn secondary btn-sm" onClick={handleSave}>
            Save
          </button>
        </div>
        {saveNotice ? <p className="pv-save-notice" role="status">{saveNotice}</p> : null}
        {sessions.length === 0 ? (
          <p className="pv-panel-hint">No saved sessions yet.</p>
        ) : (
          <ul className="pv-session-list">
            {sessions.map((s) => (
              <li key={s.id} className="pv-session-item">
                <button type="button" className="pv-session-load" onClick={() => handleLoad(s.id)}>
                  <strong>{s.name}</strong>
                  <span>{new Date(s.savedAt).toLocaleString()} · {s.maskCount} surface{s.maskCount !== 1 ? "s" : ""}</span>
                </button>
                <button type="button" className="pv-session-delete" aria-label={`Delete ${s.name}`} onClick={() => handleDelete(s.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="pv-export-summary-details">
        <summary>Export summary preview</summary>
        <pre className="pv-export-summary-pre">{summaryPreview}</pre>
      </details>
    </section>
  );
}
