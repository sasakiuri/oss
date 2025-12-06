"use client";

import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  actions?: ReactNode;
  /** Navigation icon (optional, e.g., back arrow or menu) */
  navigationIcon?: ReactNode;
  /** Variant: "surface" (default), "primary" (colored) */
  variant?: "surface" | "primary";
}

/**
 * Material Design 3 Top App Bar (Small)
 *
 * M3 Specifications:
 * - Height: 64dp
 * - Horizontal padding: 16dp (4dp for leading icon)
 * - Title: Title Large (22sp)
 * - Background: Surface (or Primary for colored variant)
 * - Elevation: Level 0 (scrolled: Level 2)
 *
 * Layout:
 * [Leading icon (48dp touch)] [Title] [Trailing actions]
 */
export function AppHeader({
  title,
  actions,
  navigationIcon,
  variant = "surface",
}: AppHeaderProps) {
  const isColored = variant === "primary";

  return (
    <header
      className={[
        "sticky top-0 z-50",
        "transition-shadow duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        isColored
          ? "bg-primary text-primary-foreground"
          : "bg-surface-container text-on-surface",
      ].join(" ")}
      role="banner"
    >
      <div className="mx-auto flex h-16 max-w-xl items-center gap-1 px-4">
        {/* Leading navigation icon */}
        {navigationIcon && (
          <div className="flex h-12 w-12 items-center justify-center -ml-2">
            {navigationIcon}
          </div>
        )}

        {/* Title - M3 Title Large */}
        <h1
          className={[
            "flex-1 text-[22px] leading-7 font-normal",
            navigationIcon ? "" : "ml-0",
          ].join(" ")}
        >
          {title}
        </h1>

        {/* Trailing actions */}
        {actions && (
          <div className="flex items-center gap-1 -mr-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
