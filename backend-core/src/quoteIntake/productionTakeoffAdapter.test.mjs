/**
 * ProductionTakeoffAdapter fake + boundary source checks.
 * Run: node backend-core/src/quoteIntake/productionTakeoffAdapter.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFakeProductionTakeoffAdapter,
  FakeProductionTakeoffAdapter,
  PRODUCTION_TAKEOFF_ADAPTER_NAME
} from "./productionTakeoffAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nproductionTakeoffAdapter.test.mjs\n");

{
  const adapter = createFakeProductionTakeoffAdapter();
  assert.equal(adapter.name, PRODUCTION_TAKEOFF_ADAPTER_NAME);
  assert.ok(adapter instanceof FakeProductionTakeoffAdapter);

  const result = await adapter.createFromIntake({
    organizationId: "org",
    intakeCaseId: "case",
    intakeAttachmentId: "att",
    actor: { type: "system", automationDecisionId: "dec-1" },
    initiationMode: "automatic",
    idempotencyKey: "k1"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "takeoff_invocation_disabled");
  assert.equal(adapter.createAttempts.length, 1);
  assert.equal(await adapter.getJobStatus("job", "org"), null);
  assert.deepEqual(await adapter.listLinkedJobs("case"), []);

  assert.throws(() => adapter.importToInternalEstimate(), /IE import must never be called/);
  console.log("ok: fake adapter refuses takeoff + IE import");
}

{
  const files = readdirSync(__dirname).filter(
    (f) => (f.endsWith(".mjs") || f.endsWith(".js")) && !f.endsWith(".test.mjs")
  );
  const forbidden = [
    "internalQuoteTakeoffImport",
    "import-from-takeoff",
    "geminiTakeoffProvider",
    "openAiTakeoffProvider",
    "exayardTakeoffProvider",
    "takeoffExtractionService",
    "takeoffWorkspaceService",
    "createTakeoffWorkspace",
    "runAiTakeoffExtraction",
    "@supabase/supabase-js",
    "quotePersist",
    "quoteCalculator",
    "quoteDelivery",
    "emailClient"
  ];
  for (const file of files) {
    const src = readFileSync(join(__dirname, file), "utf8");
    for (const needle of forbidden) {
      assert.equal(
        src.includes(needle),
        false,
        `${file} must not reference ${needle}`
      );
    }
  }
  // Routes may call resolveOrganizationContext (org identity only) — allowed.
  const routesSrc = readFileSync(join(__dirname, "quoteIntakeRoutes.js"), "utf8");
  assert.ok(routesSrc.includes("resolveOrganizationContext"));
  assert.ok(routesSrc.includes("createQuoteIntakeRepository"));
  console.log("ok: package source boundary (no IE/takeoff providers/supabase-js/persist)");
}

console.log("\nAll productionTakeoffAdapter / boundary tests passed.\n");
