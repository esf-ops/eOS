"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/AuthProvider";
import type { EliteosTopbarMenuItem } from "@/types/eliteos-topbar";

/** Client-only — avoids RSC/SSR dual-React issues when resolving shared Topbar. */
const EliteosTopbar = dynamic(() => import("./EliteosTopbarClient"), {
  ssr: false,
  loading: () => <div className="h-14 border-b border-[var(--border)] bg-[var(--surface)]" aria-hidden />,
});

function initialsFrom(name?: string | null, email?: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function SlabAiTopbar() {
  const { context, userEmail, signOut } = useAuth();
  const homeUrl = process.env.NEXT_PUBLIC_HOME_URL || "https://www.eliteosfab.com";

  if (!context) return null;

  const menuItems: EliteosTopbarMenuItem[] = [
    { label: "Home Launcher", href: homeUrl },
    { label: "AI Tools", href: "/tools" },
    { label: "Recent generations", href: "/recent" },
  ];
  if (context.canAdministerKnowledge) {
    menuItems.splice(2, 0, { label: "Knowledge Hub", href: "/knowledge" });
  }

  return (
    <EliteosTopbar
      appName="AI Studio"
      organizationName="eliteOS"
      homeHref={homeUrl}
      userName={context.displayName || userEmail || "User"}
      userEmail={userEmail || undefined}
      userSubtitle={context.devBypass ? "DEV AUTH BYPASS" : context.role}
      initials={initialsFrom(context.displayName, userEmail)}
      menuItems={menuItems}
      onSignOut={context.devBypass ? undefined : () => void signOut()}
      statusSlot={
        context.devBypass ? (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            DEV BYPASS
          </span>
        ) : undefined
      }
    />
  );
}
