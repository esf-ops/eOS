/**
 * Regression: legacy takeoff jobs missing new quoteFlow nested metadata
 * must still hydrate Review Takeoff / AD soft-link without 5xx.
 *
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowLegacyHydration.test.mjs
 */
import assert from "node:assert/strict";
import {
  readQuoteFlowNestedObject,
  readQuoteFlowQuoteName
} from "../takeoff/takeoffWorkspaceService.mjs";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import {
  emptyAccountDirectoryLink,
  confirmAccountDirectoryLink
} from "./quoteFlowAccountDirectory.mjs";

console.log("\nquoteFlowLegacyHydration.test.mjs\n");

function workspaceDtoFields(metadata) {
  return {
    quoteFlowRequestedSelections: readQuoteFlowNestedObject(metadata, "requestedSelections"),
    quoteFlowStartingConfiguration: readQuoteFlowNestedObject(metadata, "startingConfiguration"),
    quoteFlowAccountDirectoryLink: readQuoteFlowNestedObject(metadata, "accountDirectoryLink"),
    quoteName: readQuoteFlowQuoteName(metadata)
  };
}

{
  const dto = workspaceDtoFields({ source: "ai_takeoff_lab", processing: { phase: "done" } });
  assert.equal(dto.quoteFlowRequestedSelections, null);
  assert.equal(dto.quoteFlowStartingConfiguration, null);
  assert.equal(dto.quoteFlowAccountDirectoryLink, null);
  assert.equal(dto.quoteName, null);
  console.log("ok: legacy takeoff job with none of the new quoteFlow metadata");
}

{
  const dto = workspaceDtoFields({
    source: "ai_takeoff_lab",
    quoteFlow: {
      selectedPlanFilename: "image001.jpg",
      quoteName: "image001.jpg",
      quoteNameSource: "filename",
      quoteNameUserSet: false
    }
  });
  assert.equal(dto.quoteName, "image001.jpg");
  assert.equal(dto.quoteFlowAccountDirectoryLink, null);
  assert.equal(dto.quoteFlowStartingConfiguration, null);
  assert.equal(dto.quoteFlowRequestedSelections, null);
  console.log("ok: legacy filename-only job (image001) exposes quoteName without nested soft-link fields");
}

{
  const dto = workspaceDtoFields({
    quoteFlow: { quoteName: "CRC-Kenne", quoteNameUserSet: true, quoteNameSource: "user" }
  });
  assert.equal(dto.quoteName, "CRC-Kenne");
  assert.equal(dto.quoteFlowAccountDirectoryLink, null);
  assert.equal(dto.quoteFlowStartingConfiguration, null);
  assert.equal(dto.quoteFlowRequestedSelections, null);
  console.log("ok: job with Quote Name only");
}

{
  const dto = workspaceDtoFields({
    quoteFlow: {
      quoteName: "Pearson Zude",
      requestedSelections: { version: "qf_requested_selections_v1", items: [] }
    }
  });
  assert.ok(dto.quoteFlowRequestedSelections);
  assert.equal(dto.quoteFlowAccountDirectoryLink, null);
  assert.equal(dto.quoteFlowStartingConfiguration, null);
  console.log("ok: job with requested selections but no AD link");
}

{
  const link = confirmAccountDirectoryLink(emptyAccountDirectoryLink(), {
    accountId: "11111111-1111-4111-8111-111111111111",
    contactId: "22222222-2222-4222-8222-222222222222",
    identitySnapshot: { accountDisplayName: "Pearson Builders" },
    actorUserId: "user-1"
  });
  const dto = workspaceDtoFields({
    quoteFlow: {
      quoteName: "Pearson Zude",
      accountDirectoryLink: link
    }
  });
  assert.equal(dto.quoteFlowAccountDirectoryLink?.status, "confirmed");
  assert.equal(dto.quoteFlowStartingConfiguration, null);
  console.log("ok: job with AD link but no Starting Configuration");
}

{
  const dto = workspaceDtoFields({
    quoteFlow: {
      quoteName: "Fully Populated",
      quoteNameUserSet: true,
      requestedSelections: { version: "v1", items: [{ id: "a", status: "confirmed" }] },
      startingConfiguration: { version: "v1", status: "draft", quote: {}, rooms: [], addOns: {} },
      accountDirectoryLink: {
        ...emptyAccountDirectoryLink(),
        status: "confirmed",
        accountId: "11111111-1111-4111-8111-111111111111",
        userSet: true
      }
    }
  });
  assert.equal(dto.quoteName, "Fully Populated");
  assert.ok(dto.quoteFlowRequestedSelections);
  assert.ok(dto.quoteFlowStartingConfiguration);
  assert.equal(dto.quoteFlowAccountDirectoryLink?.status, "confirmed");
  console.log("ok: fully populated current job");
}

{
  // Corrupt / unexpected shapes must not throw.
  assert.equal(readQuoteFlowNestedObject(null, "accountDirectoryLink"), null);
  assert.equal(readQuoteFlowNestedObject("x", "accountDirectoryLink"), null);
  assert.equal(readQuoteFlowNestedObject({ quoteFlow: [] }, "accountDirectoryLink"), null);
  assert.equal(readQuoteFlowNestedObject({ quoteFlow: { accountDirectoryLink: [] } }, "accountDirectoryLink"), null);
  assert.equal(readQuoteFlowQuoteName({ quoteFlow: { quoteName: 12 } }), null);
  console.log("ok: corrupt quoteFlow shapes stay null-safe");
}

function makeService(opts = {}) {
  let meta = opts.metadata ?? { source: "ai_takeoff_lab", processing: { phase: "done" } };
  const writeFails = opts.writeFails === true;
  return {
    meta: () => meta,
    svc: createQuoteFlowSetScopeService({
      queueService: { listQueue: async () => ({ cases: [] }) },
      getSupabase: () => ({
        from() {
          const builder = {
            select() {
              return builder;
            },
            eq() {
              return builder;
            },
            update(payload) {
              return {
                eq() {
                  return this;
                },
                then(resolve) {
                  if (writeFails) {
                    resolve({ error: { message: "simulated write failure" } });
                    return;
                  }
                  meta = payload?.metadata ?? meta;
                  resolve({ error: null });
                }
              };
            },
            async maybeSingle() {
              return {
                data: { id: "743eef66-c530-47c4-8d5c-5968e9d4f8ef", metadata: meta },
                error: null
              };
            }
          };
          return builder;
        }
      })
    })
  };
}

{
  const { svc } = makeService({
    metadata: { source: "ai_takeoff_lab" } // no quoteFlow at all
  });
  const got = await svc.getAccountDirectoryLink({
    organizationId: "89180433-9fab-4024-bec9-a14d870bd0a8",
    takeoffJobId: "743eef66-c530-47c4-8d5c-5968e9d4f8ef"
  });
  assert.equal(got.ok, true);
  assert.equal(got.accountDirectoryLink.status, "unlinked");
  console.log("ok: GET account-directory-link succeeds for legacy job with no quoteFlow");
}

{
  const { svc, meta } = makeService({
    metadata: {
      source: "ai_takeoff_lab",
      quoteFlow: { selectedPlanFilename: "image001.jpg", quoteName: "image001.jpg" }
    }
  });
  const refreshed = await svc.updateAccountDirectoryLink({
    organizationId: "89180433-9fab-4024-bec9-a14d870bd0a8",
    takeoffJobId: "743eef66-c530-47c4-8d5c-5968e9d4f8ef",
    action: "refresh_suggestions",
    role: "estimator"
  });
  assert.equal(refreshed.ok, true);
  assert.ok(["unlinked", "suggested"].includes(refreshed.accountDirectoryLink.status));
  // Source + filename quoteName preserved when soft-link fields are written.
  assert.equal(meta().source, "ai_takeoff_lab");
  assert.equal(meta().quoteFlow.selectedPlanFilename, "image001.jpg");
  assert.equal(meta().quoteFlow.quoteName, "image001.jpg");
  assert.ok(meta().quoteFlow.accountDirectoryLink);
  console.log("ok: refresh_suggestions on filename-only legacy job returns 200-class ok and preserves quoteFlow");
}

{
  const { svc } = makeService({
    metadata: { source: "ai_takeoff_lab" },
    writeFails: true
  });
  const refreshed = await svc.updateAccountDirectoryLink({
    organizationId: "89180433-9fab-4024-bec9-a14d870bd0a8",
    takeoffJobId: "743eef66-c530-47c4-8d5c-5968e9d4f8ef",
    action: "refresh_suggestions",
    role: "estimator"
  });
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.persisted, false);
  assert.ok(refreshed.accountDirectoryLink);
  console.log("ok: refresh_suggestions write failure does not throw (Review Takeoff stays usable)");
}

console.log("\nAll quoteFlowLegacyHydration tests passed.\n");
