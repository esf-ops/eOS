const FAVORITES_KEY = "slabos-ai-favorites-v1";
const HISTORY_KEY = "slabos-ai-history-v1";
const THEME_KEY = "slabos-ai-theme-v1";

export type HistoryEntry = {
  id: string;
  toolId: string;
  toolSlug: string;
  toolTitle: string;
  title: string;
  result: string;
  timestamp: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getFavorites(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function setFavorites(ids: string[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export function toggleFavorite(toolId: string): string[] {
  const current = getFavorites();
  const next = current.includes(toolId)
    ? current.filter((id) => id !== toolId)
    : [...current, toolId];
  setFavorites(next);
  return next;
}

export function getHistory(): HistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry) {
  if (!canUseStorage()) return;
  const prev = getHistory().filter((h) => h.id !== entry.id);
  const next = [entry, ...prev].slice(0, 40);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export type ThemeMode = "light" | "dark" | "system";

export function getStoredTheme(): ThemeMode {
  if (!canUseStorage()) return "system";
  const v = localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function setStoredTheme(mode: ThemeMode) {
  if (!canUseStorage()) return;
  localStorage.setItem(THEME_KEY, mode);
}
