"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { ToolCard } from "@/components/ai/ToolCard";
import { listClientCatalog } from "@/lib/ai-tools/client-catalog";
import { useFavorites } from "@/lib/hooks";

export default function FavoritesPage() {
  const { favorites, toggle, isFavorite } = useFavorites();
  const tools = listClientCatalog().filter((t) => favorites.includes(t.id));

  return (
    <div>
      <AppHeader title="Favorites" subtitle="Pinned tools for quick access on this device." />
      {tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center text-sm text-[var(--fg-secondary)]">
          No favorites yet. Star a tool from the catalog to pin it here.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              favorite={isFavorite(tool.id)}
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
