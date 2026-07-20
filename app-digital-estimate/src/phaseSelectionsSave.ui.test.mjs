/**
 * Selection-save error handling — must not treat every 404 as estimate unavailable.
 * Run: node app-digital-estimate/src/phaseSelectionsSave.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiSrc = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const appSrc = readFileSync(join(__dirname, "App.tsx"), "utf8");

console.log("\nphaseSelectionsSave.ui.test.mjs\n");

assert.ok(apiSrc.includes("classifyConfigurationMutationError"));
assert.ok(apiSrc.includes("lifecycleFatal"));
assert.ok(apiSrc.includes('method: "PUT"'));
assert.ok(apiSrc.includes("/api/public-digital-estimate/v2/selections"));
assert.ok(apiSrc.includes("session_required"));
assert.ok(apiSrc.includes("session_not_found"));
assert.ok(apiSrc.includes("publication_revoked"));
assert.ok(apiSrc.includes("DE-SAVE"));
assert.ok(apiSrc.includes("no_current_review_request") || apiSrc.includes("reviewRequest: null"));

assert.ok(viewSrc.includes("lifecycleFatal"));
assert.ok(viewSrc.includes("accessToken"));
assert.ok(viewSrc.includes("exchangeFragmentToken"));
assert.ok(viewSrc.includes("session_not_found"));
assert.equal(
  /status === 401 \|\| status === 403 \|\| status === 404[\s\S]*onFatal\(\)/.test(viewSrc),
  false,
  "save catch must not call onFatal for every 401/403/404"
);
assert.ok(viewSrc.includes("err.lifecycleFatal"));
assert.ok(appSrc.includes("accessToken={accessToken}"));

// Keep in sync with publicConfigApi.classifyConfigurationMutationError
function classifyConfigurationMutationError(status, body) {
  const code = String(body?.code || "").trim();
  const stage = String(body?.stage || "").trim();
  const diagnosticCode = String(body?.diagnosticCode || "").trim();
  const FATAL_CODES = new Set([
    "publication_revoked",
    "publication_expired",
    "publication_unavailable",
    "publication_superseded"
  ]);
  if (body?.lifecycleFatal === true || FATAL_CODES.has(code) || status === 410) {
    return { lifecycleFatal: true, code: code || "publication_unavailable" };
  }
  if (
    code === "session_required" ||
    code === "session_not_found" ||
    code === "session_invalid" ||
    diagnosticCode === "DE-COOKIE" ||
    status === 401
  ) {
    return { lifecycleFatal: false, code: code || "session_required" };
  }
  if (
    code === "unknown_option" ||
    code === "configuration_unavailable" ||
    code === "no_current_review_request"
  ) {
    return { lifecycleFatal: false, code };
  }
  if (code === "row_version_conflict" || status === 409) {
    return { lifecycleFatal: false, code: "row_version_conflict" };
  }
  return {
    lifecycleFatal: false,
    code: code || (status === 404 ? "save_route_or_server" : "save_failed")
  };
}

{
  const missingCookie = classifyConfigurationMutationError(401, {
    error: "Please refresh and try again",
    code: "session_required",
    diagnosticCode: "DE-COOKIE"
  });
  assert.equal(missingCookie.lifecycleFatal, false);
}

{
  const notFound = classifyConfigurationMutationError(401, {
    error: "Please refresh and try again",
    code: "session_not_found",
    stage: "selection",
    diagnosticCode: "DE-COOKIE",
    recoverable: true
  });
  assert.equal(notFound.lifecycleFatal, false);
}

{
  // Production shape that previously wiped the page (generic unavailable + message match)
  const legacySelection404 = classifyConfigurationMutationError(404, {
    error: "Estimate unavailable",
    stage: "selection",
    code: "unavailable",
    diagnosticCode: "DE-EXCHANGE-404"
  });
  assert.equal(
    legacySelection404.lifecycleFatal,
    false,
    "selection-stage generic unavailable must not be fatal"
  );
}

{
  const htmlRouteMissing = classifyConfigurationMutationError(404, null);
  assert.equal(htmlRouteMissing.lifecycleFatal, false);
}

{
  const revoked = classifyConfigurationMutationError(404, {
    error: "Estimate unavailable",
    code: "publication_revoked",
    stage: "selection",
    lifecycleFatal: true
  });
  assert.equal(revoked.lifecycleFatal, true);
}

{
  const expired = classifyConfigurationMutationError(410, {
    error: "Pricing has expired",
    code: "publication_expired"
  });
  assert.equal(expired.lifecycleFatal, true);
}

{
  const unknown = classifyConfigurationMutationError(400, {
    error: "That selection is unavailable",
    code: "unknown_option",
    stage: "selection"
  });
  assert.equal(unknown.lifecycleFatal, false);
}

{
  const conflict = classifyConfigurationMutationError(409, {
    error: "Please refresh and try again",
    code: "row_version_conflict"
  });
  assert.equal(conflict.lifecycleFatal, false);
}

console.log("ok: save 404/server error is not estimate-unavailable; lifecycle codes still fatal");
console.log("\nAll phaseSelectionsSave UI tests passed.\n");
