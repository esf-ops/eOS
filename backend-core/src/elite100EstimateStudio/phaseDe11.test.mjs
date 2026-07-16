/**
 * Phase DE.1.1 — Elite 100 Estimate Studio access + isolation tests.
 * Run: node backend-core/src/elite100EstimateStudio/phaseDe11.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { EOS_HEAD_SLUGS, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { HEAD_LAUNCHER_CATALOG, buildMeHeadsPayload } from "../me/launcherHeads.js";
import { resolveHeadDeploymentUrl } from "../me/headDeploymentUrls.js";
import {
  ELITE100_ESTIMATE_STUDIO_HEAD_SLUG,
  isElite100EstimateStudioEnabled,
  isElite100EstimateStudioPilotUser
} from "./elite100EstimateStudioConfig.mjs";
import { requireElite100EstimateStudioPilot } from "./elite100EstimateStudioAccess.mjs";
import {
  maybeAttachElite100EstimateStudioRoutes
} from "./elite100EstimateStudioRoutes.js";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimate/digitalEstimatePublishService.mjs";
import { resolvePublicDigitalEstimate } from "../digitalEstimate/digitalEstimateAccessService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PILOT_ID = "pilot-user-aaaaaaaa";
const PILOT_EMAIL = "owner@example.com";

const ENV_STUDIO = {
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: PILOT_ID,
  ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: PILOT_EMAIL,
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  HEAD_URL_ELITE100_ESTIMATE_STUDIO: "https://elite100.eliteosfab.com",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com"
};

function eliteHeader(overrides = {}) {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-DYER-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Test Customer",
    project_name: "Kitchen",
    project_address: "1 Main",
    calculation_snapshot: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 12450,
        estimate_rooms: [{ name: "Kitchen", materialProgramOverride: "inherit" }],
        customer_estimate_print_snapshot: { finalRounded: 12450, rooms: [], summaryRows: [] }
      }
    },
    ...overrides
  };
}

console.log("\nphaseDe11.test.mjs\n");

{
  assert.equal(isElite100EstimateStudioEnabled({}), false);
  assert.equal(isElite100EstimateStudioEnabled({ ELITE100_ESTIMATE_STUDIO_ENABLED: "1" }), true);
  assert.equal(isElite100EstimateStudioPilotUser({ id: PILOT_ID, email: PILOT_EMAIL }, {}), false);
  assert.equal(
    isElite100EstimateStudioPilotUser({ id: PILOT_ID, email: PILOT_EMAIL }, ENV_STUDIO),
    true
  );
  assert.equal(
    isElite100EstimateStudioPilotUser({ id: "other", email: PILOT_EMAIL }, ENV_STUDIO),
    false
  );
  assert.equal(
    isElite100EstimateStudioPilotUser({ id: PILOT_ID, email: "spoof@evil.com" }, ENV_STUDIO),
    false
  );
  console.log("ok: studio flags off by default; pilot allowlist enforced");
}

{
  assert.equal(isKnownHeadSlug(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG), true);
  assert.ok(EOS_HEAD_SLUGS.includes(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG));
  assert.ok(HEAD_LAUNCHER_CATALOG.some((h) => h.slug === ELITE100_ESTIMATE_STUDIO_HEAD_SLUG));
  assert.equal(
    HEAD_LAUNCHER_CATALOG.some((h) => h.slug === "digital_estimate"),
    false
  );
  const prevUrl = process.env.HEAD_URL_ELITE100_ESTIMATE_STUDIO;
  process.env.HEAD_URL_ELITE100_ESTIMATE_STUDIO = "https://elite100.eliteosfab.com";
  const url = resolveHeadDeploymentUrl(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG);
  assert.equal(url, "https://elite100.eliteosfab.com");
  if (prevUrl === undefined) delete process.env.HEAD_URL_ELITE100_ESTIMATE_STUDIO;
  else process.env.HEAD_URL_ELITE100_ESTIMATE_STUDIO = prevUrl;
  console.log("ok: studio slug registered; public digital_estimate not in launcher catalog");
}

{
  function chain(data) {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data, error: null }),
      then: undefined
    };
    // Make awaitable when used as eq() result for user_head_access
    api.eq = () => {
      const eqApi = {
        maybeSingle: async () => ({ data, error: null }),
        then: (resolve, reject) =>
          Promise.resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error: null }).then(
            resolve,
            reject
          )
      };
      return eqApi;
    };
    return api;
  }

  const mockSbHidden = {
    from: (table) => {
      if (table === "user_profiles") return chain({ user_kind: "internal" });
      if (table === "user_head_access") return chain([]);
      return chain(null);
    }
  };

  const prev = { ...process.env };
  Object.assign(process.env, ENV_STUDIO);
  const payloadHidden = await buildMeHeadsPayload(mockSbHidden, {
    id: "non-pilot-admin",
    email: "admin@example.com",
    role: "admin",
    isActive: true
  });
  assert.equal(
    payloadHidden.heads.some((h) => h.slug === ELITE100_ESTIMATE_STUDIO_HEAD_SLUG),
    false,
    "admin without pilot must not see Studio tile"
  );

  const mockSbPilot = {
    from: (table) => {
      if (table === "user_profiles") return chain({ user_kind: "internal" });
      if (table === "user_head_access")
        return chain([{ head_slug: ELITE100_ESTIMATE_STUDIO_HEAD_SLUG }]);
      return chain(null);
    }
  };
  const payloadPilot = await buildMeHeadsPayload(mockSbPilot, {
    id: PILOT_ID,
    email: PILOT_EMAIL,
    role: "admin",
    isActive: true
  });
  assert.equal(
    payloadPilot.heads.some((h) => h.slug === ELITE100_ESTIMATE_STUDIO_HEAD_SLUG),
    true,
    "pilot admin sees Studio tile"
  );

  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(ENV_STUDIO)) {
    if (!(k in prev)) delete process.env[k];
  }
  console.log("ok: launcher tile requires pilot allowlist");
}

{
  const appOff = express();
  const r = maybeAttachElite100EstimateStudioRoutes(appOff, {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => ({}),
    env: {}
  });
  assert.equal(r.mounted, false);

  const mw = requireElite100EstimateStudioPilot({ env: ENV_STUDIO });
  const denied = await new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        resolve(this);
      }
    };
    mw({ user: { id: "spoofed", email: "spoof@x.com" }, body: { userId: PILOT_ID } }, res, () =>
      resolve({ statusCode: 200 })
    );
  });
  assert.equal(denied.statusCode, 403);
  console.log("ok: spoofed identity cannot pass pilot middleware");
}

{
  // Cross-org isolation via repository (session org is authoritative).
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  repo.seedQuote(
    eliteHeader({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", organization_id: ORG_B })
  );
  const foreign = await repo.getQuoteHeader(ORG, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(foreign, null);
  const own = await repo.getQuoteHeader(ORG, QUOTE_ID);
  assert.ok(own);
  console.log("ok: cross-org source quote rejected at repository boundary");
}

{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: {
      ...ENV_STUDIO,
      DIGITAL_ESTIMATE_VIEW_THROTTLE_SECONDS: "0"
    },
    organizationId: ORG,
    actorUserId: PILOT_ID,
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const dto = await resolvePublicDigitalEstimate({
    env: ENV_STUDIO,
    repository: repo,
    rawToken: published.accessToken
  });
  assert.equal(dto.estimate.totals.estimatedProjectTotal, 12450);
  assert.equal(JSON.stringify(repo._dump()).includes(published.accessToken), false);
  console.log("ok: publication remains atomic/frozen via DE services");
}

{
  const ieApp = readFileSync(
    join(__dirname, "../../../app-internal-estimate/src/InternalEstimateApp.tsx"),
    "utf8"
  );
  assert.equal(ieApp.includes("DigitalEstimatePanel"), false);
  assert.equal(ieApp.includes("digital-estimate"), false);
  assert.equal(ieApp.includes("VITE_DIGITAL_ESTIMATE"), false);

  const ql = readFileSync(join(__dirname, "../quotes/quoteLibraryApi.js"), "utf8");
  assert.equal(ql.includes("quote_publication_events"), false);
  assert.equal(ql.includes("digital_estimate"), false);

  const studioSrc = readdirSync(join(__dirname, "../../../app-elite100-estimate-studio/src"), {
    recursive: true
  })
    .filter((f) => /\.(tsx|ts)$/.test(String(f)) && !String(f).includes(".test."))
    .map((f) => readFileSync(join(__dirname, "../../../app-elite100-estimate-studio/src", f), "utf8"))
    .join("\n");
  assert.equal(studioSrc.includes("calculateQuote"), false);
  assert.equal(studioSrc.includes("/api/internal-quotes"), false);
  assert.ok(studioSrc.includes("/api/elite100-estimate-studio/"));
  console.log("ok: IE/QL restored; Studio uses Brain studio APIs only");
}

console.log("\nAll phaseDe11 backend tests passed.\n");
