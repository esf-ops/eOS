import { useEffect, useState } from "react";
import { ConfigurationView } from "./ConfigurationView";
import { ReadOnlyEstimateView } from "./ReadOnlyEstimateView";
import {
  clearFragmentFromUrl,
  configurationUiEnabled,
  exchangeFragmentToken,
  fetchLegacyPathEstimate,
  parseTokenFromHash,
  parseTokenFromPath,
  resumeConfigurationSession,
  type ConfigurationState,
  type PublicEstimate,
} from "./publicConfigApi";

const UNAVAILABLE_MESSAGE = "This estimate is unavailable.";

export { parseTokenFromPath, parseTokenFromHash };

function clearAllState(
  setters: {
    setEstimate: (v: PublicEstimate | null) => void;
    setConfigState: (v: ConfigurationState | null) => void;
    setUnavailable: (v: boolean) => void;
  },
) {
  setters.setEstimate(null);
  setters.setConfigState(null);
  setters.setUnavailable(true);
}

export function App() {
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [configState, setConfigState] = useState<ConfigurationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<"legacy" | "configure" | "none">("none");

  useEffect(() => {
    let cancelled = false;
    const setters = { setEstimate, setConfigState, setUnavailable };

    (async () => {
      const fragmentToken = parseTokenFromHash(window.location.hash);
      const pathToken = parseTokenFromPath(window.location.pathname);

      // Prefer fragment (DE.2E). Clear fragment after successful exchange.
      if (fragmentToken && configurationUiEnabled()) {
        try {
          const state = await exchangeFragmentToken(fragmentToken);
          if (cancelled) return;
          clearFragmentFromUrl();
          if (state.lifecycle === "active" && state.configuration) {
            setConfigState(state);
            setEstimate(state.estimate || null);
            setMode("configure");
          } else if (state.estimate) {
            // No active envelope — read-only baseline from session exchange
            setEstimate(state.estimate);
            setConfigState(state);
            setMode("legacy");
          } else {
            clearAllState(setters);
          }
        } catch {
          if (!cancelled) {
            clearFragmentFromUrl();
            clearAllState(setters);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Try resume cookie session when on /e without token (refresh)
      if (
        configurationUiEnabled() &&
        !fragmentToken &&
        !pathToken &&
        (window.location.pathname === "/e" || window.location.pathname === "/e/")
      ) {
        try {
          const state = await resumeConfigurationSession();
          if (cancelled) return;
          if (state.lifecycle === "active" && state.configuration) {
            setConfigState(state);
            setEstimate(state.estimate || null);
            setMode("configure");
          } else if (state.estimate) {
            setEstimate(state.estimate);
            setMode("legacy");
          } else {
            clearAllState(setters);
          }
        } catch {
          if (!cancelled) clearAllState(setters);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Legacy DE.1 path-token read-only
      if (pathToken) {
        try {
          const dto = await fetchLegacyPathEstimate(pathToken);
          if (cancelled) return;
          setEstimate(dto);
          setMode("legacy");
        } catch {
          if (!cancelled) clearAllState(setters);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Fragment present but config UI flag off → treat as unavailable for config; try not to use path
      if (fragmentToken && !configurationUiEnabled()) {
        // Fallback: use legacy API with bearer not supported on v1 — show unavailable
        // (operators must enable public config UI flag for fragment links)
        if (!cancelled) {
          clearFragmentFromUrl();
          clearAllState(setters);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        clearAllState(setters);
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
    return (
      <div className="page">
        <main className="shell shell--narrow">
          <p className="unavailable" role="alert">
            {UNAVAILABLE_MESSAGE}
          </p>
        </main>
      </div>
    );
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
          setMode("none");
        }}
      />
    );
  }

  if (estimate) {
    return (
      <div className="page">
        <main className="shell">
          <ReadOnlyEstimateView estimate={estimate} />
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <main className="shell shell--narrow">
        <p className="unavailable" role="alert">
          {UNAVAILABLE_MESSAGE}
        </p>
      </main>
    </div>
  );
}
