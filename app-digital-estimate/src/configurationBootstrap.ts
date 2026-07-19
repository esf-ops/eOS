/**
 * Pure view-selection for public Digital Estimate bootstrap.
 * Server envelope + lifecycle remain authoritative; the Vite flag is a UI kill-switch only.
 */

export type BootstrapMode = "configure" | "legacy" | "none";

export type FallbackReason =
  | "ui_flag_disabled"
  | "exchange_failed"
  | "lifecycle_not_active"
  | "configuration_absent"
  | "estimate_missing"
  | "render_error"
  | null;

export type BootstrapDecision = {
  mode: BootstrapMode;
  fallbackReason: FallbackReason;
};

/**
 * Configuration UI kill-switch.
 * - exact "false" → force read-only legacy
 * - unset / "true" / anything else → allow ConfigurationView when the server returns an active envelope
 */
export function isConfigurationUiKillSwitchOff(rawEnvValue: string | undefined | null): boolean {
  return String(rawEnvValue ?? "").trim() !== "false";
}

export function decideConfigurationView(input: {
  uiEnabled: boolean;
  lifecycle?: string | null;
  hasConfiguration: boolean;
  hasEstimate: boolean;
}): BootstrapDecision {
  if (!input.uiEnabled) {
    return {
      mode: input.hasEstimate ? "legacy" : "none",
      fallbackReason: "ui_flag_disabled"
    };
  }

  if (
    input.lifecycle === "active" &&
    input.hasConfiguration &&
    input.hasEstimate
  ) {
    return { mode: "configure", fallbackReason: null };
  }

  if (input.hasEstimate) {
    if (input.lifecycle && input.lifecycle !== "active") {
      return { mode: "legacy", fallbackReason: "lifecycle_not_active" };
    }
    if (!input.hasConfiguration) {
      return { mode: "legacy", fallbackReason: "configuration_absent" };
    }
    return { mode: "legacy", fallbackReason: "lifecycle_not_active" };
  }

  return { mode: "none", fallbackReason: "estimate_missing" };
}

export function isDevDiagnosticsEnabled(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}
