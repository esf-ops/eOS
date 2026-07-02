import type { DashboardFilters } from "./salesDashboardTypes";
import type { DashboardViewDefinition } from "./salesDashboardPresets";

export type UserSavedView = {
  id: string;
  label: string;
  filters: Partial<DashboardFilters>;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "eliteos-sales-saved-views-v1";

function readStore(): UserSavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserSavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(views: UserSavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function loadUserSavedViews(): UserSavedView[] {
  return readStore().sort((a, b) => a.label.localeCompare(b.label));
}

export function saveUserView(label: string, filters: Partial<DashboardFilters>): UserSavedView {
  const now = new Date().toISOString();
  const view: UserSavedView = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim() || "Saved view",
    filters,
    createdAt: now,
    updatedAt: now
  };
  const next = [...readStore(), view];
  writeStore(next);
  return view;
}

export function renameUserView(id: string, label: string): UserSavedView | null {
  const views = readStore();
  const idx = views.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  views[idx] = { ...views[idx], label: label.trim() || views[idx].label, updatedAt: new Date().toISOString() };
  writeStore(views);
  return views[idx];
}

export function deleteUserView(id: string): void {
  writeStore(readStore().filter((v) => v.id !== id));
}

export function viewDefinitionFromUser(view: UserSavedView): DashboardViewDefinition {
  return { id: view.id, label: view.label, filters: view.filters };
}

/** Compare active filters to a saved view (ignores page). */
export function filtersMatchView(filters: DashboardFilters, viewFilters: Partial<DashboardFilters>): boolean {
  const keys = new Set([...Object.keys(viewFilters), ...Object.keys(filters)]) as Set<keyof DashboardFilters>;
  for (const key of keys) {
    if (key === "page" || key === "pageSize") continue;
    const a = filters[key];
    const b = viewFilters[key];
    if (b === undefined) continue;
    if (typeof a === "boolean" || typeof b === "boolean") {
      if (Boolean(a) !== Boolean(b)) return false;
      continue;
    }
    const sa = String(a ?? "").trim();
    const sb = String(b ?? "").trim();
    if (sa !== sb) return false;
  }
  return true;
}

export function snapshotFiltersForView(filters: DashboardFilters): Partial<DashboardFilters> {
  const { page: _p, pageSize: _ps, ...rest } = filters;
  return { ...rest, page: 1 };
}
