/**
 * Phase 1.1 dry-run orchestrator — builds EstimateAdd qbXML and stops before transmit.
 * Never claims queue rows (pending preview only). Never transmits EstimateAdd.
 */

import {
  QBTEST_0001_CONCEPT_KEYS,
  QBTEST_CUSTOMER_FULL_NAME,
  QBTEST_IDEMPOTENCY_KEY,
  QBTEST_REF_NUMBER,
  buildQbtest0001EstimateAdd,
  sanitizeEstimateAddQbXmlForDisplay
} from "./quoteQbEstimateAddBuilder.js";
import { loadActiveQbItemMappings, requireMappedConcepts } from "./quoteQbItemMappingStore.js";
import {
  assertCompanyAllowlisted,
  loadQbWriteConfig,
  validateQbWriteConfig
} from "./quoteQbWriteConfig.js";
import { validateQbWriteSafetyGate } from "./quoteQbWriteSafety.js";
import {
  upsertQbtest0001QueueRow,
  findQueueRowByIdempotencyKey,
  restoreClaimedQbtest0001QueueRowToPending
} from "./quoteQbWriteQueueStore.js";
import {
  buildCompanyQueryQbXml,
  buildCustomerQueryByFullNameQbXml,
  parseCompanyIdentity,
  resolveExactlyOneActiveTestCustomer,
  processQbXmlSafely,
  transmitEstimateAdd
} from "./quoteQbWriteTransport.js";
import {
  QBTEST_0001_EXPECTED_ITEMS,
  queryAndValidateTestItems,
  validateExpectedTestItems
} from "./quoteQbTestItemValidation.js";

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   transport?: { processRequest: Function, close?: Function }|null,
 *   companyIdentityOverride?: string|null,
 *   customerListIdOverride?: string|null,
 *   customerFullNameOverride?: string|null,
 *   skipSdkQueries?: boolean,
 *   persistQueue?: boolean,
 *   claimQueue?: boolean,
 *   itemValidationOverride?: Array<{ listId: string|null, fullName: string|null, isActive: boolean|null, found: boolean }>|null,
 * }} args
 */
export async function runQbEstimateDryRun(args) {
  const env = args.env ?? process.env;
  const configLoaded = loadQbWriteConfig(env);
  const configCheck = validateQbWriteConfig(configLoaded);
  if (!configCheck.ok) {
    return {
      ok: false,
      stage: "config",
      errors: configCheck.errors,
      dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
      estimateAddQbXml: null,
      queueRow: null
    };
  }
  const config = configCheck.config;

  // Phase 1.1: never claim. If a prior Phase 1 run left claimed, restore first.
  if (args.persistQueue !== false) {
    try {
      await restoreClaimedQbtest0001QueueRowToPending(args.db, {
        organizationId: config.organizationId
      });
    } catch (err) {
      return {
        ok: false,
        stage: "queue_restore",
        errors: [
          {
            code: "QB_QUEUE_RESTORE_FAILED",
            message: String(err?.message || err)
          }
        ],
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
  }

  /** @type {string|null} */
  let companyIdentity = args.companyIdentityOverride != null ? String(args.companyIdentityOverride).trim() : null;
  /** @type {string|null} */
  let customerListId = args.customerListIdOverride != null ? String(args.customerListIdOverride).trim() : null;
  /** @type {string|null} */
  let customerFullName =
    args.customerFullNameOverride != null ? String(args.customerFullNameOverride).trim() : null;

  const skipSdk = args.skipSdkQueries === true || !args.transport;
  /** @type {object|null} */
  let itemValidation = null;

  if (!skipSdk) {
    const companyXml = buildCompanyQueryQbXml({ qbXmlVersion: config.qbXmlVersion });
    const companyRes = await processQbXmlSafely(args.transport, companyXml, {
      dryRun: true,
      purpose: "CompanyQuery"
    });
    if (!companyRes.transmitted) {
      return {
        ok: false,
        stage: "company_query",
        errors: [{ code: "QB_COMPANY_QUERY_BLOCKED", message: "CompanyQuery was unexpectedly blocked." }],
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    companyIdentity = parseCompanyIdentity(companyRes.responseXml);
    if (!companyIdentity) {
      return {
        ok: false,
        stage: "company_query",
        errors: [
          {
            code: "QB_COMPANY_IDENTITY_UNAVAILABLE",
            message: "Could not parse CompanyName/CompanyFileName from CompanyQuery response."
          }
        ],
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }

    const companyGate = assertCompanyAllowlisted(companyIdentity, config.allowlist, config.forbidden);
    if (!companyGate.ok) {
      return {
        ok: false,
        stage: "company_allowlist",
        errors: companyGate.errors,
        companyIdentity,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }

    const customerXml = buildCustomerQueryByFullNameQbXml({
      fullName: config.testCustomerName || QBTEST_CUSTOMER_FULL_NAME,
      qbXmlVersion: config.qbXmlVersion
    });
    const customerRes = await processQbXmlSafely(args.transport, customerXml, {
      dryRun: true,
      purpose: "CustomerQuery"
    });
    if (!customerRes.transmitted) {
      return {
        ok: false,
        stage: "customer_query",
        errors: [{ code: "QB_CUSTOMER_QUERY_BLOCKED", message: "CustomerQuery was unexpectedly blocked." }],
        companyIdentity,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    const customerResolved = resolveExactlyOneActiveTestCustomer(
      customerRes.responseXml,
      config.testCustomerName || QBTEST_CUSTOMER_FULL_NAME
    );
    if (!customerResolved.ok) {
      return {
        ok: false,
        stage: "customer_query",
        errors: customerResolved.errors,
        companyIdentity,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    customerListId = customerResolved.listId;
    customerFullName = customerResolved.fullName;

    itemValidation = await queryAndValidateTestItems(args.transport, {
      qbXmlVersion: config.qbXmlVersion,
      expected: QBTEST_0001_EXPECTED_ITEMS
    });
    if (!itemValidation.ok) {
      return {
        ok: false,
        stage: "item_validation",
        errors: itemValidation.errors,
        companyIdentity,
        customerListId,
        customerFullName,
        itemValidation,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
  } else {
    if (!companyIdentity) {
      return {
        ok: false,
        stage: "company_allowlist",
        errors: [
          {
            code: "QB_COMPANY_IDENTITY_REQUIRED",
            message: "companyIdentityOverride is required when skipSdkQueries=true."
          }
        ],
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    const companyGate = assertCompanyAllowlisted(companyIdentity, config.allowlist, config.forbidden);
    if (!companyGate.ok) {
      return {
        ok: false,
        stage: "company_allowlist",
        errors: companyGate.errors,
        companyIdentity,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    if (!customerListId) {
      return {
        ok: false,
        stage: "customer_query",
        errors: [
          {
            code: "QB_TEST_CUSTOMER_MISSING",
            message: "customerListIdOverride is required when skipSdkQueries=true (no CustomerAdd fallback)."
          }
        ],
        companyIdentity,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
    if (!customerFullName) customerFullName = config.testCustomerName || QBTEST_CUSTOMER_FULL_NAME;

    const observed =
      args.itemValidationOverride ||
      QBTEST_0001_EXPECTED_ITEMS.map((exp) => ({
        listId: exp.listId,
        fullName: exp.fullName,
        isActive: true,
        found: true
      }));
    itemValidation = validateExpectedTestItems(QBTEST_0001_EXPECTED_ITEMS, observed);
    if (!itemValidation.ok) {
      return {
        ok: false,
        stage: "item_validation",
        errors: itemValidation.errors,
        companyIdentity,
        customerListId,
        customerFullName,
        itemValidation,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: null,
        queueRow: null
      };
    }
  }

  const mappings = await loadActiveQbItemMappings(args.db, config.organizationId);
  const required = requireMappedConcepts(mappings, QBTEST_0001_CONCEPT_KEYS);
  if (!required.ok) {
    return {
      ok: false,
      stage: "mappings",
      errors: required.errors,
      companyIdentity,
      customerListId,
      itemValidation,
      dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
      estimateAddQbXml: null,
      queueRow: null
    };
  }

  const built = buildQbtest0001EstimateAdd(required.mappings, {
    customerListId,
    qbXmlVersion: config.qbXmlVersion,
    txnDate: new Date().toISOString().slice(0, 10)
  });

  const requestPayload = {
    phase: "phase1_1_dry_run",
    ref_number: QBTEST_REF_NUMBER,
    customer_full_name: customerFullName || config.testCustomerName,
    customer_list_id: customerListId,
    company_identity: companyIdentity,
    concept_keys: QBTEST_0001_CONCEPT_KEYS,
    item_validation: itemValidation?.results || null,
    lines: built.lines.map((ln) => ({
      eliteos_concept_key: ln.eliteosConceptKey,
      item_list_id: ln.itemListId,
      desc: ln.desc,
      quantity: ln.quantity,
      rate: ln.rate,
      expected_amount: ln.expectedAmount
    })),
    estimate_add_qbxml: built.qbXml,
    transmit: false,
    claimed: false
  };

  let queueRow = null;
  if (args.persistQueue !== false) {
    const existing = await findQueueRowByIdempotencyKey(
      args.db,
      config.organizationId,
      QBTEST_IDEMPOTENCY_KEY
    );
    const gate = validateQbWriteSafetyGate({
      writeEnvironment: "test",
      quoteNumber: QBTEST_REF_NUMBER,
      companyIdentity,
      allowedCompanyIdentities: config.allowlist,
      idempotencyKey: QBTEST_IDEMPOTENCY_KEY,
      existingQueueStatus: existing?.status ?? null,
      rejectProductionCompany: true
    });
    if (!gate.ok) {
      return {
        ok: false,
        stage: "queue_safety",
        errors: gate.errors,
        companyIdentity,
        customerListId,
        itemValidation,
        queueRow: existing,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: sanitizeEstimateAddQbXmlForDisplay(built.qbXml)
      };
    }

    // Phase 1.1: upsert pending preview only — NEVER claim (claim is for future transmit worker).
    const upserted = await upsertQbtest0001QueueRow(args.db, {
      organizationId: config.organizationId,
      companyIdentity,
      allowedCompanyIdentities: config.allowlist,
      requestPayload
    });
    if (!upserted.ok) {
      return {
        ok: false,
        stage: "queue_upsert",
        errors: upserted.errors,
        companyIdentity,
        customerListId,
        itemValidation,
        queueRow: upserted.row,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: sanitizeEstimateAddQbXmlForDisplay(built.qbXml)
      };
    }
    queueRow = upserted.row;
    if (queueRow && queueRow.status === "claimed") {
      return {
        ok: false,
        stage: "queue_status",
        errors: [
          {
            code: "QB_DRY_RUN_LEFT_CLAIMED",
            message: "Dry-run must not leave a claimed queue row."
          }
        ],
        companyIdentity,
        customerListId,
        itemValidation,
        queueRow,
        dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS",
        estimateAddQbXml: sanitizeEstimateAddQbXmlForDisplay(built.qbXml)
      };
    }
  }

  let transmitBlocked = null;
  try {
    transmitEstimateAdd({ qbXml: built.qbXml });
  } catch (err) {
    transmitBlocked = String(err?.message || err);
  }

  const addGuard = await processQbXmlSafely(
    {
      processRequest: async () => {
        throw new Error("ProcessRequest must not be called for EstimateAdd in Phase 1");
      }
    },
    built.qbXml,
    { dryRun: true, purpose: "EstimateAdd" }
  );

  return {
    ok: true,
    stage: "dry_run_complete",
    errors: [],
    companyIdentity,
    customerListId,
    customerFullName: customerFullName || config.testCustomerName,
    mappingsUsed: required.mappings,
    itemValidation,
    queueRow,
    idempotencyKey: QBTEST_IDEMPOTENCY_KEY,
    refNumber: QBTEST_REF_NUMBER,
    estimateAddQbXml: sanitizeEstimateAddQbXmlForDisplay(built.qbXml),
    transmitBlocked,
    addGuard,
    dryRunBanner: "DRY RUN — NOTHING SENT TO QUICKBOOKS"
  };
}
