import test from "node:test";
import assert from "node:assert/strict";
import { checkConfigurationSessionBinding } from "./sessionBinding.mjs";

test("session binding", () => {
  const session = { id: "s-a" };
  assert.equal(checkConfigurationSessionBinding(session, { expectedSessionId: "s-a" }), null);
  assert.equal(checkConfigurationSessionBinding(session, { expectedSessionId: "s-b" }), "session_mismatch");
  assert.equal(checkConfigurationSessionBinding(session, {}), null, "optional when not required");
  assert.equal(checkConfigurationSessionBinding(session, {}, { required: true }), "session_binding_missing");
  assert.equal(checkConfigurationSessionBinding(session, { expectedSessionId: "  " }, { required: true }), "session_binding_missing");
  assert.equal(checkConfigurationSessionBinding(null, { expectedSessionId: "s-a" }), "session_mismatch");
});
