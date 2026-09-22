"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { ToolCard } from "@/components/ai/ToolCard";
import { ToolDirectory } from "@/components/ai/ToolDirectory";
import { listClientCatalog } from "@/lib/ai-tools/client-catalog";
import { useFavorites, useHistory } from "@/lib/hooks";

export default function HomePage() {
  const { favorites, toggle, isFavorite } = useFavorites();
  const { history } = useHistory();
  const tools = listClientCatalog();
  const featured = tools.filter((t) => t.featured && t.status === "live");
  const recentTools = history
    .map((h) => tools.find((t) => t.id === h.toolId))
    .filter(Boolean)
    .filter((t, i, arr) => arr.findIndex((x) => x!.id === t!.id) === i)
    .slice(0, 4);

  return (
    <div className="space-y-10">
      <AppHeader
        title="AI coworkers for fabrication"
        subtitle="A catalog of specialized tools for remnant sales, shop troubleshooting, scope drafting, and customer care — built to expand without redesigning the core."
      />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <p className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-3xl">
          slabOS AI Studio
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--fg-secondary)]">
          Start with a featured tool, search the catalog, or pin favorites. Generation stays
          server-side; mock mode keeps the full UX testable without API keys.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/tools"
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Browse all tools
          </Link>
          <Link
            href="/tools/remnant-pitch"
            className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--muted)]"
          >
            Remnant Marketing Generator
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Featured</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              favorite={isFavorite(tool.id)}
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      </section>

      {recentTools.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Recently used</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recentTools.map((tool) =>
              tool ? (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  favorite={isFavorite(tool.id)}
                  onToggleFavorite={toggle}
                  compact
                />
              ) : null
            )}
          </div>
        </section>
      ) : null}

      {favorites.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Favorites</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tools
              .filter((t) => favorites.includes(t.id))
              .map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  favorite
                  onToggleFavorite={toggle}
                  compact
                />
              ))}
          </div>
        </section>
      ) : null}

      <ToolDirectory favorites={favorites} onToggleFavorite={toggle} heading="Discover" />
    </div>
  );
}
