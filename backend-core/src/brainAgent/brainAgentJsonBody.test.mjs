/**
 * HTTP regression: Brain Agent POST routes must parse JSON bodies.
 * Brain has no global express.json() — missing route-local parser caused
 * production "message is required" despite a valid JSON body from slabOS.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attachBrainAgentRoutes } from "./brainAgentApi.js";

const ORG = "00000000-0000-4000-8000-000000000099";
const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const NO_HEAD = "00000000-0000-4000-8000-0000000000ff";

function requireAuthStub(users) {
  return () => (req, res, next) => {
    const token = String(req.header("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = users[token];
    if (!u) return res.status(401).json({ ok: false, error: "Unauthorized" });
    req.user = u;
    next();
  };
}

function requireHeadAccessStub(grants) {
  return (_slug, _opts) => (req, res, next) => {
    if (!grants.has(req.user?.id)) {
      return res.status(403).json({ ok: false, error: "You do not have access to this head." });
    }
    next();
  };
}

describe("Brain Agent JSON body parsing (HTTP)", () => {
  it("source wires express.json on all POST body routes", () => {
    const src = readFileSync(fileURLToPath(new URL("./brainAgentApi.js", import.meta.url)), "utf8");
    assert.match(src, /express\.json\(\s*\{\s*limit:\s*"256kb"\s*\}\s*\)/);
    assert.match(src, /\/api\/brain-agent\/run".*jsonParser/s);
    assert.match(src, /\/api\/brain-agent\/execute".*jsonParser/s);
    assert.match(src, /\/api\/brain-agent\/validate-answer".*jsonParser/s);
  });

  it("parses run/execute/validate JSON; guards stay intact", async () => {
    // Audit log client requires env; placeholders avoid throw so route handlers can finish.
    process.env.SUPABASE_URL ||= "https://example.invalid.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-placeholder-not-a-secret";

    const users = {
      admin: {
        id: ADMIN,
        email: "admin@example.test",
        role: "admin",
        organization_id: ORG,
        isActive: true,
      },
      nohead: {
        id: NO_HEAD,
        email: "viewer@example.test",
        role: "viewer",
        organization_id: ORG,
        isActive: true,
      },
    };
    const grants = new Set([ADMIN]);

    const app = express();
    attachBrainAgentRoutes(app, {
      requireAuth: requireAuthStub(users),
      requireHeadAccess: requireHeadAccessStub(grants),
      getSupabase: () => ({}),
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 5 — auth guard
      const unauth = await fetch(`${base}/api/brain-agent/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(unauth.status, 401);

      // 5 — head guard
      const forbidden = await fetch(`${base}/api/brain-agent/run`, {
        method: "POST",
        headers: {
          Authorization: "Bearer nohead",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(forbidden.status, 403);

      // 4 — missing message still validation error (body parsed as {})
      const missing = await fetch(`${base}/api/brain-agent/run`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ context: {}, debug: false }),
      });
      assert.equal(missing.status, 400);
      const missingBody = await missing.json();
      assert.equal(missingBody.error, "message is required");

      // 1 — JSON message available → not "message is required"
      const run = await fetch(`${base}/api/brain-agent/run`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "What's going on with Garman Built?",
          context: { accountLabel: "Garman Built", recentMessages: [] },
          debug: false,
        }),
      });
      const runBody = await run.json();
      assert.notEqual(run.status, 400);
      assert.notEqual(runBody.error, "message is required");
      assert.ok(
        runBody.answerState === "CAPABILITY_UNAVAILABLE" ||
          runBody.answerState === "INSUFFICIENT_EVIDENCE" ||
          typeof runBody.answer === "string" ||
          runBody.ok === true ||
          runBody.ok === false,
        `expected agent result, got ${JSON.stringify(runBody)}`
      );

      // 2 — execute receives capability/input JSON
      const execMissing = await fetch(`${base}/api/brain-agent/execute`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { query: "x" } }),
      });
      assert.equal(execMissing.status, 400);
      assert.equal((await execMissing.json()).error, "capability is required");

      const exec = await fetch(`${base}/api/brain-agent/execute`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          capability: "brain.definitely_not_registered",
          input: { query: "sentinel" },
        }),
      });
      const execBody = await exec.json();
      assert.notEqual(execBody.error, "capability is required");
      assert.equal(execBody.code, "CAPABILITY_UNAVAILABLE");

      // 3 — validate-answer receives JSON contract (fabricated cite proves parse)
      const validate = await fetch(`${base}/api/brain-agent/validate-answer`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          answerText: "Secret fact [ev_deadbeefdeadbeef]",
          citedEvidenceIds: ["ev_deadbeefdeadbeef"],
          evidenceBag: [
            {
              evidenceId: "ev_real0000000001",
              authoritative: true,
              data: { accountName: "Sentinel" },
            },
          ],
          requiresAuthoritative: true,
        }),
      });
      assert.equal(validate.status, 422);
      const validateBody = await validate.json();
      assert.equal(validateBody.ok, false);
      assert.equal(validateBody.validation?.code, "FABRICATED_EVIDENCE");

      // Without JSON parser, Content-Type application/json body would be unread —
      // document the failure mode on a control route (not registered on Brain Agent).
      const control = express();
      control.post("/no-parser", (req, res) => {
        const message = String(req.body?.message || "").trim();
        if (!message) return res.status(400).json({ ok: false, error: "message is required" });
        res.json({ ok: true, message });
      });
      control.post("/with-parser", express.json({ limit: "256kb" }), (req, res) => {
        const message = String(req.body?.message || "").trim();
        if (!message) return res.status(400).json({ ok: false, error: "message is required" });
        res.json({ ok: true, message });
      });
      const controlServer = await new Promise((resolve) => {
        const s = control.listen(0, "127.0.0.1", () => resolve(s));
      });
      const cport = controlServer.address().port;
      const broken = await fetch(`http://127.0.0.1:${cport}/no-parser`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(broken.status, 400);
      assert.equal((await broken.json()).error, "message is required");
      const fixed = await fetch(`http://127.0.0.1:${cport}/with-parser`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(fixed.status, 200);
      assert.equal((await fixed.json()).message, "hello");
      await new Promise((r) => controlServer.close(r));
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
