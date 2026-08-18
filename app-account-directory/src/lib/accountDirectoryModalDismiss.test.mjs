/**
 * Edit-account modal dismiss regressions (no DOM runtime).
 * Run: node app-account-directory/src/lib/accountDirectoryModalDismiss.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldDismissModalOnBackdropClick } from "./accountDirectoryModalDismiss.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../AccountDirectoryApp.tsx"), "utf8");

console.log("\naccountDirectoryModalDismiss.test.mjs\n");

{
  assert.equal(shouldDismissModalOnBackdropClick({ pointerDownOnBackdrop: true, clickOnBackdrop: true }), true);
  assert.equal(shouldDismissModalOnBackdropClick({ pointerDownOnBackdrop: false, clickOnBackdrop: true }), false);
  assert.equal(shouldDismissModalOnBackdropClick({ pointerDownOnBackdrop: true, clickOnBackdrop: false }), false);
  assert.equal(shouldDismissModalOnBackdropClick({ pointerDownOnBackdrop: false, clickOnBackdrop: false }), false);
  console.log("ok: 4–5, 10) true backdrop click closes; drag from inside does not");
}

{
  // Selection drag: pointer starts on input, click lands on overlay (browser common-ancestor click).
  assert.equal(
    shouldDismissModalOnBackdropClick({ pointerDownOnBackdrop: false, clickOnBackdrop: true }),
    false,
    "highlight/select drag ending on backdrop must not close"
  );
  console.log("ok: 3) select/highlight text does not close modal");
}

{
  assert.ok(app.includes("shouldDismissModalOnBackdropClick"));
  assert.ok(app.includes("modalBackdropPointerRef"));
  assert.ok(app.includes("onPointerDown"));
  assert.ok(app.includes('data-ad-modal="true"'));
  assert.ok(app.includes('autoFocus'));
  assert.ok(app.includes("Account name"));
  assert.ok(app.includes("setForm((f) => ({ ...f, displayName: v }))"));
  console.log("ok: 1–2) Account name input is focused/typed via Edit modal handlers");
}

{
  assert.ok(app.includes("onClick={closeModal}"));
  assert.ok(app.includes('aria-label="Close dialog"'));
  assert.ok(app.includes("Cancel"));
  const escapeFn = app.split("if (!modal) return;")[1]?.split("submitForm")[0] || "";
  assert.ok(escapeFn.includes('event.key === "Escape"') && escapeFn.includes("closeModal()"));
  console.log("ok: 7–9) Cancel, X, and Escape still dismiss");
}

{
  const workspaceEscape = app.split("function onKey(event: KeyboardEvent)")[1]?.split("function onFocus")[0] || "";
  assert.ok(workspaceEscape.includes('document.querySelector("[data-ad-modal], [data-ad-child-modal]")'));
  assert.ok(workspaceEscape.includes("return;"));
  console.log("ok: 11) Account 360 stays open while Edit modal is active (Escape skipped)");
}

{
  assert.ok(app.includes("serializeAccountWritePayload(form)"));
  assert.ok(app.includes("updateAccount(sessionToken"));
  assert.ok(app.includes("modal === \"edit\""));
  console.log("ok: 12) save still updates displayName via existing edit path");
}

{
  assert.equal(app.includes("onClick={closeModal}") && app.includes("modal-backdrop"), true);
  // Backdrop must not close on raw onClick={closeModal} anymore.
  assert.equal(/modal-backdrop"[^>]*onClick=\{closeModal\}/.test(app), false);
  console.log("ok: 6) selection across input bounds uses pointer-origin backdrop dismiss");
}

{
  // Keyboard select-all does not involve backdrop click.
  assert.equal(app.includes("metaKey") && app.includes("closeModal") && app.includes("select-all"), false);
  console.log("ok: 6b) Cmd+A / keyboard selection has no close handler");
}

console.log("\naccountDirectoryModalDismiss.test.mjs — all passed\n");
