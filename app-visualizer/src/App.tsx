import { useEffect, useMemo, useRef, useState } from "react";
import { BeforeAfterSlider } from "./components/BeforeAfterSlider";
import { VisualizerSampleGallery } from "./components/VisualizerSampleGallery";
import {
  downloadDataUrl,
  fetchVisualizerConfig,
  fetchVisualizerTextures,
  renderVisualizer,
  type VisualizerTexture,
} from "./lib/api";
import { VISUALIZER_DISCLAIMER } from "./lib/config";
import { listDemoTextures } from "./lib/demoTextures";
import { VISUALIZER_SAMPLES } from "./lib/samples";
import { getSupabase } from "./lib/supabase";

type Phase = "setup" | "loading" | "result";

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [textures, setTextures] = useState<VisualizerTexture[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreview, setRoomPreview] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [renderEnabled, setRenderEnabled] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localTextures = useMemo(() => listDemoTextures(), []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    void sb.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
      setAuthEmail(data.session?.user?.email ?? null);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
      setAuthEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authToken) return;
    void fetchVisualizerConfig(authToken)
      .then((cfg) => setRenderEnabled(cfg.visualizerRenderEnabled))
      .catch(() => setRenderEnabled(false));

    void fetchVisualizerTextures(authToken)
      .then((items) => {
        setTextures(items);
        const first = items.find((t) => t.hasImage) ?? items[0];
        if (first) setMaterialId(first.id);
      })
      .catch(() => {
        const fallback = localTextures.map((t) => ({
          id: t.id,
          name: t.colorName,
          slug: t.slug,
          thumbUrl: t.thumbUrl,
          fullUrl: t.fullUrl,
          hasImage: true,
        }));
        setTextures(fallback);
        if (fallback[0]) setMaterialId(fallback[0].id);
      });
  }, [authToken, localTextures]);

  useEffect(() => {
    if (!roomFile) {
      setRoomPreview(null);
      return;
    }
    const url = URL.createObjectURL(roomFile);
    setRoomPreview(url);
    setRenderedImage(null);
    setPhase("setup");
    return () => URL.revokeObjectURL(url);
  }, [roomFile]);

  const selectedTexture = textures.find((t) => t.id === materialId) ?? null;

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setAuthError(null);
    const sb = getSupabase();
    if (!sb) {
      setAuthError("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
      return;
    }
    const { error: signInErr } = await sb.auth.signInWithPassword({
      email: signInEmail.trim(),
      password: signInPassword,
    });
    if (signInErr) setAuthError(signInErr.message);
  }

  async function handleSignOut() {
    await getSupabase()?.auth.signOut();
    setRenderedImage(null);
    setRoomFile(null);
    setPhase("setup");
  }

  function handleRoomFile(file: File | null) {
    if (!file) return;
    setError(null);
    setRoomFile(file);
  }

  async function handleSampleSelect(sample: (typeof VISUALIZER_SAMPLES)[number]) {
    setError(null);
    try {
      const res = await fetch(sample.imageUrl);
      if (!res.ok) throw new Error("Failed to load sample");
      const blob = await res.blob();
      const ext = sample.imageUrl.endsWith(".svg") ? "svg" : "jpg";
      handleRoomFile(new File([blob], `${sample.id}.${ext}`, { type: blob.type || "image/svg+xml" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load sample");
    }
  }

  async function handleVisualize() {
    if (!authToken || !roomFile || !materialId) return;
    setPhase("loading");
    setError(null);
    try {
      const result = await renderVisualizer({ token: authToken, roomFile, materialId });
      setRenderedImage(result.renderedImage);
      setMaterialName(result.materialName);
      setPhase("result");
    } catch (err: unknown) {
      setPhase("setup");
      setError(err instanceof Error ? err.message : "Render failed");
    }
  }

  function handleTryAnotherColor() {
    setRenderedImage(null);
    setPhase("setup");
  }

  function handleUploadAnotherPhoto() {
    setRenderedImage(null);
    setRoomFile(null);
    setPhase("setup");
    fileInputRef.current?.click();
  }

  function handleDownload() {
    if (!renderedImage) return;
    const slug = materialId || "visualizer";
    downloadDataUrl(renderedImage, `eliteos-visualizer-${slug}.png`);
  }

  const canVisualize = Boolean(authToken && roomFile && materialId && phase !== "loading");

  if (!authToken) {
    return (
      <div className="app auth-screen">
        <header className="header">
          <p className="eyebrow">eliteOS · Standalone MVP</p>
          <h1>Countertop Visualizer</h1>
        </header>
        <div className="disclaimer">{VISUALIZER_DISCLAIMER}</div>
        <form className="auth-card panel" onSubmit={handleSignIn}>
          <h2>Sign in</h2>
          <p className="hint">Visualizer routes require authentication and visualizer head access.</p>
          <label>
            Email
            <input type="email" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} required />
          </label>
          {authError ? <p className="error">{authError}</p> : null}
          <button type="submit" className="primary">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">eliteOS · Standalone MVP</p>
          <h1>Countertop Visualizer</h1>
          <p className="subtitle">AI concept render via backend-core · {authEmail}</p>
        </div>
        <button type="button" className="secondary" onClick={() => void handleSignOut()}>Sign out</button>
      </header>

      <div className="disclaimer" role="note">{VISUALIZER_DISCLAIMER}</div>

      {renderEnabled === false ? (
        <div className="banner banner-warn">
          Visualizer render is disabled on the server. Set <code>VISUALIZER_RENDER_ENABLED=1</code> and configure a provider API key.
        </div>
      ) : null}

      <main className="layout">
        <section className="panel controls">
          <h2>1. Room photo</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            onChange={(e) => handleRoomFile(e.target.files?.[0] ?? null)}
          />
          <div className="row">
            <button type="button" className="primary" onClick={() => fileInputRef.current?.click()}>
              Upload photo
            </button>
          </div>
          <VisualizerSampleGallery
            samples={VISUALIZER_SAMPLES}
            onSelectSample={(s) => void handleSampleSelect(s)}
            disabled={phase === "loading"}
          />

          <h2>2. Countertop material</h2>
          <div className="texture-grid">
            {textures.map((texture) => (
              <button
                key={texture.id}
                type="button"
                className={`texture-card${materialId === texture.id ? " selected" : ""}`}
                onClick={() => setMaterialId(texture.id)}
                disabled={phase === "loading"}
              >
                <img src={texture.thumbUrl} alt={texture.name} loading="lazy" />
                <span>{texture.name}</span>
              </button>
            ))}
          </div>

          <div className="row actions">
            <button
              type="button"
              className="primary visualize-btn"
              disabled={!canVisualize}
              onClick={() => void handleVisualize()}
            >
              {phase === "loading" ? "Visualizing…" : "Visualize"}
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel results">
          <h2>Preview</h2>
          {phase === "loading" ? (
            <div className="placeholder loading-state">
              <div className="spinner" aria-hidden />
              <p>Generating concept visualization…</p>
            </div>
          ) : phase === "result" && roomPreview && renderedImage ? (
            <>
              {materialName ? <p className="result-meta">Material: {materialName}</p> : null}
              <BeforeAfterSlider beforeSrc={roomPreview} afterSrc={renderedImage} />
              <div className="disclaimer inline-disclaimer">{VISUALIZER_DISCLAIMER}</div>
              <div className="row actions">
                <button type="button" className="secondary" onClick={handleTryAnotherColor}>
                  Try another color
                </button>
                <button type="button" className="secondary" onClick={handleUploadAnotherPhoto}>
                  Upload another photo
                </button>
                <button type="button" className="primary" onClick={handleDownload}>
                  Download result
                </button>
              </div>
            </>
          ) : roomPreview ? (
            <div className="single-preview">
              <img src={roomPreview} alt="Uploaded room" />
              <p className="hint">Choose a material and click Visualize.</p>
            </div>
          ) : (
            <div className="placeholder">Upload a kitchen photo or pick a sample to begin.</div>
          )}

          {selectedTexture && phase !== "result" ? (
            <p className="hint selected-material">Selected: {selectedTexture.name}</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
