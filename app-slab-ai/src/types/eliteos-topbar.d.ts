import type { ReactNode, FC } from "react";

export type EliteosTopbarMenuItem = {
  label: string;
  meta?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "danger";
};

export type EliteosTopbarProps = {
  appName?: string;
  organizationName: string;
  logoSrc?: string;
  homeHref?: string;
  userName?: string;
  userEmail?: string;
  userSubtitle?: string;
  initials?: string;
  searchSlot?: ReactNode;
  primaryActionSlot?: ReactNode;
  statusSlot?: ReactNode;
  menuItems?: EliteosTopbarMenuItem[];
  onSignOut?: () => void;
  signOutLabel?: string;
};

declare const EliteosTopbar: FC<EliteosTopbarProps>;
export default EliteosTopbar;
