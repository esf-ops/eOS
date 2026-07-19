/**
 * Preserve safe PostgREST RPC failure diagnostics on replace-token.
 * Run: node backend-core/src/digitalEstimate/phaseDe11.replaceTokenRpcDiagnostics.test.mjs
 */
import assert from "node:assert/strict";
import {
  REUSABLE_LINK_BUILD_VERSION,
  REUSABLE_LINK_RPC_VERSION,
  REPLACE_TOKEN_ATOMIC_PARAM_KEYS,
  REPLACE_TOKEN_ATOMIC_RPC,
  buildSafeReplaceTokenRpcDiagnostics,
  createInMemoryDigitalEstimateRepository,
  createSupabaseDigitalEstimateRepository
} from "./digitalEstimateRepository.mjs";
import { replaceDigitalEstimateToken } from "./digitalEstimatePublishService.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_LINK_WRAP_KEY: "unit-test-wrap-key-aaaaaaaa",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com",
  NODE_ENV: "test"
};

console.log("\nphaseDe11.replaceTokenRpcDiagnostics.test.mjs\n");

{
  const built = buildSafeReplaceTokenRpcDiagnostics({
    code: "PGRST202",
    message: "Could not find the function public.digital_estimate_replace_token_atomic(...)",
    details: "Searched for the function with given args",
    hint: "Perhaps you meant to call the function with 4 arguments"
  });
  assert.equal(built.rpc, REPLACE_TOKEN_ATOMIC_RPC);
  assert.deepEqual(built.parameterKeys, [...REPLACE_TOKEN_ATOMIC_PARAM_KEYS]);
  assert.equal(built.buildVersion, REUSABLE_LINK_BUILD_VERSION);
  assert.match(built.message, /Could not find the function/);
  assert.match(built.details, /Searched for the function/);
  assert.match(built.hint, /4 arguments/);
  assert.equal(JSON.stringify(built).includes("token_wrapped="), false);
  console.log("ok: buildSafeReplaceTokenRpcDiagnostics preserves message/details/hint");
}

{
  const mem = createInMemoryDigitalEstimateRepository();
  assert.equal(mem.reusableLinkRpcVersion, REUSABLE_LINK_RPC_VERSION);
  const supabase = createSupabaseDigitalEstimateRepository({
    db: {
      async rpc() {
        return { data: null, error: { code: "PGRST202", message: "x", details: "y", hint: "z" } };
      }
    }
  });
  assert.equal(supabase.reusableLinkRpcVersion, REUSABLE_LINK_RPC_VERSION);
  console.log("ok: repository exposes reusableLinkRpcVersion=v2-5-arg");
}

{
  const hint =
    "Perhaps you meant the function digital_estimate_replace_token_atomic(uuid, uuid, text, uuid)";
  const details =
    "Could not find the function public.digital_estimate_replace_token_atomic with matching args in the schema cache";
  const message =
    "Could not find the function public.digital_estimate_replace_token_atomic(p_organization_id, p_publication_id, p_new_token_hash, p_actor_user_id, p_token_wrapped) in the schema cache";

  let capturedArgs = null;
  const db = {
    from() {
      throw new Error("unexpected table access in this test");
    },
    async rpc(name, args) {
      capturedArgs = { name, keys: Object.keys(args) };
      return {
        data: null,
        error: {
          code: "PGRST202",
          message,
          details,
          hint
        }
      };
    }
  };
  const supabaseRepo = createSupabaseDigitalEstimateRepository({ db });

  // Minimal stub around supabase replace so we exercise RPC error path only.
  const err = await supabaseRepo
    .replaceTokenAtomic({
      organizationId: ORG,
      publicationId: QUOTE_ID,
      newTokenHash: "deadbeef".repeat(8),
      tokenWrapped: "wrap-ciphertext-not-a-secret-for-assert",
      actorUserId: "user-1"
    })
    .catch((e) => e);

  assert.equal(capturedArgs.name, REPLACE_TOKEN_ATOMIC_RPC);
  assert.deepEqual(capturedArgs.keys, [...REPLACE_TOKEN_ATOMIC_PARAM_KEYS]);
  assert.equal(err.code, "PGRST202");
  assert.equal(err.message, "Unable to replace token");
  assert.equal(err.diagnostics.message, message);
  assert.equal(err.diagnostics.details, details);
  assert.equal(err.diagnostics.hint, hint);
  assert.equal(err.diagnostics.rpc, REPLACE_TOKEN_ATOMIC_RPC);
  assert.deepEqual(err.diagnostics.parameterKeys, [...REPLACE_TOKEN_ATOMIC_PARAM_KEYS]);
  assert.equal(err.diagnostics.buildVersion, REUSABLE_LINK_BUILD_VERSION);
  const raw = JSON.stringify(err.diagnostics);
  assert.equal(raw.includes("deadbeef"), false);
  assert.equal(raw.includes("wrap-ciphertext"), false);
  assert.equal(raw.includes(ORG), false);
  console.log("ok: replaceTokenAtomic preserves PostgREST message/details/hint without param values");
}

{
  // Service must not overwrite rpc diagnostics with link-only flags.
  const mem = createInMemoryDigitalEstimateRepository();
  mem.seedQuote({
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-EXAMPLE-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Example Homes LLC",
    project_name: "Kitchen",
    calculation_snapshot: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 10000,
        estimate_rooms: [{ name: "Kitchen", materialProgramOverride: "inherit" }],
        customer_estimate_print_snapshot: { finalRounded: 10000, rooms: [], summaryRows: [] }
      }
    }
  });
  const { publishDigitalEstimate } = await import("./digitalEstimatePublishService.mjs");
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: mem,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const hint = "schema cache still has the 4-argument candidate";
  const failing = {
    ...mem,
    mode: "supabase",
    reusableLinkRpcVersion: REUSABLE_LINK_RPC_VERSION,
    getPublication: mem.getPublication.bind(mem),
    getActiveTokenForPublication: mem.getActiveTokenForPublication.bind(mem),
    probeTokenWrappedColumn: mem.probeTokenWrappedColumn.bind(mem),
    assertActiveTokenWrappedWritable: mem.assertActiveTokenWrappedWritable.bind(mem),
    async replaceTokenAtomic() {
      const err = new Error("Unable to replace token");
      err.code = "PGRST202";
      err.statusCode = 503;
      err.diagnostics = buildSafeReplaceTokenRpcDiagnostics({
        code: "PGRST202",
        message: "Could not find the function in the schema cache",
        details: "Searched for 5-arg candidate",
        hint
      });
      throw err;
    }
  };

  const err = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: failing,
    publicationId: published.publication.id,
    body: { confirm: true }
  }).catch((e) => e);

  assert.equal(err.code, "PGRST202");
  assert.equal(err.diagnostics.hint, hint);
  assert.equal(err.diagnostics.details, "Searched for 5-arg candidate");
  assert.equal(err.diagnostics.rpc, REPLACE_TOKEN_ATOMIC_RPC);
  assert.equal(err.diagnostics.wrapKeyPresent, undefined);
  console.log("ok: replaceDigitalEstimateToken preserves rpc diagnostics through service layer");
}

console.log("\nAll replace-token RPC diagnostics tests passed.\n");
