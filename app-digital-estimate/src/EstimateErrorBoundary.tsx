import { Component, type ErrorInfo, type ReactNode } from "react";
import { EstimateRenderError } from "./normalizePublicEstimate";

type Props = {
  children: ReactNode;
  buildMarker?: string;
};

type State = {
  failed: boolean;
  diagnosticCode: string;
};

function readBuildMarker(): string {
  try {
    const meta = document.querySelector('meta[name="eliteos-de-build"]');
    const v = meta?.getAttribute("content")?.trim();
    return v || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Top-level render safety net. Never surfaces raw error messages or payloads.
 */
export class EstimateErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, diagnosticCode: "DE-RENDER" };

  static getDerivedStateFromError(error: Error): State {
    const diagnosticCode =
      error instanceof EstimateRenderError
        ? error.diagnosticCode
        : "DE-RENDER-BASELINE";
    return { failed: true, diagnosticCode };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Log only class + stage code — never message/stack content (may embed payload).
    const stage =
      error instanceof EstimateRenderError ? error.stage : "unknown";
    const code =
      error instanceof EstimateRenderError ? error.diagnosticCode : "DE-RENDER";
    console.error("[digital-estimate]", error.name || "Error", code, stage);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const build = this.props.buildMarker || readBuildMarker();
    return (
      <div className="page">
        <main className="shell shell--narrow">
          <p className="unavailable" role="alert">
            This estimate could not be displayed.
          </p>
          <p className="status" aria-label="diagnostic code">
            {this.state.diagnosticCode}
          </p>
          <p className="status" aria-label="build marker">
            build {build}
          </p>
        </main>
      </div>
    );
  }
}
