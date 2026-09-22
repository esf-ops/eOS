"use client";

/**
 * Next client boundary for shared EliteosTopbar (webpack alias → shared/eliteos-ui).
 * Types from local shim; runtime from shared presentational component (not forked).
 */
import EliteosTopbar from "@eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem, EliteosTopbarProps } from "@/types/eliteos-topbar";

export default EliteosTopbar;
export type { EliteosTopbarMenuItem, EliteosTopbarProps };
