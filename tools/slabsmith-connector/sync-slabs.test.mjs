/**
 * sync-slabs.mjs — unit tests (no network).
 * Run: npm run eos:test:slabsmith-connector
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  parseArgs,
  parseIngestResponse,
  postXmlToBackend,
  runSync,
  shouldCallBackend,
} from "./sync-slabs.mjs";

describe("parseArgs", () => {
  it("parses config, dry-run, and send", () => {
    const args = parseArgs(["node", "sync-slabs.mjs", "--config", "cfg.json", "--dry-run"]);
    assert.equal(args.configPath, "cfg.json");
    assert.equal(args.dryRun, true);
    assert.equal(args.send, false);
  });
});

describe("shouldCallBackend", () => {
  it("dry-run alone does not call backend", () => {
    assert.equal(shouldCallBackend({ dryRun: true, send: false, writeEnabled: true }), false);
  });

  it("--send forces backend call even with dry-run", () => {
    assert.equal(shouldCallBackend({ dryRun: true, send: true, writeEnabled: false }), true);
  });

  it("writeEnabled calls backend when not dry-run", () => {
    assert.equal(shouldCallBackend({ dryRun: false, send: false, writeEnabled: true }), true);
  });
});

describe("parseIngestResponse", () => {
  it("parses JSON success body", () => {
    const body = parseIngestResponse('{"ok":true,"rows_seen":3}', 200);
    assert.equal(body.ok, true);
    assert.equal(body.rows_seen, 3);
  });

  it("wraps non-JSON error text", () => {
    const body = parseIngestResponse("upstream error", 502);
    assert.equal(body.ok, false);
    assert.match(body.error, /upstream error/);
  });
});

describe("postXmlToBackend", () => {
  it("consumes fetch response body once via text()", async () => {
    let textCalls = 0;
    const fetchImpl = async () => ({
      status: 200,
      text: async () => {
        textCalls += 1;
        return JSON.stringify({ ok: true, rows_seen: 1 });
      },
    });

    const result = await postXmlToBackend({
      backendBaseUrl: "https://example.com",
      syncToken: "token",
      xml: "<xml/>",
      fetchImpl,
    });

    assert.equal(textCalls, 1);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
  });
});

describe("runSync success path", () => {
  it("returns 0 after mocked backend post without throwing", async () => {
    const fixtureXml = fileURLToPath(
      new URL("../../backend-core/src/slabsmith/fixtures/sample-slabs.xml", import.meta.url)
    );
    const tmpDir = mkdtempSync(join(tmpdir(), "slabsmith-connector-test-"));
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        backendBaseUrl: "https://example.com",
        sourceXmlPath: fixtureXml,
        syncToken: "test-secret",
        logDir: "",
        writeEnabled: false,
      })
    );

    const code = await runSync(
      ["node", "sync-slabs.mjs", "--config", configPath, "--send"],
      {
        postXmlToBackend: async () => ({
          status: 200,
          body: {
            ok: true,
            rows_seen: 3,
            inserted: 0,
            updated: 3,
            unchanged: 0,
            sync_run_id: "test-run",
            needs_review: 0,
            warnings_count: 0,
          },
        }),
      }
    );

    assert.equal(code, 0);
  });
});

console.log("sync-slabs.test.mjs: all tests passed");
