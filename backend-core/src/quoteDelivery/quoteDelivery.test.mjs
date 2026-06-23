/**
 * Quote Delivery Phase 1 — unit and contract tests.
 *
 * Run: npm run eos:test:quote-delivery
 */
import assert from "node:assert/strict";

import { wasProviderCalled, sendEstimateEmail } from "../email/emailClient.js";
import {
  assertCustomerSafeText,
  auditCustomerSafeText,
  filterCustomerFacingCustomLines,
  formatCustomerSafeViolationWarning,
  sanitizeSnapshotForCustomer
} from "./estimateContentSanitizer.js";
import { buildCustomerEstimateDisplayFromSnapshot } from "./estimateDisplayFromSnapshot.js";
import { buildEstimateEmailContent, pickReplyToEmail } from "./estimateEmailBuilder.js";
import { buildCustomerEstimatePrintHtml } from "./customerEstimatePrintHtml.js";
import { buildCustomerEstimatePdfAttachment, renderHtmlToPdfBytes } from "./customerEstimatePdfBuilder.js";
import {
  buildCustomerEstimatePdfFilename,
  loadPrintSnapshotFromQuoteRow,
  parseCustomerEstimatePrintSnapshot,
  patchPrintSnapshotQuoteNumber
} from "./customerEstimatePrintSnapshot.js";
import { buildDeliveryLogRow, insertQuoteDeliveryLog } from "./quoteDeliveryLogs.js";
import { getQuoteDeliveryEnv } from "./quoteDeliveryEnv.js";
import {
  applyRecipientPolicy,
  runQuoteDelivery,
  validateDeliveryRecipients
} from "./quoteDeliveryService.js";

const QUOTE_ID = "a1111111-1111-4111-8111-111111111111";
const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const USER_ID = "c3333333-3333-4333-8333-333333333333";

function makePrintSnapshot(overrides = {}) {
  return {
    version: 1,
    finalRounded: 12450,
    header: {
      estimateDate: "June 23, 2026",
      quoteNumber: "ESF-LIS-000042",
      customerName: "Jane Customer",
      projectName: "Kitchen Remodel",
      projectAddress: "123 Main St",
      city: "Lisbon",
      state: "IA",
      branch: "Lisbon",
      salesRep: "Peg Reid",
      accountName: null,
      primaryGroup: "Group Promo",
      primaryColorLabel: "",
      colorTbd: false
    },
    display: {
      finalRounded: 12450,
      preparedByDisplayName: "Peg Reid",
      estimateSummaryRows: [
        { key: "countertop", label: "Countertop material", displayAmount: 12000 },
        { key: "addons", label: "Add-ons / fixtures", displayAmount: 450 }
      ],
      showRoomBreakdown: true,
      roomAreaPrintRows: [
        {
          roomId: "kitchen",
          displayName: "Kitchen",
          materialGroup: "Group Promo",
          isVanity: false,
          displayedMaterial: 11500,
          displayedAddOns: 450,
          displayedAreaTotal: 11950,
          addonLines: [{ label: "Visible sink", amountExact: 450, displayedAmount: 450 }],
          customerCustomLines: [],
          customerNoteLines: []
        }
      ],
      unassignedDisplayTotal: 500,
      unassignedExact: 500,
      customerFacingNoteLines: ["Customer note line 1"],
      roomComparisonTable: null
    },
    ...overrides
  };
}

function internalQuoteRow(overrides = {}) {
  const { skipPrintSnapshot, ...rest } = overrides;
  const baseInternalUi = {
    customer_display_total: 12450,
    customer_estimate_customer_facing_notes: "Customer note line 1",
    custom_line_items: [
      { name: "Visible sink", customerFacing: true, lineTotal: 500 },
      { name: "Internal adjustment", customerFacing: false, lineTotal: 200, internalNote: "secret" }
    ],
    estimate_rooms: [{ name: "Kitchen", countertopSqft: 35, backsplashSqft: 7 }],
    internal_material_basis: "wholesale"
  };
  if (!skipPrintSnapshot) {
    baseInternalUi.customer_estimate_print_snapshot = makePrintSnapshot();
  }
  const baseSnapshot = {
    materialGroup: "Group Promo",
    totals: { estimated_sqft: 42 },
    internal_ui: baseInternalUi,
    inputSummary: { areas: { countertopSqft: 35 }, engine: "rooms" },
    material_breakdown: [{ group: "Group Promo", price_per_sqft: 70 }]
  };
  const mergedSnapshot = rest.calculation_snapshot
    ? {
        ...baseSnapshot,
        ...rest.calculation_snapshot,
        internal_ui: {
          ...baseInternalUi,
          ...(rest.calculation_snapshot.internal_ui || {})
        }
      }
    : baseSnapshot;

  return {
    id: QUOTE_ID,
    quote_number: "ESF-LIS-000042",
    quote_source: "internal_quote",
    revision_number: 2,
    revision_label: "R2",
    customer_name: "Jane Customer",
    customer_email: "jane@example.com",
    project_name: "Kitchen Remodel",
    project_address: "123 Main St",
    city: "Lisbon",
    state: "IA",
    branch: "Lisbon",
    sales_rep: "Peg Reid",
    prepared_by: "peg.reid@eliteosfab.com",
    grand_total: 12447.82,
    estimated_sqft: 42,
    organization_id: ORG_ID,
    calculation_snapshot: mergedSnapshot,
    ...rest
  };
}

function makeMockSupabase({ quoteRow = null, logsAvailable = true, capturedLogs = [] } = {}) {
  return {
    from(table) {
      if (table === "quote_headers") {
        return {
          select() {
            return {
              eq() {
                return {
                  or() {
                    return {
                      limit() {
                        return Promise.resolve({ data: quoteRow ? [quoteRow] : [], error: null });
                      }
                    };
                  },
                  limit() {
                    return Promise.resolve({ data: quoteRow ? [quoteRow] : [], error: null });
                  }
                };
              }
            };
          }
        };
      }
      if (table === "quote_delivery_logs") {
        return {
          select() {
            return {
              limit() {
                if (!logsAvailable) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "42P01", message: 'relation "quote_delivery_logs" does not exist' }
                  });
                }
                return Promise.resolve({ data: [], error: null });
              }
            };
          },
          insert(row) {
            capturedLogs.push(Array.isArray(row) ? row[0] : row);
            return {
              select() {
                return {
                  limit() {
                    return Promise.resolve({ data: [{ id: "d1111111-1111-4111-8111-111111111111" }], error: null });
                  }
                };
              }
            };
          }
        };
      }
      if (table === "organizations") {
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return Promise.resolve({
                      data: [{ id: ORG_ID, organization_key: "elite_stone_fabrication", display_name: "ESF" }],
                      error: null
                    });
                  }
                };
              }
            };
          }
        };
      }
      if (table === "user_profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return Promise.resolve({ data: [{ organization_id: ORG_ID }], error: null });
                  }
                };
              }
            };
          }
        };
      }
      return {
        select() {
          return {
            limit() {
              return Promise.resolve({ data: [{ organization_id: ORG_ID }], error: null });
            }
          };
        }
      };
    }
  };
}

function mockReq(overrides = {}) {
  return {
    user: {
      id: USER_ID,
      email: "staff@eliteosfab.com",
      role: "sales",
      organization_id: ORG_ID,
      isActive: true
    },
    headers: {},
    ...overrides
  };
}

// ── Recipient validation ─────────────────────────────────────────────────────

function testRecipientValidation() {
  const missing = validateDeliveryRecipients([]);
  assert.equal(missing.ok, false);
  assert.match(missing.errors[0], /At least one recipient/);

  const noTo = validateDeliveryRecipients([{ email: "cc@example.com", type: "cc" }]);
  assert.equal(noTo.ok, false);
  assert.match(noTo.errors.join(" "), /type "to"/);

  const bcc = validateDeliveryRecipients([
    { email: "a@example.com", type: "to" },
    { email: "b@example.com", type: "bcc" }
  ]);
  assert.equal(bcc.ok, false);
  assert.match(bcc.errors.join(" "), /BCC/);

  const tooMany = validateDeliveryRecipients(
    Array.from({ length: 6 }, (_, i) => ({ email: `u${i}@example.com`, type: i === 0 ? "to" : "cc" }))
  );
  assert.equal(tooMany.ok, false);

  const badEmail = validateDeliveryRecipients([{ email: "not-an-email", type: "to" }]);
  assert.equal(badEmail.ok, false);

  const ok = validateDeliveryRecipients([
    { email: "Customer@Example.com", type: "to" },
    { email: "rep@eliteosfab.com", type: "cc" }
  ]);
  assert.equal(ok.ok, true);
  assert.equal(ok.recipients.length, 2);
  assert.equal(ok.recipients[0].email, "customer@example.com");
}

// ── Sanitizer ────────────────────────────────────────────────────────────────

function testSanitizerExcludesInternalDetails() {
  const snap = internalQuoteRow().calculation_snapshot;
  const { sanitized, warnings } = sanitizeSnapshotForCustomer(snap);

  assert.equal(sanitized.customerFacingCustomLines.length, 1);
  assert.equal(sanitized.customerFacingCustomLines[0].name, "Visible sink");
  assert.match(warnings.join(" "), /internal-only custom line/);
  assert.equal(sanitized.customerDisplayTotal, 12450);
  assert.equal(sanitized.roomSummaries.length, 1);

  const html = JSON.stringify(sanitized);
  assert.ok(!html.includes("internal_material_basis"));
  assert.ok(!html.includes("Internal adjustment"));
  assert.ok(!html.includes("price_per_sqft"));
}

function testCustomerSafeTextAssertion() {
  assert.equal(assertCustomerSafeText("Your estimate total is $12,450"), true);
  assert.equal(assertCustomerSafeText("Rate: $70/sf wholesale"), false);
  assert.equal(assertCustomerSafeText('{"internal_ui":{}}'), false);

  // Regression: CSS margin + Prepared by + legitimate area sf labels must not false-positive.
  const cssHtml =
    '<h1 style="margin:0 0 8px;">Estimate</h1><p>Prepared by Peg</p><li>35 sf counter</li>';
  assert.equal(assertCustomerSafeText(cssHtml), true);

  const leakAudit = auditCustomerSafeText("Wholesale rate for Group Promo");
  assert.equal(leakAudit.ok, false);
  assert.equal(leakAudit.violations[0].patternId, "wholesale_pricing");
}

function testBuiltEmailHtmlPassesCustomerSafeAudit() {
  const display = buildCustomerEstimateDisplayFromSnapshot(internalQuoteRow());
  const { htmlPreview, textPreview } = buildEstimateEmailContent(display);
  const htmlAudit = auditCustomerSafeText(htmlPreview);
  const textAudit = auditCustomerSafeText(textPreview);
  assert.equal(htmlAudit.ok, true, formatCustomerSafeViolationWarning("HTML", htmlAudit) || "html should be safe");
  assert.equal(textAudit.ok, true, formatCustomerSafeViolationWarning("Text", textAudit) || "text should be safe");
  assert.ok(htmlPreview.includes("35 sf counter") || htmlPreview.includes("sf counter"));
  assert.ok(htmlPreview.includes("Prepared by"));
  assert.ok(htmlPreview.includes("Peg Reid"));
  assert.ok(!htmlPreview.includes("peg.reid@eliteosfab.com"));
}

function testBrandedEmailTemplateSections() {
  const display = buildCustomerEstimateDisplayFromSnapshot(internalQuoteRow());
  const { htmlPreview, textPreview, subject } = buildEstimateEmailContent(display);

  assert.match(subject, /^Elite Stone Fabrication Estimate — ESF-LIS-000042 — Kitchen Remodel$/);
  assert.ok(htmlPreview.includes("Elite Stone Fabrication Estimate"));
  assert.ok(htmlPreview.includes("elitestonefabrication.com"));
  assert.ok(htmlPreview.includes("www.elitestonefabrication.com"));
  assert.ok(htmlPreview.includes("Lisbon, IA"));
  assert.ok(htmlPreview.includes("319-455-4200"));
  assert.ok(htmlPreview.includes("$12,450"));
  assert.ok(htmlPreview.includes("Estimated project total"));
  assert.ok(htmlPreview.includes("planning purposes"));
  assert.ok(htmlPreview.includes("field verification"));
  assert.ok(htmlPreview.includes("Areas &amp; rooms") || htmlPreview.includes("Areas & rooms"));
  assert.ok(htmlPreview.includes("Kitchen"));
  assert.ok(htmlPreview.includes("Visible sink"));

  assert.ok(textPreview.includes("ELITE STONE FABRICATION"));
  assert.ok(textPreview.includes("Estimated project total: $12,450"));
  assert.ok(textPreview.includes("Areas & rooms"));
  assert.ok(textPreview.includes("PLANNING ESTIMATE"));
  assert.ok(textPreview.includes("www.elitestonefabrication.com"));
  assert.ok(textPreview.includes("Prepared by: Peg Reid"));
}

function testReplyToFromPreparedByEmail() {
  const display = buildCustomerEstimateDisplayFromSnapshot(internalQuoteRow());
  assert.equal(pickReplyToEmail(display), "peg.reid@eliteosfab.com");
  const { replyTo } = buildEstimateEmailContent(display);
  assert.equal(replyTo, "peg.reid@eliteosfab.com");

  const noEmailDisplay = buildCustomerEstimateDisplayFromSnapshot(
    internalQuoteRow({ prepared_by: "Peg Reid" })
  );
  assert.equal(pickReplyToEmail(noEmailDisplay), null);
}

function testFilterCustomerFacingCustomLines() {
  const lines = filterCustomerFacingCustomLines([
    { name: "A", customerFacing: true, lineTotal: 100 },
    { name: "B", customerFacing: false, lineTotal: 50 }
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, "A");
}

// ── Display from snapshot ────────────────────────────────────────────────────

function testDisplayFromSnapshotUsesStoredTotal() {
  const display = buildCustomerEstimateDisplayFromSnapshot(internalQuoteRow());
  assert.equal(display.estimateTotal, 12450);
  assert.equal(display.summaryRows[0].label, "Estimated project total");
  assert.equal(display.customerFacingNotes.length, 1);
  assert.equal(display.roomSummaries[0].name, "Kitchen");
}

// ── Delivery log shape ───────────────────────────────────────────────────────

function testDeliveryLogRowShape() {
  const row = buildDeliveryLogRow({
    organizationId: ORG_ID,
    quoteId: QUOTE_ID,
    quoteNumber: "ESF-LIS-000042",
    revisionNumber: 2,
    revisionLabel: "R2",
    snapshotHash: "abc123",
    status: "preview",
    sentBy: USER_ID,
    sentByEmail: "staff@eliteosfab.com",
    recipients: [{ email: "jane@example.com", type: "to" }],
    subject: "Test",
    provider: "none",
    metadata: { dry_run: true }
  });

  assert.equal(row.quote_id, QUOTE_ID);
  assert.equal(row.status, "preview");
  assert.equal(row.delivery_mode, "email");
  assert.deepEqual(row.recipients, [{ email: "jane@example.com", type: "to" }]);
  assert.equal(row.metadata.dry_run, true);
}

// ── Preview dry-run ──────────────────────────────────────────────────────────

async function testPreviewDryRun() {
  const prevSend = process.env.QUOTE_EMAIL_SEND_ENABLED;
  const prevProvider = process.env.QUOTE_EMAIL_PROVIDER;
  process.env.QUOTE_EMAIL_SEND_ENABLED = "0";
  process.env.QUOTE_EMAIL_PROVIDER = "none";

  const capturedLogs = [];
  const db = makeMockSupabase({ quoteRow: internalQuoteRow(), capturedLogs });
  const req = mockReq();

  const result = await runQuoteDelivery(
    db,
    req,
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.sendEnabled, false);
  assert.equal(result.quoteNumber, "ESF-LIS-000042");
  assert.equal(result.revisionLabel, "R2");
  assert.ok(result.htmlPreview.includes("Elite Stone Fabrication Estimate"));
  assert.ok(result.htmlPreview.includes("www.elitestonefabrication.com"));
  assert.ok(result.htmlPreview.includes("planning purposes"));
  assert.ok(result.htmlPreview.includes("Visible sink"));
  assert.ok(!result.htmlPreview.includes("Internal adjustment"));
  assert.ok(result.htmlPreview.includes("Estimated project total"));
  assert.ok(!result.htmlPreview.includes("internal_ui"));
  assert.ok(!result.htmlPreview.includes("/sf"));
  assert.ok(
    !(result.warnings || []).some((w) => String(w).includes("customer-safe check")),
    `unexpected customer-safe warning: ${(result.warnings || []).join("; ")}`
  );
  assert.equal(result.deliveryLogId, "d1111111-1111-4111-8111-111111111111");
  assert.equal(capturedLogs.length, 1);
  assert.equal(capturedLogs[0].status, "preview");

  process.env.QUOTE_EMAIL_SEND_ENABLED = prevSend;
  process.env.QUOTE_EMAIL_PROVIDER = prevProvider;
}

async function testSendBlockedWhenDisabled() {
  const prevSend = process.env.QUOTE_EMAIL_SEND_ENABLED;
  process.env.QUOTE_EMAIL_SEND_ENABLED = "0";

  const db = makeMockSupabase({ quoteRow: internalQuoteRow() });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "send" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.blocked, true);
  assert.equal(result.sendEnabled, false);

  process.env.QUOTE_EMAIL_SEND_ENABLED = prevSend;
}

async function testQuoteNotFound() {
  const db = makeMockSupabase({ quoteRow: null });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 404);
}

async function testWrongQuoteSource() {
  const db = makeMockSupabase({
    quoteRow: internalQuoteRow({ quote_source: "public_consumer" })
  });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 422);
  assert.equal(result.code, "unsupported_quote_source");
}

async function testNoProviderCallInDryRun() {
  const result = await sendEstimateEmail({
    to: ["test@example.com"],
    subject: "Test",
    html: "<p>Hi</p>",
    text: "Hi",
    from: "estimates@eliteosfab.com",
    provider: "none"
  });
  assert.equal(result.skipped, true);
  assert.equal(wasProviderCalled(result), false);
}

async function testLogsGracefulWhenTableMissing() {
  const db = makeMockSupabase({ logsAvailable: false });
  const result = await insertQuoteDeliveryLog(
    db,
    buildDeliveryLogRow({ quoteId: QUOTE_ID, status: "preview" })
  );
  assert.equal(result.skipped, true);
  assert.ok(result.setupWarning.includes("eliteos_quote_delivery_foundation.sql"));
}

function testEnvDefaults() {
  const prev = {
    send: process.env.QUOTE_EMAIL_SEND_ENABLED,
    pdf: process.env.QUOTE_EMAIL_PDF_ENABLED,
    provider: process.env.QUOTE_EMAIL_PROVIDER,
    from: process.env.QUOTE_EMAIL_FROM
  };
  delete process.env.QUOTE_EMAIL_SEND_ENABLED;
  delete process.env.QUOTE_EMAIL_PDF_ENABLED;
  delete process.env.QUOTE_EMAIL_PROVIDER;
  delete process.env.QUOTE_EMAIL_FROM;

  const env = getQuoteDeliveryEnv();
  assert.equal(env.sendEnabled, false);
  assert.equal(env.pdfEnabled, false);
  assert.equal(env.provider, "none");
  assert.equal(env.fromAddress, "estimates@eliteosfab.com");

  process.env.QUOTE_EMAIL_SEND_ENABLED = prev.send;
  process.env.QUOTE_EMAIL_PDF_ENABLED = prev.pdf;
  process.env.QUOTE_EMAIL_PROVIDER = prev.provider;
  process.env.QUOTE_EMAIL_FROM = prev.from;
}

function testAllowedDomainsPolicy() {
  const env = { allowedDomains: ["eliteosfab.com"], forceRecipient: null };
  const blocked = applyRecipientPolicy([{ email: "a@other.com", type: "to" }], env);
  assert.equal(blocked.ok, false);

  const allowed = applyRecipientPolicy([{ email: "a@eliteosfab.com", type: "to" }], env);
  assert.equal(allowed.ok, true);
}

function testForceRecipientOverridesDeliveryTarget() {
  const env = { allowedDomains: [], forceRecipient: "ops@eliteosfab.com" };
  const result = applyRecipientPolicy(
    [
      { email: "customer@example.com", type: "to" },
      { email: "cc@example.com", type: "cc" }
    ],
    env
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.recipients, [{ email: "ops@eliteosfab.com", type: "to" }]);
  assert.deepEqual(result.intendedRecipients, [
    { email: "customer@example.com", type: "to" },
    { email: "cc@example.com", type: "cc" }
  ]);
  assert.ok((result.warnings || []).some((w) => String(w).includes("ops@eliteosfab.com")));
}

function testResendProviderEnvSelection() {
  const prev = {
    send: process.env.QUOTE_EMAIL_SEND_ENABLED,
    provider: process.env.QUOTE_EMAIL_PROVIDER,
    from: process.env.QUOTE_EMAIL_FROM
  };
  process.env.QUOTE_EMAIL_PROVIDER = "resend";
  process.env.QUOTE_EMAIL_FROM = "Elite Stone Fabrication <quotes@eliteosfab.com>";
  const env = getQuoteDeliveryEnv();
  assert.equal(env.provider, "resend");
  assert.equal(env.fromAddress, "Elite Stone Fabrication <quotes@eliteosfab.com>");
  process.env.QUOTE_EMAIL_SEND_ENABLED = prev.send;
  process.env.QUOTE_EMAIL_PROVIDER = prev.provider;
  process.env.QUOTE_EMAIL_FROM = prev.from;
}

async function testResendMissingApiKeyFailsSafely() {
  const prevKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const result = await sendEstimateEmail({
    to: ["test@example.com"],
    subject: "Test estimate",
    html: "<p>Hi</p>",
    text: "Hi",
    from: "quotes@eliteosfab.com",
    provider: "resend"
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.error || "", /RESEND_API_KEY/i);
  assert.equal(wasProviderCalled(result), false);
  if (prevKey != null) process.env.RESEND_API_KEY = prevKey;
}

async function testResendSendUsesApiWithMockFetch() {
  const prevKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_mock_key_for_unit_tests";
  const prevFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = null;
  let authHeader = "";
  globalThis.fetch = async (url, opts) => {
    capturedUrl = String(url);
    authHeader = String(opts?.headers?.Authorization || "");
    capturedBody = JSON.parse(String(opts?.body || "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "msg_resend_test_123" })
    };
  };

  const result = await sendEstimateEmail({
    to: ["customer@example.com"],
    cc: ["rep@eliteosfab.com"],
    subject: "Elite Stone Fabrication Estimate",
    html: "<p>Estimate</p>",
    text: "Estimate",
    from: "Elite Stone Fabrication <quotes@eliteosfab.com>",
    provider: "resend",
    replyTo: "peg.reid@eliteosfab.com"
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, "resend");
  assert.equal(result.messageId, "msg_resend_test_123");
  assert.equal(wasProviderCalled(result), true);
  assert.equal(capturedUrl, "https://api.resend.com/emails");
  assert.ok(authHeader.startsWith("Bearer "));
  assert.deepEqual(capturedBody.to, ["customer@example.com"]);
  assert.deepEqual(capturedBody.cc, ["rep@eliteosfab.com"]);
  assert.equal(capturedBody.from, "Elite Stone Fabrication <quotes@eliteosfab.com>");
  assert.equal(capturedBody.reply_to, "peg.reid@eliteosfab.com");

  globalThis.fetch = prevFetch;
  if (prevKey != null) process.env.RESEND_API_KEY = prevKey;
  else delete process.env.RESEND_API_KEY;
}

async function testSendWithResendEnabledLogsIntendedRecipientsWhenForced() {
  const prev = {
    send: process.env.QUOTE_EMAIL_SEND_ENABLED,
    provider: process.env.QUOTE_EMAIL_PROVIDER,
    force: process.env.QUOTE_EMAIL_FORCE_RECIPIENT,
    key: process.env.RESEND_API_KEY
  };
  process.env.QUOTE_EMAIL_SEND_ENABLED = "1";
  process.env.QUOTE_EMAIL_PROVIDER = "resend";
  process.env.QUOTE_EMAIL_FORCE_RECIPIENT = "ops@eliteosfab.com";
  process.env.RESEND_API_KEY = "re_test_mock_key";

  const prevFetch = globalThis.fetch;
  let sentTo = [];
  let sentReplyTo = null;
  let sentHtml = "";
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(String(opts?.body || "{}"));
    sentTo = body.to || [];
    sentReplyTo = body.reply_to ?? null;
    sentHtml = String(body.html || "");
    return { ok: true, status: 200, json: async () => ({ id: "msg_forced" }) };
  };

  const capturedLogs = [];
  const db = makeMockSupabase({ quoteRow: internalQuoteRow(), capturedLogs });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    {
      recipients: [
        { email: "customer@example.com", type: "to" },
        { email: "cc@example.com", type: "cc" }
      ]
    },
    { mode: "send" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  assert.deepEqual(sentTo, ["ops@eliteosfab.com"]);
  assert.equal(sentReplyTo, "peg.reid@eliteosfab.com");
  assert.ok(sentHtml.includes("Elite Stone Fabrication Estimate"));
  assert.ok(sentHtml.includes("$12,450"));
  assert.equal(capturedLogs.length, 1);
  assert.deepEqual(capturedLogs[0].recipients, [{ email: "ops@eliteosfab.com", type: "to" }]);
  assert.deepEqual(capturedLogs[0].metadata.intended_recipients, [
    { email: "customer@example.com", type: "to" },
    { email: "cc@example.com", type: "cc" }
  ]);

  globalThis.fetch = prevFetch;
  process.env.QUOTE_EMAIL_SEND_ENABLED = prev.send;
  process.env.QUOTE_EMAIL_PROVIDER = prev.provider;
  process.env.QUOTE_EMAIL_FORCE_RECIPIENT = prev.force;
  if (prev.key != null) process.env.RESEND_API_KEY = prev.key;
  else delete process.env.RESEND_API_KEY;
}

async function testMissingQuoteNumberBlocksDelivery() {
  const db = makeMockSupabase({ quoteRow: internalQuoteRow({ quote_number: null }) });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 422);
  assert.equal(result.code, "quote_number_missing");
  assert.match(result.error, /Save this quote before printing/);
}

async function testMissingSnapshotBlocksDelivery() {
  const db = makeMockSupabase({ quoteRow: internalQuoteRow({ calculation_snapshot: null }) });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 422);
  assert.equal(result.code, "calculation_snapshot_missing");
}

function testEmailHtmlRequiresQuoteNumber() {
  const display = buildCustomerEstimateDisplayFromSnapshot(
    internalQuoteRow({ quote_number: null })
  );
  assert.throws(() => buildEstimateEmailContent(display), /requires a saved quote number/);
}

async function testPreviewHtmlIncludesQuoteNumberNotDash() {
  const db = makeMockSupabase({ quoteRow: internalQuoteRow() });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, true);
  assert.ok(result.htmlPreview.includes("ESF-LIS-000042"));
  assert.ok(!result.htmlPreview.includes("Quote #</td><td style=\"padding:4px 0;\">—"));
}

function testPrintSnapshotParseAndFilename() {
  const snap = makePrintSnapshot();
  assert.ok(parseCustomerEstimatePrintSnapshot(snap));
  assert.equal(
    buildCustomerEstimatePdfFilename("ESF-LIS-000042", "R2"),
    "Elite Stone Fabrication Estimate - ESF-LIS-000042-R2.pdf"
  );
  const loaded = loadPrintSnapshotFromQuoteRow(internalQuoteRow());
  assert.ok(loaded?.snapshot);
  assert.equal(loaded.reconciled, true);
}

function testPatchPrintSnapshotQuoteNumberForCreateSave() {
  const snapStore = {
    internal_ui: {
      customer_display_total: 12450,
      customer_estimate_print_snapshot: makePrintSnapshot({
        header: { ...makePrintSnapshot().header, quoteNumber: "" }
      })
    }
  };
  patchPrintSnapshotQuoteNumber(snapStore, "ESF-LIS-000099");
  const ps = snapStore.internal_ui.customer_estimate_print_snapshot;
  assert.equal(ps.header.quoteNumber, "ESF-LIS-000099");
  const row = internalQuoteRow({
    quote_number: "ESF-LIS-000099",
    calculation_snapshot: {
      materialGroup: "Group Promo",
      internal_ui: snapStore.internal_ui
    }
  });
  const loaded = loadPrintSnapshotFromQuoteRow(row);
  assert.ok(loaded?.snapshot);
  assert.equal(loaded.snapshot.header.quoteNumber, "ESF-LIS-000099");
}

function testPrintHtmlCustomerSafe() {
  const snap = makePrintSnapshot();
  const html = buildCustomerEstimatePrintHtml(snap);
  assert.ok(html.includes("ESF-LIS-000042"));
  assert.ok(html.includes("$12,450"));
  assert.ok(html.includes("Kitchen"));
  const audit = auditCustomerSafeText(html);
  assert.equal(audit.ok, true, formatCustomerSafeViolationWarning("Print HTML", audit) || "print html safe");
  assert.ok(!html.includes("internal_ui"));
  assert.ok(!html.includes("price_per_sqft"));
}

async function testPreviewReturnsPdfMetadataOnly() {
  const prevPdf = process.env.QUOTE_EMAIL_PDF_ENABLED;
  process.env.QUOTE_EMAIL_PDF_ENABLED = "1";
  const db = makeMockSupabase({ quoteRow: internalQuoteRow() });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, true);
  assert.ok(result.pdfAttachment);
  assert.equal(typeof result.pdfAttachment.byteLength, "number");
  assert.ok(result.pdfAttachment.filename?.includes("ESF-LIS-000042"));
  assert.ok(!("pdfBase64" in result));
  assert.ok(!JSON.stringify(result).includes("base64"));
  process.env.QUOTE_EMAIL_PDF_ENABLED = prevPdf;
}

async function testLegacyQuoteWithoutPrintSnapshotWarns() {
  const prevPdf = process.env.QUOTE_EMAIL_PDF_ENABLED;
  process.env.QUOTE_EMAIL_PDF_ENABLED = "1";
  const db = makeMockSupabase({ quoteRow: internalQuoteRow({ skipPrintSnapshot: true }) });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "jane@example.com", type: "to" }] },
    { mode: "preview" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.pdfAttachment?.generated, false);
  assert.equal(result.pdfAttachment?.reason, "no_print_snapshot");
  assert.ok((result.warnings || []).some((w) => String(w).includes("print snapshot")));
  process.env.QUOTE_EMAIL_PDF_ENABLED = prevPdf;
}

async function testPdfBuilderDisabledSafely() {
  const result = await buildCustomerEstimatePdfAttachment({
    row: internalQuoteRow(),
    pdfEnabled: false
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "pdf_disabled");
}

async function testPdfRenderProducesValidBytesWhenAvailable() {
  const html = buildCustomerEstimatePrintHtml(makePrintSnapshot());
  const result = await renderHtmlToPdfBytes(html);
  if (!result.ok) {
    console.warn("[quote-delivery-test] PDF renderer unavailable locally:", result.error);
    return;
  }
  assert.ok(result.buffer.length > 100);
  assert.equal(result.buffer.subarray(0, 4).toString("utf8"), "%PDF");
}

async function testResendReceivesAttachmentWhenPdfEnabled() {
  const prev = {
    send: process.env.QUOTE_EMAIL_SEND_ENABLED,
    pdf: process.env.QUOTE_EMAIL_PDF_ENABLED,
    provider: process.env.QUOTE_EMAIL_PROVIDER,
    force: process.env.QUOTE_EMAIL_FORCE_RECIPIENT,
    key: process.env.RESEND_API_KEY
  };
  process.env.QUOTE_EMAIL_SEND_ENABLED = "1";
  process.env.QUOTE_EMAIL_PDF_ENABLED = "1";
  process.env.QUOTE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_mock_key";

  const prevFetch = globalThis.fetch;
  let capturedAttachments = null;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(String(opts?.body || "{}"));
    capturedAttachments = body.attachments || null;
    return { ok: true, status: 200, json: async () => ({ id: "msg_with_pdf" }) };
  };

  const db = makeMockSupabase({ quoteRow: internalQuoteRow() });
  const result = await runQuoteDelivery(
    db,
    mockReq(),
    QUOTE_ID,
    { recipients: [{ email: "customer@example.com", type: "to" }] },
    { mode: "send" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  if (result.pdfAttachment?.generated) {
    assert.ok(Array.isArray(capturedAttachments));
    assert.equal(capturedAttachments.length, 1);
    assert.ok(capturedAttachments[0].filename.includes("ESF-LIS-000042"));
    assert.ok(typeof capturedAttachments[0].content === "string");
    assert.ok(capturedAttachments[0].content.length > 20);
  } else {
    console.warn(
      "[quote-delivery-test] PDF not generated in send test:",
      result.pdfAttachment?.reason,
      result.pdfAttachment?.error
    );
  }

  globalThis.fetch = prevFetch;
  process.env.QUOTE_EMAIL_SEND_ENABLED = prev.send;
  process.env.QUOTE_EMAIL_PDF_ENABLED = prev.pdf;
  process.env.QUOTE_EMAIL_PROVIDER = prev.provider;
  process.env.QUOTE_EMAIL_FORCE_RECIPIENT = prev.force;
  if (prev.key != null) process.env.RESEND_API_KEY = prev.key;
  else delete process.env.RESEND_API_KEY;
}

async function runAll() {
  testRecipientValidation();
  testSanitizerExcludesInternalDetails();
  testCustomerSafeTextAssertion();
  testBuiltEmailHtmlPassesCustomerSafeAudit();
  testBrandedEmailTemplateSections();
  testReplyToFromPreparedByEmail();
  testFilterCustomerFacingCustomLines();
  testDisplayFromSnapshotUsesStoredTotal();
  testDeliveryLogRowShape();
  testEnvDefaults();
  testAllowedDomainsPolicy();
  testForceRecipientOverridesDeliveryTarget();
  testResendProviderEnvSelection();
  await testPreviewDryRun();
  await testSendBlockedWhenDisabled();
  await testQuoteNotFound();
  await testWrongQuoteSource();
  await testMissingQuoteNumberBlocksDelivery();
  await testMissingSnapshotBlocksDelivery();
  testEmailHtmlRequiresQuoteNumber();
  testPrintSnapshotParseAndFilename();
  testPatchPrintSnapshotQuoteNumberForCreateSave();
  testPrintHtmlCustomerSafe();
  await testPreviewReturnsPdfMetadataOnly();
  await testLegacyQuoteWithoutPrintSnapshotWarns();
  await testPdfBuilderDisabledSafely();
  await testPdfRenderProducesValidBytesWhenAvailable();
  await testPreviewHtmlIncludesQuoteNumberNotDash();
  await testNoProviderCallInDryRun();
  await testResendMissingApiKeyFailsSafely();
  await testResendSendUsesApiWithMockFetch();
  await testSendWithResendEnabledLogsIntendedRecipientsWhenForced();
  await testResendReceivesAttachmentWhenPdfEnabled();
  await testLogsGracefulWhenTableMissing();
  console.log("quoteDelivery tests: all passed");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
