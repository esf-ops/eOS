import { EOS_HEAD_SLUGS, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";

/**
 * Canonical launcher cards — slugs MUST align with `user_head_access.head_slug`
 * and `EOS_HEAD_SLUGS`. Href prefixes are SPA routing hints (not enforced here).
 */
export const HEAD_LAUNCHER_CATALOG = [
  {
    slug: "executive",
    label: "Executive",
    description: "Analytics, trends, and operating summary — Titans Flowing widget for Today.",
    category: "Leadership",
    href: "/executive"
  },
  {
    slug: "brain_health",
    label: "Brain Health",
    description: "Sync health, ingest signals, operational cadence cues.",
    category: "Operations",
    href: "/brain-health"
  },
  {
    slug: "system_admin",
    label: "System Admin",
    description: "User governance, head access assignments, auditing.",
    category: "Administration",
    href: "/system-admin"
  },
  { slug: "sales", label: "Sales", description: "Sales workflows and dashboards.", category: "Revenue", href: "/sales" },
  { slug: "quote", label: "Quote", description: "Quote tools and estimating.", category: "Revenue", href: "/quote" },
  {
    slug: "production",
    label: "Production",
    description: "Production pacing and throughput views.",
    category: "Operations",
    href: "/production"
  },
  {
    slug: "shop_tv",
    label: "Shop Floor TV",
    description: "Live floor-facing boards (operational tempo).",
    category: "Operations",
    href: "/shop-tv"
  },
  {
    slug: "install",
    label: "Install",
    description: "Install scheduling and install-day boards.",
    category: "Field",
    href: "/install"
  },
  {
    slug: "purchasing",
    label: "Purchasing",
    description: "Procurement head (future).",
    category: "Finance & supply",
    href: "/purchasing"
  },
  {
    slug: "customer_service",
    label: "Customer Service",
    description: "Service queue and CX workflows.",
    category: "Service",
    href: "/customer-service"
  },
  { slug: "hr", label: "HR", description: "People operations.", category: "People", href: "/hr" },
  {
    slug: "safety",
    label: "Safety",
    description: "Compliance and safety programs.",
    category: "People",
    href: "/safety"
  },
  {
    slug: "marketing",
    label: "Marketing",
    description: "Positioning and campaign assets.",
    category: "Commercial",
    href: "/marketing"
  },
  {
    slug: "finance",
    label: "Finance",
    description: "Financial reporting tie-ins.",
    category: "Finance & supply",
    href: "/finance"
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Curated BI and exports.",
    category: "Insights",
    href: "/reports"
  },
  {
    slug: "partner_quote",
    label: "Partner Quote",
    description: "Dealer quoting (Partner Quoting Platform).",
    category: "Partner",
    href: "/partner-quote"
  },
  {
    slug: "dealer_resources",
    label: "Dealer Resources",
    description: "Partner/dealer-facing resources.",
    category: "Partner",
    href: "/dealer-resources"
  }
];

const ALL_KNOWN = new Set(EOS_HEAD_SLUGS);

/**
 * Dealer-visible heads (`quote_history` etc. extend here later).
 * Internal ESF launcher rows must never be returned for `dealer_partner` users — even mis-configured `user_head_access`.
 */
export const DEALER_VISIBLE_SLUGS = new Set(["partner_quote", "dealer_resources", "quote"]);

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
    return sanitizeSlugSet(["partner_quote", "dealer_resources", "quote"]);
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
    sales: ["sales", "quote", "reports"],
    production: ["production", "shop_tv", "reports"],
    shop_tv: ["shop_tv"],
    installer: ["install"],
    purchasing: ["purchasing"],
    accounting: ["finance", "reports"],
    finance: ["finance", "reports"],
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

/** @typedef {{ slug: string, label: string, description: string, href: string, category: string, enabled: boolean, visibilityReason: 'assigned' | 'role_default' | 'admin_roadmap' }} LauncherHeadRow */

/** @returns {LauncherHeadRow[]} */
function headsForAdmin(openGrantSet, usedExplicitAssigns, explicitDbGrantSet) {
  return HEAD_LAUNCHER_CATALOG.map((row) => {
    const slug = row.slug;
    const enabled = openGrantSet.has(slug);
    /** @type {'assigned' | 'role_default' | 'admin_roadmap'} */
    let visibilityReason = "admin_roadmap";
    if (enabled) {
      visibilityReason =
        usedExplicitAssigns ?
          explicitDbGrantSet.has(slug) ? "assigned"
          : /** explicit rows exist but this slug cleared via mismatch — uncommon */ "role_default"
        : "role_default";
    }
    return {
      slug,
      label: row.label,
      description: row.description,
      href: row.href,
      category: row.category,
      enabled,
      visibilityReason
    };
  });
}

/** Internal non-admin (and executives, etc.) — launcher rows strictly match access; no roadmap cards. */
/** @returns {LauncherHeadRow[]} */
function headsForInternalNonRoadmap(openGrantSet, usedExplicitAssigns) {
  return HEAD_LAUNCHER_CATALOG.filter((row) => openGrantSet.has(row.slug)).map((row) => ({
    slug: row.slug,
    label: row.label,
    description: row.description,
    href: row.href,
    category: row.category,
    enabled: true,
    visibilityReason: /** when rows exist everything shown is attributable to assignments */
      usedExplicitAssigns ? "assigned" : "role_default"
  }));
}

/** Dealer / partner portfolio — curated slugs only, no internals, no roadmap. */
/** @returns {LauncherHeadRow[]} */
function headsForDealerPortfolio(openGrantSet, usedExplicitAssigns, explicitDealerSubsetForVisibility) {
  const slugOrder = HEAD_LAUNCHER_CATALOG.map((r) => r.slug).filter((s) => DEALER_VISIBLE_SLUGS.has(s));
  const visible =
    usedExplicitAssigns ?
      slugOrder.filter((s) => explicitDealerSubsetForVisibility.has(s))
    : [...slugOrder];

  return visible.map((slug) => {
    const row = HEAD_LAUNCHER_CATALOG.find((c) => c.slug === slug);
    if (!row) throw new Error(`launcher catalog missing dealer slug "${slug}"`);
    const r = row;
    return {
      slug: r.slug,
      label: r.label,
      description: r.description,
      href: r.href,
      category: r.category,
      enabled: openGrantSet.has(slug),
      visibilityReason: usedExplicitAssigns ? "assigned" : "role_default"
    };
  });
}

/**
 * @param {ReturnType<import("@supabase/supabase-js").createClient>} supabase
 * @param {{ id: string, email?: string, role?: string, isActive?: boolean }} reqUser — from attachUser (`req.user`)
 */
export async function buildMeHeadsPayload(supabase, reqUser) {
  const id = pickStr(reqUser?.id);
  const email = pickStr(reqUser?.email);
  const role = pickStr(reqUser?.role ?? "viewer");
  const active = reqUser?.isActive !== false;

  if (!id) {
    return {
      ok: false,
      error: "missing_user",
      heads: [],
      user: null
    };
  }

  if (!active) {
    return {
      ok: true,
      inactive: true,
      user: {
        id,
        email,
        role,
        userKind: "internal"
      },
      heads: []
    };
  }

  const { data: prof, error: pe } = await supabase.from("user_profiles").select("user_kind").eq("id", id).maybeSingle();

  const userKind = pe ? "internal" : pickStr(prof?.user_kind || "internal") || "internal";
  const dealer = userKind === "dealer_partner";

  /** @type {Set<string>} */
  let explicitDbGrantSet = new Set();
  try {
    const { data: rows } = await supabase.from("user_head_access").select("head_slug").eq("user_id", id);
    explicitDbGrantSet = sanitizeSlugSet((rows ?? []).map((r) => r.head_slug));
  } catch {
    explicitDbGrantSet = new Set();
  }

  /** Dealer-only assigns after clamping junk internal slugs away from payloads. */
  const explicitDealerSubset = intersectDealerSlugs(explicitDbGrantSet);

  const usedExplicitAssigns = explicitDbGrantSet.size > 0;

  /** Slugs treated as actionable / launcher-enabled (differs per cohort). Replaces defaults when DB rows exist. */
  /** @type {Set<string>} */
  let actionableGrantSet;
  if (!dealer) {
    actionableGrantSet = usedExplicitAssigns ? new Set(explicitDbGrantSet) : defaultSlugSet(role, userKind);
  } else if (usedExplicitAssigns) {
    actionableGrantSet = new Set(explicitDealerSubset);
  } else {
    actionableGrantSet = intersectDealerSlugs(defaultSlugSet(role, userKind));
  }

  /** Dealer attempted internal-only assigns — no dealer-visible slug survived clamping → empty launcher (secure). */
  if (usedExplicitAssigns && dealer && explicitDbGrantSet.size > 0 && explicitDealerSubset.size === 0) {
    return {
      ok: true,
      user: {
        id,
        email,
        role,
        userKind
      },
      heads: []
    };
  }

  const adminRole = isAdminRole(role);

  /** @type {LauncherHeadRow[]} */
  let heads;

  if (adminRole && !dealer) {
    heads = headsForAdmin(actionableGrantSet, usedExplicitAssigns, explicitDbGrantSet);
  } else if (dealer) {
    heads = headsForDealerPortfolio(actionableGrantSet, usedExplicitAssigns, explicitDealerSubset);
  } else {
    heads = headsForInternalNonRoadmap(actionableGrantSet, usedExplicitAssigns);
  }

  return {
    ok: true,
    user: {
      id,
      email,
      role,
      userKind
    },
    heads
  };
}

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}
