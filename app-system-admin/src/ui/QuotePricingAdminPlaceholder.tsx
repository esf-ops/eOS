import React, { useEffect, useState } from "react";

import { ApiError, apiFetch } from "../lib/api";

type SaasStatus = {
  ok?: boolean;
  current_organization_display_name?: string;
  saas_foundation_installed?: boolean;
  warnings?: string[];
};

/**
 * Placeholder until full Quote Pricing Admin grids ship.
 * Backend: backend-core/src/quotes/quotePricingAdminApi.js
 */
export default function QuotePricingAdminPlaceholder({ token }: { token: string }) {
  const [saas, setSaas] = useState<SaasStatus | null>(null);
  const [saasErr, setSaasErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await apiFetch("/api/admin/saas-foundation-status", { token })) as SaasStatus;
        if (!cancelled) {
          setSaas(r);
          setSaasErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSaas(null);
          setSaasErr(e instanceof ApiError ? e.message : "Unable to load SaaS foundation status.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const installed = saas?.saas_foundation_installed === true;
  const orgLabel = saas?.current_organization_display_name || "Elite Stone Fabrication";

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Quote pricing (preview)</h2>

      <div className="drawer-section" style={{ marginBottom: 16 }}>
        <h4>SaaS readiness (foundation)</h4>
        <p className="muted" style={{ marginTop: 4 }}>
          Current organization: <strong>{orgLabel}</strong>
        </p>
        <p className="muted" style={{ marginTop: 4 }}>
          SaaS foundation (organizations table + default Elite row):{" "}
          <strong>{saasErr ? "unknown" : installed ? "ready" : "pending"}</strong>
          {saasErr ? <span> — {saasErr}</span> : null}
        </p>
        {(saas?.warnings?.length ?? 0) > 0 ? (
          <p className="muted" style={{ marginTop: 4 }}>
            Notes: {saas?.warnings?.join(" · ")}
          </p>
        ) : null}
        <p className="muted" style={{ marginBottom: 0 }}>
          Future admin: organization settings, public quote branding, Monday integration config, branches, material/pricing
          per org, territory routing per org.
        </p>
      </div>

      <p className="muted">
        Planning doc: <code>docs/quote-platform/pricing-admin-head-plan.md</code> — spreadsheet-style editors, filters, and
        partner assignment UI will connect to the admin APIs below. Public homeowner wizard stays out of scope here.
      </p>
      <p className="muted">
        Future <strong>Quote Catalog Admin</strong> (programs, SKUs, media, visibility):{" "}
        <code>docs/quote-platform/quote-catalog-admin-architecture.md</code> · SQL{" "}
        <code>backend-core/supabase/eos_quote_catalog_schema.sql</code>
      </p>
      <div className="drawer-section">
        <h4>Admin API (system_admin + admin role)</h4>
        <ul className="muted" style={{ lineHeight: 1.6 }}>
          <li>GET/PATCH /api/admin/quote-pricing-structures (+ /:id), POST /api/admin/quote-pricing-structures</li>
          <li>GET/PATCH /api/admin/quote-pricing-rules (+ /:id), POST /api/admin/quote-pricing-rules</li>
          <li>GET/PATCH /api/admin/quote-partners (+ /:id), POST /api/admin/quote-partners</li>
          <li>GET/POST /api/admin/quote-partners/:id/pricing-assignment</li>
          <li>GET /api/admin/quote-analytics/summary</li>
          <li>GET /api/admin/saas-foundation-status</li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          <strong>Public retail</strong> structures must keep <code>retail_markup_percent ≥ 25</code> (enforced in API and DB).
          Prefer soft-deactivate (<code>is_active: false</code>) instead of deleting rules or structures.
        </p>
      </div>

      <div className="drawer-section">
        <h4>Pricing Admin coverage (wired vs next)</h4>
        <ul className="muted" style={{ lineHeight: 1.65 }}>
          <li>
            <strong>Wired — read/write APIs:</strong> quote_pricing_structures, quote_pricing_rules, quote_partner_accounts,
            quote_partner_pricing_assignments, quote_source_configs, quote_sales_territories; quote analytics summary.
          </li>
          <li>
            <strong>Next — UI:</strong> spreadsheet-style editors for rules, partner assignment flows, catalog/program SKUs
            (when quote catalog tables are populated), vanity/shower/sink/faucet/outlet rows as dedicated grids.
          </li>
          <li>
            <strong>Public retail protection:</strong> Admin UI should keep structures at or above 25% markup — the backend rejects
            lower values for <code>pricing_mode = public_retail</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
