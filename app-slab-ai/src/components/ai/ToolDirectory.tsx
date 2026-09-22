"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ToolCard } from "./ToolCard";
import { CATEGORY_LABELS, NAV_CATEGORIES, type ToolCategory } from "@/lib/ai-tools/types";
import { searchClientTools } from "@/lib/ai-tools/client-catalog";
import { cn } from "@/lib/utils";

type Props = {
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  initialCategory?: ToolCategory | "all";
  heading?: string;
  showFilters?: boolean;
};

export function ToolDirectory({
  favorites,
  onToggleFavorite,
  initialCategory = "all",
  heading = "All tools",
  showFilters = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategory | "all">(initialCategory);

  const results = useMemo(() => searchClientTools(query, category), [query, category]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--fg)]">{heading}</h2>
          <p className="mt-1 text-sm text-[var(--fg-secondary)]">
            Specialized AI coworkers for stone fabrication — searchable and expandable.
          </p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search tools</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-fg)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, category, keyword…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--fg)] outline-none ring-[var(--accent)] placeholder:text-[var(--muted-fg)] focus:ring-2"
          />
        </label>
      </div>

      {showFilters ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category filters">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")} label="All" />
          {NAV_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              active={category === cat}
              onClick={() => setCategory(cat)}
              label={CATEGORY_LABELS[cat]}
            />
          ))}
        </div>
      ) : null}

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center text-sm text-[var(--fg-secondary)]">
          No tools match that search.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              favorite={favorites.includes(tool.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-secondary)] hover:border-[var(--accent)]/40"
      )}
    >
      {label}
    </button>
  );
}
