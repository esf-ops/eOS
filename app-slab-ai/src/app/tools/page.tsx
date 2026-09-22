"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { ToolDirectory } from "@/components/ai/ToolDirectory";
import { useFavorites } from "@/lib/hooks";

export default function ToolsPage() {
  const { favorites, toggle } = useFavorites();
  return (
    <div>
      <AppHeader
        title="All tools"
        subtitle="Search and filter the full catalog. Adding a tool later is mostly a definition — not a new app."
      />
      <ToolDirectory favorites={favorites} onToggleFavorite={toggle} />
    </div>
  );
}
