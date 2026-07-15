/**
 * Phase 6P.4 UI boundary tests (no React mount / no network).
 * Run: node app-ai-takeoff/src/lib/phase6p4.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQuoteIntakeApiClient,
  QUOTE_INTAKE_API_PREFIX,
  assertQuoteIntakePathAllowed
} from "./quoteIntakeApi.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

console.log("\nphase6p4.ui.test.mjs\n");

{
  const paths = [];
  const client = createQuoteIntakeApiClient({
    fetchImpl: async (path, init) => {
      paths.push({ path, method: (init?.method || "GET").toUpperCase() });
      assertQuoteIntakePathAllowed(path);
      if (path.endsWith("/mailbox/preview")) {
        return {
          ok: true,
          status: 200,
          json: { ok: true, messages: [], messageCount: 0 }
        };
      }
      if (path.endsWith("/mailbox/import")) {
        const body = JSON.parse(String(init.body || "{}"));
        assert.equal(body.confirm, true);
        return {
          ok: true,
          status: 200,
          json: { ok: true, results: [], takeoffInvocation: { attempted: false } }
        };
      }
      if (path.endsWith("/config")) {
        return {
          ok: true,
          status: 200,
          json: {
            ok: true,
            config: { quoteIntakeApiEnabled: true, mailboxSyncEnabled: true }
          }
        };
      }
      return { ok: true, status: 200, json: { ok: true, cases: [] } };
    }
  });

  await client.previewMailbox("tok");
  await client.importMailboxMessages("tok", { messageIds: ["m1"], confirm: true });
  assert.ok(paths.some((p) => p.path.includes("/mailbox/preview") && p.method === "POST"));
  assert.ok(paths.some((p) => p.path.includes("/mailbox/import") && p.method === "POST"));
  for (const p of paths) {
    assert.ok(p.path.startsWith(QUOTE_INTAKE_API_PREFIX));
    assert.equal(p.path.includes("/api/takeoff-jobs"), false);
  }
  console.log("ok: UI client mailbox preview/import paths + confirm");
}

{
  const modal = readFileSync(
    join(srcRoot, "components/intake/MailboxSyncModal.tsx"),
    "utf8"
  );
  const queue = readFileSync(
    join(srcRoot, "components/intake/EstimatorQueueView.tsx"),
    "utf8"
  );
  assert.equal(modal.includes("useEffect"), false, "modal must not auto-preview on mount");
  assert.ok(modal.includes("Preview mailbox"));
  assert.ok(modal.includes("confirmImport"));
  assert.ok(modal.includes("I confirm importing"));
  assert.ok(modal.includes("clearPreviewData"));
  assert.ok(modal.includes("classifyQuoteIntakeError"));
  assert.ok(
    /classified\.kind === "unauthorized" \|\| classified\.kind === "forbidden"/.test(modal) ||
      /kind === "unauthorized"/.test(modal)
  );
  assert.ok(queue.includes("Sync mailbox"));
  assert.ok(queue.includes("mailboxSyncEnabled"));
  assert.equal(queue.includes("previewMailbox("), false);
  console.log("ok: UI requires explicit preview + import confirmation; clears on 401/403");
}

{
  const intakeFiles = readdirSync(join(srcRoot, "components/intake")).map((f) =>
    join(srcRoot, "components/intake", f)
  );
  const libFiles = readdirSync(join(srcRoot, "lib"))
    .filter((f) => f.startsWith("quoteIntake"))
    .map((f) => join(srcRoot, "lib", f));
  for (const file of [...intakeFiles, ...libFiles]) {
    const src = readFileSync(file, "utf8");
    for (const needle of [
      "QUOTE_INTAKE_GRAPH_CLIENT_SECRET",
      "MS_GRAPH_CLIENT_SECRET",
      "client_secret",
      "login.microsoftonline.com"
    ]) {
      assert.equal(src.includes(needle), false, `${file} must not embed ${needle}`);
    }
    assert.equal(src.includes("dangerouslySetInnerHTML"), false);
  }
  console.log("ok: no Graph secrets / HTML injection in frontend intake modules");
}

console.log("\nAll phase6p4 UI tests passed.\n");
