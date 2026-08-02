/**
 * Final-acceptance action errors must not wipe a loaded estimate page.
 * Run: node app-digital-estimate/src/finalAcceptanceActionError.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const apiSrc = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const appSrc = readFileSync(join(__dirname, "App.tsx"), "utf8");

const ACCEPT_PUBLICATION_SUPERSEDED_MESSAGE =
  "A newer estimate is available. Please use the latest estimate link from Elite.";

/** Keep in sync with publicConfigApi.readSafeLatestEstimateUrl */
function readSafeLatestEstimateUrl(body) {
  if (!body || typeof body !== "object") return null;
  for (const key of [
    "latestEstimateUrl",
    "latestCustomerUrl",
    "replacementCustomerUrl",
    "customerUrl",
  ]) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/** Keep in sync with publicConfigApi.classifyFinalAcceptanceError */
function classifyFinalAcceptanceError(status, body) {
  const code = String(body?.code || "").trim();
  const latestEstimateUrl = readSafeLatestEstimateUrl(body);
  if (
    code === "publication_superseded" ||
    (status === 410 && /newer estimate/i.test(String(body?.error || "")))
  ) {
    return {
      message: ACCEPT_PUBLICATION_SUPERSEDED_MESSAGE,
      code: code || "publication_superseded",
      lifecycleFatal: false,
      latestEstimateUrl,
    };
  }
  if (
    code === "publication_revoked" ||
    code === "publication_expired" ||
    code === "publication_unavailable"
  ) {
    return {
      message: "This estimate link is no longer active. Please contact Elite.",
      code,
      lifecycleFatal: false,
      latestEstimateUrl,
    };
  }
  return {
    message: String(body?.error || "We couldn’t record your acceptance. Please try again."),
    code: code || "accept_failed",
    lifecycleFatal: false,
    latestEstimateUrl,
  };
}

console.log("\nfinalAcceptanceActionError.ui.test.mjs\n");

{
  const superseded = classifyFinalAcceptanceError(410, {
    error: "A newer estimate is available...",
    code: "publication_superseded",
    lifecycleFatal: true,
  });
  assert.equal(superseded.lifecycleFatal, false);
  assert.equal(superseded.code, "publication_superseded");
  assert.equal(superseded.message, ACCEPT_PUBLICATION_SUPERSEDED_MESSAGE);
  assert.equal(superseded.latestEstimateUrl, null);
  console.log("ok: 1 publication_superseded → friendly non-fatal action error");
}

{
  const withLink = classifyFinalAcceptanceError(410, {
    code: "publication_superseded",
    lifecycleFatal: true,
    latestCustomerUrl: "https://estimate.example/e/latest-token",
  });
  assert.equal(withLink.lifecycleFatal, false);
  assert.equal(withLink.latestEstimateUrl, "https://estimate.example/e/latest-token");
  assert.equal(readSafeLatestEstimateUrl({ latestCustomerUrl: "not-a-url" }), null);
  assert.equal(readSafeLatestEstimateUrl({ latestEstimateUrl: "/relative" }), null);
  console.log("ok: 2 optional latest link only when server provides absolute http(s) URL");
}

{
  assert.ok(apiSrc.includes("classifyFinalAcceptanceError"));
  assert.ok(apiSrc.includes("readSafeLatestEstimateUrl"));
  assert.ok(apiSrc.includes(ACCEPT_PUBLICATION_SUPERSEDED_MESSAGE));
  assert.match(apiSrc, /classifyFinalAcceptanceError\(res\.status,\s*body\)/);
  assert.ok(
    /export function classifyConfigurationMutationError[\s\S]*publication_superseded[\s\S]*lifecycleFatal:\s*true/.test(
      apiSrc,
    ),
    "save/review mutation classifier still marks publication_superseded lifecycleFatal",
  );
  console.log("ok: 3 API wires action classifier; mutation lifecycleFatal unchanged");
}

{
  const acceptFn = viewSrc.slice(
    viewSrc.indexOf("async function onAcceptFinal"),
    viewSrc.indexOf("function applyPlumbingSource"),
  );
  assert.ok(acceptFn.includes("setAcceptError"));
  assert.equal(
    acceptFn.includes("onFatal("),
    false,
    "final-acceptance catch must not wipe the page via onFatal",
  );
  assert.ok(acceptFn.includes("publication_superseded"));
  assert.ok(acceptFn.includes(ACCEPT_PUBLICATION_SUPERSEDED_MESSAGE));
  assert.ok(viewSrc.includes("de-accept-modal-error"));
  assert.ok(viewSrc.includes('data-testid="de-accept-error"'));
  assert.ok(viewSrc.includes('data-testid="de-page-shell"'));
  assert.ok(viewSrc.includes("Accept estimate with these selections"));
  assert.ok(viewSrc.includes("canAcceptPublishedEstimate") || viewSrc.includes("acceptMode"));
  console.log("ok: 4 accept action keeps estimate UI; shows modal/inline error");
}

{
  assert.ok(appSrc.includes("UnavailableScreen"));
  assert.ok(appSrc.includes("setUnavailable(true)"));
  assert.ok(appSrc.includes('setDiagnosticCode("DE-STATE")'));
  assert.ok(viewSrc.includes("Accept estimate"));
  console.log("ok: 5 initial load fatal/unavailable + accept CTAs preserved");
}

console.log("\nAll final-acceptance action error UI tests passed.\n");
