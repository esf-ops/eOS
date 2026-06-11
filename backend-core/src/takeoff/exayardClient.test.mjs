/**
 * exayardClient — unit tests (connection + workflow v1).
 *
 * Run: npm run eos:test:takeoff-exayard-client
 */
import assert from "node:assert/strict";
import {
  buildExayardSafeWorkflowMeta,
  confirmExayardFileUpload,
  createExayardFileUpload,
  createExayardProject,
  formatExayardOperatorError,
  getExayardSafeDiagnostics,
  parseExayardProblemJson,
  pollExayardAssessment,
  readExayardConfig,
  runExayardTakeoffWorkflow,
  uploadExayardFileBytes,
} from "./exayardClient.mjs";
import {
  exayardTakeoffProvider,
} from "./exayardTakeoffProvider.mjs";
import {
  getExtractionProvider,
  readExtractionConfig,
  readSafeProviderConfig,
} from "./takeoffAiProvider.mjs";

console.log("\nexayardClient — workflow v1 tests\n");

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withEnvAsync(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const BASE_ENV = {
  EXAYARD_API_KEY: "ey-test-key-secret",
  EXAYARD_ORGANIZATION_ID: "org_test_123",
  EXAYARD_API_BASE_URL: "https://api.exayard.com/v1",
  TAKEOFF_AI_PROVIDER: "exayard",
  TAKEOFF_AI_ENABLED: "1",
};

/** @type {Array<{ url: string, method: string, body?: unknown, auth?: string|null }>} */
let fetchLog = [];

function makeWorkflowFetchMock(overrides = {}) {
  fetchLog = [];
  let assessmentPolls = 0;
  const {
    assessmentStatusSequence = ["running", "completed"],
    pagesDelayPolls = 0,
    failScope = false,
    failRateLimit = false,
    memberships = [{ orgId: "org_test_123", role: "admin", name: "Test Org", slug: "test-org" }],
  } = overrides;

  return async (url, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    let body = null;
    if (init.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    const auth = init.headers?.Authorization ?? init.headers?.authorization ?? null;
    fetchLog.push({ url, method, body, auth });

    if (failRateLimit && url.includes("api.exayard.com") && fetchLog.filter((f) => f.url.includes("api.exayard.com")).length === 1) {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({
          type: "https://errors.exayard.com/rate_limited",
          title: "Rate limited",
          status: 429,
          detail: "Too many requests",
          code: "rate_limited",
        }),
        headers: {
          get: (n) => {
            if (String(n).toLowerCase() === "content-type") return "application/problem+json";
            if (String(n) === "RateLimit") return "10;w=60";
            return null;
          },
        },
      };
    }

    if (failScope && url.includes("/analysis/propose")) {
      return {
        ok: false,
        status: 403,
        text: async () => JSON.stringify({
          type: "https://errors.exayard.com/insufficient_scope",
          title: "Insufficient scope",
          status: 403,
          detail: "Token lacks projects:write",
          code: "insufficient_scope",
        }),
        headers: { get: () => "application/problem+json" },
      };
    }

    if (url === "https://api.exayard.com/v1/projects" && method === "POST") {
      return okJson({ id: "proj_1", secret: "sec_1" });
    }
    if (url === "https://api.exayard.com/v1/files" && method === "POST") {
      return okJson({
        fileId: "file_1",
        uploadUrl: "https://upload.example.com/put-here",
        r2Key: "r2/key/plan.pdf",
        expiresAt: Date.now() + 60_000,
        filename: body?.filename ?? "plan.pdf",
      });
    }
    if (url === "https://upload.example.com/put-here" && method === "PUT") {
      return { ok: true, status: 200, text: async () => "", headers: { get: () => null } };
    }
    if (url === "https://api.exayard.com/v1/files/file_1/confirm" && method === "POST") {
      return { ok: true, status: 204, text: async () => "", headers: { get: () => null } };
    }
    if (url.startsWith("https://api.exayard.com/v1/projects/proj_1/pages")) {
      if (pagesDelayPolls > 0 && fetchLog.filter((f) => f.url.includes("/pages")).length <= pagesDelayPolls) {
        return okJson([]);
      }
      return okJson([{ _id: "page_1", fileId: "file_1" }]);
    }
    if (url.startsWith("https://api.exayard.com/v1/files/file_1")) {
      return okJson({ _id: "file_1", uploadStatus: "completed", pages: [{ _id: "page_1", fileId: "file_1" }] });
    }
    if (url.includes("/analysis/propose")) {
      return okJson({
        projectId: "proj_1",
        pageIds: ["page_1"],
        fileIds: ["file_1"],
        elements: [{ id: "el_1", name: "Countertops", category: "area", hexColor: "#3366ff" }],
        creditEstimate: 1,
        prompt: body?.prompt,
      });
    }
    if (url.includes("/analysis/run")) {
      return okJson({ assessmentId: "asmt_1", pageIds: ["page_1"], _uiType: "analysisRunning" });
    }
    if (url.includes("/assessments/asmt_1")) {
      assessmentPolls += 1;
      const status = assessmentStatusSequence[Math.min(assessmentPolls - 1, assessmentStatusSequence.length - 1)];
      return okJson({ _id: "asmt_1", projectId: "proj_1", status, elements: [{ name: "CT", qty: 42 }] });
    }
    if (url.endsWith("/me")) {
      return okJson({ clerkUserId: null, tokenType: "api_key", memberships });
    }

    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ title: "Not found", status: 404, detail: url, code: "not_found", type: "x" }),
      headers: { get: () => "application/problem+json" },
    };
  };
}

function okJson(data) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
    headers: { get: () => "application/json" },
  };
}

// T1 — provider selection
{
  const cfg = withEnv(BASE_ENV, () => readExtractionConfig());
  assert.equal(cfg.providerName, "exayard");
  assert.equal(getExtractionProvider("exayard"), exayardTakeoffProvider);
  console.log("ok T1: exayard extraction provider wired");
}

// T2 — missing API key
await withEnvAsync({ ...BASE_ENV, EXAYARD_API_KEY: null }, async () => {
  const diagnostics = await getExayardSafeDiagnostics({ testConnection: false });
  assert.ok(String(diagnostics.setupError).includes("EXAYARD_API_KEY"));
  console.log("ok T2: missing EXAYARD_API_KEY");
});

// T3 — missing organization id warning
await withEnvAsync({ ...BASE_ENV, EXAYARD_ORGANIZATION_ID: null }, async () => {
  const diagnostics = await getExayardSafeDiagnostics({
    fetchFn: makeWorkflowFetchMock(),
    testConnection: false,
  });
  assert.ok(String(diagnostics.setupWarning).includes("EXAYARD_ORGANIZATION_ID"));
  console.log("ok T3: missing EXAYARD_ORGANIZATION_ID warning");
});

// T4 — Authorization header on API calls
await withEnvAsync(BASE_ENV, async () => {
  fetchLog = [];
  const mockFetch = makeWorkflowFetchMock();
  await createExayardProject({ name: "Test", fetchFn: mockFetch });
  const apiCall = fetchLog.find((f) => f.url.includes("api.exayard.com/v1/projects"));
  assert.equal(apiCall?.auth, "Bearer ey-test-key-secret");
  console.log("ok T4: Authorization header sent");
});

// T5 — problem+json parsed
{
  const problem = parseExayardProblemJson(JSON.stringify({
    type: "x", title: "Bad", status: 400, detail: "nope", code: "bad_request",
  }), "application/problem+json");
  assert.equal(problem?.code, "bad_request");
  console.log("ok T5: problem+json parsed");
}

// T6 — no API key leakage
await withEnvAsync({ ...BASE_ENV, EXAYARD_API_KEY: "ey-ultra-secret" }, async () => {
  const mockFetch = makeWorkflowFetchMock();
  const result = await runExayardTakeoffWorkflow({
    fileBuffer: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    filename: "plan.pdf",
    prompt: "measure countertops",
    fetchFn: mockFetch,
    pollConfig: { intervalMs: 1, pagesTimeoutMs: 50, assessmentTimeoutMs: 50 },
  });
  const serialized = JSON.stringify(result) + JSON.stringify(buildExayardSafeWorkflowMeta(result));
  assert.ok(!serialized.includes("ey-ultra-secret"));
  assert.equal(result.projectId, "proj_1");
  assert.equal(result.fileId, "file_1");
  assert.equal(result.assessmentId, "asmt_1");
  console.log("ok T6: no API key leakage in workflow output");
});

// T7 — full mocked workflow
await withEnvAsync(BASE_ENV, async () => {
  const mockFetch = makeWorkflowFetchMock();
  const result = await runExayardTakeoffWorkflow({
    fileBuffer: Buffer.from("%PDF-test"),
    mimeType: "application/pdf",
    filename: "kitchen.pdf",
    prompt: "countertop areas",
    fetchFn: mockFetch,
    pollConfig: { intervalMs: 1, pagesTimeoutMs: 100, assessmentTimeoutMs: 100 },
  });
  assert.equal(result.status, "completed");
  assert.ok(fetchLog.some((f) => f.method === "PUT" && f.url.includes("upload.example.com")));
  assert.ok(fetchLog.some((f) => f.url.includes("/confirm")));
  assert.ok(fetchLog.some((f) => f.url.includes("/analysis/propose")));
  assert.ok(fetchLog.some((f) => f.url.includes("/analysis/run")));
  console.log("ok T7: full mocked create/upload/confirm/analysis/poll workflow");
});

// T8 — upload URL PUT flow isolated
await withEnvAsync(BASE_ENV, async () => {
  let putContentType = null;
  const mockFetch = async (url, init) => {
    if (url.includes("upload.example.com")) {
      putContentType = init.headers?.["Content-Type"] ?? null;
      return { ok: true, status: 200, text: async () => "", headers: { get: () => null } };
    }
    return makeWorkflowFetchMock()(url, init);
  };
  const init = await createExayardFileUpload({
    projectId: "proj_1",
    filename: "a.pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    fetchFn: mockFetch,
  });
  await uploadExayardFileBytes({
    uploadUrl: init.uploadUrl,
    fileBuffer: Buffer.from("bytes"),
    mimeType: "application/pdf",
    fetchFn: mockFetch,
  });
  await confirmExayardFileUpload({ fileId: init.fileId, r2Key: init.r2Key, fetchFn: mockFetch });
  assert.equal(putContentType, "application/pdf");
  console.log("ok T8: upload PUT + confirm flow");
});

// T9 — poll success
await withEnvAsync(BASE_ENV, async () => {
  const mockFetch = makeWorkflowFetchMock({ assessmentStatusSequence: ["running", "completed"] });
  const result = await pollExayardAssessment({
    assessmentId: "asmt_1",
    fetchFn: mockFetch,
    intervalMs: 1,
    timeoutMs: 200,
  });
  assert.equal(result.status, "completed");
  console.log("ok T9: poll success");
});

// T10 — poll timeout
await withEnvAsync(BASE_ENV, async () => {
  const mockFetch = makeWorkflowFetchMock({ assessmentStatusSequence: ["running", "running"] });
  await assert.rejects(
    () => pollExayardAssessment({
      assessmentId: "asmt_1",
      fetchFn: mockFetch,
      intervalMs: 1,
      timeoutMs: 5,
    }),
    (err) => {
      assert.equal(err.code, "exayard_assessment_timeout");
      return true;
    }
  );
  console.log("ok T10: poll timeout");
});

// T11 — insufficient_scope operator message
{
  const msg = formatExayardOperatorError({
    problem: { code: "insufficient_scope", detail: "missing scope" },
    message: "Exayard API error 403",
    statusCode: 403,
  });
  assert.ok(msg.includes("scope"));
  console.log("ok T11: insufficient_scope error message");
}

// T12 — rate_limited operator message
{
  const msg = formatExayardOperatorError({
    problem: { code: "rate_limited" },
    statusCode: 429,
    rateLimit: "10;w=60",
    message: "Exayard API error 429",
  });
  assert.ok(msg.toLowerCase().includes("rate limit"));
  console.log("ok T12: rate_limited error message");
}

// T13 — insufficient_scope from workflow
await withEnvAsync(BASE_ENV, async () => {
  await assert.rejects(
    () => runExayardTakeoffWorkflow({
      fileBuffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
      filename: "plan.pdf",
      prompt: "measure",
      fetchFn: makeWorkflowFetchMock({ failScope: true }),
      pollConfig: { intervalMs: 1, pagesTimeoutMs: 50, assessmentTimeoutMs: 50 },
    }),
    (err) => {
      assert.equal(err.problem?.code, "insufficient_scope");
      return true;
    }
  );
  console.log("ok T13: insufficient_scope from workflow");
});

// T14 — exayardTakeoffProvider returns raw captured placeholder
await withEnvAsync(BASE_ENV, async () => {
  const mockFetch = makeWorkflowFetchMock();
  const out = await exayardTakeoffProvider({
    fileBuffer: Buffer.from("%PDF"),
    mimeType: "application/pdf",
    originalFilename: "plan.pdf",
    promptVersion: "v1",
    modelName: "platform",
    apiKey: "ignored",
    fetchFn: mockFetch,
    pollConfig: { intervalMs: 1, pagesTimeoutMs: 100, assessmentTimeoutMs: 100 },
  });
  assert.equal(out.exayardRawCaptured, true);
  assert.equal(out.provider, "exayard");
  assert.equal(out.parsed.rooms.length, 0);
  assert.ok(out.parsed.projectAssumptions.some((s) => s.includes("normalization pending")));
  assert.ok(!JSON.stringify(out).includes("ey-test-key-secret"));
  console.log("ok T14: provider returns raw captured placeholder");
});

// T15 — safe config shape
{
  const result = withEnv(BASE_ENV, () => readSafeProviderConfig());
  assert.equal(result.hasExayardKey, true);
  assert.equal(result.hasExayardOrganizationId, true);
  console.log("ok T15: safe config shape");
}

// T16 — configured org in memberships → no warning
await withEnvAsync(BASE_ENV, async () => {
  const diagnostics = await getExayardSafeDiagnostics({
    fetchFn: makeWorkflowFetchMock({
      memberships: [{ orgId: "org_test_123", role: "admin" }],
    }),
  });
  assert.equal(diagnostics.configuredOrganizationId, "org_test_123");
  assert.deepEqual(diagnostics.membershipOrganizationIds, ["org_test_123"]);
  assert.equal(diagnostics.configuredOrganizationIdInMemberships, true);
  assert.equal(diagnostics.setupWarning, undefined);
  console.log("ok T16: configured org in memberships → no warning");
});

// T17 — configured org missing from memberships → warning + recommended org
await withEnvAsync(
  { ...BASE_ENV, EXAYARD_ORGANIZATION_ID: "wrong_eliteos_uuid" },
  async () => {
    const diagnostics = await getExayardSafeDiagnostics({
      fetchFn: makeWorkflowFetchMock({
        memberships: [{ orgId: "exayard_org_correct", role: "admin", name: "Fab Shop" }],
      }),
    });
    assert.equal(diagnostics.configuredOrganizationIdInMemberships, false);
    assert.equal(diagnostics.recommendedOrganizationId, "exayard_org_correct");
    assert.ok(String(diagnostics.setupWarning).includes("missing or not in memberships"));
    assert.deepEqual(diagnostics.membershipOrganizations, [{
      orgId: "exayard_org_correct",
      role: "admin",
      name: "Fab Shop",
      slug: null,
    }]);
    console.log("ok T17: invalid configured org → warning + recommendedOrganizationId");
  }
);

// T18 — project create refuses invalid configured org before POST /projects
await withEnvAsync(
  { ...BASE_ENV, EXAYARD_ORGANIZATION_ID: "supabase-not-exayard-id" },
  async () => {
    fetchLog = [];
    const mockFetch = makeWorkflowFetchMock({
      memberships: [{ orgId: "exayard_real_org", role: "member" }],
    });
    await assert.rejects(
      () => createExayardProject({ name: "Should not create", fetchFn: mockFetch }),
      (err) => {
        assert.equal(err.code, "invalid_organization_id");
        assert.ok(err.message.includes("membershipOrganizationIds from /api/takeoff/config"));
        return true;
      }
    );
    assert.ok(!fetchLog.some((f) => f.url.includes("/projects") && f.method === "POST"));
    console.log("ok T18: project create blocked before Exayard POST /projects");
  }
);

// T19 — diagnostics never leak API key
await withEnvAsync({ ...BASE_ENV, EXAYARD_API_KEY: "ey-leak-check-key" }, async () => {
  const diagnostics = await getExayardSafeDiagnostics({
    fetchFn: makeWorkflowFetchMock(),
  });
  const serialized = JSON.stringify(diagnostics);
  assert.ok(!serialized.includes("ey-leak-check-key"));
  assert.ok(!serialized.includes("Authorization"));
  assert.ok(!serialized.includes("upload.example.com"));
  console.log("ok T19: no API key or secret leakage in org diagnostics");
});

console.log("\nexayardClient: all 19 tests passed");
