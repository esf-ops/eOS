import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CORNER_RADII_NOTES, EDGE_PROFILES, type EdgeProfile } from "./edgeProfileData";
import { EdgeScene, webglAvailable, type SlabFinish } from "./edgeScene";
import "./edgeProfiles.css";

export type EdgeViewerColor = {
  key: string;
  name: string;
  group: string;
  textureUrl: string | null;
  thumbUrl: string | null;
};

type Props = {
  colors: readonly EdgeViewerColor[];
  /** Color to start with (e.g. the one opened in the carousel lightbox). */
  initialColorKey?: string | null;
  onClose: () => void;
};

function groupLabel(g: string) {
  return g === "Promo" ? "Promo" : `Group ${g}`;
}

function EdgeIcon({ edge }: { edge: EdgeProfile }) {
  return (
    <svg viewBox="0 0 160 90" className="edge3d-icon" aria-hidden>
      <path d={edge.path} fill="#e4e0db" stroke="#222" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export function EdgeProfilesViewer({ colors, initialColorKey = null, onClose }: Props) {
  const canUse3d = useMemo(() => webglAvailable(), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<EdgeScene | null>(null);
  const pickerOpenRef = useRef(false);

  const [edgeA, setEdgeA] = useState<EdgeProfile>(EDGE_PROFILES[0]);
  const [edgeB, setEdgeB] = useState<EdgeProfile>(EDGE_PROFILES[3]);
  const [compare, setCompare] = useState(false);
  const [slot, setSlot] = useState<"A" | "B">("A");
  const [finish, setFinish] = useState<SlabFinish>("polished");
  const [colorKey, setColorKey] = useState<string | null>(
    () => (initialColorKey && colors.some((c) => c.key === initialColorKey) ? initialColorKey : null),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [textureFailed, setTextureFailed] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);

  const color = useMemo(() => colors.find((c) => c.key === colorKey) ?? null, [colors, colorKey]);
  const colorIndex = useMemo(() => colors.findIndex((c) => c.key === colorKey), [colors, colorKey]);
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const c of colors) if (!seen.includes(c.group)) seen.push(c.group);
    return seen.sort((a, b) => (a === "Promo" ? 1 : b === "Promo" ? -1 : a.localeCompare(b)));
  }, [colors]);
  const visibleColors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return colors.filter((c) => (groupFilter === "all" || c.group === groupFilter) && (!q || c.name.toLowerCase().includes(q)));
  }, [colors, groupFilter, query]);
  const stepColor = (dir: 1 | -1) => {
    if (!colors.length) return;
    const next = colorIndex < 0 ? (dir === 1 ? 0 : colors.length - 1) : (colorIndex + dir + colors.length) % colors.length;
    setColorKey(colors[next].key);
  };
  const chooseColor = (key: string | null) => { setColorKey(key); setPickerOpen(false); };

  // Create the 3D scene once.
  useEffect(() => {
    if (!canUse3d || !stageRef.current || !canvasRef.current) return;
    let scene: EdgeScene | null = null;
    try {
      scene = new EdgeScene(stageRef.current, canvasRef.current, () => setTextureFailed(true));
      sceneRef.current = scene;
    } catch {
      setSceneFailed(true);
      return;
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [canUse3d]);

  useEffect(() => {
    sceneRef.current?.setEdges(compare ? [edgeA, edgeB] : [edgeA]);
  }, [edgeA, edgeB, compare, sceneFailed, canUse3d]);

  useEffect(() => { sceneRef.current?.setFinish(finish); }, [finish, canUse3d]);

  useEffect(() => {
    setTextureFailed(false);
    sceneRef.current?.setTexture(color?.textureUrl ?? null);
  }, [color, canUse3d]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (pickerOpenRef.current) setPickerOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => { pickerOpenRef.current = pickerOpen; }, [pickerOpen]);

  const pickEdge = useCallback((edge: EdgeProfile) => {
    if (compare && slot === "B") setEdgeB(edge);
    else setEdgeA(edge);
  }, [compare, slot]);

  const show3d = canUse3d && !sceneFailed;
  const activeToken = compare && slot === "B" ? edgeB.token : edgeA.token;

  return (
    <div className="edge3d" role="dialog" aria-modal="true" aria-label="Edge profiles">
      <div className="edge3d-main">
        <div className="edge3d-stage" ref={stageRef}>
          {show3d ? (
            <canvas ref={canvasRef} className="edge3d-canvas" aria-label="3D edge profile preview" />
          ) : (
            <div className="edge3d-flat">
              <p className="edge3d-flat-note">3D preview is not available on this display. Cross-sections shown below.</p>
              <div className="edge3d-flat-grid">
                {EDGE_PROFILES.map((edge) => (
                  <div key={edge.token} className="edge3d-flat-card">
                    <EdgeIcon edge={edge} />
                    <strong>{edge.name}</strong>
                    {edge.upcharge ? <span className="edge3d-tag">Upcharge</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          {show3d ? (
            <>
              <div className="edge3d-names">
                <span>{edgeA.name}</span>
                {compare ? <span>{edgeB.name}</span> : null}
              </div>
              <div className="edge3d-hint">Drag to turn · Pinch to zoom</div>
              {textureFailed || (color && !color.textureUrl) ? <div className="edge3d-warn">Color photo unavailable, showing plain stone.</div> : null}
            </>
          ) : null}
        </div>

        <div className="edge3d-colorbar">
          <button type="button" className="edge3d-step" onClick={() => stepColor(-1)} aria-label="Previous color" disabled={!colors.length}>‹</button>
          <button type="button" className="edge3d-current" onClick={() => setPickerOpen(true)} disabled={!colors.length}>
            <span
              className="edge3d-current-sw"
              style={color?.thumbUrl ? { backgroundImage: `url("${color.thumbUrl}")` } : undefined}
            />
            <span className="edge3d-current-text">
              <strong>{color ? color.name : "Plain stone"}</strong>
              <small>{color ? groupLabel(color.group) : "Tap to choose an Elite 100 color"}</small>
            </span>
            <span className="edge3d-current-cta">Choose color</span>
          </button>
          <button type="button" className="edge3d-step" onClick={() => stepColor(1)} aria-label="Next color" disabled={!colors.length}>›</button>
        </div>

        {pickerOpen ? (
          <div className="edge3d-picker" role="dialog" aria-label="Choose a color">
            <div className="edge3d-picker-head">
              <strong>Choose a color</strong>
              <input
                className="edge3d-search"
                type="search"
                placeholder="Search colors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="edge3d-close" onClick={() => setPickerOpen(false)} aria-label="Close color list">×</button>
            </div>
            <div className="edge3d-groups" role="group" aria-label="Filter by group">
              <button type="button" className={groupFilter === "all" ? "is-on" : ""} onClick={() => setGroupFilter("all")}>All {colors.length}</button>
              {groups.map((g) => (
                <button key={g} type="button" className={groupFilter === g ? "is-on" : ""} onClick={() => setGroupFilter(g)}>
                  {groupLabel(g)}
                </button>
              ))}
            </div>
            <div className="edge3d-grid">
              <button type="button" className={`edge3d-tile${colorKey === null ? " is-on" : ""}`} onClick={() => chooseColor(null)}>
                <span className="edge3d-tile-sw edge3d-chip-plain" />
                <span>Plain stone</span>
              </button>
              {visibleColors.map((c) => (
                <button key={c.key} type="button" className={`edge3d-tile${colorKey === c.key ? " is-on" : ""}`} onClick={() => chooseColor(c.key)}>
                  <span className="edge3d-tile-sw" style={c.thumbUrl ? { backgroundImage: `url("${c.thumbUrl}")` } : undefined} />
                  <span>{c.name}</span>
                </button>
              ))}
              {!visibleColors.length ? <p className="edge3d-empty">No colors match.</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="edge3d-panel">
        <div className="edge3d-head">
          <div>
            <div className="edge3d-eyebrow">Elite Stone Fabrication</div>
            <h2>Edge Profiles</h2>
          </div>
          <button type="button" className="edge3d-close" onClick={onClose} aria-label="Close edge profiles">×</button>
        </div>

        {show3d ? (
          <div className="edge3d-controls">
            <div className="edge3d-seg" role="group" aria-label="Finish">
              <button type="button" className={finish === "polished" ? "is-on" : ""} onClick={() => setFinish("polished")}>Polished</button>
              <button type="button" className={finish === "honed" ? "is-on" : ""} onClick={() => setFinish("honed")}>Honed</button>
            </div>
            <div className="edge3d-seg" role="group" aria-label="View">
              <button type="button" className={!compare ? "is-on" : ""} onClick={() => { setCompare(false); setSlot("A"); }}>Single</button>
              <button type="button" className={compare ? "is-on" : ""} onClick={() => setCompare(true)}>Compare</button>
            </div>
            {compare ? (
              <div className="edge3d-seg" role="group" aria-label="Which edge to change">
                <button type="button" className={slot === "A" ? "is-on" : ""} onClick={() => setSlot("A")}>Change left: {edgeA.name}</button>
                <button type="button" className={slot === "B" ? "is-on" : ""} onClick={() => setSlot("B")}>Change right: {edgeB.name}</button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="edge3d-list">
          {EDGE_PROFILES.map((edge) => (
            <button
              key={edge.token}
              type="button"
              className={`edge3d-edge${activeToken === edge.token ? " is-on" : ""}`}
              onClick={() => pickEdge(edge)}
            >
              <EdgeIcon edge={edge} />
              <span className="edge3d-edge-text">
                <strong>{edge.name}</strong>
                {edge.spec ? <small>{edge.spec}</small> : null}
              </span>
              {edge.upcharge ? <span className="edge3d-tag">Upcharge</span> : null}
            </button>
          ))}
        </div>

        <ul className="edge3d-notes">
          {CORNER_RADII_NOTES.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="edge3d-foot">Illustrations are representative, not to scale. Ask your Elite representative about pricing.</p>
      </aside>
    </div>
  );
}
