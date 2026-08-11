/**
 * Quote Flow Inbox attachment preview/download route safety.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowAttachmentPreview.test.mjs
 */
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { attachElite100QuoteFlowRoutes } from "./elite100QuoteFlowRoutes.js";
import { createQuoteFlowService } from "./quoteFlowService.mjs";
import { ELITE100_QUOTE_FLOW_HEAD_SLUG } from "./elite100QuoteFlowConfig.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const MSG = "AAMkAGI2MessageKeyExample==";
const ATT_PDF = "AAMkAGI2AttachmentPdf==";
const ATT_JPEG = "AAMkAGI2AttachmentJpeg+special==";
const ATT_PNG = "att-png-1";
const ATT_MISSING = "att-missing";

console.log("\nquoteFlowAttachmentPreview.test.mjs\n");

function mockSupabase({ headRows = [], userKind = "internal" } = {}) {
  return {
    from(table) {
      if (table === "user_profiles") {
        const result = { data: [{ user_kind: userKind }], error: null };
        const single = { data: { user_kind: userKind }, error: null };
        const api = {
          select: () => api,
          eq: () => api,
          limit: async () => result,
          maybeSingle: async () => single
        };
        return api;
      }
      if (table === "user_head_access") {
        const rows = headRows;
        const api = {
          select: () => api,
          eq: () => Promise.resolve({ data: rows, error: null })
        };
        return api;
      }
      if (table === "organizations") {
        const api = {
          select: () => api,
          eq: () => api,
          limit: async () => ({
            data: [{ id: ORG, organization_key: "elite_stone_fabrication" }],
            error: null
          }),
          maybeSingle: async () => ({
            data: { id: ORG, organization_key: "elite_stone_fabrication" },
            error: null
          })
        };
        return api;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            limit: async () => ({ data: [], error: null })
          })
        })
      };
    }
  };
}

function mockSharedInbox() {
  return {
    listInbox: async () => ({ items: [], total: 0 }),
    getMessage: async () => ({
      item: {
        messageKey: MSG,
        attachments: [
          { attachmentKey: ATT_PDF, filename: "KITCHEN.pdf", contentType: "application/pdf" },
          { attachmentKey: ATT_JPEG, filename: "IMG_9361.jpeg", contentType: "image/jpeg" },
          { attachmentKey: ATT_PNG, filename: "image001.png", contentType: "image/png" }
        ]
      }
    }),
    sendToAiTakeoff: async () => {
      throw new Error("not used");
    }
  };
}

function mockPlanViewer() {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    async getSharedInboxAttachmentContent({ messageKey, attachmentKey }) {
      assert.equal(messageKey, MSG);
      if (attachmentKey === ATT_PDF) {
        return {
          bytes: pdf,
          filename: "KITCHEN.pdf",
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="KITCHEN.pdf"'
          }
        };
      }
      if (attachmentKey === ATT_JPEG) {
        return {
          bytes: jpeg,
          filename: "IMG_9361.jpeg",
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": 'inline; filename="IMG_9361.jpeg"'
          }
        };
      }
      if (attachmentKey === ATT_PNG) {
        return {
          bytes: png,
          filename: "image001.png",
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": 'inline; filename="image001.png"'
          }
        };
      }
      if (attachmentKey === ATT_MISSING) {
        const err = new Error("The attachment could not be found.");
        err.statusCode = 404;
        err.code = "attachment_not_found";
        throw err;
      }
      const err = new Error("Attachment bytes unavailable from mailbox provider.");
      err.statusCode = 502;
      err.code = "attachment_content_unavailable";
      throw err;
    }
  };
}

async function requestBytes(app, path, init = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: {
        Authorization: "Bearer test",
        ...(init.headers || {})
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if (contentType.includes("application/json")) {
      json = JSON.parse(buf.toString("utf8"));
    }
    return { status: res.status, contentType, buf, json, headers: res.headers };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function mountApp({
  planViewerService = mockPlanViewer(),
  authUser = {
    id: "u-granted",
    email: "est@example.com",
    role: "estimator",
    isActive: true,
    user_kind: "internal"
  },
  headRows = [{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }]
} = {}) {
  const shared = mockSharedInbox();
  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: { getActiveByIntakeCase: async () => null },
    planViewerService
  });
  const app = express();
  const noop = {};
  attachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (req, res, next) => {
      if (!authUser) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }
      req.user = authUser;
      next();
    },
    getSupabase: () => mockSupabase({ headRows }),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "1" },
    quoteFlowService: svc,
    quoteFlowSetScopeService: noop,
    quoteFlowEstimatesService: noop,
    quoteFlowPricingService: noop,
    quoteFlowReviewService: noop,
    quoteFlowDigitalEstimateService: noop,
    quoteFlowActivityService: noop,
    quoteFlowAcceptedReportService: noop,
    studioEstimateService: { repository: {} },
    studioEstimateRepository: {},
    sharedInboxService: shared,
    studioEstimateQueueService: {},
    quoteIntakeRepository: {},
    planViewerService
  });
  return app;
}

{
  const app = mountApp({ authUser: null });
  const res = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PDF)}/preview`
  );
  assert.equal(res.status, 401);
  console.log("ok: preview requires auth");
}

{
  const app = mountApp({ headRows: [] });
  const res = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PDF)}/preview`
  );
  assert.equal(res.status, 403);
  assert.ok(!String(res.contentType).includes("application/pdf"));
  console.log("ok: preview requires elite100_quote_flow head access");
}

{
  const app = mountApp();
  const pdf = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PDF)}/preview`
  );
  assert.equal(pdf.status, 200, JSON.stringify(pdf.json));
  assert.match(pdf.contentType, /application\/pdf/i);
  assert.ok(pdf.buf.subarray(0, 4).equals(Buffer.from("%PDF")));

  const jpeg = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_JPEG)}/preview`
  );
  assert.equal(jpeg.status, 200);
  assert.match(jpeg.contentType, /image\/jpeg/i);
  assert.equal(jpeg.buf[0], 0xff);
  assert.equal(jpeg.buf[1], 0xd8);

  const png = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PNG)}/preview`
  );
  assert.equal(png.status, 200);
  assert.match(png.contentType, /image\/png/i);
  assert.equal(png.buf[0], 0x89);

  const dl = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PDF)}/download`
  );
  assert.equal(dl.status, 200);
  assert.match(dl.contentType, /application\/pdf/i);
  assert.match(String(dl.headers.get("content-disposition") || ""), /attachment/i);
  console.log("ok: PDF/JPEG/PNG preview streams bytes; download disposition attachment");
}

{
  const app = mountApp();
  const missing = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_MISSING)}/preview`
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.json?.ok, false);
  assert.ok(missing.json?.error);
  assert.doesNotMatch(JSON.stringify(missing.json), /graph\.microsoft|Bearer |service_role/i);
  console.log("ok: missing attachment returns safe 404 JSON");
}

{
  const app = mountApp({
    planViewerService: {
      async getSharedInboxAttachmentContent() {
        throw Object.assign(new Error("provider down"), {
          statusCode: 502,
          code: "attachment_content_unavailable"
        });
      }
    }
  });
  const fail = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_PDF)}/preview`
  );
  assert.equal(fail.status, 502);
  assert.equal(fail.json?.ok, false);
  assert.match(String(fail.json?.error || ""), /Unable to load attachment|unavailable|provider/i);
  console.log("ok: provider failure returns safe error JSON");
}

{
  const app = mountApp();
  const res = await requestBytes(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/attachments/${encodeURIComponent(ATT_JPEG)}/preview`
  );
  assert.equal(res.status, 200);
  assert.match(res.contentType, /image\/jpeg/i);
  console.log("ok: attachment keys with +/= encode/decode safely");
}

{
  const shared = mockSharedInbox();
  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: { getActiveByIntakeCase: async () => null }
  });
  await assert.rejects(
    () =>
      svc.getAttachmentContent({
        organizationId: ORG,
        messageKey: MSG,
        attachmentKey: ATT_PDF
      }),
    (e) => e?.statusCode === 503 || e?.code === "takeoff_unavailable"
  );
  console.log("ok: missing planViewerService returns safe 503, no crash");
}

console.log("\nquoteFlowAttachmentPreview.test.mjs: ok\n");
