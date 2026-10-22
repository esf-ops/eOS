import { useCallback, useEffect, useMemo, useState } from "react";
import { classifyFreshness } from "../lib/eccModel.mjs";
import { buildCustomers } from "../lib/workspaceModel.mjs";
import CommandCenter from "./CommandCenter";
import { CustomerDetail, CustomerList } from "./Customers";
import ProjectDetail from "./ProjectDetail";
import QuotesJobs from "./QuotesJobs";

export type Dataset = {
  mode: "fixture" | "live";
  asOf: string;
  sources: Array<{
    key: string;
    label: string;
    authority: string;
    table: string;
    lastSuccessAt: string | null;
    staleAfterHours: number | null;
    kind?: string;
    cadence: string;
  }>;
  opportunities: any[];
  customers: any[];
};

export type Period = { key: string; label: string; from: string; to: string };
export type DrillTarget = { kind: "projects" | "customers"; label: string; ids: string[] };

const PERIODS: Period[] = [
  { key: "sep", label: "September 2026", from: "2026-09-01", to: "2026-09-30" },
  { key: "aug", label: "August 2026", from: "2026-08-01", to: "2026-08-31" },
  { key: "q3", label: "Q3 2026", from: "2026-07-01", to: "2026-09-30" },
  { key: "oct", label: "October 2026 (to date)", from: "2026-10-01", to: "2026-10-31" },
];

type Route = { view: "command" | "jobs" | "customers"; id: string | null };

function parseHash(hash: string): Route {
  const [view, ...rest] = hash.replace(/^#\/?/, "").split("/");
  const id = rest.length ? decodeURIComponent(rest.join("/")) : null;
  if (view === "jobs" || view === "customers") return { view, id };
  return { view: "command", id: null };
}

const TABS: Array<{ view: Route["view"]; label: string }> = [
  { view: "command", label: "Command Center" },
  { view: "customers", label: "Customers" },
  { view: "jobs", label: "Quotes & Jobs" },
];

export default function Workspace({ dataset }: { dataset: Dataset }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [periodKey, setPeriodKey] = useState("sep");
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((view: Route["view"], id: string | null = null) => {
    window.location.hash = id ? `#/${view}/${encodeURIComponent(id)}` : `#/${view}`;
    window.scrollTo({ top: 0 });
  }, []);

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0];
  const freshness = useMemo(
    () => Object.fromEntries(dataset.sources.map((s) => [s.key, classifyFreshness(s, dataset.asOf)])),
    [dataset],
  );
  const customers = useMemo(() => buildCustomers(dataset.opportunities, dataset.customers, dataset.asOf), [dataset]);
  const customerKeyFor = useCallback((projectId: string) => customers.find((c) => c.projectIds.includes(projectId))?.key ?? null, [customers]);

  const onDrill = (target: DrillTarget) => {
    setDrill(target);
    go(target.kind === "customers" ? "customers" : "jobs");
  };

  const project = route.view === "jobs" && route.id ? dataset.opportunities.find((o) => o.id === route.id) : null;
  const customer = route.view === "customers" && route.id ? customers.find((c) => c.key === route.id) : null;

  return (
    <div className="ecc-page">
      {dataset.mode === "fixture" ? (
        <div className="ecc-banner warn" role="status">
          <strong>Prototype — fixture data.</strong> Customers, projects and amounts are synthetic. Source freshness reflects the real
          production sync state observed {new Date(dataset.asOf).toLocaleDateString()}. Read-only; QuickBooks and Moraware writes are off.
        </div>
      ) : null}

      <header className="ecc-hero">
        <div>
          <p className="ecc-kicker">slabOS workspace</p>
          <h1>Customers, quotes, jobs and receivables</h1>
          <p className="ecc-lead">One customer and project identity across views. QuickBooks owns quotes and money; Moraware owns production.</p>
        </div>
        <label className="ecc-field">
          Period
          <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="ecc-tabs" aria-label="Workspace views">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            className={`ecc-tab ${route.view === t.view ? "active" : ""}`}
            aria-current={route.view === t.view ? "page" : undefined}
            onClick={() => go(t.view)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {route.view === "command" ? (
        <CommandCenter
          dataset={dataset}
          customers={customers}
          period={period}
          freshness={freshness}
          onDrill={onDrill}
          onOpenProject={(id) => go("jobs", id)}
        />
      ) : null}

      {route.view === "jobs" && project ? (
        <ProjectDetail opp={project} customers={customers} asOf={dataset.asOf} onBack={() => go("jobs")} onOpenCustomer={(k) => go("customers", k)} />
      ) : null}
      {route.view === "jobs" && !route.id ? (
        <QuotesJobs
          dataset={dataset}
          period={period}
          drill={drill}
          onClearDrill={() => setDrill(null)}
          onOpenProject={(id) => go("jobs", id)}
          onOpenCustomer={(k) => go("customers", k)}
          customerKeyFor={customerKeyFor}
        />
      ) : null}

      {route.view === "customers" && customer ? (
        <CustomerDetail customer={customer} opps={dataset.opportunities} asOf={dataset.asOf} onBack={() => go("customers")} onOpenProject={(id) => go("jobs", id)} />
      ) : null}
      {route.view === "customers" && !route.id ? (
        <CustomerList customers={customers} drill={drill} onClearDrill={() => setDrill(null)} onOpenCustomer={(k) => go("customers", k)} />
      ) : null}

      {route.id && !project && !customer ? <p className="ecc-muted">That record is not in this dataset.</p> : null}
    </div>
  );
}
