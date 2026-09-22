import {
  Briefcase,
  Building2,
  ClipboardList,
  FileText,
  Gem,
  LayoutGrid,
  ScrollText,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Gem,
  Wrench,
  FileText,
  Sparkles,
  Briefcase,
  Building2,
  LayoutGrid,
  ClipboardList,
  ScrollText,
};

export function resolveToolIcon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}
