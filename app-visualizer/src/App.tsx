import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialPicker } from "./components/MaterialPicker";
import { PreviewPanel, type RecentRender } from "./components/PreviewPanel";
import { VisualizerHeader } from "./components/VisualizerHeader";
import { VisualizerSampleGallery } from "./components/VisualizerSampleGallery";
import {
  downloadDataUrl,
  fetchVisualizerConfig,
  fetchVisualizerTextures,
  renderVisualizer,
  VisualizerApiError,
  type VisualizerConfig,
} from "./lib/api";
import { VISUALIZER_DISCLAIMER } from "./lib/config";
import { VISUALIZER_SAMPLES } from "./lib/samples";
import { getSupabase } from "./lib/supabase";
import { buildLocalTextureCatalog, mergeApiTextures, type VisualizerTexture } from "./lib/textureCatalog";

type WorkflowStep = 1 | 2 | 3;
type Phase = "empty" | "ready" | "loading" | "result";

const MAX_UPLOAD_MB_DEFAULT = 10;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function friendlyError(err: unknown, maxUploadMb: number): string {
  if (err instanceof VisualizerApiError) {
    if (err.status === 413) return `Photo is too large. Maximum size is ${maxUploadMb} MB.`;
    if (err.status === 503) return String(err.message);
    if (err.status === 504) return "Render timed out. Please try again.";
    return String(err.message);
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [config, setConfig] = useState<VisualizerConfig | null>(null);
  const [textures, setTextures] = useState<VisualizerTexture[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [colorFamilies, setColorFamilies] = useState<string[]>([]);

  const [materialId, setMaterialId] = useState("");
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreview, setRoomPreview] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [error, setError] = useState<string | null>(null);
  const [recentRenders, setRecentRenders] = useState<RecentRender[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localCatalog = useMemo(() => buildLocalTextureCatalog(), []);

  const maxUploadMb = config?.maxUploadMb ?? MAX_UPLOAD_MB_DEFAULT;
  const workflowStep: WorkflowStep = !roomPreview ? 1 : !materialId ? 2 : 3;

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
      .then(setConfig)
      .catch(() => setConfig(null));

    void fetchVisualizerTextures(authToken)
      .then((payload) => {
        const merged = mergeApiTextures(payload.textures);
        setTextures(merged.length ? merged : localCatalog.textures);
        setGroups(payload.meta?.groups?.length ? payload.meta.groups : localCatalog.meta.groups);
        setColorFamilies(
          payload.meta?.colorFamilies?.length ? payload.meta.colorFamilies : localCatalog.meta.colorFamilies,
        );
        const first = (merged.length ? merged : localCatalog.textures)[0];
        if (first) setMaterialId(first.id);
      })
      .catch(() => {
        setTextures(localCatalog.textures);
        setGroups(localCatalog.meta.groups);
        setColorFamilies(localCatalog.meta.colorFamilies);
        if (localCatalog.textures[0]) setMaterialId(localCatalog.textures[0].id);
      });
  }, [authToken, localCatalog]);

  useEffect(() => {
    if (!roomFile) {
      setRoomPreview(null);
      setPhase("empty");
      return;
    }
    const url = URL.createObjectURL(roomFile);
    setRoomPreview(url);
    setRenderedImage(null);
    setPhase("ready");
    return () => URL.revokeObjectURL(url);
  }, [roomFile]);

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
    setRecentRenders([]);
    setPhase("empty");
  }

  function validateRoomFile(file: File): string | null {
    const mime = file.type.toLowerCase();
    if (mime && !ACCEPTED_TYPES.has(mime) && !mime.startsWith("image/")) {
      return "Unsupported file type. Use JPEG, PNG, or WebP.";
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      return `Photo is too large. Maximum size is ${maxUploadMb} MB.`;
    }
    return null;
  }

  function handleRoomFile(file: File | null) {
    if (!file) return;
    const validationError = validateRoomFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
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

  async function handleGenerate() {
    if (!authToken || !roomFile || !materialId || phase === "loading") return;
    if (config && !config.visualizerRenderEnabled) {
      setError("Visualizer render is disabled on the server.");
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      const result = await renderVisualizer({ token: authToken, roomFile, materialId });
      setRenderedImage(result.renderedImage);
      setMaterialName(result.materialName);
      setPhase("result");
      setRecentRenders((prev) => [
        {
          id: `${Date.now()}-${materialId}`,
          materialId,
          materialName: result.materialName,
          renderedImage: result.renderedImage,
          createdAt: Date.now(),
        },
        ...prev.filter((r) => r.materialId !== materialId).slice(0, 4),
      ]);
    } catch (err: unknown) {
      setPhase(roomPreview ? "ready" : "empty");
      setError(friendlyError(err, maxUploadMb));
    }
  }

  function handleTryAnotherColor() {
    setRenderedImage(null);
    setPhase(roomPreview ? "ready" : "empty");
    setError(null);
  }

  function handleUploadAnotherPhoto() {
    setRenderedImage(null);
    setRoomFile(null);
    setPhase("empty");
    setError(null);
    fileInputRef.current?.click();
  }

  function handleDownload() {
    if (!renderedImage) return;
    downloadDataUrl(renderedImage, `slabos-visualizer-${materialId || "result"}.png`);
  }

  function handleSelectRecent(item: RecentRender) {
    setRenderedImage(item.renderedImage);
    setMaterialName(item.materialName);
    setMaterialId(item.materialId);
    setPhase("result");
  }

  const canGenerate = Boolean(
    authToken && roomFile && materialId && phase !== "loading" && config?.visualizerRenderEnabled !== false,
  );

  if (!authToken) {
    return (
      <div className="app-shell auth-screen">
        <div className="auth-brand">
          <p className="vz-eyebrow">slabOS · eliteOS</p>
          <h1 className="vz-title">slabOS Visualizer</h1>
        </div>
        <div className="disclaimer">{VISUALIZER_DISCLAIMER}</div>
        <form className="panel auth-card" onSubmit={handleSignIn}>
          <h2>Sign in</h2>
          <p className="hint">Requires visualizer head access on your account.</p>
          <label>
            Email
            <input type="email" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} required />
          </label>
          {authError ? <p className="alert alert-error">{authError}</p> : null}
          <button type="submit" className="btn btn-primary">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <VisualizerHeader email={authEmail} config={config} onSignOut={() => void handleSignOut()} />

      <div className="disclaimer">{VISUALIZER_DISCLAIMER}</div>

      {config && !config.visualizerRenderEnabled ? (
        <div className="alert alert-warn">
          Render provider is disabled. Set <code>VISUALIZER_RENDER_ENABLED=1</code> on backend-core.
        </div>
      ) : null}

      <div className="workflow-steps" aria-label="Workflow progress">
        <div className={`workflow-step${workflowStep >= 1 ? " active" : ""}${workflowStep > 1 ? " done" : ""}`}>
          <span className="step-num">1</span> Room photo
        </div>
        <div className={`workflow-step${workflowStep >= 2 ? " active" : ""}${workflowStep > 2 ? " done" : ""}`}>
          <span className="step-num">2</span> Material
        </div>
        <div className={`workflow-step${workflowStep >= 3 ? " active" : ""}`}>
          <span className="step-num">3</span> Generate
        </div>
      </div>

      <main className="workspace">
        <section className="panel workflow-panel">
          <div className="panel-head">
            <h2>Workflow</h2>
            <p className="panel-sub">{textures.length} materials available</p>
          </div>

          <div className="workflow-block">
            <h3>1. Upload or choose room photo</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              onChange={(e) => handleRoomFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={phase === "loading"}
            >
              Upload photo
            </button>
            <VisualizerSampleGallery
              samples={VISUALIZER_SAMPLES}
              onSelectSample={(s) => void handleSampleSelect(s)}
              disabled={phase === "loading"}
            />
          </div>

          <div className="workflow-block">
            <h3>2. Choose countertop material</h3>
            <MaterialPicker
              textures={textures}
              groups={groups}
              colorFamilies={colorFamilies}
              selectedId={materialId}
              onSelect={setMaterialId}
              disabled={phase === "loading"}
            />
          </div>

          <div className="workflow-block">
            <h3>3. Generate visualization</h3>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
            >
              {phase === "loading" ? "Generating…" : "Generate visualization"}
            </button>
            {!roomFile ? <p className="hint">Upload a room photo first.</p> : null}
            {roomFile && !materialId ? <p className="hint">Select a countertop material.</p> : null}
          </div>
        </section>

        <PreviewPanel
          phase={phase}
          roomPreview={roomPreview}
          renderedImage={renderedImage}
          materialName={materialName}
          error={error}
          recentRenders={recentRenders}
          onSelectRecent={handleSelectRecent}
          onTryAnotherColor={handleTryAnotherColor}
          onUploadAnotherPhoto={handleUploadAnotherPhoto}
          onDownload={handleDownload}
        />
      </main>
    </div>
  );
}
