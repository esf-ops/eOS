/**
 * Secure Plan Viewer Phase 1 — service + route contracts (fake Graph / sentinel only).
 * Run: node backend-core/src/elite100EstimateStudio/studioSecurePlanViewer.test.mjs
 *   or: npm run eos:test:studio-secure-plan-viewer
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import {
  createStudioSecurePlanViewerService,
  _planViewerTestHelpers,
  planViewerError
} from "./studioSecurePlanViewer.mjs";
import { attachElite100EstimateStudioRoutes } from "./elite100EstimateStudioRoutes.js";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import {
  createFakeGraphTransport,
  sampleGraphMessage,
  samplePdfAttachment
} from "../quoteIntake/fakeQuoteIntakeGraph.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";
import { DEFAULT_ORGANIZATION_KEY } from "../organizations/organizationContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PILOT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PILOT_EMAIL = "pilot@example.com";

const {
  validatePlanBytes,
  sanitizePlanFilename,
  contentDispositionInline,
  isPreviewSupportedMeta,
  planContentResponseHeaders,
  readPlanPreviewMaxBytes
} = _planViewerTestHelpers;

const GRAPH_ENV = {
  QUOTE_INTAKE_API_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
  QUOTE_INTAKE_GRAPH_TENANT_ID: "tenant-test",
  QUOTE_INTAKE_GRAPH_CLIENT_ID: "client-test",
  QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "secret-test-value",
  QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@elitestonefabrication.com",
  QUOTE_INTAKE_AUTOMATIC_TAKEOFF: "0",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: PILOT_ID,
  ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: PILOT_EMAIL,
  STUDIO_PLAN_PREVIEW_MAX_BYTES: String(50 * 1024 * 1024)
};

const PDF_BYTES = Buffer.from("%PDF-1.4 sentinel-plan");
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.from("VP8 "),
  Buffer.alloc(4)
]);
const HTML_BYTES = Buffer.from("<!DOCTYPE html><html><body>x</body></html>");
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function graphClientFor(transport) {
  return createQuoteIntakeGraphClient({
    mailbox: "quotes@elitestonefabrication.com",
    credentials: {
      tenantId: "tenant-test",
      clientId: "client-test",
      clientSecret: "secret-test-value",
      mailbox: "quotes@elitestonefabrication.com"
    },
    fetchImpl: transport.fetchImpl
  });
}

function makeViewer({
  messages,
  attachmentsByMessageId,
  repo,
  downloadStoredFile,
  env = GRAPH_ENV,
  throttle = false
} = {}) {
  const transport = createFakeGraphTransport({
    messages: messages || [
      sampleGraphMessage({
        id: "msg-plan-1",
        internetMessageId: "<plan-1@example.com>",
        hasAttachments: true
      })
    ],
    attachmentsByMessageId: attachmentsByMessageId || {
      "msg-plan-1": [
        samplePdfAttachment({
          id: "att-plan-1",
          name: "Kitchen Plan.pdf",
          contentBytes: PDF_BYTES.toString("base64"),
          supportPdf: true
        })
      ]
    },
    throttle
  });
  const repository = repo || new InMemoryQuoteIntakeRepository();
  const service = createStudioSecurePlanViewerService({
    env,
    quoteIntakeRepository: repository,
    graphClient: graphClientFor(transport),
    downloadStoredFile
  });
  return { service, transport, repository };
}

console.log("\nstudioSecurePlanViewer.test.mjs\n");

// --- Content validation helpers ---
{
  assert.equal(validatePlanBytes(PDF_BYTES).kind, "pdf");
  assert.equal(validatePlanBytes(PNG_BYTES).contentType, "image/png");
  assert.equal(validatePlanBytes(JPEG_BYTES).contentType, "image/jpeg");
  assert.equal(validatePlanBytes(WEBP_BYTES).contentType, "image/webp");

  assert.throws(
    () => validatePlanBytes(HTML_BYTES, { declaredMime: "application/pdf", filename: "x.pdf" }),
    (e) => e.code === "attachment_type_mismatch"
  );
  assert.throws(
    () => validatePlanBytes(HTML_BYTES, { filename: "evil.pdf" }),
    (e) => e.code === "attachment_type_mismatch"
  );
  assert.throws(
    () => validatePlanBytes(SVG_BYTES, { filename: "x.svg", declaredMime: "image/svg+xml" }),
    (e) => e.code === "attachment_preview_not_supported"
  );
  assert.throws(
    () => validatePlanBytes(Buffer.from("PK\x03\x04office"), { filename: "plan.docx" }),
    (e) => e.code === "attachment_preview_not_supported"
  );
  console.log("ok: 10–16 magic-byte validation (PDF/PNG/JPEG/WebP; HTML/SVG/Office rejected)");
}

{
  const dirty = 'plan.pdf\r\nContent-Type: text/html"/../evil.pdf';
  const safe = sanitizePlanFilename(dirty);
  assert.equal(/\r|\n|\\|\/|"/.test(safe), false);
  const disp = contentDispositionInline(dirty);
  assert.match(disp, /^inline; filename="/);
  assert.equal(/\r|\n/.test(disp), false);
  assert.equal(disp.includes('"'), true); // quoted token only
  assert.ok(!disp.split("filename=")[1]?.includes("\n"));
  console.log("ok: 18–19 filename sanitization + CR/LF header injection prevented");
}

{
  const headers = planContentResponseHeaders({
    contentType: "application/pdf",
    filename: "Kitchen Plan.pdf",
    sizeBytes: 42
  });
  assert.equal(headers["Content-Type"], "application/pdf");
  assert.match(headers["Content-Disposition"], /^inline;/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers.Pragma, "no-cache");
  assert.ok(readPlanPreviewMaxBytes(GRAPH_ENV) <= 100 * 1024 * 1024);
  console.log("ok: 20–23 response security headers + size limit helper");
}

{
  assert.equal(isPreviewSupportedMeta({ support: "direct_pdf", filename: "a.pdf" }), true);
  assert.equal(isPreviewSupportedMeta({ support: "too_large" }), false);
  assert.equal(isPreviewSupportedMeta({ mimeType: "image/png", filename: "a.png" }), true);
  assert.equal(isPreviewSupportedMeta({ filename: "notes.docx", mimeType: "application/vnd..." }), false);
  console.log("ok: previewSupported meta for PDF/images; Office unsupported");
}

// --- Graph / stored retrieval ---
{
  const { service, transport } = makeViewer();
  const before = transport.requests.length;
  const result = await service.getSharedInboxAttachmentContent({
    organizationId: ORG,
    messageKey: "msg-plan-1",
    attachmentKey: "att-plan-1"
  });
  assert.equal(result.contentType, "application/pdf");
  assert.equal(result.source, "graph");
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.equal(result.bytes.subarray(0, 4).toString(), "%PDF");
  assert.equal(result.headers["Content-Type"], "application/pdf");
  const body = JSON.stringify(result);
  assert.equal(/graph\.microsoft|https?:\/\//i.test(body), false);
  assert.equal(/access_token|Bearer |client_secret/i.test(body), false);
  const attGets = transport.requests.filter(
    (r) => r.method === "GET" && /\/attachments\//.test(r.url)
  );
  assert.ok(attGets.length >= 1);
  assert.equal(
    transport.requests.some((r) => /PATCH|PUT|DELETE/i.test(r.method)),
    false
  );
  assert.equal(
    transport.requests.some((r) => /isRead|move|\$value/i.test(r.url) && /PATCH/i.test(r.method)),
    false
  );
  assert.ok(transport.requests.length > before);
  console.log("ok: 1/24–29 Graph GET returns bytes; no Graph URL/token; no mark-read/move/delete");
}

{
  const sha = createHash("sha256").update(PDF_BYTES).digest("hex");
  let graphHits = 0;
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage({ id: "msg-stored-1" })],
    attachmentsByMessageId: {
      "msg-stored-1": [
        samplePdfAttachment({
          id: "att-stored-1",
          contentBytes: PDF_BYTES.toString("base64"),
          supportPdf: true
        })
      ]
    }
  });
  const origFetch = transport.fetchImpl;
  transport.fetchImpl = async (url, init) => {
    if (String(url).includes("/attachments/")) graphHits += 1;
    return origFetch(url, init);
  };
  const repo = new InMemoryQuoteIntakeRepository();
  const created = repo.createCase({
    organizationId: ORG,
    sourceType: "graph_mailbox",
    receivedAt: "2026-07-28T12:00:00Z",
    sourceMessage: {
      internetMessageId: "<stored-1@example.com>",
      graphImmutableMessageId: "msg-stored-1"
    },
    attachments: [
      {
        mimeType: "application/pdf",
        safeFilename: "Kitchen Plan.pdf",
        sourceAttachmentId: "att-stored-1",
        providerMessageId: "msg-stored-1",
        support: "direct_pdf",
        sha256: sha,
        sizeBytes: PDF_BYTES.length,
        retrievalState: "retrieved"
      }
    ]
  });
  const service = createStudioSecurePlanViewerService({
    env: GRAPH_ENV,
    quoteIntakeRepository: repo,
    graphClient: graphClientFor(transport),
    downloadStoredFile: async ({ organizationId, sha256 }) => {
      assert.equal(organizationId, ORG);
      assert.equal(sha256, sha);
      return {
        bytes: PDF_BYTES,
        filename: "Kitchen Plan.pdf",
        declaredMime: "application/pdf",
        source: "stored"
      };
    }
  });
  const result = await service.getSharedInboxAttachmentContent({
    organizationId: ORG,
    messageKey: "msg-stored-1",
    attachmentKey: "att-stored-1"
  });
  assert.equal(result.source, "stored");
  assert.equal(graphHits, 0);
  const byIntake = await service.getIntakeAttachmentContent({
    organizationId: ORG,
    intakeCaseId: created.id,
    attachmentId: created.attachments[0].id
  });
  assert.equal(byIntake.source, "stored");
  console.log("ok: 30–31 stored-file source preferred over Graph");
}

{
  const { service } = makeViewer({
    messages: [sampleGraphMessage({ id: "msg-gone" })],
    attachmentsByMessageId: {}
  });
  await assert.rejects(
    () =>
      service.getSharedInboxAttachmentContent({
        organizationId: ORG,
        messageKey: "msg-gone",
        attachmentKey: "att-missing"
      }),
    (e) => e.code === "attachment_content_unavailable" || e.code === "attachment_not_found"
  );
  console.log("ok: 32 missing Graph attachment → safe unavailable/not found");
}

{
  const { service } = makeViewer({ throttle: true });
  await assert.rejects(
    () =>
      service.getSharedInboxAttachmentContent({
        organizationId: ORG,
        messageKey: "msg-plan-1",
        attachmentKey: "att-plan-1"
      }),
    (e) => e.code === "mailbox_unavailable" && Number(e.statusCode) >= 429
  );
  console.log("ok: 33 Graph throttle → mailbox_unavailable retryable");
}

{
  const oversized = Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.alloc(2048, 0x41)]);
  const { service, repository } = makeViewer({
    env: { ...GRAPH_ENV, STUDIO_PLAN_PREVIEW_MAX_BYTES: "1024" },
    attachmentsByMessageId: {
      "msg-plan-1": [
        samplePdfAttachment({
          id: "att-plan-1",
          name: "huge.pdf",
          contentBytes: oversized.toString("base64"),
          supportPdf: true
        })
      ]
    }
  });
  await assert.rejects(
    () =>
      service.getSharedInboxAttachmentContent({
        organizationId: ORG,
        messageKey: "msg-plan-1",
        attachmentKey: "att-plan-1"
      }),
    (e) => e.code === "attachment_too_large_for_preview"
  );
  const casesBefore = repository.listCases(ORG, { limit: 50 }).length;
  assert.equal(casesBefore, 0);
  console.log("ok: 17 oversized → attachment_too_large_for_preview; no intake created");
}

{
  const { service, repository } = makeViewer();
  const beforeCases = repository.listCases(ORG, { limit: 50 }).length;
  await service.getSharedInboxAttachmentContent({
    organizationId: ORG,
    messageKey: "msg-plan-1",
    attachmentKey: "att-plan-1"
  });
  assert.equal(repository.listCases(ORG, { limit: 50 }).length, beforeCases);
  console.log("ok: 34–36 viewer GET performs no intake/Takeoff/workflow mutation");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  const alpha = repo.createCase({
    organizationId: ORG,
    sourceType: "graph_mailbox",
    sourceMessage: {
      internetMessageId: "<alpha@example.com>",
      graphImmutableMessageId: "msg-alpha"
    },
    attachments: [
      {
        mimeType: "application/pdf",
        safeFilename: "alpha.pdf",
        sourceAttachmentId: "att-alpha",
        providerMessageId: "msg-alpha",
        support: "direct_pdf",
        sizeBytes: 10
      }
    ]
  });
  repo.createCase({
    organizationId: ORG_B,
    sourceType: "graph_mailbox",
    sourceMessage: {
      internetMessageId: "<beta@example.com>",
      graphImmutableMessageId: "msg-beta"
    },
    attachments: [
      {
        mimeType: "application/pdf",
        safeFilename: "beta.pdf",
        sourceAttachmentId: "att-beta",
        providerMessageId: "msg-beta",
        support: "direct_pdf",
        sizeBytes: 10
      }
    ]
  });
  const { service } = makeViewer({
    repo,
    messages: [
      sampleGraphMessage({ id: "msg-alpha" }),
      sampleGraphMessage({ id: "msg-beta" })
    ],
    attachmentsByMessageId: {
      "msg-alpha": [
        samplePdfAttachment({
          id: "att-alpha",
          contentBytes: PDF_BYTES.toString("base64"),
          supportPdf: true
        })
      ],
      "msg-beta": [
        samplePdfAttachment({
          id: "att-beta",
          contentBytes: PDF_BYTES.toString("base64"),
          supportPdf: true
        })
      ]
    }
  });

  await assert.rejects(
    () =>
      service.getIntakeAttachmentContent({
        organizationId: ORG,
        intakeCaseId: alpha.id,
        attachmentId: "att-beta"
      }),
    (e) => e.code === "attachment_not_found" && e.statusCode === 404
  );
  await assert.rejects(
    () =>
      service.getIntakeAttachmentContent({
        organizationId: ORG,
        intakeCaseId: alpha.id,
        attachmentId: "does-not-exist"
      }),
    (e) => e.code === "attachment_not_found"
  );
  await assert.rejects(
    () =>
      service.getIntakeAttachmentContent({
        organizationId: ORG,
        intakeCaseId: "00000000-0000-4000-8000-000000000099",
        attachmentId: alpha.attachments[0].id
      }),
    (e) => e.code === "attachment_not_found"
  );
  // Cross-org: org-alpha must not retrieve org-beta case (404, no existence leak shape)
  await assert.rejects(
    () =>
      service.getIntakeAttachmentContent({
        organizationId: ORG,
        intakeCaseId: repo.listCases(ORG_B, { limit: 1 })[0].id,
        attachmentId: repo.listCases(ORG_B, { limit: 1 })[0].attachments[0].id
      }),
    (e) => e.code === "attachment_not_found" && e.statusCode === 404
  );
  console.log("ok: 4–7 org-scope + wrong message/intake/attachment relationships → 404");
}

{
  const repo = new InMemoryQuoteIntakeRepository();
  repo.createCase({
    organizationId: ORG,
    sourceType: "manual",
    sourceMessage: {},
    attachments: []
  });
  const { service } = makeViewer({ repo });
  const listed = await service.listIntakeSourcePlans({
    organizationId: ORG,
    intakeCaseId: repo.listCases(ORG, { limit: 1 })[0].id
  });
  assert.equal(listed.noPlan, true);
  assert.equal(listed.sourceLabel, "Manual estimate");
  assert.equal(listed.plans.length, 0);
  console.log("ok: listIntakeSourcePlans — manual no-plan state");
}

{
  const pngTransport = createFakeGraphTransport({
    messages: [sampleGraphMessage({ id: "msg-png" })],
    attachmentsByMessageId: {
      "msg-png": [
        {
          id: "att-png",
          name: "scan.png",
          contentType: "image/png",
          size: PNG_BYTES.length,
          isInline: false,
          "@odata.type": "#microsoft.graph.fileAttachment",
          contentBytes: PNG_BYTES.toString("base64")
        }
      ]
    }
  });
  const service = createStudioSecurePlanViewerService({
    env: GRAPH_ENV,
    quoteIntakeRepository: new InMemoryQuoteIntakeRepository(),
    graphClient: graphClientFor(pngTransport)
  });
  const result = await service.getSharedInboxAttachmentContent({
    organizationId: ORG,
    messageKey: "msg-png",
    attachmentKey: "att-png"
  });
  assert.equal(result.contentType, "image/png");
  assert.equal(result.kind, "png");
  console.log("ok: PNG image support via Graph bytes");
}

// --- Route source contracts ---
{
  const routes = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(
    routes,
    /shared-inbox\/:messageKey\/attachments\/:attachmentKey\/content/
  );
  assert.match(routes, /intake-cases\/:caseId\/attachments\/:attachmentId\/content/);
  assert.match(routes, /intake-cases\/:caseId\/source-plans/);
  const contentSlice = routes.split("Secure plan viewer")[1] || "";
  assert.match(contentSlice, /\.\.\.staffStack/);
  assert.match(routes, /sendPlanViewerError/);
  assert.equal(/createSignedUrl|getPublicUrl/i.test(contentSlice.slice(0, 3500)), false);
  console.log("ok: route contracts — staffStack content routes; no signed/public URL helpers in slice");
}

{
  const candidates = [
    join(root, "backend-core/src/digitalEstimate/digitalEstimatePublicRoutes.js"),
    join(root, "backend-core/src/digitalEstimate/digitalEstimatePublicApi.js"),
    join(root, "backend-core/src/digitalEstimate/liveDigitalEstimatePublicRoutes.js")
  ];
  let found = false;
  for (const dePath of candidates) {
    let deSrc = "";
    try {
      deSrc = readFileSync(dePath, "utf8");
    } catch {
      continue;
    }
    found = true;
    assert.equal(/shared-inbox\/:messageKey\/attachments/i.test(deSrc), false);
    assert.equal(/intake-cases\/:caseId\/attachments\/:attachmentId\/content/i.test(deSrc), false);
  }
  if (!found) {
    // Fallback: Studio routes must not mount under public DE path prefixes in the content handlers.
    const routes = readFileSync(
      join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
      "utf8"
    );
    assert.match(routes, /\/api\/elite100-estimate-studio\/shared-inbox/);
    assert.equal(/\/api\/digital-estimate\/.*attachments.*content/i.test(routes), false);
  }
  console.log("ok: 9 public Digital Estimate routes do not expose staff attachment content");
}

// --- HTTP authz (local Express; sentinel only) ---
function limitResult(data) {
  const row = { data: data == null ? [] : Array.isArray(data) ? data : [data], error: null };
  return {
    limit: async () => row,
    maybeSingle: async () => ({
      data: Array.isArray(data) ? data[0] ?? null : data,
      error: null
    }),
    then: (resolve, reject) => Promise.resolve(row).then(resolve, reject)
  };
}

function mockSupabase({ organizationId = ORG, headAccess = true } = {}) {
  const orgRow = {
    id: organizationId,
    organization_key: DEFAULT_ORGANIZATION_KEY,
    display_name: "Elite Stone Fabrication"
  };
  return {
    from(table) {
      if (table === "user_profiles") {
        return {
          select() {
            return {
              eq() {
                return limitResult({
                  user_kind: "internal",
                  organization_id: organizationId
                });
              }
            };
          }
        };
      }
      if (table === "organizations") {
        return {
          select() {
            return {
              eq(_col, val) {
                if (String(val) === DEFAULT_ORGANIZATION_KEY || String(val) === organizationId) {
                  return limitResult(orgRow);
                }
                return limitResult([]);
              }
            };
          }
        };
      }
      if (table === "user_head_access") {
        return {
          select() {
            return {
              eq() {
                return limitResult(
                  headAccess ? [{ head_slug: "elite100_estimate_studio" }] : []
                );
              }
            };
          }
        };
      }
      return {
        select() {
          return {
            eq() {
              return limitResult(null);
            }
          };
        }
      };
    }
  };
}

async function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
}

{
  const intake = new InMemoryQuoteIntakeRepository();
  const transport = createFakeGraphTransport({
    messages: [sampleGraphMessage({ id: "msg-http-1" })],
    attachmentsByMessageId: {
      "msg-http-1": [
        samplePdfAttachment({
          id: "att-http-1",
          contentBytes: PDF_BYTES.toString("base64"),
          supportPdf: true
        })
      ]
    }
  });
  let authMode = "ok"; // ok | missing | no_head
  let orgId = ORG;
  const prevEnv = { ...process.env };
  Object.assign(process.env, GRAPH_ENV);

  const app = express();
  attachElite100EstimateStudioRoutes(app, {
    env: GRAPH_ENV,
    requireAuth: () => (req, res, next) => {
      if (authMode === "missing") {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      req.user = {
        id: PILOT_ID,
        email: PILOT_EMAIL,
        // admin bypasses head access — use non-admin for head-denial case
        role: authMode === "no_head" ? "estimator" : "admin",
        isActive: true
      };
      return next();
    },
    getSupabase: () => mockSupabase({ organizationId: orgId, headAccess: authMode !== "no_head" }),
    repository: { mode: "memory" },
    quoteIntakeRepository: intake,
    graphClient: graphClientFor(transport),
    studioSecurePlanViewerService: createStudioSecurePlanViewerService({
      env: GRAPH_ENV,
      quoteIntakeRepository: intake,
      graphClient: graphClientFor(transport)
    })
  });

  const server = await listen(app);
  const { port } = server.address();
  const contentPath = `/api/elite100-estimate-studio/shared-inbox/${encodeURIComponent("msg-http-1")}/attachments/${encodeURIComponent("att-http-1")}/content`;

  try {
    authMode = "ok";
    const ok = await fetch(`http://127.0.0.1:${port}${contentPath}`, {
      headers: { Authorization: "Bearer sentinel-token" }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "application/pdf");
    assert.match(String(ok.headers.get("content-disposition") || ""), /inline/);
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.match(String(ok.headers.get("cache-control") || ""), /no-store/);
    const buf = Buffer.from(await ok.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString(), "%PDF");
    const textish = buf.toString("utf8");
    assert.equal(/graph\.microsoft|access_token/i.test(textish), false);
    console.log("ok: HTTP authorized staff retrieves org PDF with secure headers");

    authMode = "missing";
    const unauth = await fetch(`http://127.0.0.1:${port}${contentPath}`);
    assert.equal(unauth.status, 401);
    console.log("ok: 2 unauthorized user rejected");

    authMode = "ok";
    authMode = "no_head";
    const noHead = await fetch(`http://127.0.0.1:${port}${contentPath}`, {
      headers: { Authorization: "Bearer sentinel-token" }
    });
    assert.ok(noHead.status === 403 || noHead.status === 401, `expected 401/403 got ${noHead.status}`);
    authMode = "ok";
    console.log("ok: 3 missing Studio head access rejected");

    // Wrong relationship on intake route
    const caseRow = intake.createCase({
      organizationId: ORG,
      sourceType: "graph_mailbox",
      sourceMessage: {
        internetMessageId: "<http-case@example.com>",
        graphImmutableMessageId: "msg-http-1"
      },
      attachments: [
        {
          mimeType: "application/pdf",
          safeFilename: "Kitchen Plan.pdf",
          sourceAttachmentId: "att-http-1",
          providerMessageId: "msg-http-1",
          support: "direct_pdf",
          sizeBytes: PDF_BYTES.length
        }
      ]
    });
    const wrongAtt = await fetch(
      `http://127.0.0.1:${port}/api/elite100-estimate-studio/intake-cases/${caseRow.id}/attachments/${encodeURIComponent("wrong-att")}/content`,
      { headers: { Authorization: "Bearer sentinel-token" } }
    );
    assert.equal(wrongAtt.status, 404);
    const wrongBody = await wrongAtt.json();
    assert.equal(wrongBody.code, "attachment_not_found");
    console.log("ok: HTTP wrong intake/attachment relationship → 404");

    assert.equal(planViewerError("x", 404, "attachment_not_found").code, "attachment_not_found");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const k of Object.keys(process.env)) {
      if (!(k in prevEnv)) delete process.env[k];
    }
    Object.assign(process.env, prevEnv);
  }
}

console.log("\nstudioSecurePlanViewer.test.mjs: ok\n");
