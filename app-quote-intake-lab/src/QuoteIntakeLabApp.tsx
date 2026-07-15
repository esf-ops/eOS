import { useCallback, useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import CaseDetailPanel from "./components/CaseDetailPanel";
import IsolationBanner from "./components/IsolationBanner";
import LabDataControls from "./components/LabDataControls";
import QueueFilters from "./components/QueueFilters";
import QueueSummaryHeader from "./components/QueueSummaryHeader";
import QueueTable from "./components/QueueTable";
import ImportEmailModal from "./components/import/ImportEmailModal";
import TakeoffReviewWorkspace from "./components/takeoff/TakeoffReviewWorkspace";
import type { QuoteIntakeAttachment, QuoteIntakeCase, QuoteIntakeFilter, QuoteIntakeStatusCounts } from "./domain/types";
import { FIXTURE_IDENTITY, resolveLabIdentity, type LabIdentity } from "./lib/identity";
import { getLocalQuoteIntakeRepository } from "./repository/LocalQuoteIntakeRepository.mjs";
import { takeoffTopbarChipLabel } from "./takeoff/takeoffWorkspaceProvenance.mjs";

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
  const repo = useMemo(() => getLocalQuoteIntakeRepository(), []);
  const [identity, setIdentity] = useState<LabIdentity>(FIXTURE_IDENTITY);
  const [filter, setFilter] = useState<QuoteIntakeFilter>({ missingInfo: "any" });
  const [cases, setCases] = useState<QuoteIntakeCase[]>([]);
  const [counts, setCounts] = useState<QuoteIntakeStatusCounts>(EMPTY_COUNTS);
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [estimators, setEstimators] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuoteIntakeCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [takeoffCaseId, setTakeoffCaseId] = useState<string | null>(null);
  const [takeoffCase, setTakeoffCase] = useState<QuoteIntakeCase | null>(null);
  const [takeoffWorkspaceMode, setTakeoffWorkspaceMode] = useState<"simulated" | "live">("simulated");

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

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
      await repo.ready();
      const [list, statusCounts, sales, est, imported] = await Promise.all([
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
        repo.listEstimators(),
        repo.countImported()
      ]);
      if (cancelled) return;
      setCases(list as QuoteIntakeCase[]);
      setCounts(statusCounts);
      setSalespeople(sales);
      setEstimators(est);
      setImportedCount(imported);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, filter, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSelected(null);
      return;
    }
    repo.getCase(selectedId).then((c: QuoteIntakeCase | null) => {
      if (!cancelled) setSelected(c);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, selectedId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    if (!takeoffCaseId) {
      setTakeoffCase(null);
      return;
    }
    repo.getCase(takeoffCaseId).then((c: QuoteIntakeCase | null) => {
      if (!cancelled) setTakeoffCase(c);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, takeoffCaseId, reloadToken]);

  useEffect(() => {
    if (!selectedId && !importOpen && !takeoffCaseId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (importOpen) setImportOpen(false);
        else if (takeoffCaseId) setTakeoffCaseId(null);
        else setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, importOpen, takeoffCaseId]);

  async function downloadAttachment(caseId: string, attachment: QuoteIntakeAttachment) {
    const bytes = await repo.getAttachmentBytes(caseId, attachment.id);
    if (!bytes) return;
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
      type: attachment.contentType || "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename || "attachment.bin";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    }
  }

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

  const detailOpen = Boolean(selectedId && selected && !takeoffCaseId);
  const takeoffOpen = Boolean(takeoffCaseId && takeoffCase);
  const takeoffChip = takeoffTopbarChipLabel(takeoffWorkspaceMode);
  const isolationVariant = !takeoffOpen
    ? "default"
    : takeoffWorkspaceMode === "live"
      ? "takeoff-live"
      : "takeoff-simulated";

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
        statusSlot={
          <span className={`qil-topbar-lab-chip${takeoffOpen && takeoffWorkspaceMode === "live" ? " is-live" : ""}`}>
            {takeoffOpen ? takeoffChip : "Fixture + local imports only"}
          </span>
        }
      />

      <IsolationBanner variant={isolationVariant} />

      {takeoffOpen && takeoffCase ? (
        <main className="qil-main qil-main-takeoff">
          <TakeoffReviewWorkspace
            caseItem={takeoffCase}
            repo={repo}
            actorLabel={identity.displayName}
            onBackToQueue={() => {
              setTakeoffCaseId(null);
              setTakeoffWorkspaceMode("simulated");
              refresh();
            }}
            onCaseMutated={refresh}
            onWorkspaceModeChange={setTakeoffWorkspaceMode}
          />
        </main>
      ) : (
        <main className={`qil-main${detailOpen ? " has-detail" : ""}`}>
          <section className="qil-queue" aria-label="Estimator queue">
            <div className="qil-queue-chrome">
              <QueueSummaryHeader
                counts={counts}
                activeBucket={filter.summaryBucket ?? ""}
                onSelectBucket={(bucket) => setFilter((f) => ({ ...f, summaryBucket: bucket || undefined }))}
                importedCount={importedCount}
                onImportClick={() => setImportOpen(true)}
                toolbar={
                  <LabDataControls
                    importedCount={importedCount}
                    onClearImported={async () => {
                      await repo.clearImported();
                      setSelectedId(null);
                      setTakeoffCaseId(null);
                      refresh();
                    }}
                  />
                }
              />

              <QueueFilters
                filter={filter}
                salespeople={salespeople}
                estimators={estimators}
                onChange={(next) => setFilter(next)}
              />

              {loading ? <div className="qil-loading">Loading lab queue…</div> : null}
            </div>

            <div className="qil-queue-body">
              <QueueTable
                cases={cases}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
              />
            </div>
          </section>

          {detailOpen ? (
            <>
              <button
                type="button"
                className="qil-detail-backdrop"
                aria-label="Close case detail"
                onClick={() => setSelectedId(null)}
              />
              <CaseDetailPanel
                caseItem={selected}
                onClose={() => setSelectedId(null)}
                onDownloadAttachment={downloadAttachment}
                repo={repo}
                actorLabel={identity.displayName}
                onCaseMutated={refresh}
                onOpenTakeoffReview={(caseId) => {
                  setTakeoffCaseId(caseId);
                  setSelectedId(null);
                }}
              />
            </>
          ) : null}
        </main>
      )}

      <ImportEmailModal
        open={importOpen}
        repo={repo}
        importActor={identity.displayName}
        onClose={() => setImportOpen(false)}
        onImported={() => refresh()}
        onOpenCase={(caseId) => {
          setSelectedId(caseId);
          setImportOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
