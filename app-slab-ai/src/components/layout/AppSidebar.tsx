"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock3,
  Home,
  LayoutGrid,
  Library,
  Moon,
  Sun,
  Star,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState } from "react";
import { CATEGORY_LABELS, NAV_CATEGORIES } from "@/lib/ai-tools/types";
import { listClientCatalog } from "@/lib/ai-tools/client-catalog";
import { resolveToolIcon } from "@/lib/ai-tools/icons";
import { useTheme } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

const primaryNavBase = [
  { href: "/", label: "Ask eliteOS", icon: Home },
  { href: "/tools", label: "Skills", icon: LayoutGrid },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/recent", label: "Recent", icon: Clock3 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { mode, setTheme } = useTheme();
  const { context } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const tools = listClientCatalog();
  const primaryNav = context?.canAdministerKnowledge
    ? [
        ...primaryNavBase.slice(0, 2),
        { href: "/knowledge", label: "Knowledge", icon: Library },
        ...primaryNavBase.slice(2),
      ]
    : primaryNavBase;
  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] text-[var(--fg)] transition-[width] md:flex",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-4">
          {!collapsed ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-fg)]">slabOS</p>
              <p className="text-sm font-semibold tracking-tight">Operating assistant</p>
            </div>
          ) : (
            <span className="mx-auto text-xs font-bold">sAI</span>
          )}
          <button
            type="button"
            className="rounded-md p-1.5 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
          <ul className="space-y-1">
            {primaryNav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--fg-secondary)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
                    )}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? item.label : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          {!collapsed
            ? NAV_CATEGORIES.map((category) => {
                const group = tools.filter((t) => t.category === category);
                return (
                  <div key={category} className="mt-5">
                    <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-fg)]">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <ul className="space-y-0.5">
                      {group.map((tool) => {
                        const Icon = resolveToolIcon(tool.icon);
                        const href = tool.status === "live" ? `/tools/${tool.slug}` : "#";
                        const active = pathname === `/tools/${tool.slug}`;
                        return (
                          <li key={tool.id}>
                            <Link
                              href={href}
                              aria-disabled={tool.status !== "live"}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                                tool.status !== "live" && "cursor-default opacity-55",
                                active
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                  : "text-[var(--fg-secondary)] hover:bg-[var(--muted)]"
                              )}
                              onClick={(e) => {
                                if (tool.status !== "live") e.preventDefault();
                              }}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{tool.title}</span>
                              {tool.status !== "live" ? (
                                <span className="ml-auto text-[9px] uppercase tracking-wide">Soon</span>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            : null}
        </nav>

        <div className="border-t border-[var(--border)] p-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--muted)]"
            onClick={() => setTheme(mode === "dark" ? "light" : "dark")}
            aria-label="Toggle color theme"
          >
            {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed ? (mode === "dark" ? "Light mode" : "Dark mode") : null}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--sidebar)]/95 backdrop-blur md:hidden"
        aria-label="Mobile"
      >
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium",
                active ? "text-[var(--accent)]" : "text-[var(--muted-fg)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
