"use client";

import { AppSidebar } from "./AppSidebar";
import { SlabAiTopbar } from "./SlabAiTopbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <SlabAiTopbar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-3 pb-24 md:px-5 md:py-4 md:pb-4">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
