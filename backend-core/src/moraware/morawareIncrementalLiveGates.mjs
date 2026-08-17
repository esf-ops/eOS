/**
 * Production authorization gates for Moraware incremental LIVE writes.
 * Distinct from dry-run `--allow-moraware-read` (reads only).
 */

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

export const MORAWARE_INCREMENTAL_EXECUTE_PHRASE = "I_UNDERSTAND_PRODUCTION_WRITES";

/**
 * All four gates required. Missing any one ⇒ refuse before network/mutation.
 */
export function evaluateMorawareIncrementalLiveGates({
  argv = [],
  env = process.env
} = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const live = args.includes("--live");
  const allow = args.includes("--allow-live-incremental");
  const envAllow = pickStr(env?.MORAWARE_INCREMENTAL_LIVE) === "1";
  const execute =
    pickStr(env?.MORAWARE_INCREMENTAL_EXECUTE) === MORAWARE_INCREMENTAL_EXECUTE_PHRASE;

  const missing = [];
  if (!live) missing.push("--live");
  if (!allow) missing.push("--allow-live-incremental");
  if (!envAllow) missing.push("MORAWARE_INCREMENTAL_LIVE=1");
  if (!execute) missing.push(`MORAWARE_INCREMENTAL_EXECUTE=${MORAWARE_INCREMENTAL_EXECUTE_PHRASE}`);

  return {
    ok: missing.length === 0,
    live,
    allow_live_incremental: allow,
    env_live: envAllow,
    execute_phrase_ok: execute,
    missing,
    status: missing.length ? "live_incremental_gates_refused" : "live_incremental_gates_ok",
    note:
      missing.length === 0
        ? "All four production gates present."
        : "Refuse before Moraware contact or Supabase mutation."
  };
}

export function formatLiveIncrementalGateRefusal(gates) {
  return [
    "REFUSED: live incremental requires all of:",
    "  --live",
    "  --allow-live-incremental",
    "  MORAWARE_INCREMENTAL_LIVE=1",
    `  MORAWARE_INCREMENTAL_EXECUTE=${MORAWARE_INCREMENTAL_EXECUTE_PHRASE}`,
    "",
    `missing=${(gates?.missing || []).join(", ") || "(none)"}`,
    "",
    "Use dry-run instead:",
    "  npm run eos:moraware:incremental:dry-run"
  ].join("\n");
}
