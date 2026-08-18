import assert from "node:assert/strict";
import { formatAccountDirectoryPhone } from "./accountDirectoryPhoneFormat.mjs";

{
  assert.equal(formatAccountDirectoryPhone("3192690407"), "(319) 269-0407");
  console.log("ok: 1) raw 10-digit → (319) 269-0407");
}

{
  assert.equal(formatAccountDirectoryPhone("319-269-0407"), "(319) 269-0407");
  assert.equal(formatAccountDirectoryPhone("319.269.0407"), "(319) 269-0407");
  assert.equal(formatAccountDirectoryPhone("319 269 0407"), "(319) 269-0407");
  console.log("ok: 2) dotted/hyphen/spaced variants normalize");
}

{
  assert.equal(formatAccountDirectoryPhone("+1 319 269 0407"), "(319) 269-0407");
  assert.equal(formatAccountDirectoryPhone("1-319-269-0407"), "(319) 269-0407");
  console.log("ok: 3) leading +1 normalizes");
}

{
  assert.equal(formatAccountDirectoryPhone("3192690407 ext. 123"), "(319) 269-0407 ext. 123");
  assert.equal(formatAccountDirectoryPhone("(319) 269-0407 x123"), "(319) 269-0407 ext. 123");
  console.log("ok: 4) extensions preserved");
}

{
  const intl = "+44 20 7946 0958";
  assert.equal(formatAccountDirectoryPhone(intl), intl);
  const odd = "call shop";
  assert.equal(formatAccountDirectoryPhone(odd), odd);
  console.log("ok: 5) international/unparseable not corrupted");
}

{
  assert.equal(formatAccountDirectoryPhone(""), "");
  assert.equal(formatAccountDirectoryPhone(null), "");
  assert.equal(formatAccountDirectoryPhone("   "), "");
  console.log("ok: 6) blank safe");
}

console.log("\naccountDirectoryPhoneFormat.test.mjs — all passed\n");
