"use client";

import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  actions?: ReactNode;
}

/**
 * Standalone app header component
 * Used by home-target and game-species-test
 */
export function AppHeader({ title, actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
        <h1 className="text-lg font-medium">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
