import { useEffect, useState } from "react";
import { ConfigurationView } from "./ConfigurationView";
import { ReadOnlyEstimateView } from "./ReadOnlyEstimateView";
import {
  EstimateRenderError,
  normalizePublicEstimate,
} from "./normalizePublicEstimate";
import {
  clearFragmentFromUrl,
  configurationUiEnabled,
  exchangeFragmentToken,
  fetchPublicEstimateByToken,
  parseTokenFromHash,
  parseTokenFromPath,
  resumeConfigurationSession,
  type ConfigurationState,
  type PublicEstimate,
} from "./publicConfigApi";

const UNAVAILABLE_MESSAGE = "This estimate is unavailable.";

export { parseTokenFromPath, parseTokenFromHash };

function readBuildMarker(): string {
  try {
    const meta = document.querySelector('meta[name="eliteos-de-build"]');
    const v = meta?.getAttribute("content")?.trim();
    return v || "unknown";
  } catch {
    return "unknown";
  }
}

function UnavailableScreen({ diagnosticCode }: { diagnosticCode: string | null }) {
  const build = readBuildMarker();
  return (
    <div className="page">
      <main className="shell shell--narrow">
        <p className="unavailable" role="alert">
          {UNAVAILABLE_MESSAGE}
        </p>
        {diagnosticCode ? (
          <p className="status" aria-label="diagnostic code">
            {diagnosticCode}
          </p>
        ) : null}
        <p className="status" aria-label="build marker">
          build {build}
        </p>
      </main>
    </div>
  );
}

function clearAllState(
  setters: {
    setEstimate: (v: PublicEstimate | null) => void;
    setConfigState: (v: ConfigurationState | null) => void;
    setUnavailable: (v: boolean) => void;
    setDiagnosticCode?: (v: string | null) => void;
  },
  diagnosticCode: string | null = "DE-EXCHANGE-404",
) {
  setters.setEstimate(null);
  setters.setConfigState(null);
  setters.setUnavailable(true);
  setters.setDiagnosticCode?.(diagnosticCode);
}

function normalizeConfigurationState(state: ConfigurationState): ConfigurationState {
  if (state.estimate == null) return state;
  const estimate = normalizePublicEstimate(state.estimate);
  return { ...state, estimate };
}

function applyExchangeState(
  state: ConfigurationState,
  setters: {
    setEstimate: (v: PublicEstimate | null) => void;
    setConfigState: (v: ConfigurationState | null) => void;
    setUnavailable: (v: boolean) => void;
    setMode: (v: "legacy" | "configure" | "none") => void;
    setDiagnosticCode?: (v: string | null) => void;
  },
) {
  let normalized: ConfigurationState;
  try {
    normalized = normalizeConfigurationState(state);
  } catch (e) {
    const code =
      e instanceof EstimateRenderError ? e.diagnosticCode : "DE-RENDER-BASELINE";
    clearAllState(setters, code);
    setters.setMode("none");
    return;
  }

  const canConfigure =
    configurationUiEnabled() &&
    normalized.lifecycle === "active" &&
    Boolean(normalized.configuration);

  if (canConfigure) {
    setters.setConfigState(normalized);
    setters.setEstimate(normalized.estimate || null);
    setters.setMode("configure");
    setters.setDiagnosticCode?.(null);
    return;
  }

  if (normalized.estimate) {
    setters.setEstimate(normalized.estimate);
    setters.setConfigState(normalized);
    setters.setMode("legacy");
    setters.setDiagnosticCode?.(null);
    return;
  }

  clearAllState(setters, "DE-RENDER");
  setters.setMode("none");
}

export function App() {
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [configState, setConfigState] = useState<ConfigurationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"legacy" | "configure" | "none">("none");

  useEffect(() => {
    let cancelled = false;
    const setters = { setEstimate, setConfigState, setUnavailable, setMode, setDiagnosticCode };

    (async () => {
      const fragmentToken = parseTokenFromHash(window.location.hash);
      const pathToken = parseTokenFromPath(window.location.pathname);

      // Stable reusable link: /e/<token> (path) or legacy /e#<token> (fragment).
      // Shared public contract is GET /api/public-digital-estimate/v1/:token (not consumed).
      const accessToken = pathToken || fragmentToken;
      if (accessToken) {
        if (fragmentToken && !pathToken) {
          clearFragmentFromUrl();
        }
        try {
          const publicBody = await fetchPublicEstimateByToken(accessToken);
          if (cancelled) return;
          setEstimate(normalizePublicEstimate(publicBody.estimate));
          setMode("legacy");
          setDiagnosticCode(null);
          // Optional configure mode when UI flag + v2 session exchange succeed.
          if (configurationUiEnabled()) {
            try {
              const state = await exchangeFragmentToken(accessToken);
              if (!cancelled) applyExchangeState(state, setters);
            } catch {
              /* keep read-only baseline from v1 */
            }
          }
        } catch (e) {
          const code =
            e && typeof e === "object" && "diagnosticCode" in e
              ? String((e as { diagnosticCode?: string }).diagnosticCode || "DE-PUBLIC-404")
              : "DE-PUBLIC-404";
          if (!cancelled) clearAllState(setters, code);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (window.location.pathname === "/e" || window.location.pathname === "/e/") {
        try {
          const state = await resumeConfigurationSession();
          if (cancelled) return;
          applyExchangeState(state, setters);
        } catch (e) {
          const code = e instanceof EstimateRenderError ? e.diagnosticCode : "DE-COOKIE";
          if (!cancelled) clearAllState(setters, code);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        clearAllState(setters, "DE-STATE");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <main className="shell" aria-busy="true">
          <p className="status">Loading estimate…</p>
        </main>
      </div>
    );
  }

  if (unavailable || (!estimate && !configState)) {
    return <UnavailableScreen diagnosticCode={diagnosticCode} />;
  }

  if (mode === "configure" && configState) {
    return (
      <ConfigurationView
        state={configState}
        onState={setConfigState}
        onFatal={() => {
          setEstimate(null);
          setConfigState(null);
          setUnavailable(true);
          setDiagnosticCode("DE-STATE");
          setMode("none");
        }}
      />
    );
  }

  if (estimate) {
    const lifecycleNotice =
      configState?.lifecycle && configState.lifecycle !== "active"
        ? configState.message ||
          (configState.lifecycle === "expired"
            ? "Pricing expired. Contact your estimator for updated pricing."
            : configState.lifecycle === "revoked"
              ? "This estimate link has been revoked."
              : configState.lifecycle === "superseded"
                ? "A newer estimate is available. Contact your estimator."
                : "This estimate is unavailable.")
        : null;
    return (
      <div className="page">
        <main className="shell">
          {lifecycleNotice ? (
            <p className="unavailable" role="status" data-testid="de-lifecycle-notice">
              {lifecycleNotice}
            </p>
          ) : null}
          <ReadOnlyEstimateView estimate={estimate} />
        </main>
      </div>
    );
  }

  return <UnavailableScreen diagnosticCode={diagnosticCode || "DE-RENDER"} />;
}
