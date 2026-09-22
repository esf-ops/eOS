"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { ToolDirectory } from "@/components/ai/ToolDirectory";
import { useFavorites } from "@/lib/hooks";
import Link from "next/link";

export default function SkillsPage() {
  const { favorites, toggle } = useFavorites();
  return (
    <div>
      <AppHeader
        title="Skills"
        subtitle="Reusable workflows behind the assistant. Prefer asking slabOS in natural language on Home — open a skill when you want a guided form."
      />
      <p className="mb-6 text-sm text-[var(--fg-secondary)]">
        <Link href="/" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          ← Back to Assistant
        </Link>
      </p>
      <ToolDirectory favorites={favorites} onToggleFavorite={toggle} />
    </div>
  );
}
