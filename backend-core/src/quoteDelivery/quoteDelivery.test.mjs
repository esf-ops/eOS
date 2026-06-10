/**
 * Quote Delivery Phase 1 — unit and contract tests.
 *
 * Run: npm run eos:test:quote-delivery
 */
import assert from "node:assert/strict";

import { wasProviderCalled, sendEstimateEmail } from "../email/emailClient.js";
import {
  assertCustomerSafeText,
  filterCustomerFacingCustomLines,
  sanitizeSnapshotForCustomer
} from "./estimateContentSanitizer.js";
import { buildCustomerEstimateDisplayFromSnapshot } from "./estimateDisplayFromSnapshot.js";
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

function internalQuoteRow(overrides = {}) {
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
    calculation_snapshot: {
      materialGroup: "Group Promo",
      totals: { estimated_sqft: 42 },
      internal_ui: {
        customer_display_total: 12450,
        customer_estimate_customer_facing_notes: "Customer note line 1",
        custom_line_items: [
          { name: "Visible sink", customerFacing: true, lineTotal: 500 },
          { name: "Internal adjustment", customerFacing: false, lineTotal: 200, internalNote: "secret" }
        ],
        estimate_rooms: [{ name: "Kitchen", countertopSqft: 35, backsplashSqft: 7 }],
        internal_material_basis: "wholesale"
      },
      inputSummary: { areas: { countertopSqft: 35 }, engine: "rooms" },
      material_breakdown: [{ group: "Group Promo", price_per_sqft: 70 }]
    },
    ...overrides
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
  assert.ok(result.htmlPreview.includes("Visible sink"));
  assert.ok(!result.htmlPreview.includes("Internal adjustment"));
  assert.ok(result.htmlPreview.includes("Estimated project total"));
  assert.ok(!result.htmlPreview.includes("internal_ui"));
  assert.ok(!result.htmlPreview.includes("/sf"));
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
    provider: process.env.QUOTE_EMAIL_PROVIDER,
    from: process.env.QUOTE_EMAIL_FROM
  };
  delete process.env.QUOTE_EMAIL_SEND_ENABLED;
  delete process.env.QUOTE_EMAIL_PROVIDER;
  delete process.env.QUOTE_EMAIL_FROM;

  const env = getQuoteDeliveryEnv();
  assert.equal(env.sendEnabled, false);
  assert.equal(env.provider, "none");
  assert.equal(env.fromAddress, "estimates@eliteosfab.com");

  process.env.QUOTE_EMAIL_SEND_ENABLED = prev.send;
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

async function runAll() {
  testRecipientValidation();
  testSanitizerExcludesInternalDetails();
  testCustomerSafeTextAssertion();
  testFilterCustomerFacingCustomLines();
  testDisplayFromSnapshotUsesStoredTotal();
  testDeliveryLogRowShape();
  testEnvDefaults();
  testAllowedDomainsPolicy();
  await testPreviewDryRun();
  await testSendBlockedWhenDisabled();
  await testQuoteNotFound();
  await testWrongQuoteSource();
  await testNoProviderCallInDryRun();
  await testLogsGracefulWhenTableMissing();
  console.log("quoteDelivery tests: all passed");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
