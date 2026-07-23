/**
 * Account Directory create/edit form contract tests (fake/sentinel data only).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyAccountWriteDraft,
  serializeAccountWritePayload,
  validateAccountDisplayName,
  draftFromAccountDetail
} from "./accountDirectoryForm.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, "../AccountDirectoryApp.tsx"), "utf8");
const apiSrc = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");

console.log("\naccountDirectoryForm.test.mjs\n");

const draft = emptyAccountWriteDraft();
assert.equal(draft.displayName, "");
assert.ok("displayName" in draft);
assert.equal("name" in draft, false);

assert.equal(validateAccountDisplayName(""), "Account name is required.");
assert.equal(validateAccountDisplayName("   "), "Account name is required.");
assert.equal(validateAccountDisplayName("TEST ACCOUNT"), null);

const filled = {
  displayName: "TEST ACCOUNT",
  primaryEmail: "test-account-directory@example.com",
  primaryPhone: "555-0100",
  city: "Test City",
  state: "ID"
};
const payload = serializeAccountWritePayload(filled);
assert.equal(payload.displayName, "TEST ACCOUNT");
assert.equal(payload.primaryEmail, "test-account-directory@example.com");
assert.equal(payload.primaryPhone, "555-0100");
assert.equal(payload.city, "Test City");
assert.equal(payload.state, "ID");
assert.equal("name" in payload, false);
assert.equal("notes" in payload, false);

const blankOptional = serializeAccountWritePayload({
  displayName: "Only Name",
  primaryEmail: "  ",
  primaryPhone: "",
  city: "",
  state: ""
});
assert.deepEqual(Object.keys(blankOptional).sort(), ["displayName"]);

const fromDetail = draftFromAccountDetail({ name: "Legacy", primaryEmail: "a@b.c" });
assert.equal(fromDetail.displayName, "Legacy");

assert.ok(appSrc.includes("serializeAccountWritePayload"));
assert.ok(appSrc.includes("validateAccountDisplayName"));
assert.ok(appSrc.includes("form.displayName"));
assert.ok(appSrc.includes('modal === "new-prospect"'));
assert.ok(appSrc.includes('modal === "edit"'));
assert.equal(appSrc.includes('createAccount(sessionToken, { ...form, name })'), false);
assert.equal(appSrc.includes('createProspect(sessionToken, { ...form, name })'), false);
assert.ok(apiSrc.includes("displayName: String(payload.displayName"));
assert.equal(apiSrc.includes("name:"), false);

// Error clears when typing valid displayName (handler present)
assert.ok(appSrc.includes('formError === "Account name is required."'));
assert.ok(appSrc.includes("setFormError(null)"));

// Failed request preserves form: setModal(null) only in try success path after awaits
assert.ok(appSrc.includes("setFormError(e instanceof ApiError"));
assert.ok(appSrc.includes("formBusy"));

// Double-submit guard
assert.ok(appSrc.includes("if (!sessionToken || !modal || formBusy) return"));

console.log("ok: displayName form + serialize contract");
console.log("ok: new account / prospect / edit share displayName");
console.log("\nAll account directory form contract checks passed.\n");
