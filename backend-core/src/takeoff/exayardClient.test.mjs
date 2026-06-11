/**
 * exayardClient — unit tests (connection scaffold).
 *
 * Run: npm run eos:test:takeoff-exayard-client
 *
 * Tests:
 *   1.  TAKEOFF_AI_PROVIDER=exayard selected in readExtractionConfig
 *   2.  Missing EXAYARD_API_KEY → clear setup error
 *   3.  Missing EXAYARD_ORGANIZATION_ID → setup warning (connection still attempted)
 *   4.  Authorization Bearer header sent in mocked fetch
 *   5.  application/problem+json error parsed
 *   6.  API key never appears in diagnostics JSON
 *   7.  Successful /me → authenticated diagnostics
 *   8.  getExtractionProvider("exayard") rejects extraction (not wired)
 */
import assert from "node:assert/strict";
import {
  exayardRequest,
  getExayardSafeDiagnostics,
  parseExayardProblemJson,
  readExayardConfig,
} from "./exayardClient.mjs";
import {
  getExtractionProvider,
  readExtractionConfig,
  readSafeProviderConfig,
} from "./takeoffAiProvider.mjs";

console.log("\nexayardClient — provider scaffold tests\n");

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

// T1 — exayard selected by TAKEOFF_AI_PROVIDER
{
  const cfg = withEnv({
    TAKEOFF_AI_PROVIDER: "exayard",
    TAKEOFF_AI_ENABLED: "1",
    EXAYARD_API_KEY: "ey-test-key-should-not-leak",
    EXAYARD_ORGANIZATION_ID: "org_abc",
  }, () => readExtractionConfig());

  assert.equal(cfg.providerName, "exayard", "T1: providerName=exayard");
  assert.equal(cfg.modelName, "platform", "T1: modelName=platform");
  assert.equal(cfg.enabled, true, "T1: enabled=true");
  assert.equal(cfg.apiKey, "ey-test-key-should-not-leak", "T1: reads EXAYARD_API_KEY internally");
  console.log("ok T1: exayard selected by TAKEOFF_AI_PROVIDER");
}

// T2 — missing EXAYARD_API_KEY → clear setup error
await withEnvAsync({
  TAKEOFF_AI_PROVIDER: "exayard",
  TAKEOFF_AI_ENABLED: "1",
  EXAYARD_API_KEY: null,
  EXAYARD_ORGANIZATION_ID: "org_abc",
}, async () => {
  const diagnostics = await getExayardSafeDiagnostics({ testConnection: false });
  assert.equal(diagnostics.apiKeyPresent, false, "T2: apiKeyPresent=false");
  assert.ok(
    String(diagnostics.setupError).includes("EXAYARD_API_KEY"),
    "T2: setupError mentions EXAYARD_API_KEY"
  );

  await assert.rejects(
    () => exayardRequest("/me", { fetchFn: async () => ({ ok: true }) }),
    (err) => {
      assert.ok(err.message.includes("EXAYARD_API_KEY"));
      return true;
    },
    "T2: exayardRequest rejects without key"
  );
  console.log("ok T2: missing EXAYARD_API_KEY returns clear setup error");
});

// T3 — missing EXAYARD_ORGANIZATION_ID → setup warning
await withEnvAsync({
  TAKEOFF_AI_PROVIDER: "exayard",
  TAKEOFF_AI_ENABLED: "1",
  EXAYARD_API_KEY: "ey-test-key",
  EXAYARD_ORGANIZATION_ID: null,
}, async () => {
  const mockFetch = async (url, init) => {
    assert.equal(url, "https://api.exayard.com/v1/me");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        clerkUserId: "user_1",
        tokenType: "api_key",
        memberships: [{ orgId: "org_1", role: "admin" }],
      }),
      headers: { get: () => "application/json" },
    };
  };

  const diagnostics = await getExayardSafeDiagnostics({ fetchFn: mockFetch });
  assert.equal(diagnostics.organizationIdPresent, false, "T3: organizationIdPresent=false");
  assert.ok(
    String(diagnostics.setupWarning).includes("EXAYARD_ORGANIZATION_ID"),
    "T3: setupWarning mentions EXAYARD_ORGANIZATION_ID"
  );
  assert.equal(diagnostics.authenticated, true, "T3: connection test still runs");
  console.log("ok T3: missing EXAYARD_ORGANIZATION_ID returns setup warning");
});

// T4 — Authorization header sent in mocked fetch
await withEnvAsync({
  EXAYARD_API_KEY: "ey-secret-token-xyz",
  EXAYARD_API_BASE_URL: "https://api.exayard.com/v1",
}, async () => {
  let capturedAuth = null;
  let capturedUrl = null;
  const mockFetch = async (url, init) => {
    capturedUrl = url;
    capturedAuth = init?.headers?.Authorization ?? init?.headers?.authorization ?? null;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ clerkUserId: null, tokenType: "api_key", memberships: [] }),
      headers: { get: () => "application/json" },
    };
  };

  await exayardRequest("/me", { fetchFn: mockFetch });
  assert.equal(capturedUrl, "https://api.exayard.com/v1/me", "T4: calls baseUrl/me");
  assert.equal(capturedAuth, "Bearer ey-secret-token-xyz", "T4: Authorization Bearer header set");
  console.log("ok T4: Authorization header sent in mocked fetch");
});

// T5 — problem+json error parsed
{
  const problem = parseExayardProblemJson(
    JSON.stringify({
      type: "https://errors.exayard.com/unauthenticated",
      title: "Unauthenticated",
      status: 401,
      detail: "Invalid API key",
      code: "unauthenticated",
      request_id: "req_test_123",
    }),
    "application/problem+json"
  );
  assert.equal(problem?.code, "unauthenticated", "T5: code parsed");
  assert.equal(problem?.detail, "Invalid API key", "T5: detail parsed");

  await withEnvAsync({ EXAYARD_API_KEY: "ey-bad-key" }, async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({
        type: "https://errors.exayard.com/unauthenticated",
        title: "Unauthenticated",
        status: 401,
        detail: "Invalid API key",
        code: "unauthenticated",
      }),
      headers: {
        get: (name) => {
          if (name.toLowerCase() === "content-type") return "application/problem+json";
          return null;
        },
      },
    });

    await assert.rejects(
      () => exayardRequest("/me", { fetchFn: mockFetch }),
      (err) => {
        assert.equal(err.problem?.code, "unauthenticated", "T5: err.problem attached");
        assert.ok(err.message.includes("Invalid API key"), "T5: message includes detail");
        assert.ok(!err.message.includes("ey-bad-key"), "T5: API key not in error message");
        return true;
      }
    );
  });
  console.log("ok T5: problem+json error parsed");
}

// T6 — API key not in diagnostics
await withEnvAsync({
  TAKEOFF_AI_PROVIDER: "exayard",
  TAKEOFF_AI_ENABLED: "1",
  EXAYARD_API_KEY: "ey-ultra-secret-key-999",
  EXAYARD_ORGANIZATION_ID: "org_xyz",
}, async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      clerkUserId: "u1",
      tokenType: "api_key",
      memberships: [{ orgId: "org_xyz" }, { orgId: "org_other" }],
    }),
    headers: {
      get: (name) => {
        if (name === "RateLimit") return "100;w=60";
        if (name === "RateLimit-Policy") return "100;w=60";
        return "application/json";
      },
    },
  });

  const diagnostics = await getExayardSafeDiagnostics({ fetchFn: mockFetch });
  const serialized = JSON.stringify(diagnostics);
  assert.ok(!serialized.includes("ey-ultra-secret-key-999"), "T6: key absent from diagnostics");
  assert.equal(diagnostics.authenticated, true, "T6: authenticated=true");
  assert.equal(diagnostics.tokenType, "api_key", "T6: tokenType returned");
  assert.equal(diagnostics.membershipsCount, 2, "T6: membershipsCount returned");

  const safeConfig = readSafeProviderConfig();
  const safeSerialized = JSON.stringify(safeConfig);
  assert.ok(!safeSerialized.includes("ey-ultra-secret-key-999"), "T6: key absent from safe config");
  assert.equal(safeConfig.hasExayardKey, true, "T6: hasExayardKey=true (boolean only)");
  console.log("ok T6: API key not included in diagnostics");
});

// T7 — readExayardConfig defaults
{
  const cfg = withEnv({
    EXAYARD_API_BASE_URL: null,
    EXAYARD_API_KEY: null,
    EXAYARD_ORGANIZATION_ID: null,
  }, () => readExayardConfig());
  assert.equal(cfg.baseUrl, "https://api.exayard.com/v1", "T7: default base URL");
  assert.equal(cfg.apiKey, null, "T7: null apiKey when unset");
  console.log("ok T7: readExayardConfig defaults");
}

// T8 — getExtractionProvider("exayard") rejects (extraction not wired)
{
  assert.throws(
    () => getExtractionProvider("exayard"),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.ok(err.message.includes("not wired"));
      return true;
    },
    "T8: exayard extraction rejected"
  );
  console.log("ok T8: getExtractionProvider(exayard) rejects extraction");
}

console.log("\nexayardClient: all 8 tests passed");
