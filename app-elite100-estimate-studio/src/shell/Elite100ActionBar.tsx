import React, { type ReactNode } from "react";

export type Elite100ActionBarProps = {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
};

/** Horizontal action cluster with consistent spacing. */
export default function Elite100ActionBar({
  children,
  align = "end",
  className = "",
}: Elite100ActionBarProps) {
  return (
    <div
      className={`e100-action-bar e100-action-bar--${align}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
