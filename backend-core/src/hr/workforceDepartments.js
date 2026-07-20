/**
 * Department data-entry groups for the Weekly Operations Scorecard.
 * Maps stable department slugs → grading section UUIDs.
 * @module workforceDepartments
 */

/** @typedef {"service_quality"|"outside_partners"|"plumbing"|"shop_operations"|"quoting"|"machinery"} DepartmentSlug */

/**
 * @typedef {object} DepartmentGroup
 * @property {DepartmentSlug} slug
 * @property {string} name
 * @property {ReadonlyArray<string>} sectionIds
 */

/** @type {ReadonlyArray<DepartmentGroup>} */
export const DEPARTMENT_GROUPS = Object.freeze([
  {
    slug: "service_quality",
    name: "Service / Quality Coordination",
    sectionIds: Object.freeze([
      "b2000001-0001-4001-8001-000000000001", // Office
      "b2000001-0001-4001-8001-000000000002", // Templating
      "b2000001-0001-4001-8001-000000000006", // Programming
      "b2000001-0001-4001-8001-000000000012", // ESF non billable
      "b2000001-0001-4001-8001-000000000013", // Installation
      "b2000001-0001-4001-8001-000000000003" // Lead times
    ])
  },
  {
    slug: "outside_partners",
    name: "Outside Partners",
    sectionIds: Object.freeze([
      "b2000001-0001-4001-8001-000000000004",
      "b2000001-0001-4001-8001-000000000005"
    ])
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    sectionIds: Object.freeze(["b2000001-0001-4001-8001-000000000008"])
  },
  {
    slug: "shop_operations",
    name: "Shop Operations",
    sectionIds: Object.freeze([
      "b2000001-0001-4001-8001-000000000009",
      "b2000001-0001-4001-8001-000000000010"
    ])
  },
  {
    slug: "quoting",
    name: "Quoting",
    sectionIds: Object.freeze(["b2000001-0001-4001-8001-000000000007"])
  },
  {
    slug: "machinery",
    name: "Machinery",
    sectionIds: Object.freeze(["b2000001-0001-4001-8001-000000000011"])
  }
]);

/** @type {ReadonlySet<string>} */
export const DEPARTMENT_SLUGS = Object.freeze(new Set(DEPARTMENT_GROUPS.map((g) => g.slug)));

/** @type {ReadonlyMap<string, DepartmentGroup>} */
const GROUP_BY_SLUG = new Map(DEPARTMENT_GROUPS.map((g) => [g.slug, g]));

/** @type {ReadonlyMap<string, string>} */
const SECTION_TO_DEPARTMENT = (() => {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const group of DEPARTMENT_GROUPS) {
    for (const sectionId of group.sectionIds) {
      map.set(sectionId, group.slug);
    }
  }
  return map;
})();

/**
 * @param {string} slug
 */
export function isValidDepartmentSlug(slug) {
  return DEPARTMENT_SLUGS.has(String(slug ?? "").trim());
}

/**
 * @param {string} slug
 */
export function getDepartmentGroup(slug) {
  return GROUP_BY_SLUG.get(String(slug ?? "").trim()) ?? null;
}

/**
 * @param {string} sectionId
 */
export function departmentSlugForSection(sectionId) {
  return SECTION_TO_DEPARTMENT.get(String(sectionId ?? "").trim()) ?? null;
}

/**
 * @param {Iterable<string>|null|undefined} departmentSlugs
 * @returns {Set<string>}
 */
export function sectionIdsForDepartments(departmentSlugs) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const slug of departmentSlugs ?? []) {
    const group = getDepartmentGroup(slug);
    if (!group) continue;
    for (const id of group.sectionIds) out.add(id);
  }
  return out;
}

/**
 * @param {Array<{ slug: string }>} assignments
 */
export function listAssignedDepartmentGroups(assignments) {
  const seen = new Set();
  /** @type {DepartmentGroup[]} */
  const out = [];
  for (const row of assignments ?? []) {
    const slug = String(row.slug ?? row.department_slug ?? "").trim();
    if (!slug || seen.has(slug)) continue;
    const group = getDepartmentGroup(slug);
    if (!group) continue;
    seen.add(slug);
    out.push(group);
  }
  return out;
}
