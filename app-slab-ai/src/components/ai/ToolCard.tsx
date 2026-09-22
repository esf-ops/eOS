"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { CATEGORY_LABELS, type ToolCatalogEntry } from "@/lib/ai-tools/types";
import { resolveToolIcon } from "@/lib/ai-tools/icons";
import { cn } from "@/lib/utils";

type Props = {
  tool: ToolCatalogEntry;
  favorite?: boolean;
  onToggleFavorite?: (toolId: string) => void;
  compact?: boolean;
};

export function ToolCard({ tool, favorite, onToggleFavorite, compact }: Props) {
  const Icon = resolveToolIcon(tool.icon);
  const comingSoon = tool.status === "coming-soon";

  const body = (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition",
        !comingSoon && "hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]",
        comingSoon && "opacity-80"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex items-center gap-2">
          {comingSoon ? (
            <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              Coming soon
            </span>
          ) : null}
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={favorite ? `Remove ${tool.title} from favorites` : `Favorite ${tool.title}`}
              className="rounded-md p-1.5 text-[var(--muted-fg)] transition hover:bg-[var(--muted)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(tool.id);
              }}
            >
              <Star className={cn("h-4 w-4", favorite && "fill-[var(--accent)] text-[var(--accent)]")} />
            </button>
          ) : null}
        </div>
      </div>
      <h3 className={cn("text-base font-semibold text-[var(--fg)]", compact && "text-sm")}>{tool.title}</h3>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
        {CATEGORY_LABELS[tool.category]}
      </p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--fg-secondary)]">{tool.shortDescription}</p>
    </article>
  );

  if (comingSoon) {
    return <div className="block h-full cursor-default">{body}</div>;
  }

  return (
    <Link href={`/tools/${tool.slug}`} className="block h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
      {body}
    </Link>
  );
}
