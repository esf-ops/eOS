/**
 * HTTP-level create contract: JSON body parsing + displayName normalization.
 * Does not contact production Supabase.
 */
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeAccountWritePayload } from "./accountDirectoryPayload.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";

async function main() {
  const apiSrc = readFileSync(fileURLToPath(new URL("./accountDirectoryApi.js", import.meta.url)), "utf8");
  assert.ok(apiSrc.includes("express.json"));
  assert.ok(apiSrc.includes("writeGuard"));
  assert.ok(apiSrc.includes("normalizeAccountWritePayload"));
  assert.ok(apiSrc.includes("createAccountDirectorySupabaseStore"));
  assert.ok(apiSrc.includes('mode === "supabase"'));
  assert.equal(apiSrc.includes("Supabase repository is not enabled"), false);

  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store });
  const local = express();
  const jsonParser = express.json({ limit: "256kb" });

  local.post("/create", jsonParser, async (req, res) => {
    const normalized = normalizeAccountWritePayload(req.body, { requireDisplayName: true });
    if (!normalized.ok) return res.status(400).json(normalized);
    const account = await service.createAccount({
      organizationId: "org-1",
      role: "sales",
      actorUserId: "user-1",
      payload: normalized.payload
    });
    res.status(201).json({ ok: true, account });
  });

  const server = await new Promise((resolve) => {
    const s = local.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "TEST ACCOUNT",
      primaryEmail: "test-account-directory@example.com",
      primaryPhone: "555-0100",
      city: "Test City",
      state: "ID",
      notes: "ignored"
    })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.account.name, "TEST ACCOUNT");
  assert.equal(body.account.primaryEmail, "test-account-directory@example.com");

  const res2 = await fetch(`http://127.0.0.1:${port}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Compat Account" })
  });
  assert.equal(res2.status, 201);
  assert.equal((await res2.json()).account.name, "Compat Account");

  const res3 = await fetch(`http://127.0.0.1:${port}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res3.status, 400);
  assert.equal((await res3.json()).code, "display_name_required");

  await new Promise((r) => server.close(r));

  // Without jsonParser → empty body → same false required-name error as hosted failure
  const broken = express();
  broken.post("/broken", async (req, res) => {
    const normalized = normalizeAccountWritePayload(req.body, { requireDisplayName: true });
    if (!normalized.ok) return res.status(400).json(normalized);
    res.json({ ok: true });
  });
  const s2 = await new Promise((resolve) => {
    const s = broken.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port2 = s2.address().port;
  const resBroken = await fetch(`http://127.0.0.1:${port2}/broken`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "TEST ACCOUNT" })
  });
  assert.equal(resBroken.status, 400);
  assert.equal((await resBroken.json()).code, "display_name_required");
  await new Promise((r) => s2.close(r));

  console.log("accountDirectoryCreateHttp.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
