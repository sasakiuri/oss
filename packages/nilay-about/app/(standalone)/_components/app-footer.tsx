"use client";

import type { ReactNode } from "react";

interface AppFooterProps {
  children: ReactNode;
}

/**
 * Material Design 3 Bottom App Bar
 *
 * M3 Specifications:
 * - Height: 80dp
 * - Horizontal padding: 16dp
 * - Background: Surface-container with elevation 2
 * - Corner radius: 0 (full width)
 *
 * Layout:
 * [Action icons] [Spacer] [FAB (optional)]
 */
export function AppFooter({ children }: AppFooterProps) {
  return (
    <footer
      className={[
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-surface-container",
        "shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_2px_rgba(0,0,0,0.15)]", // elevation 2
      ].join(" ")}
      role="toolbar"
      aria-label="操作ボタン"
    >
      <div className="mx-auto flex h-20 max-w-xl items-center justify-around px-4">
        {children}
      </div>
    </footer>
  );
}
