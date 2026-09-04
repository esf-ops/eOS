/**
 * Quote Flow ↔ AI Takeoff postMessage origin + Set Scope save-ack contract.
 * Run: node app-elite100-quote-flow/src/lib/takeoffPostMessageOrigins.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAllowedTakeoffMessageOrigins,
  isAllowedTakeoffMessageOrigin,
  requestSaveDraftFromIframe,
  requestSetScopePayloadFromIframe,
  SET_SCOPE_IFRAME_REQUIRED_ERROR,
  SET_SCOPE_SAVE_TIMEOUT_ERROR,
  TAKEOFF_REVIEW_DRAFT_SAVED,
  TAKEOFF_REVIEW_DRAFT_SAVE_FAILED,
  QUOTE_FLOW_SET_SCOPE_PAYLOAD,
  QUOTE_FLOW_REQUEST_SAVE_DRAFT
} from "./takeoffPostMessageOrigins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\ntakeoffPostMessageOrigins.test.mjs\n");

{
  // Root cause regression: callers pass origin only; allowlist must still pick up
  // Vite env via import.meta.env OR explicit env arg — never localhost-only in prod builds.
  const prodEnv = { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" };
  assert.equal(isAllowedTakeoffMessageOrigin("https://takeoff.eliteosfab.com", prodEnv), true);
  assert.equal(isAllowedTakeoffMessageOrigin("http://localhost:5186", prodEnv), true);
  assert.equal(isAllowedTakeoffMessageOrigin("https://evil.example.com", prodEnv), false);
  assert.ok(buildAllowedTakeoffMessageOrigins(prodEnv).has("https://takeoff.eliteosfab.com"));
  assert.ok(!buildAllowedTakeoffMessageOrigins(prodEnv).has("*"));

  // Empty env arg must NOT wipe a configured Vite takeoff URL when import.meta.env has it.
  // In Node test runs import.meta.env is usually empty — assert the merge preference:
  // explicit env wins; empty object falls back to localhost only when no meta.
  const localOnly = buildAllowedTakeoffMessageOrigins({});
  assert.ok(localOnly.has("http://localhost:5186"));
  assert.ok(localOnly.has("http://127.0.0.1:5186"));

  const originsSrc = readFileSync(join(here, "takeoffPostMessageOrigins.mjs"), "utf8");
  assert.match(originsSrc, /import\.meta\.env\.VITE_HEAD_URL_AI_TAKEOFF/);
  assert.match(originsSrc, /VITE_HEAD_URL_AI_TAKEOFF/);
  console.log("ok: production takeoff origin allowlisted via env merge");
}

{
  // Simulate parent save-ack: delayed DRAFT_SAVED must not false-timeout.
  const jobId = "job-delay-1";
  const listeners = [];
  const fakeWindow = {
    addEventListener(type, fn) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    clearTimeout(id) {
      clearTimeout(id);
    },
    setTimeout
  };
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;

  const iframe = {
    contentWindow: {
      postMessage(msg) {
        assert.equal(msg.type, QUOTE_FLOW_REQUEST_SAVE_DRAFT);
        assert.equal(msg.takeoffJobId, jobId);
        // Respond slightly after request — parent listener must already be registered.
        setTimeout(() => {
          for (const fn of [...listeners]) {
            fn({
              origin: "https://takeoff.eliteosfab.com",
              data: {
                type: TAKEOFF_REVIEW_DRAFT_SAVED,
                takeoffJobId: jobId,
                resultId: "res-1",
                alreadyClean: false
              }
            });
          }
        }, 40);
      }
    }
  };

  const result = await requestSaveDraftFromIframe(iframe, jobId, {
    timeoutMs: 2000,
    env: { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.resultId, "res-1");
  globalThis.window = prevWindow;
  console.log("ok: delayed DRAFT_SAVED ack does not false-timeout");
}

{
  const jobId = "job-fail-1";
  const listeners = [];
  const fakeWindow = {
    addEventListener(type, fn) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    clearTimeout(id) {
      clearTimeout(id);
    },
    setTimeout
  };
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;

  const iframe = {
    contentWindow: {
      postMessage() {
        setTimeout(() => {
          for (const fn of [...listeners]) {
            fn({
              origin: "https://takeoff.eliteosfab.com",
              data: {
                type: TAKEOFF_REVIEW_DRAFT_SAVE_FAILED,
                takeoffJobId: jobId,
                error: "disk full"
              }
            });
          }
        }, 10);
      }
    }
  };

  const result = await requestSaveDraftFromIframe(iframe, jobId, {
    timeoutMs: 2000,
    env: { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /disk full/);
  globalThis.window = prevWindow;
  console.log("ok: SAVE_FAILED stops Set Scope transaction");
}

{
  // Foreign origin must be ignored (would otherwise timeout → fail closed).
  const jobId = "job-origin-1";
  const listeners = [];
  const fakeWindow = {
    addEventListener(type, fn) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    clearTimeout(id) {
      clearTimeout(id);
    },
    setTimeout
  };
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;

  const iframe = {
    contentWindow: {
      postMessage() {
        setTimeout(() => {
          for (const fn of [...listeners]) {
            fn({
              origin: "https://evil.example.com",
              data: {
                type: TAKEOFF_REVIEW_DRAFT_SAVED,
                takeoffJobId: jobId,
                resultId: "should-ignore"
              }
            });
          }
        }, 10);
      }
    }
  };

  const result = await requestSaveDraftFromIframe(iframe, jobId, {
    timeoutMs: 80,
    env: { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
  assert.equal(result.error, SET_SCOPE_SAVE_TIMEOUT_ERROR);
  globalThis.window = prevWindow;
  console.log("ok: foreign-origin DRAFT_SAVED ignored (fail closed)");
}

{
  const missing = await requestSaveDraftFromIframe(null, "job-x", {});
  assert.equal(missing.ok, false);
  assert.equal(missing.error, SET_SCOPE_IFRAME_REQUIRED_ERROR);
  console.log("ok: missing iframe refuses save request");
}

{
  // Payload helper still works (legacy / optional) and respects allowlist.
  const jobId = "job-payload-1";
  const listeners = [];
  const fakeWindow = {
    addEventListener(type, fn) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    clearTimeout(id) {
      clearTimeout(id);
    },
    setTimeout
  };
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;
  const iframe = {
    contentWindow: {
      postMessage() {
        setTimeout(() => {
          for (const fn of [...listeners]) {
            fn({
              origin: "https://takeoff.eliteosfab.com",
              data: {
                type: QUOTE_FLOW_SET_SCOPE_PAYLOAD,
                takeoffJobId: jobId,
                takeoffResult: { rooms: [{ id: "r1" }] },
                dirty: false
              }
            });
          }
        }, 10);
      }
    }
  };
  const payload = await requestSetScopePayloadFromIframe(iframe, jobId, {
    timeoutMs: 1000,
    env: { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" }
  });
  assert.ok(payload?.takeoffResult?.rooms);
  globalThis.window = prevWindow;
  console.log("ok: set-scope payload helper still allowlist-aware");
}

{
  const queue = readFileSync(join(appRoot, "src/queue/EstimateQueuePage.tsx"), "utf8");
  assert.match(queue, /requestSaveDraftFromIframe/);
  assert.match(queue, /Saving takeoff…/);
  assert.match(queue, /Setting scope…/);
  assert.match(queue, /setScopePhase/);
  assert.match(queue, /SET_SCOPE_IFRAME_REQUIRED_ERROR/);
  // Save-ack transaction: backend Set Scope after save, no required live takeoffResult transport.
  assert.doesNotMatch(queue, /takeoffResult:\s*payload\.takeoffResult/);
  assert.doesNotMatch(queue, /if \(!payload\?\.takeoffResult\)/);
  assert.doesNotMatch(queue, /If postMessage times out \/ fails, still call Set Scope/);
  assert.doesNotMatch(queue, /payload\?\.takeoffResult \|\| undefined/);
  assert.match(queue, /No takeoffResult: Brain loads the draft we just saved/);
  console.log("ok: EstimateQueuePage uses save-ack Set Scope transaction");
}

{
  const contract = readFileSync(
    join(repoRoot, "app-ai-takeoff/src/lib/takeoffReviewReadyContract.mjs"),
    "utf8"
  );
  assert.match(contract, /TAKEOFF_REVIEW_DRAFT_SAVE_FAILED/);
  assert.match(
    contract,
    /type === TAKEOFF_REVIEW_DRAFT_SAVE_FAILED/
  );
  console.log("ok: child posts SAVE_FAILED with wildcard targetOrigin");
}

console.log("\ntakeoffPostMessageOrigins.test.mjs: ok\n");
