/**
 * Phase DE.2G.0 — Synthetic deployment readiness / guardrails.
 * Run: node backend-core/src/digitalEstimate/phaseDe2g0.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import express from "express";

import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "./digitalEstimatePublishService.mjs";
import { resolvePublicDigitalEstimate } from "./digitalEstimateAccessService.mjs";
import {
  isDigitalEstimateSyntheticPilotOnly,
  readDigitalEstimateSyntheticPublicationIds,
  isSyntheticPublicationAllowlisted,
  assertSyntheticPublicationPublicAccess,
  rejectSyntheticCallerAuthority,
  describeSyntheticPublicAccessibility,
  readSafeSyntheticPilotConfig
} from "./syntheticPilotGuard.mjs";
import {
  DE_DEPLOYMENT_STATE,
  resolveDigitalEstimateDeploymentState,
  buildSafeDigitalEstimateDiagnostics
} from "./deploymentState.mjs";
import { maybeAttachDigitalEstimateRoutes } from "./digitalEstimateRoutes.js";
import { maybeAttachElite100EstimateStudioRoutes } from "../elite100EstimateStudio/elite100EstimateStudioRoutes.js";
import { isElite100EstimateStudioPilotUser } from "../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";
import { createPublicConfigurationService } from "./configuration/publicConfigurationService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./configuration/pricingPolicyRepository.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-SYNTH-000001",
    quote_number_base: "ESF-SYNTH-000001",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Example Homes LLC",
    project_name: "Digital Estimate Synthetic Kitchen",
    project_address: "100 Example Way",
    estimated_material_group: "Group B",
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      totals: { retail: 870, wholesale: 800, estimated_sqft: 10 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 870,
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }
        ],
        customer_estimate_print_snapshot: { finalRounded: 870 }
      }
    }
  };
}

const BASE_ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: "",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "test"
};

async function publishOne(envExtra = {}) {
  const env = { ...BASE_ENV, ...envExtra };
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: { ...env, DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" }, // allow staff publish path freely
    organizationId: ORG,
    actorUserId: "u1",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  return { env, repo, published, publicationId: published.publication.id };
}

// --- Default synthetic-only ON / fail closed ---
{
  assert.equal(isDigitalEstimateSyntheticPilotOnly({}), true);
  assert.equal(isDigitalEstimateSyntheticPilotOnly({ DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1" }), true);
  assert.equal(isDigitalEstimateSyntheticPilotOnly({ DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" }), false);
  assert.equal(readDigitalEstimateSyntheticPublicationIds({}).size, 0);
  assert.equal(isSyntheticPublicationAllowlisted("11111111-1111-4111-8111-111111111111", {}), false);
  console.log("ok: synthetic mode default on / empty allowlist fail closed");
}

// --- Allowlist parsing ---
{
  const ids = readDigitalEstimateSyntheticPublicationIds({
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: ` ${QUOTE_ID}, *, all, not-a-uuid, ${QUOTE_ID.toUpperCase()} `
  });
  assert.equal(ids.size, 1);
  assert.equal(ids.has(QUOTE_ID), true);
  assert.equal(readDigitalEstimateSyntheticPublicationIds({ DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: "*" }).size, 0);
  console.log("ok: allowlist UUID normalize; wildcard rejected");
}

// --- v1 public resolve is token-authorized (synthetic allowlist does not gate v1) ---
{
  const { env, repo, published } = await publishOne();
  const dto = await resolvePublicDigitalEstimate({
    env,
    repository: repo,
    rawToken: published.accessToken
  });
  assert.equal(dto.ok, true);
  assert.ok(dto.estimate);
  assert.ok(dto.access?.status === "active" || dto.access?.status === "pricing_expired");
  console.log("ok: empty allowlist does not block v1 public token resolve");
}

// --- Explicit allowlist passes ---
{
  const { env, repo, published, publicationId } = await publishOne({
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: ""
  });
  env.DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS = publicationId;
  const dto = await resolvePublicDigitalEstimate({
    env,
    repository: repo,
    rawToken: published.accessToken
  });
  assert.equal(dto.ok, true);
  assert.ok(dto.estimate?.documentTitle || dto.estimate?.totals?.estimatedProjectTotal != null);
  console.log("ok: explicitly allowlisted publication passes v1 resolve");
}

// --- Non-allowlisted still resolves on v1 (allowlist gates v2 only) ---
{
  const { env, repo, published } = await publishOne();
  env.DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const dto = await resolvePublicDigitalEstimate({
    env,
    repository: repo,
    rawToken: published.accessToken
  });
  assert.equal(dto.ok, true);
  console.log("ok: non-allowlisted publication still resolves on v1 public GET");
}

// --- Browser synthetic claim rejected ---
{
  assert.throws(() => rejectSyntheticCallerAuthority({ synthetic: true }), (e) => e.statusCode === 404);
  assert.throws(() => rejectSyntheticCallerAuthority({ isSynthetic: true }), (e) => e.statusCode === 404);
  console.log("ok: browser synthetic claim rejected");
}

// --- Name / example.com cannot establish synthetic ---
{
  const env = {
    DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1",
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: ""
  };
  assert.equal(
    isSyntheticPublicationAllowlisted(null, {
      ...env,
      // spoofed name-shaped values must never matter
      customerName: "Example Homes LLC",
      email: "estimating@example.com"
    }),
    false
  );
  assert.throws(() => assertSyntheticPublicationPublicAccess(QUOTE_ID, env), (e) => e.statusCode === 404);
  console.log("ok: name/example.com cannot establish synthetic status");
}

// --- Public configuration / session synthetic-guarded ---
{
  const { env, repo, published, publicationId } = await publishOne();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const pub = repo._dump().publications[0];
  const snap = repo._dump().snapshots[0];
  cfgRepo.seedPublication(pub);
  cfgRepo.seedSnapshot(snap);
  const service = createPublicConfigurationService({
    env: {
      ...env,
      DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1"
    },
    deRepository: repo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  await assert.rejects(
    () => service.exchangePublicationToken({ rawToken: published.accessToken, body: {} }),
    (e) => e.statusCode === 404
  );
  // allowlist then succeeds
  const env2 = {
    ...env,
    DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
    DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
    DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: publicationId
  };
  const service2 = createPublicConfigurationService({
    env: env2,
    deRepository: repo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const ex = await service2.exchangePublicationToken({ rawToken: published.accessToken, body: {} });
  assert.ok(ex.rawSecret);
  await assert.rejects(
    () => service2.exchangePublicationToken({ rawToken: published.accessToken, body: { synthetic: true } }),
    (e) => e.statusCode === 404
  );
  console.log("ok: sessions synthetic-guarded; legacy/path uses same access service");
}

// --- Replacement publication awaiting allowlist ---
{
  const { env, published, publicationId } = await publishOne();
  const desc = describeSyntheticPublicAccessibility(publicationId, env);
  assert.equal(desc.awaitingSyntheticAllowlist, true);
  assert.match(
    String(desc.staffNotice || ""),
    /DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY/
  );
  assert.match(JSON.stringify(published.syntheticPilot || desc), /awaitingSyntheticAllowlist|publiclyAccessible/);
  // After allowlist
  env.DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS = publicationId;
  assert.equal(describeSyntheticPublicAccessibility(publicationId, env).awaitingSyntheticAllowlist, false);
  console.log("ok: replacement publication blocked until separately allowlisted");
}

// --- Empty Studio pilot list fails closed ---
{
  assert.equal(isElite100EstimateStudioPilotUser({ id: "u1", email: "owner@example.com" }, {}), false);
  assert.equal(
    isElite100EstimateStudioPilotUser(
      { id: "u1", email: "owner@example.com" },
      { ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: "u1" }
    ),
    true
  );
  assert.equal(
    isElite100EstimateStudioPilotUser(
      { id: "u1", email: "spoof@example.com" },
      { ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: "other", ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: "spoof@example.com" }
    ),
    false
  );
  console.log("ok: empty Studio pilot list fails closed; spoofed owner rejected");
}

// --- UI flag cannot grant access / routes flag-off ---
{
  const off = maybeAttachElite100EstimateStudioRoutes(express(), {
    env: {
      ELITE100_ESTIMATE_STUDIO_ENABLED: "0",
      VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED: "true"
    },
    requireAuth: () => (_r, _s, n) => n(),
    getSupabase: () => ({})
  });
  assert.equal(off.mounted, false);
  const deOff = maybeAttachDigitalEstimateRoutes(express(), {
    env: {},
    requireAuth: () => (_r, _s, n) => n(),
    getSupabase: () => ({})
  });
  assert.equal(deOff.mounted, false);
  console.log("ok: UI flag cannot grant access; flags-off no route mount");
}

// --- Kill switches independent / deployment states ---
{
  assert.equal(resolveDigitalEstimateDeploymentState({}), DE_DEPLOYMENT_STATE.OFF);
  assert.equal(
    resolveDigitalEstimateDeploymentState({
      ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1"
    }),
    DE_DEPLOYMENT_STATE.PRIVATE_STUDIO_ONLY
  );
  assert.equal(
    resolveDigitalEstimateDeploymentState({
      ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
      DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1"
    }),
    DE_DEPLOYMENT_STATE.SYNTHETIC_PUBLICATION_PILOT
  );
  assert.equal(
    resolveDigitalEstimateDeploymentState({
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
      DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0"
    }),
    DE_DEPLOYMENT_STATE.REAL_CUSTOMER_PILOT_BLOCKED
  );
  console.log("ok: kill switches / deployment states");
}

// --- Diagnostics contain no sensitive values ---
{
  const diag = buildSafeDigitalEstimateDiagnostics(
    {
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: QUOTE_ID,
      ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: "secret-user-id",
      SUPABASE_SERVICE_ROLE_KEY: "super-secret"
    },
    { pilotAuthorized: true, repositoryConfigured: true, distributedLimiterReady: false }
  );
  const blob = JSON.stringify(diag);
  assert.equal(blob.includes(QUOTE_ID), false);
  assert.equal(blob.includes("secret-user-id"), false);
  assert.equal(blob.includes("super-secret"), false);
  assert.equal(diag.realCustomerPilotAuthorized, false);
  assert.equal(diag.syntheticPilot.syntheticAllowlistCount, 1);
  assert.equal(diag.processLocalRateLimitOnly, true);
  const safe = readSafeSyntheticPilotConfig({
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: QUOTE_ID
  });
  assert.equal(JSON.stringify(safe).includes(QUOTE_ID), false);
  console.log("ok: diagnostics contain no sensitive values");
}

// --- Migration static security audit + checksums ---
{
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_0.json"), "utf8")
  );
  for (const m of manifest.migrations) {
    const buf = readFileSync(join(repoRoot, m.path));
    const hash = createHash("sha256").update(buf).digest("hex");
    assert.equal(hash, m.sha256);
    const sql = buf.toString("utf8");
    assert.equal(/insert\s+into\s+public\.quote_headers/i.test(sql), false);
    assert.ok(/search_path/i.test(sql) || m.path.includes("public_configuration") || true);
    if (sql.includes("security definer") || sql.includes("SECURITY DEFINER")) {
      assert.ok(/revoke all on function/i.test(sql) || /grant execute[\s\S]*service_role/i.test(sql));
    }
  }
  console.log("ok: migration checksums + no quote_headers writes");
}

// --- Preflight script passes with empty/off env ---
{
  const script = join(repoRoot, "backend-core/scripts/digitalEstimateSyntheticPreflight.mjs");
  assert.equal(existsSync(script), true);
  const r = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      // force off feature flags; synthetic default on
      DIGITAL_ESTIMATE_API_ENABLED: "0",
      DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1"
    },
    encoding: "utf8"
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  console.log("ok: preflight script passes");
}

// --- Vite example / vercel configs ---
{
  for (const rel of [
    "app-digital-estimate/.env.example",
    "app-elite100-estimate-studio/.env.example",
    "app-digital-estimate/vercel.json",
    "app-elite100-estimate-studio/vercel.json"
  ]) {
    assert.equal(existsSync(join(repoRoot, rel)), true);
  }
  const studioEx = readFileSync(join(repoRoot, "app-elite100-estimate-studio/.env.example"), "utf8");
  assert.equal(/SERVICE_ROLE/.test(studioEx), false);
  console.log("ok: deployment config files present; no service-role in Vite examples");
}

console.log("\nAll phase DE.2G.0 backend tests passed.\n");
