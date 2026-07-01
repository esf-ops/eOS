import { useEffect, useMemo, useState } from "react";
import { BeforeAfter } from "./components/BeforeAfter";
import { PointSelector } from "./components/PointSelector";
import { fetchSlabs, renderVisualization, type Point, type SlabOption } from "./lib/api";

const DISCLAIMER =
  "Concept visualization only. Not an estimate, measurement, layout, inventory reservation, or production drawing.";

export function App() {
  const [slabs, setSlabs] = useState<SlabOption[]>([]);
  const [slabId, setSlabId] = useState("");
  const [kitchenFile, setKitchenFile] = useState<File | null>(null);
  const [kitchenPreview, setKitchenPreview] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSlabs()
      .then((items) => {
        setSlabs(items);
        if (items[0]) setSlabId(items[0].id);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load slabs");
      });
  }, []);

  useEffect(() => {
    if (!kitchenFile) {
      setKitchenPreview(null);
      return;
    }
    const url = URL.createObjectURL(kitchenFile);
    setKitchenPreview(url);
    setPoints([]);
    setResultUrl(null);
    return () => URL.revokeObjectURL(url);
  }, [kitchenFile]);

  const selectedSlab = useMemo(() => slabs.find((s) => s.id === slabId) ?? null, [slabs, slabId]);

  const canRender = Boolean(kitchenFile && slabId && points.length === 4 && !loading);

  async function handleRender() {
    if (!kitchenFile || points.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const result = await renderVisualization({ kitchenFile, slabId, points });
      setResultUrl(`${result.output_url}?t=${Date.now()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setLoading(false);
    }
  }

  function loadSampleKitchen() {
    fetch("/files/samples/kitchen.jpg")
      .then((res) => {
        if (!res.ok) throw new Error("Sample kitchen not found. Run generate_samples.py first.");
        return res.blob();
      })
      .then((blob) => {
        const file = new File([blob], "kitchen.jpg", { type: "image/jpeg" });
        setKitchenFile(file);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load sample kitchen");
      });
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">eliteOS · Local MVP</p>
          <h1>Countertop Visualizer</h1>
          <p className="subtitle">Manual polygon selection · OpenCV local rendering · No cloud AI</p>
        </div>
      </header>

      <div className="disclaimer" role="note">
        {DISCLAIMER}
      </div>

      <main className="layout">
        <section className="panel controls">
          <h2>1. Kitchen photo</h2>
          <div className="row">
            <label className="file-button">
              Upload photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setKitchenFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="secondary" onClick={loadSampleKitchen}>
              Use sample kitchen
            </button>
          </div>

          <h2>2. Slab material</h2>
          <select value={slabId} onChange={(e) => setSlabId(e.target.value)} disabled={!slabs.length}>
            {slabs.map((slab) => (
              <option key={slab.id} value={slab.id}>
                {slab.name}
              </option>
            ))}
          </select>
          {selectedSlab ? (
            <img className="slab-thumb" src={selectedSlab.url} alt={selectedSlab.name} />
          ) : null}

          <h2>3. Countertop corners</h2>
          <PointSelector
            imageUrl={kitchenPreview}
            points={points}
            onPointsChange={setPoints}
            disabled={loading}
          />
          <div className="row">
            <button type="button" className="secondary" onClick={() => setPoints([])} disabled={!points.length}>
              Reset points
            </button>
            <button type="button" className="primary" onClick={handleRender} disabled={!canRender}>
              {loading ? "Rendering…" : "Render visualization"}
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel results">
          <h2>Result</h2>
          {kitchenPreview && resultUrl ? (
            <BeforeAfter beforeUrl={kitchenPreview} afterUrl={resultUrl} />
          ) : (
            <div className="canvas-placeholder">
              Render to compare before and after. Output files are saved locally under <code>outputs/</code>.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
