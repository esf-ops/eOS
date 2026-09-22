"use client";

import { useEffect, useState } from "react";
import {
  getFavorites,
  getHistory,
  getStoredTheme,
  pushHistory,
  setStoredTheme,
  toggleFavorite,
  type HistoryEntry,
  type ThemeMode,
} from "@/lib/storage/preferences";

export function useFavorites() {
  const [favorites, setFavoritesState] = useState<string[]>([]);

  useEffect(() => {
    setFavoritesState(getFavorites());
  }, []);

  function toggle(toolId: string) {
    const next = toggleFavorite(toolId);
    setFavoritesState(next);
    return next;
  }

  return { favorites, toggle, isFavorite: (id: string) => favorites.includes(id) };
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  function add(entry: HistoryEntry) {
    pushHistory(entry);
    setHistory(getHistory());
  }

  return { history, add };
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setMode(stored);
    applyTheme(stored);
  }, []);

  function setTheme(next: ThemeMode) {
    setMode(next);
    setStoredTheme(next);
    applyTheme(next);
  }

  return { mode, setTheme };
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
}
