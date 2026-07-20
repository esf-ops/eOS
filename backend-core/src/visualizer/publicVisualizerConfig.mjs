/**
 * Public visualizer configuration — separate from protected /api/visualizer/* routes.
 */
import { VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import { readRenderConfig } from "./visualizerRenderProvider.mjs";

function envFlag(name, defaultFalse = true) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw && defaultFalse) return false;
  return raw === "1";
}

function envInt(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @returns {{
 *   enabled: boolean,
 *   renderEnabled: boolean,
 *   maxUploadMb: number,
 *   maxRendersPerIpPerHour: number,
 * }}
 */
export function readPublicVisualizerConfig() {
  const maxUploadMb = envInt(
    "PUBLIC_VISUALIZER_MAX_UPLOAD_MB",
    envInt("VISUALIZER_MAX_UPLOAD_MB", 10),
  );
  return {
    enabled: envFlag("PUBLIC_VISUALIZER_ENABLED"),
    renderEnabled: envFlag("PUBLIC_VISUALIZER_RENDER_ENABLED"),
    maxUploadMb,
    maxRendersPerIpPerHour: envInt("PUBLIC_VISUALIZER_MAX_RENDERS_PER_IP_PER_HOUR", 12),
    useElite100Assets: envFlag("PUBLIC_VISUALIZER_USE_ELITE100_ASSETS"),
    organizationId: resolvePublicVisualizerOrganizationId(),
  };
}

/**
 * @returns {string|null}
 */
export function resolvePublicVisualizerOrganizationId() {
  // Prefer SlabOS org (same as kiosk / inventory Elite 100 surfaces).
  return (
    String(process.env.SLABOS_ORGANIZATION_ID ?? "").trim() ||
    String(process.env.PUBLIC_VISUALIZER_ORGANIZATION_ID ?? "").trim() ||
    String(process.env.SLABCLOUD_ORGANIZATION_ID ?? "").trim() ||
    null
  );
}

/**
 * @returns {{ useElite100Assets: boolean, organizationId: string|null }}
 */
export function readPublicVisualizerAssetConfig() {
  const pub = readPublicVisualizerConfig();
  return {
    useElite100Assets: pub.useElite100Assets,
    organizationId: pub.organizationId,
  };
}

/**
 * Effective render config for public channel (provider keys remain backend-only).
 * @returns {{
 *   publicSurfaceEnabled: boolean,
 *   renderEnabled: boolean,
 *   maxUploadBytes: number,
 *   providerName: string,
 *   modelName: string,
 *   apiKey: string|null,
 * }}
 */
export function readPublicRenderConfig() {
  const pub = readPublicVisualizerConfig();
  const provider = readRenderConfig();
  const renderEnabled =
    pub.enabled &&
    pub.renderEnabled &&
    Boolean(provider.apiKey);

  return {
    publicSurfaceEnabled: pub.enabled,
    renderEnabled,
    maxUploadBytes: pub.maxUploadMb * 1024 * 1024,
    providerName: provider.providerName,
    modelName: provider.modelName,
    apiKey: provider.apiKey,
  };
}

/**
 * Safe public config for GET /api/public-visualizer/config — no secrets.
 */
export function readSafePublicVisualizerConfig() {
  const pub = readPublicVisualizerConfig();
  const provider = readRenderConfig();
  const renderReady = pub.enabled && pub.renderEnabled && Boolean(provider.apiKey);

  return {
    publicVisualizerEnabled: pub.enabled,
    renderEnabled: renderReady,
    maxUploadMb: pub.maxUploadMb,
    maxRendersPerIpPerHour: pub.maxRendersPerIpPerHour,
    providerLabel: renderReady ? provider.providerName : null,
    disclaimer: VISUALIZER_DISCLAIMER,
  };
}
