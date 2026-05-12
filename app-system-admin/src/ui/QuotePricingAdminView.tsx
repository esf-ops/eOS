import React, { useState } from "react";
import QuotePricingAdminPlaceholder from "./QuotePricingAdminPlaceholder";
import QuoteTerritoriesAdmin from "./QuoteTerritoriesAdmin";

export default function QuotePricingAdminView({ token }: { token: string }) {
  const [tab, setTab] = useState<"overview" | "territories">("overview");
  return (
    <div className="quote-pricing-admin-view">
      <div className="subnav-tabs">
        <button type="button" className={`btn ${tab === "overview" ? "btn-primary" : ""}`} onClick={() => setTab("overview")}>
          Overview &amp; APIs
        </button>
        <button type="button" className={`btn ${tab === "territories" ? "btn-primary" : ""}`} onClick={() => setTab("territories")}>
          Sales territories
        </button>
      </div>
      {tab === "overview" ? <QuotePricingAdminPlaceholder token={token} /> : <QuoteTerritoriesAdmin token={token} />}
    </div>
  );
}
