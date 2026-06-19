import { DEALER_SAFE_HEAD_SLUG_SET, EOS_HEAD_SLUGS, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { inferHeadDeploymentStatus, resolveHeadDeploymentUrl } from "./headDeploymentUrls.js";

/**
 * Canonical launcher cards — slugs MUST align with `user_head_access.head_slug`
 * and `EOS_HEAD_SLUGS`. Href prefixes are SPA routing hints (not enforced here).
 */
export const HEAD_LAUNCHER_CATALOG = [
  {
    slug: "executive",
    label: "eliteOS Executive Head",
    description: "Analytics, trends, and operating summary — Titans Flowing widget for Today.",
    category: "Leadership",
    href: "/executive"
  },
  {
    slug: "brain_health",
    label: "eliteOS Brain Health Head",
    description: "Sync health, ingest signals, and operational cadence for the eliteOS Brain.",
    category: "Operations",
    href: "/brain-health"
  },
  {
    slug: "system_admin",
    label: "eliteOS System Admin Head",
    description: "User governance, head access assignments, and auditing.",
    category: "Administration",
    href: "/system-admin"
  },
  {
    slug: "org_directory",
    label: "eliteOS Org Directory",
    description: "Plan departments, roles, reporting lines, and recommended eliteOS access (planning only).",
    category: "People",
    href: "/org-directory",
    roleNote: "Does not change actual user permissions — use System Admin for head access."
  },
  {
    slug: "pricing_admin",
    label: "eliteOS Pricing Admin Head",
    description: "Material tiers, add-ons, and quote pricing policy (authorized staff only).",
    category: "Administration",
    href: "/pricing-admin",
    roleNote: "eliteOS Brain APIs still require pricing_admin head access and route-level role checks."
  },
  {
    slug: "sales",
    label: "eliteOS Sales Head",
    description: "Sales dashboard preview: sync health, starter KPIs, and attribution-labeled revenue views.",
    category: "Revenue",
    href: "/sales",
    roleNote: "Preview only until approved account attribution mappings and dashboard parity are complete."
  },
  {
    slug: "quote",
    label: "eliteOS Internal Estimate Head",
    description: "Create and revise internal estimates (measurement + pricing workspace).",
    category: "Revenue",
    href: "/quote",
    roleNote:
      "Internal Estimate uses Brain head slug `quote` for access checks — distinct from Quote Library (`quote_library`), Public Quote (`public_quote`), and Partner Quote (`partner_quote`). APIs still enforce permissions per request."
  },
  {
    slug: "quote_library",
    label: "eliteOS Quote Library Head",
    description: "Search, filter, manage, and move quotes from estimate to sold job.",
    category: "Revenue",
    href: "/quote-library",
    roleNote: "Account-centered quote operations and handoff docs; distinct from Public Quote and Internal Estimate."
  },
  {
    slug: "custom_quote",
    label: "eliteOS Custom Quote Head",
    description: "Off-program / non-Elite-100 material quotes with backend markup/uplift pricing.",
    category: "Revenue",
    href: "/custom-quote",
    roleNote:
      "ESF internal only — not for dealers, partners, or public users. Saves to Quote Library with quote_source custom_quote."
  },
  {
    slug: "production",
    label: "eliteOS Production Head",
    description: "Production pacing and throughput views.",
    category: "Operations",
    href: "/production"
  },
  {
    slug: "shop_tv",
    label: "eliteOS Shop Floor TV Head",
    description: "Live floor-facing boards (operational tempo).",
    category: "Operations",
    href: "/shop-tv"
  },
  {
    slug: "install_dashboard",
    label: "Install Dashboard",
    description: "Daily install route, job details, notes, and field-ready information.",
    category: "Field",
    href: "/install-dashboard",
    roleNote: "Read-only Installer Day View — no schedule editing or Moraware writeback in v1."
  },
  {
    slug: "install",
    label: "eliteOS Install Head",
    description: "Install scheduling and install-day boards.",
    category: "Field",
    href: "/install"
  },
  {
    slug: "purchasing",
    label: "eliteOS Purchasing Head",
    description: "Procurement workflows (future).",
    category: "Finance & supply",
    href: "/purchasing"
  },
  {
    slug: "customer_service",
    label: "eliteOS Customer Service Head",
    description: "Service queue and CX workflows.",
    category: "Service",
    href: "/customer-service"
  },
  { slug: "hr", label: "eliteOS HR Head", description: "People operations.", category: "People", href: "/hr" },
  {
    slug: "safety",
    label: "eliteOS Safety Head",
    description: "Compliance and safety programs.",
    category: "People",
    href: "/safety"
  },
  {
    slug: "marketing",
    label: "eliteOS Marketing Head",
    description: "Positioning and campaign assets.",
    category: "Commercial",
    href: "/marketing"
  },
  {
    slug: "finance",
    label: "eliteOS Finance Head",
    description: "Financial reporting tie-ins.",
    category: "Finance & supply",
    href: "/finance"
  },
  {
    slug: "reports",
    label: "eliteOS Reports Head",
    description: "Curated BI and exports.",
    category: "Insights",
    href: "/reports"
  },
  {
    slug: "partner_quote",
    label: "eliteOS Partner Quote Head",
    description: "Dealer quoting (Partner Quoting Platform).",
    category: "Partner",
    href: "/partner-quote"
  },
  {
    slug: "dealer_resources",
    label: "eliteOS Dealer Resources Head",
    description: "Partner- and dealer-facing resources.",
    category: "Partner",
    href: "/dealer-resources"
  },
  {
    slug: "ai_takeoff",
    label: "AI Takeoff Lab",
    description: "Upload plans, extract countertop measurement evidence, and review AI-generated takeoffs before quote import.",
    category: "Revenue",
    href: "/takeoff",
    roleNote: "Internal preview — AI-assisted plan takeoff for estimators. Import to Internal Estimate remains disabled until QA gates pass consistently."
  },
  {
    slug: "slab_inventory",
    label: "eliteOS Slab Inventory Head",
    description: "Browse the cached SlabCloud slab inventory — colors, materials, dimensions, racks, and photos (read-only).",
    category: "Inventory",
    href: "/slab-inventory",
    roleNote:
      "Read-only v1 — reads the normalized SlabCloud cache; no holds, allocation, or writeback. Price group shown is the imported source value, not slabOS pricing authority. Backend APIs still require slab_inventory head access per request."
  }
];

/** Convenience launcher row — not an `EOS_HEAD_SLUGS` head (no `user_head_access` / `requireHeadAccess`). */
export const PUBLIC_QUOTE_LAUNCHER_ROW = Object.freeze({
  slug: "public_quote",
  label: "eliteOS Public Quote Head",
  description: "Customer-facing quote experience (no login required at destination).",
  category: "Revenue",
  href: "/quote/public",
  roleNote: "Public eliteOS head — link only; destination does not use this session."
});

const ALL_KNOWN = new Set(EOS_HEAD_SLUGS);

/** @deprecated Use `DEALER_SAFE_HEAD_SLUG_SET` from `eosGovernanceConstants.js` — kept for launcher callers. */
export const DEALER_VISIBLE_SLUGS = DEALER_SAFE_HEAD_SLUG_SET;

function sanitizeSlugSet(slugs) {
  const out = new Set();
  for (const s of slugs) {
    const v = String(s ?? "").trim();
    if (isKnownHeadSlug(v)) out.add(v);
  }
  return out;
}

function intersectDealerSlugs(slugSet) {
  const out = new Set();
  for (const slug of slugSet) {
    if (DEALER_VISIBLE_SLUGS.has(slug)) out.add(slug);
  }
  return out;
}

/**
 * Fallback when no `user_head_access` rows — once rows exist they fully replace defaults.
 */
function defaultSlugSet(role, userKind) {
  const r = String(role ?? "viewer").trim();
  const kind = String(userKind ?? "internal").trim();

  if (kind === "dealer_partner") {
    // "quote" (Internal Estimate) intentionally excluded — dealer_partner users must not see or reach
    // internal estimate routes. DEALER_SAFE_HEAD_SLUGS also no longer includes "quote" for the same reason.
    return sanitizeSlugSet(["partner_quote", "dealer_resources"]);
  }
  if (r === "admin") {
    return new Set(EOS_HEAD_SLUGS);
  }
  if (r === "executive") {
    const ex = EOS_HEAD_SLUGS.filter((s) => s !== "system_admin");
    return new Set(ex);
  }

  const base = new Set(["brain_health"]);
  const roleHints = {
    sales: ["sales", "quote", "quote_library", "custom_quote", "reports"],
    estimator: ["quote", "quote_library", "custom_quote", "reports"],
    accounting: ["finance", "reports", "pricing_admin"],
    production: ["production", "shop_tv", "reports"],
    shop_tv: ["shop_tv"],
    installer: ["install_dashboard", "install"],
    purchasing: ["purchasing"],
    finance: ["finance", "reports", "pricing_admin"],
    dealer_admin: ["partner_quote", "dealer_resources", "quote"],
    dealer_user: ["partner_quote", "dealer_resources", "quote"],
    viewer: [],
    hr: ["hr"],
    safety: ["safety"],
    marketing: ["marketing"],
    customer_service: ["customer_service"]
  };
  const extra = roleHints[r] ?? [];
  for (const x of extra) {
    if (ALL_KNOWN.has(x)) base.add(x);
  }
  return sanitizeSlugSet([...base]);
}

function isAdminRole(role) {
  return String(role ?? "").trim() === "admin";
}

/** Admin / executive / super_admin: launcher shows the full head catalog (URLs still env-driven). */
function hasLauncherFullCatalogRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "admin" || r === "executive" || r === "super_admin";
}

/**
 * @param {typeof HEAD_LAUNCHER_CATALOG[number]} row
 * @param {boolean} enabled
 * @param {'assigned' | 'role_default' | 'admin_roadmap' | 'full_catalog'} visibilityReason
 */
function enrichLauncherHead(row, enabled, visibilityReason) {
  const urlRaw = resolveHeadDeploymentUrl(row.slug);
  const url = urlRaw || null;
  const status = inferHeadDeploymentStatus(urlRaw);
  const is_available = Boolean(enabled && url);
  return {
    slug: row.slug,
    title: row.label,
    label: row.label,
    description: row.description,
    href: row.href,
    category: row.category,
    enabled,
    visibilityReason,
    url,
    status,
    is_available,
    role_note: row.roleNote ? String(row.roleNote) : null
  };
}

function enrichPublicQuoteHead() {
  const row = PUBLIC_QUOTE_LAUNCHER_ROW;
  const urlRaw = resolveHeadDeploymentUrl(row.slug);
  const url = urlRaw || null;
  const status = inferHeadDeploymentStatus(urlRaw);
  return {
    slug: row.slug,
    title: row.label,
    label: row.label,
    description: row.description,
    href: row.href,
    category: row.category,
    enabled: true,
    visibilityReason: /** @type {const} */ ("role_default"),
    url,
    status,
    is_available: Boolean(url),
    role_note: row.roleNote ? String(row.roleNote) : null
  };
}

/**
 * Shared resolver for `/api/me/heads` and `requireHeadAccess` — same grants as launcher actionable set.
 *
 * @param {ReturnType<import("@supabase/supabase-js").createClient>} supabase
 * @param {{ id: string, email?: string, role?: string, isActive?: boolean }} reqUser
 * @returns {Promise<{
 *   ok: false,
 *   error: string
 * } | {
 *   ok: true,
 *   active: false,
 *   id: string,
 *   email: string,
 *   role: string,
 *   userKind: string,
 *   dealer: boolean,
 *   isAdminRole: boolean,
 *   launcherFullCatalog: boolean,
 *   actionableGrantSet: Set<string>,
 *   explicitDbGrantSet: Set<string>,
 *   usedExplicitAssigns: boolean,
 *   explicitDealerSubset: Set<string>
 * } | {
 *   ok: true,
 *   active: true,
 *   id: string,
 *   email: string,
 *   role: string,
 *   userKind: string,
 *   dealer: boolean,
 *   isAdminRole: boolean,
 *   launcherFullCatalog: boolean,
 *   actionableGrantSet: Set<string>,
 *   explicitDbGrantSet: Set<string>,
 *   usedExplicitAssigns: boolean,
 *   explicitDealerSubset: Set<string>
 * }>}
 */
export async function resolveHeadAccessContext(supabase, reqUser) {
  const id = pickStr(reqUser?.id);
  const email = pickStr(reqUser?.email);
  const role = pickStr(reqUser?.role ?? "viewer");
  const active = reqUser?.isActive !== false;

  if (!id) {
    return { ok: false, error: "missing_user" };
  }

  if (!active) {
    return {
      ok: true,
      active: false,
      id,
      email,
      role,
      userKind: "internal",
      dealer: false,
      isAdminRole: false,
      launcherFullCatalog: false,
      actionableGrantSet: new Set(),
      explicitDbGrantSet: new Set(),
      usedExplicitAssigns: false,
      explicitDealerSubset: new Set()
    };
  }

  // Prefer user_kind already loaded by requireAuth (req.user.user_kind) to avoid a redundant
  // user_profiles SELECT on every guarded route. Fall back to a DB lookup when not supplied
  // (e.g., direct calls from /api/me/heads that do not go through requireAuth).
  let userKind = pickStr(reqUser?.user_kind || "");
  if (!userKind) {
    const { data: prof, error: pe } = await supabase.from("user_profiles").select("user_kind").eq("id", id).maybeSingle();
    userKind = pe ? "internal" : pickStr(prof?.user_kind || "internal") || "internal";
  }
  const dealer = userKind === "dealer_partner";

  /** @type {Set<string>} */
  let explicitDbGrantSet = new Set();
  try {
    const { data: rows } = await supabase.from("user_head_access").select("head_slug").eq("user_id", id);
    explicitDbGrantSet = sanitizeSlugSet((rows ?? []).map((r) => r.head_slug));
  } catch {
    explicitDbGrantSet = new Set();
  }

  const explicitDealerSubset = intersectDealerSlugs(explicitDbGrantSet);

  const usedExplicitAssigns = explicitDbGrantSet.size > 0;

  /** @type {Set<string>} */
  let actionableGrantSet;
  if (!dealer) {
    actionableGrantSet = usedExplicitAssigns ? new Set(explicitDbGrantSet) : defaultSlugSet(role, userKind);
  } else if (usedExplicitAssigns) {
    actionableGrantSet = new Set(explicitDealerSubset);
  } else {
    actionableGrantSet = intersectDealerSlugs(defaultSlugSet(role, userKind));
  }

  return {
    ok: true,
    active: true,
    id,
    email,
    role,
    userKind,
    dealer,
    isAdminRole: isAdminRole(role),
    launcherFullCatalog: hasLauncherFullCatalogRole(role),
    actionableGrantSet,
    explicitDbGrantSet,
    usedExplicitAssigns,
    explicitDealerSubset
  };
}

/** @typedef {{ slug: string, title: string, label: string, description: string, href: string, category: string, enabled: boolean, visibilityReason: 'assigned' | 'role_default' | 'admin_roadmap' | 'full_catalog', url: string | null, status: 'live' | 'testing' | 'planned', is_available: boolean, role_note: string | null }} LauncherHeadRowApi */

/** @returns {LauncherHeadRowApi[]} */
function headsForLauncherFullCatalog() {
  return HEAD_LAUNCHER_CATALOG.map((row) => enrichLauncherHead(row, true, "full_catalog"));
}

/** @returns {LauncherHeadRowApi[]} */
function headsForInternalNonRoadmap(openGrantSet, usedExplicitAssigns) {
  return HEAD_LAUNCHER_CATALOG.filter((row) => openGrantSet.has(row.slug)).map((row) =>
    enrichLauncherHead(
      row,
      true,
      /** when rows exist everything shown is attributable to assignments */
      usedExplicitAssigns ? "assigned" : "role_default"
    )
  );
}

/** Dealer / partner portfolio — curated slugs only, no internals, no roadmap. */
/** @returns {LauncherHeadRowApi[]} */
function headsForDealerPortfolio(openGrantSet, usedExplicitAssigns, explicitDealerSubsetForVisibility) {
  const slugOrder = HEAD_LAUNCHER_CATALOG.map((r) => r.slug).filter((s) => DEALER_VISIBLE_SLUGS.has(s));
  const visible =
    usedExplicitAssigns ?
      slugOrder.filter((s) => explicitDealerSubsetForVisibility.has(s))
    : [...slugOrder];

  return visible.map((slug) => {
    const row = HEAD_LAUNCHER_CATALOG.find((c) => c.slug === slug);
    if (!row) throw new Error(`launcher catalog missing dealer slug "${slug}"`);
    return enrichLauncherHead(row, openGrantSet.has(slug), usedExplicitAssigns ? "assigned" : "role_default");
  });
}

function appendPublicQuoteIfMissing(heads) {
  const out = [...heads];
  if (out.some((h) => h.slug === PUBLIC_QUOTE_LAUNCHER_ROW.slug)) return out;
  out.push(enrichPublicQuoteHead());
  return out;
}

/**
 * @param {ReturnType<import("@supabase/supabase-js").createClient>} supabase
 * @param {{ id: string, email?: string, role?: string, isActive?: boolean }} reqUser — from attachUser (`req.user`)
 */
export async function buildMeHeadsPayload(supabase, reqUser) {
  const ctx = await resolveHeadAccessContext(supabase, reqUser);

  if (!ctx.ok) {
    return {
      ok: false,
      error: ctx.error,
      heads: [],
      user: null
    };
  }

  if (!ctx.active) {
    return {
      ok: true,
      inactive: true,
      user: {
        id: ctx.id,
        email: ctx.email,
        role: ctx.role,
        userKind: "internal",
        full_name: pickStr(reqUser?.full_name || reqUser?.fullName),
        department: pickStr(reqUser?.department),
        organization_id: reqUser?.organization_id ?? null
      },
      heads: []
    };
  }

  const {
    id,
    email,
    role,
    userKind,
    dealer,
    launcherFullCatalog,
    actionableGrantSet,
    explicitDbGrantSet,
    usedExplicitAssigns,
    explicitDealerSubset
  } = ctx;

  const profileUser = {
    id,
    email,
    role,
    userKind,
    full_name: pickStr(reqUser?.full_name || reqUser?.fullName),
    department: pickStr(reqUser?.department),
    organization_id: reqUser?.organization_id ?? null
  };

  /** Dealer attempted internal-only assigns — no dealer-visible slug survived clamping → secure empty catalog (public quote may still attach). */
  if (usedExplicitAssigns && dealer && explicitDbGrantSet.size > 0 && explicitDealerSubset.size === 0) {
    return {
      ok: true,
      user: profileUser,
      heads: appendPublicQuoteIfMissing([])
    };
  }

  /** @type {LauncherHeadRowApi[]} */
  let heads;

  if (launcherFullCatalog && !dealer) {
    heads = headsForLauncherFullCatalog();
  } else if (dealer) {
    heads = headsForDealerPortfolio(actionableGrantSet, usedExplicitAssigns, explicitDealerSubset);
  } else {
    heads = headsForInternalNonRoadmap(actionableGrantSet, usedExplicitAssigns);
  }

  heads = appendPublicQuoteIfMissing(heads);

  return {
    ok: true,
    user: profileUser,
    heads
  };
}

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}
