/**
 * Quote Intake Phase 6P.1 — routes + flag behavior.
 * Run: node backend-core/src/quoteIntake/quoteIntakeRoutes.test.mjs
 */

import assert from "node:assert/strict";
import {
  attachQuoteIntakeRoutes,
  maybeAttachQuoteIntakeRoutes,
  QUOTE_INTAKE_API_PREFIX
} from "./quoteIntakeRoutes.js";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import { isQuoteIntakeApiEnabled, readSafeQuoteIntakeConfig } from "./quoteIntakeConfig.mjs";
import { AUTOMATION_PATH, AUTOMATION_REASON_CODE } from "./quoteIntakeTypes.mjs";
import { createFakeProductionTakeoffAdapter } from "./productionTakeoffAdapter.mjs";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SHA =
  "0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb";

console.log("\nquoteIntakeRoutes.test.mjs\n");

/**
 * @param {Function[]} handlers
 * @param {object} req
 */
async function dispatch(handlers, req) {
  /** @type {{ statusCode: number, body: any }} */
  const out = { statusCode: 0, body: null };
  const res = {
    set() {},
    status(c) {
      out.statusCode = c;
      return this;
    },
    json(b) {
      out.body = b;
      return this;
    }
  };
  let i = 0;
  await new Promise((resolve, reject) => {
    const next = async (err) => {
      if (err) return reject(err);
      const fn = handlers[i++];
      if (!fn) return resolve();
      try {
        await fn(req, res, next);
        if (out.body !== null) resolve();
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
  return out;
}

function baseReq(overrides = {}) {
  return {
    user: { id: "user-1", email: "pilot@example.com" },
    body: {},
    params: {},
    query: {},
    headers: { "content-type": "application/json" },
    ...overrides
  };
}

{
  assert.equal(isQuoteIntakeApiEnabled({}), false);
  assert.equal(isQuoteIntakeApiEnabled({ QUOTE_INTAKE_API_ENABLED: "0" }), false);
  assert.equal(isQuoteIntakeApiEnabled({ QUOTE_INTAKE_API_ENABLED: "true" }), false);
  assert.equal(isQuoteIntakeApiEnabled({ QUOTE_INTAKE_API_ENABLED: "1" }), true);
  const cfg = readSafeQuoteIntakeConfig({ QUOTE_INTAKE_API_ENABLED: "1" });
  assert.equal(cfg.quoteIntakeApiEnabled, true);
  assert.equal(cfg.takeoffInvocationEnabled, false);
  assert.equal(cfg.graphEnabled, false);
  assert.equal(cfg.ieImportEnabled, false);
  assert.equal("apiKey" in cfg, false);
  console.log("ok: feature flag defaults and safe config");
}

{
  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers);
    }
  };
  const result = maybeAttachQuoteIntakeRoutes(app, {
    requireAuth: () => (_r, _s, n) => n(),
    env: { QUOTE_INTAKE_API_ENABLED: "0" }
  });
  assert.equal(result.mounted, false);
  assert.equal(routes.size, 0);
  console.log("ok: flag off → no routes registered (no side effects)");
}

{
  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers);
    }
  };
  const repo = new InMemoryQuoteIntakeRepository();
  const adapter = createFakeProductionTakeoffAdapter();
  const mount = attachQuoteIntakeRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = { id: "user-1", email: "pilot@example.com" };
      next();
    },
    headAccess: (_r, _s, n) => n(),
    repository: repo,
    resolveOrganizationId: async () => ORG_A,
    takeoffAdapter: adapter,
    jsonParser: (_req, _res, next) => next(),
    env: { QUOTE_INTAKE_API_ENABLED: "1" }
  });
  assert.equal(mount.mounted, true);
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/config`));
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/health`));
  assert.ok(routes.has(`POST ${QUOTE_INTAKE_API_PREFIX}/cases`));
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/cases`));
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id`));
  assert.ok(routes.has(`POST ${QUOTE_INTAKE_API_PREFIX}/cases/:id/automation-decisions`));
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id/audit-events`));
  assert.ok(routes.has(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id/takeoff-links`));
  assert.ok(![...routes.keys()].some((k) => k.includes("import-from-takeoff")));
  assert.ok(![...routes.keys()].some((k) => k.includes("/api/takeoff")));
  assert.ok(![...routes.keys()].some((k) => k.includes("graph")));
  console.log("ok: flag on → namespaced routes only");

  {
    const out = await dispatch(routes.get(`GET ${QUOTE_INTAKE_API_PREFIX}/config`), baseReq());
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.config.takeoffInvocationEnabled, false);
  }

  let caseId;
  {
    const out = await dispatch(
      routes.get(`POST ${QUOTE_INTAKE_API_PREFIX}/cases`),
      baseReq({
        body: {
          sourceMessage: { internetMessageId: "<a@example.com>", contentHash: "ch-1" },
          attachments: [{ sha256: SHA, mimeType: "application/pdf" }]
        }
      })
    );
    assert.equal(out.statusCode, 201);
    assert.equal(out.body.ok, true);
    caseId = out.body.case.id;
  }

  {
    const out = await dispatch(
      routes.get(`POST ${QUOTE_INTAKE_API_PREFIX}/cases/:id/automation-decisions`),
      baseReq({
        params: { id: caseId },
        body: {
          path: AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF,
          reasonCodes: [AUTOMATION_REASON_CODE.ALL_GATES_PASSED],
          wouldStartTakeoff: true
        }
      })
    );
    assert.equal(out.statusCode, 201);
    assert.equal(out.body.takeoffInvocation.attempted, false);
    assert.equal(adapter.createAttempts.length, 0, "adapter must not be invoked in 6P.1 routes");
  }

  {
    const out = await dispatch(
      routes.get(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id/audit-events`),
      baseReq({ params: { id: caseId } })
    );
    assert.equal(out.statusCode, 200);
    assert.ok(out.body.events.length >= 2);
  }

  {
    const repo2 = new InMemoryQuoteIntakeRepository();
    const created = repo2.createCase({
      organizationId: ORG_A,
      sourceMessage: { internetMessageId: "<only-a@example.com>" }
    });
    /** @type {Map<string, Function[]>} */
    const routesB = new Map();
    const appB = {
      get(path, ...handlers) {
        routesB.set(`GET ${path}`, handlers);
      },
      post(path, ...handlers) {
        routesB.set(`POST ${path}`, handlers);
      }
    };
    attachQuoteIntakeRoutes(appB, {
      requireAuth: () => (req, _res, next) => {
        req.user = { id: "user-b", email: "other@example.com" };
        next();
      },
      headAccess: (_r, _s, n) => n(),
      repository: repo2,
      resolveOrganizationId: async () => ORG_B,
      env: { QUOTE_INTAKE_API_ENABLED: "1" }
    });
    const out = await dispatch(
      routesB.get(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id`),
      baseReq({
        user: { id: "user-b", email: "other@example.com" },
        params: { id: created.id }
      })
    );
    assert.equal(out.statusCode, 404);
    console.log("ok: org isolation on get case");
  }

  console.log("ok: happy-path create / decision / audit");
}

{
  const env = { QUOTE_INTAKE_API_ENABLED: "1" };
  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers);
    }
  };
  const repo = new InMemoryQuoteIntakeRepository();
  attachQuoteIntakeRoutes(app, {
    requireAuth: () => (_r, _s, n) => n(),
    headAccess: (_r, _s, n) => n(),
    repository: repo,
    resolveOrganizationId: async () => ORG_A,
    jsonParser: (_req, _res, next) => next(),
    env
  });
  env.QUOTE_INTAKE_API_ENABLED = "0";
  const before = repo.listCases(ORG_A).length;
  const out = await dispatch(
    routes.get(`POST ${QUOTE_INTAKE_API_PREFIX}/cases`),
    baseReq({
      user: { id: "u", email: "a@example.com" },
      body: { sourceMessage: { contentHash: "x" } }
    })
  );
  assert.equal(out.statusCode, 404);
  assert.equal(repo.listCases(ORG_A).length, before);
  console.log("ok: disabled handler creates no repository side effects");
}

{
  const env = {
    QUOTE_INTAKE_API_ENABLED: "1",
    QUOTE_INTAKE_PILOT_EMAILS: "pilot@example.com"
  };
  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers);
    }
  };
  attachQuoteIntakeRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = { id: "x", email: "stranger@example.com" };
      next();
    },
    headAccess: (_r, _s, n) => n(),
    repository: new InMemoryQuoteIntakeRepository(),
    resolveOrganizationId: async () => ORG_A,
    env
  });
  const out = await dispatch(
    routes.get(`GET ${QUOTE_INTAKE_API_PREFIX}/config`),
    baseReq({ user: { id: "x", email: "stranger@example.com" } })
  );
  assert.equal(out.statusCode, 403);
  console.log("ok: pilot allowlist rejects non-pilot");
}

{
  // Caller-supplied organizationId / actor / pilot email must NOT be trusted.
  const AUTH_USER_ID = "auth-user-aaa";
  const AUTH_EMAIL = "pilot@example.com";
  const SPOOF_USER_ID = "spoof-user-zzz";
  const SPOOF_EMAIL = "attacker@evil.example";
  const SHA2 =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers);
    }
  };
  const repo = new InMemoryQuoteIntakeRepository();
  let resolverCalls = 0;
  attachQuoteIntakeRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      // Identity comes only from auth middleware (simulating requireAuth).
      req.user = { id: AUTH_USER_ID, email: AUTH_EMAIL };
      next();
    },
    headAccess: (_r, _s, n) => n(),
    repository: repo,
    resolveOrganizationId: async (req) => {
      resolverCalls += 1;
      // Prove org resolver does not take caller-supplied org fields.
      assert.notEqual(req.body?.organizationId, ORG_A);
      assert.equal(req.body?.organizationId, ORG_B);
      return ORG_A;
    },
    jsonParser: (_req, _res, next) => next(),
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      QUOTE_INTAKE_PILOT_EMAILS: AUTH_EMAIL
    }
  });

  const createOut = await dispatch(
    routes.get(`POST ${QUOTE_INTAKE_API_PREFIX}/cases`),
    baseReq({
      user: { id: AUTH_USER_ID, email: AUTH_EMAIL },
      headers: {
        "content-type": "application/json",
        "x-organization-id": ORG_B,
        "x-organization-key": "other_tenant"
      },
      query: { organizationId: ORG_B, organization_id: ORG_B },
      body: {
        organizationId: ORG_B,
        organization_id: ORG_B,
        createdByUserId: SPOOF_USER_ID,
        userId: SPOOF_USER_ID,
        email: SPOOF_EMAIL,
        pilotEmail: SPOOF_EMAIL,
        sourceMessage: {
          internetMessageId: "<cross-org-spoof@example.com>",
          contentHash: "cross-org-hash-1"
        },
        attachments: [{ sha256: SHA2 }]
      }
    })
  );
  assert.equal(createOut.statusCode, 201);
  assert.equal(createOut.body.case.organizationId, ORG_A);
  assert.notEqual(createOut.body.case.organizationId, ORG_B);
  assert.equal(createOut.body.case.createdByUserId, AUTH_USER_ID);
  assert.notEqual(createOut.body.case.createdByUserId, SPOOF_USER_ID);
  assert.ok(resolverCalls >= 1);
  assert.equal(repo.listCases(ORG_B).length, 0);
  assert.equal(repo.listCases(ORG_A).length, 1);

  const caseId = createOut.body.case.id;

  // Authenticated as ORG_B must not read the ORG_A case (even with spoof headers/query/body).
  /** @type {Map<string, Function[]>} */
  const routesB = new Map();
  const appB = {
    get(path, ...handlers) {
      routesB.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routesB.set(`POST ${path}`, handlers);
    }
  };
  attachQuoteIntakeRoutes(appB, {
    requireAuth: () => (req, _res, next) => {
      req.user = { id: "org-b-user", email: AUTH_EMAIL };
      next();
    },
    headAccess: (_r, _s, n) => n(),
    repository: repo,
    resolveOrganizationId: async () => ORG_B,
    jsonParser: (_req, _res, next) => next(),
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      QUOTE_INTAKE_PILOT_EMAILS: AUTH_EMAIL
    }
  });

  const readOut = await dispatch(
    routesB.get(`GET ${QUOTE_INTAKE_API_PREFIX}/cases/:id`),
    baseReq({
      user: { id: "org-b-user", email: AUTH_EMAIL },
      params: { id: caseId },
      headers: { "x-organization-id": ORG_A },
      query: { organizationId: ORG_A },
      body: { organizationId: ORG_A }
    })
  );
  assert.equal(readOut.statusCode, 404);
  assert.equal(readOut.body.ok, false);

  // Pilot gate uses req.user.email only — body/query pilotEmail cannot elevate.
  /** @type {Map<string, Function[]>} */
  const routesPilot = new Map();
  const appPilot = {
    get(path, ...handlers) {
      routesPilot.set(`GET ${path}`, handlers);
    },
    post(path, ...handlers) {
      routesPilot.set(`POST ${path}`, handlers);
    }
  };
  attachQuoteIntakeRoutes(appPilot, {
    requireAuth: () => (req, _res, next) => {
      req.user = { id: "outsider", email: SPOOF_EMAIL };
      next();
    },
    headAccess: (_r, _s, n) => n(),
    repository: repo,
    resolveOrganizationId: async () => ORG_A,
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      QUOTE_INTAKE_PILOT_EMAILS: AUTH_EMAIL
    }
  });
  const pilotOut = await dispatch(
    routesPilot.get(`GET ${QUOTE_INTAKE_API_PREFIX}/config`),
    baseReq({
      user: { id: "outsider", email: SPOOF_EMAIL },
      body: { email: AUTH_EMAIL, pilotEmail: AUTH_EMAIL },
      query: { email: AUTH_EMAIL },
      headers: { "x-pilot-email": AUTH_EMAIL }
    })
  );
  assert.equal(pilotOut.statusCode, 403);

  console.log(
    "ok: org/actor/pilot identity from auth only — cannot create or read cross-org via body/query/headers"
  );
}

console.log("\nAll quoteIntakeRoutes tests passed.\n");
