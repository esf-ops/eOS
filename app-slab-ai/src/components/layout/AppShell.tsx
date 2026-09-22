"use client";

import { AppSidebar } from "./AppSidebar";
import { SlabAiTopbar } from "./SlabAiTopbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <SlabAiTopbar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-7">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
