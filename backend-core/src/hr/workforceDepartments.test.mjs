/**
 * Department group mapping tests.
 * Run: npm run eos:test:hr-workforce
 */

import assert from "node:assert/strict";
import {
  DEPARTMENT_GROUPS,
  departmentSlugForSection,
  getDepartmentGroup,
  isValidDepartmentSlug,
  listAssignedDepartmentGroups,
  sectionIdsForDepartments
} from "./workforceDepartments.js";

assert.equal(DEPARTMENT_GROUPS.length, 6);
assert.equal(isValidDepartmentSlug("shop_operations"), true);
assert.equal(isValidDepartmentSlug("not_a_dept"), false);

assert.equal(
  departmentSlugForSection("b2000001-0001-4001-8001-000000000009"),
  "shop_operations"
);
assert.equal(
  departmentSlugForSection("b2000001-0001-4001-8001-000000000004"),
  "outside_partners"
);

const shop = getDepartmentGroup("shop_operations");
assert.ok(shop);
assert.equal(shop.sectionIds.length, 2);

const allowed = sectionIdsForDepartments(["plumbing", "quoting"]);
assert.equal(allowed.size, 2);
assert.ok(allowed.has("b2000001-0001-4001-8001-000000000008"));
assert.ok(allowed.has("b2000001-0001-4001-8001-000000000007"));
assert.equal(allowed.has("b2000001-0001-4001-8001-000000000009"), false);

const listed = listAssignedDepartmentGroups([
  { slug: "plumbing" },
  { slug: "plumbing" },
  { department_slug: "machinery" }
]);
assert.equal(listed.length, 2);
assert.equal(listed[0].slug, "plumbing");
assert.equal(listed[1].slug, "machinery");

console.log("workforceDepartments.test.mjs: ok");
