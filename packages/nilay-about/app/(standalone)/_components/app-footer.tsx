"use client";

import type { ReactNode } from "react";

interface AppFooterProps {
  children: ReactNode;
}

/**
 * Standalone app footer component (toolbar style)
 * Used by game-species-test for action buttons
 */
export function AppFooter({ children }: AppFooterProps) {
  return (
    <footer
      className="fixed bottom-0 left-0 right-0 border-t border-border bg-background"
      role="toolbar"
      aria-label="操作ボタン"
    >
      <div className="mx-auto flex max-w-xl items-stretch">{children}</div>
    </footer>
  );
}
