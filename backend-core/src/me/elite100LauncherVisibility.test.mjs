/**
 * Home Launcher Elite 100 visibility — head access is the access source.
 * Run: node backend-core/src/me/elite100LauncherVisibility.test.mjs
 */
import assert from "node:assert/strict";
import { buildMeHeadsPayload } from "./launcherHeads.js";
import { ELITE100_ESTIMATE_STUDIO_HEAD_SLUG } from "../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";

const SLUG = ELITE100_ESTIMATE_STUDIO_HEAD_SLUG;

function chain(data) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data, error: null }),
    then: undefined
  };
  api.eq = () => {
    const eqApi = {
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({
          data: Array.isArray(data) ? data : data ? [data] : [],
          error: null
        }).then(resolve, reject)
    };
    return eqApi;
  };
  return api;
}

function mockSb(headRows) {
  return {
    from: (table) => {
      if (table === "user_profiles") return chain({ user_kind: "internal" });
      if (table === "user_head_access") return chain(headRows);
      return chain(null);
    }
  };
}

console.log("\nelite100LauncherVisibility.test.mjs\n");

const prev = { ...process.env };
process.env.ELITE100_ESTIMATE_STUDIO_ENABLED = "1";
process.env.HEAD_URL_ELITE100_ESTIMATE_STUDIO = "https://elite100.eliteosfab.com";
// Env pilot lists must NOT be required for launcher visibility.
delete process.env.ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS;
delete process.env.ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS;

{
  const payload = await buildMeHeadsPayload(mockSb([{ head_slug: SLUG }]), {
    id: "new-granted-user",
    email: "new.user@example.com",
    role: "estimator",
    isActive: true
  });
  const tile = payload.heads.find((h) => h.slug === SLUG);
  assert.ok(tile, "user with Elite 100 head access sees Home Launcher tile");
  assert.equal(tile.url, "https://elite100.eliteosfab.com");
  console.log("ok: granted user sees Elite 100 tile with launch URL");
}

{
  const payload = await buildMeHeadsPayload(mockSb([]), {
    id: "ungranted-user",
    email: "other@example.com",
    role: "estimator",
    isActive: true
  });
  assert.equal(
    payload.heads.some((h) => h.slug === SLUG),
    false,
    "user without Elite 100 head access does not see tile"
  );
  console.log("ok: ungranted user does not see Elite 100 tile");
}

{
  process.env.ELITE100_ESTIMATE_STUDIO_ENABLED = "0";
  const payload = await buildMeHeadsPayload(mockSb([{ head_slug: SLUG }]), {
    id: "new-granted-user",
    email: "new.user@example.com",
    role: "estimator",
    isActive: true
  });
  assert.equal(
    payload.heads.some((h) => h.slug === SLUG),
    false,
    "Studio flag off hides tile even with head grant"
  );
  console.log("ok: Studio disabled hides tile");
}

for (const [k, v] of Object.entries(prev)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
for (const k of [
  "ELITE100_ESTIMATE_STUDIO_ENABLED",
  "HEAD_URL_ELITE100_ESTIMATE_STUDIO",
  "ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS",
  "ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS"
]) {
  if (!(k in prev)) delete process.env[k];
}

console.log("\nelite100LauncherVisibility.test.mjs: ok\n");
