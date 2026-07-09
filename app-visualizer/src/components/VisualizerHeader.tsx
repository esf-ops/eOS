import type { VisualizerConfig } from "../lib/api";

type VisualizerHeaderProps = {
  email: string | null;
  config: VisualizerConfig | null;
  onSignOut: () => void;
};

export function VisualizerHeader({ email, config, onSignOut }: VisualizerHeaderProps) {
  const providerLabel = config
    ? config.visualizerRenderEnabled
      ? `${config.activeProvider} · ${config.model}`
      : "Render disabled"
    : "Checking provider…";

  return (
    <header className="vz-header">
      <div className="vz-brand">
        <p className="vz-eyebrow">slabOS · eliteOS</p>
        <h1 className="vz-title">slabOS Visualizer</h1>
        <p className="vz-tagline">Countertop concept visualization</p>
      </div>
      <div className="vz-header-meta">
        <div className="vz-status-pill" data-enabled={config?.visualizerRenderEnabled ? "true" : "false"}>
          <span className="vz-status-dot" aria-hidden />
          {providerLabel}
        </div>
        {email ? <span className="vz-user">{email}</span> : null}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
