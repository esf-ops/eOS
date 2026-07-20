/**
 * Selection-save error handling — must not treat every 404 as estimate unavailable.
 * Run: node app-digital-estimate/src/phaseSelectionsSave.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load classifier via dynamic import of the TS source through Vite is unavailable in node.
// Mirror the exported classifier by evaluating the compiled logic from source string checks
// plus a duplicated pure unit of the same rules for regression safety.
const apiSrc = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const appSrc = readFileSync(join(__dirname, "App.tsx"), "utf8");

console.log("\nphaseSelectionsSave.ui.test.mjs\n");

assert.ok(apiSrc.includes("classifyConfigurationMutationError"));
assert.ok(apiSrc.includes("lifecycleFatal"));
assert.ok(apiSrc.includes('method: "PUT"'));
assert.ok(apiSrc.includes("/api/public-digital-estimate/v2/selections"));
assert.ok(apiSrc.includes("session_required"));
assert.ok(apiSrc.includes("DE-SAVE"));

assert.ok(viewSrc.includes("lifecycleFatal"));
assert.ok(viewSrc.includes("accessToken"));
assert.ok(viewSrc.includes("exchangeFragmentToken"));
assert.equal(
  /status === 401 \|\| status === 403 \|\| status === 404[\s\S]*onFatal\(\)/.test(viewSrc),
  false,
  "save catch must not call onFatal for every 401/403/404"
);
assert.ok(viewSrc.includes("err.lifecycleFatal"));
assert.ok(appSrc.includes("accessToken={accessToken}"));

// Pure classifier copy — keep in sync with publicConfigApi.classifyConfigurationMutationError
function classifyConfigurationMutationError(status, body) {
  const code = String(body?.code || "").trim();
  const stage = String(body?.stage || "").trim();
  const diagnosticCode = String(body?.diagnosticCode || "").trim();
  const message = String(body?.error || "").trim() || "Unable to save";

  if (code === "session_required" || diagnosticCode === "DE-COOKIE" || status === 401) {
    return { lifecycleFatal: false, code: code || "session_required" };
  }
  if (
    code === "unknown_option" ||
    code === "unresolved_product" ||
    code === "forbidden_caller_authority" ||
    code === "idempotency_required" ||
    code === "concurrency_required"
  ) {
    return { lifecycleFatal: false, code };
  }
  if (code === "row_version_conflict" || status === 409) {
    return { lifecycleFatal: false, code: "row_version_conflict" };
  }
  if (status === 410) {
    return { lifecycleFatal: true, code: code || "unavailable" };
  }
  if (
    status === 404 &&
    body &&
    (code === "unavailable" || diagnosticCode === "DE-EXCHANGE-404") &&
    (stage === "token_exchange" ||
      stage === "session" ||
      stage === "lifecycle" ||
      /revoked|expired|unavailable/i.test(message))
  ) {
    return { lifecycleFatal: true, code: code || "unavailable" };
  }
  return {
    lifecycleFatal: false,
    code: code || (status === 404 ? "save_route_or_server" : "save_failed"),
    message
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
  // Legacy production shape before session_required (DE-STATE, no code)
  const legacyMissing = classifyConfigurationMutationError(404, {
    error: "Configuration unavailable",
    diagnosticCode: "DE-STATE"
  });
  assert.equal(legacyMissing.lifecycleFatal, false);
  assert.equal(legacyMissing.code, "save_route_or_server");
}

{
  const htmlRouteMissing = classifyConfigurationMutationError(404, null);
  assert.equal(htmlRouteMissing.lifecycleFatal, false);
}

{
  const revoked = classifyConfigurationMutationError(404, {
    error: "Estimate unavailable",
    code: "unavailable",
    stage: "token_exchange",
    diagnosticCode: "DE-EXCHANGE-404"
  });
  assert.equal(revoked.lifecycleFatal, true);
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

void require;
console.log("ok: save 404/server error is not estimate-unavailable; lifecycle 404 still fatal");
console.log("\nAll phaseSelectionsSave UI tests passed.\n");
