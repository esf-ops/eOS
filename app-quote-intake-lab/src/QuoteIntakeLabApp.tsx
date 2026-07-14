import { useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import CaseDetailPanel from "./components/CaseDetailPanel";
import IsolationBanner from "./components/IsolationBanner";
import QueueFilters from "./components/QueueFilters";
import QueueSummaryHeader from "./components/QueueSummaryHeader";
import QueueTable from "./components/QueueTable";
import type { QuoteIntakeCase, QuoteIntakeFilter, QuoteIntakeStatusCounts } from "./domain/types";
import { FIXTURE_IDENTITY, resolveLabIdentity, type LabIdentity } from "./lib/identity";
import { getQuoteIntakeRepository } from "./repository/getQuoteIntakeRepository";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const EMPTY_COUNTS: QuoteIntakeStatusCounts = {
  new: 0,
  processing: 0,
  ready_for_review: 0,
  missing_information: 0,
  manual_review: 0,
  approved_ready: 0,
  sent_simulated: 0,
  total: 0
};

function homeHref(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

export default function QuoteIntakeLabApp() {
  const repo = useMemo(() => getQuoteIntakeRepository(), []);
  const [identity, setIdentity] = useState<LabIdentity>(FIXTURE_IDENTITY);
  const [filter, setFilter] = useState<QuoteIntakeFilter>({ missingInfo: "any" });
  const [cases, setCases] = useState<QuoteIntakeCase[]>([]);
  const [counts, setCounts] = useState<QuoteIntakeStatusCounts>(EMPTY_COUNTS);
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [estimators, setEstimators] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuoteIntakeCase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    resolveLabIdentity().then((id) => {
      if (!cancelled) setIdentity(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [list, statusCounts, sales, est] = await Promise.all([
        repo.listCases(filter),
        repo.getStatusCounts({
          search: filter.search,
          priority: filter.priority,
          salesperson: filter.salesperson,
          estimator: filter.estimator,
          ageBucket: filter.ageBucket,
          missingInfo: filter.missingInfo
        }),
        repo.listSalespeople(),
        repo.listEstimators()
      ]);
      if (cancelled) return;
      setCases(list as QuoteIntakeCase[]);
      setCounts(statusCounts);
      setSalespeople(sales);
      setEstimators(est);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, filter]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSelected(null);
      return;
    }
    repo.getCase(selectedId).then((c) => {
      if (!cancelled) setSelected(c as QuoteIntakeCase | null);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, selectedId]);

  const menuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Home Launcher",
      meta: "Opens production Home (not wired into this lab)",
      href: homeHref()
    },
    {
      label: "Identity mode",
      meta: "Fixture identity (no Brain /api/me · Supabase deferred)",
      disabled: true
    }
  ];

  return (
    <div className="qil-app">
      <EliteosTopbar
        appName="Quote Intake Lab"
        organizationName="Elite Stone Fabrication"
        logoSrc={EOS_LOGO_URL}
        homeHref={homeHref()}
        userName={identity.displayName}
        userEmail={identity.email}
        userSubtitle={identity.subtitle}
        initials={identity.initials}
        menuItems={menuItems}
        statusSlot={<span className="qil-topbar-lab-chip">Fixture data only</span>}
      />

      <IsolationBanner />

      <main className={`qil-main${selectedId ? " has-detail" : ""}`}>
        <div className="qil-queue">
          <QueueSummaryHeader
            counts={counts}
            activeBucket={filter.summaryBucket ?? ""}
            onSelectBucket={(bucket) => setFilter((f) => ({ ...f, summaryBucket: bucket || undefined }))}
          />

          <QueueFilters
            filter={filter}
            salespeople={salespeople}
            estimators={estimators}
            onChange={(next) => setFilter(next)}
          />

          {loading ? <div className="qil-loading">Loading fixture queue…</div> : null}

          <QueueTable
            cases={cases}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          />
        </div>

        <CaseDetailPanel caseItem={selected} onClose={() => setSelectedId(null)} />
      </main>
    </div>
  );
}
