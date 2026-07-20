/**
 * Department group + Executive Dashboard access mapping tests.
 * Run: npm run eos:test:hr-workforce
 */

import assert from "node:assert/strict";
import {
  ACCESS_ASSIGNMENT_OPTIONS,
  ACCESS_SLUGS,
  DEPARTMENT_GROUPS,
  EXECUTIVE_DASHBOARD_SLUG,
  accessOptionName,
  departmentSlugForSection,
  getDepartmentGroup,
  hasExecutiveDashboardAssignment,
  isExecutiveDashboardSlug,
  isValidAccessSlug,
  isValidDepartmentSlug,
  listAssignedDepartmentGroups,
  sectionIdsForDepartments
} from "./workforceDepartments.js";

assert.equal(DEPARTMENT_GROUPS.length, 6);
assert.equal(isValidDepartmentSlug("shop_operations"), true);
assert.equal(isValidDepartmentSlug("not_a_dept"), false);
assert.equal(isValidDepartmentSlug(EXECUTIVE_DASHBOARD_SLUG), false, "executive is not a department group");

assert.equal(isValidAccessSlug("plumbing"), true);
assert.equal(isValidAccessSlug(EXECUTIVE_DASHBOARD_SLUG), true);
assert.equal(isValidAccessSlug("not_a_scope"), false);
assert.equal(isExecutiveDashboardSlug(EXECUTIVE_DASHBOARD_SLUG), true);
assert.ok(ACCESS_SLUGS.has(EXECUTIVE_DASHBOARD_SLUG));

assert.equal(ACCESS_ASSIGNMENT_OPTIONS.length, 7);
assert.equal(ACCESS_ASSIGNMENT_OPTIONS[0].slug, EXECUTIVE_DASHBOARD_SLUG);
assert.equal(ACCESS_ASSIGNMENT_OPTIONS[0].accessType, "executive_dashboard");
assert.ok(ACCESS_ASSIGNMENT_OPTIONS[0].description.toLowerCase().includes("full company"));

assert.equal(accessOptionName(EXECUTIVE_DASHBOARD_SLUG), "Executive Dashboard");
assert.equal(accessOptionName("quoting"), "Quoting");

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
assert.equal(getDepartmentGroup(EXECUTIVE_DASHBOARD_SLUG), null);

const allowed = sectionIdsForDepartments(["plumbing", "quoting", EXECUTIVE_DASHBOARD_SLUG]);
assert.equal(allowed.size, 2, "executive_dashboard must not map to grading sections");
assert.ok(allowed.has("b2000001-0001-4001-8001-000000000008"));
assert.ok(allowed.has("b2000001-0001-4001-8001-000000000007"));
assert.equal(allowed.has("b2000001-0001-4001-8001-000000000009"), false);

const listed = listAssignedDepartmentGroups([
  { slug: "plumbing" },
  { slug: "plumbing" },
  { department_slug: "machinery" },
  { slug: EXECUTIVE_DASHBOARD_SLUG }
]);
assert.equal(listed.length, 2);
assert.equal(listed[0].slug, "plumbing");
assert.equal(listed[1].slug, "machinery");

assert.equal(hasExecutiveDashboardAssignment([{ slug: EXECUTIVE_DASHBOARD_SLUG }]), true);
assert.equal(hasExecutiveDashboardAssignment([{ department_slug: "plumbing" }]), false);
assert.equal(
  hasExecutiveDashboardAssignment([{ slug: EXECUTIVE_DASHBOARD_SLUG, is_active: false }]),
  false
);

console.log("workforceDepartments.test.mjs: ok");
