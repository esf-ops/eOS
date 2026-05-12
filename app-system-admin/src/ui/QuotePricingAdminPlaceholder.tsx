import React from "react";

/**
 * Placeholder until full Quote Pricing Admin grids ship.
 * Backend: backend-core/src/quotes/quotePricingAdminApi.js
 */
export default function QuotePricingAdminPlaceholder() {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Quote pricing (preview)</h2>
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
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          <strong>Public retail</strong> structures must keep <code>retail_markup_percent ≥ 25</code> (enforced in API and DB).
          Prefer soft-deactivate (<code>is_active: false</code>) instead of deleting rules or structures.
        </p>
      </div>
    </div>
  );
}
