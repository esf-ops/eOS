import React, { useMemo, useState } from "react";
import { MANAGER_PRESETS } from "../../lib/salesDashboardPresets";
import { viewDefinitionFromUser } from "../../lib/salesDashboardSavedViews";
import { useSalesDashboard } from "./SalesDashboardContext";

export default function SalesViewsBar() {
  const {
    activeViewId,
    activeViewDirty,
    userSavedViews,
    applyView,
    saveCurrentView,
    renameSavedView,
    deleteSavedView,
    resetToDefaultView
  } = useSalesDashboard();

  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageLabel, setManageLabel] = useState("");

  const savedDefs = useMemo(() => userSavedViews.map(viewDefinitionFromUser), [userSavedViews]);
  const presetIds = useMemo(() => new Set(MANAGER_PRESETS.map((p) => p.id)), []);

  function chipClass(id: string) {
    const on = activeViewId === id;
    const dirty = on && activeViewDirty;
    return `sd-view-chip${on ? " is-on" : ""}${dirty ? " is-dirty" : ""}`;
  }

  function handleSave() {
    const label = saveLabel.trim();
    if (!label) return;
    saveCurrentView(label);
    setSaveLabel("");
    setSaveOpen(false);
  }

  function handleRename(id: string) {
    const label = manageLabel.trim();
    if (!label) return;
    renameSavedView(id, label);
    setManageId(null);
    setManageLabel("");
  }

  return (
    <div className="sd-views-bar">
      <div className="sd-views-row">
        <span className="sd-views-label">Views</span>
        <div className="sd-views-chips">
          {MANAGER_PRESETS.slice(0, 6).map((view) => (
            <button key={view.id} type="button" className={chipClass(view.id)} onClick={() => applyView(view)} title={view.description}>
              {view.label}
            </button>
          ))}
          {savedDefs.map((view) => (
            <button key={view.id} type="button" className={chipClass(view.id)} onClick={() => applyView(view)}>
              {view.label}
              {!presetIds.has(view.id) ? (
                <span
                  className="sd-view-chip-manage"
                  role="button"
                  tabIndex={0}
                  aria-label={`Manage ${view.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setManageId(view.id);
                    setManageLabel(view.label);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setManageId(view.id);
                      setManageLabel(view.label);
                    }
                  }}
                >
                  ···
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="sd-views-actions">
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => setMenuOpen((o) => !o)}>
            All views
          </button>
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => setSaveOpen((o) => !o)}>
            Save current view
          </button>
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={resetToDefaultView}>
            Reset to default
          </button>
        </div>
      </div>

      {activeViewDirty ? (
        <p className="sd-views-dirty-hint">Filters differ from the selected view — save as new or reset to default.</p>
      ) : null}

      {menuOpen ? (
        <div className="sd-views-menu">
          <p className="sd-views-menu-title">Manager presets</p>
          <div className="sd-views-menu-grid">
            {MANAGER_PRESETS.map((view) => (
              <button key={view.id} type="button" className="sd-views-menu-item" onClick={() => { applyView(view); setMenuOpen(false); }}>
                {view.label}
              </button>
            ))}
          </div>
          {savedDefs.length ? (
            <>
              <p className="sd-views-menu-title">Your saved views</p>
              <div className="sd-views-menu-grid">
                {savedDefs.map((view) => (
                  <button key={view.id} type="button" className="sd-views-menu-item" onClick={() => { applyView(view); setMenuOpen(false); }}>
                    {view.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {saveOpen ? (
        <div className="sd-views-save">
          <input
            type="text"
            placeholder="View name…"
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
            aria-label="Saved view name"
          />
          <button type="button" className="sd-btn sd-btn--primary sd-btn--sm" onClick={handleSave} disabled={!saveLabel.trim()}>
            Save
          </button>
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => setSaveOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      {manageId ? (
        <div className="sd-views-save">
          <input
            type="text"
            value={manageLabel}
            onChange={(e) => setManageLabel(e.target.value)}
            aria-label="Rename saved view"
          />
          <button type="button" className="sd-btn sd-btn--primary sd-btn--sm" onClick={() => handleRename(manageId)}>
            Rename
          </button>
          <button
            type="button"
            className="sd-btn sd-btn--ghost sd-btn--sm"
            onClick={() => {
              deleteSavedView(manageId);
              setManageId(null);
            }}
          >
            Delete
          </button>
          <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => setManageId(null)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
