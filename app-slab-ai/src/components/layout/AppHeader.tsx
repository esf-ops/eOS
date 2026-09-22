"use client";

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 border-b border-[var(--border)] pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-fg)]">
        slabOS AI Studio
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-[var(--fg-secondary)]">{subtitle}</p> : null}
    </header>
  );
}
