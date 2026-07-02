import React, { useMemo } from "react";
import { config } from "../../lib/config";
import { useSalesDashboard } from "./SalesDashboardContext";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";
const ELITE_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

function workspaceInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

/** Shared hero shell — hidden on Command Center (that tab has its own premium header). */
export default function SalesAppHero() {
  const { activeTab } = useSalesDashboard();
  const workspaceName = DEFAULT_WORKSPACE_NAME;
  const workspaceShortId = DEFAULT_WORKSPACE_SHORT;
  const workspaceLogoUrl = ELITE_LOGO_URL;
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  if (activeTab === "command_center") return null;

  return (
    <section className="eos-hero" aria-labelledby="sales-hero-title">
      <div className="eos-hero-aurora" aria-hidden />
      <div className="eos-hero-grid">
        <div className="eos-hero-main">
          <p className="eos-hero-eyebrow">Internal tool · Sales Dashboard</p>
          <h1 id="sales-hero-title" className="eos-hero-title">
            Sales Command Center
          </h1>
          <p className="eos-hero-sub">
            Executive cockpit for <strong>Moraware production</strong>, <strong>Quote Library pipeline</strong>,{" "}
            <strong>forecast signals</strong>, and <strong>Elite 100 mix</strong> — synced through eliteOS Brain,
            filterable and drillable in one place.
          </p>
          <div className="eos-hero-chips">
            <span className="eos-hero-chip eos-hero-chip--info">
              <strong>Source ·</strong> Moraware sync · Quote Library
            </span>
            <span className="eos-hero-chip eos-hero-chip--warn">
              <strong>Trust ·</strong> Branch / rep gated by approved Sales Account Mapping
            </span>
            <span className="eos-hero-chip">
              <strong>API ·</strong> <code>{config.backendBaseUrl || "(same origin)"}</code>
            </span>
          </div>
        </div>

        <aside className="eos-hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
          <p className="eos-hero-workspace-eyebrow">Workspace</p>
          <div className="eos-hero-workspace-card">
            <div className="eos-hero-workspace-mark">
              <img
                src={workspaceLogoUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                    ".eos-hero-workspace-initials"
                  ) as HTMLElement | null;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <span className="eos-hero-workspace-initials" aria-hidden="true" style={{ display: "none" }}>
                {workspaceInitialsValue}
              </span>
            </div>
            <div className="eos-hero-workspace-text">
              <p className="eos-hero-workspace-name">{workspaceName}</p>
              <p className="eos-hero-workspace-meta">
                <span>on </span>
                <span className="eos-hero-workspace-platform">eliteOS</span>
                <span className="eos-hero-workspace-sep" aria-hidden>
                  ·
                </span>
                <span>{workspaceShortId}</span>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
