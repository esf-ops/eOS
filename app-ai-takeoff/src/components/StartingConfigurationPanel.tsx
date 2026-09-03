/**
 * Compact Starting Configuration panel for Quote Flow Review Takeoff.
 * Estimator-owned starting values seed Internal Estimate on Set Scope.
 */
import React, { useState } from "react";

export type StartingConfiguration = {
  status?: string;
  userSet?: boolean;
  quote?: {
    materialGroup?: string | null;
    colorName?: string | null;
    colorTbd?: boolean;
    edgeProfileToken?: string | null;
  };
  rooms?: Array<{
    roomId: string;
    roomName?: string | null;
    materialGroup?: string | null;
    colorName?: string | null;
    colorTbd?: boolean;
  }>;
  addOns?: Record<string, number>;
  warnings?: Array<{ message?: string; code?: string }>;
};

type Props = {
  config: StartingConfiguration | null;
  readonly?: boolean;
  busy?: boolean;
  onSave?: (patch: { quote?: StartingConfiguration["quote"]; addOns?: Record<string, number> }) => void;
  onReseed?: () => void;
};

const EDGE_OPTIONS = [
  { token: "edge_eased", label: "Eased" },
  { token: "edge_bevel", label: "Bevel" },
  { token: "edge_miter", label: "Mitered" },
  { token: "edge_full_bullnose", label: "Bullnose" }
];

export default function StartingConfigurationPanel(props: Props) {
  const { config, readonly = false, busy = false, onSave, onReseed } = props;
  const [open, setOpen] = useState(false);
  const quote = config?.quote || {};
  const [materialGroup, setMaterialGroup] = useState(quote.materialGroup || "");
  const [colorName, setColorName] = useState(quote.colorName || "");
  const [colorTbd, setColorTbd] = useState(quote.colorTbd === true);
  const [edge, setEdge] = useState(quote.edgeProfileToken || "");
  const [tearout, setTearout] = useState(Number(config?.addOns?.tearout) > 0);

  if (!config || config.status === "empty") {
    return null;
  }

  const roomCount = Array.isArray(config.rooms) ? config.rooms.length : 0;
  const warnCount = Array.isArray(config.warnings) ? config.warnings.length : 0;

  return (
    <section className="ctr-starting-config" data-testid="ctr-starting-config">
      <button
        type="button"
        className="ctr-starting-config__toggle"
        data-testid="ctr-starting-config-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Starting configuration · {quote.materialGroup || "Group TBD"}
          {quote.colorName ? ` · ${quote.colorName}` : colorTbd ? " · Color TBD" : ""}
          {roomCount ? ` · ${roomCount} room override${roomCount === 1 ? "" : "s"}` : ""}
          {warnCount ? ` · ${warnCount} review` : ""}
        </span>
        <span>{open ? "Hide" : "Edit"}</span>
      </button>
      {open ? (
        <div className="ctr-starting-config__body">
          <p className="ctr-muted">
            Estimator-approved starting values for Internal Estimate (and later Digital Estimate).
            Prefills from confirmed customer requests — override freely before Set Scope.
          </p>
          <div className="ctr-starting-config__grid">
            <label>
              Material group
              <input
                value={materialGroup}
                disabled={readonly || busy}
                onChange={(e) => setMaterialGroup(e.target.value)}
                placeholder="Group C"
              />
            </label>
            <label>
              Color
              <input
                value={colorName}
                disabled={readonly || busy || colorTbd}
                onChange={(e) => setColorName(e.target.value)}
                placeholder="Calacatta Fioressa"
              />
            </label>
            <label className="ctr-starting-config__check">
              <input
                type="checkbox"
                checked={colorTbd}
                disabled={readonly || busy}
                onChange={(e) => setColorTbd(e.target.checked)}
              />
              Color TBD
            </label>
            <label>
              Edge
              <select
                value={edge}
                disabled={readonly || busy}
                onChange={(e) => setEdge(e.target.value)}
              >
                <option value="">—</option>
                {EDGE_OPTIONS.map((o) => (
                  <option key={o.token} value={o.token}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ctr-starting-config__check">
              <input
                type="checkbox"
                checked={tearout}
                disabled={readonly || busy}
                onChange={(e) => setTearout(e.target.checked)}
              />
              Include tear-out
            </label>
          </div>
          {roomCount > 0 ? (
            <ul className="ctr-starting-config__rooms">
              {config.rooms!.map((r) => (
                <li key={r.roomId}>
                  <strong>{r.roomName || r.roomId}</strong>
                  {r.materialGroup ? ` · ${r.materialGroup}` : ""}
                  {r.colorName ? ` · ${r.colorName}` : r.colorTbd ? " · Color TBD" : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {warnCount > 0 ? (
            <ul className="ctr-starting-config__warnings">
              {config.warnings!.map((w, i) => (
                <li key={`${w.code || "w"}-${i}`}>{w.message || w.code}</li>
              ))}
            </ul>
          ) : null}
          {!readonly ? (
            <div className="ctr-starting-config__actions">
              <button
                type="button"
                disabled={busy}
                data-testid="ctr-starting-config-save"
                onClick={() =>
                  onSave?.({
                    quote: {
                      materialGroup: materialGroup || null,
                      colorName: colorTbd ? "" : colorName,
                      colorTbd,
                      edgeProfileToken: edge || null
                    },
                    addOns: { tearout: tearout ? 1 : 0 }
                  })
                }
              >
                Save starting configuration
              </button>
              <button
                type="button"
                className="ctr-btn-secondary"
                disabled={busy}
                data-testid="ctr-starting-config-reseed"
                onClick={() => onReseed?.()}
              >
                Reseed from confirmed requests
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
