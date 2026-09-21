'use client';

import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  header: ReactNode;
  footer?: ReactNode;
}

/**
 * Full-screen app layout for standalone apps
 * Provides consistent structure with header, main content, and optional footer
 */
export function AppLayout({ children, header, footer }: AppLayoutProps) {
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {header}
      <main className={`flex-1 overflow-auto ${footer ? 'pb-20' : ''}`}>
        <div className="mx-auto max-w-xl p-4">{children}</div>
      </main>
      {footer}
    </div>
  );
}
