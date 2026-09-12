import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-vscode-border/70 px-5 py-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-6 text-vscode-text">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-[13px] leading-5 text-vscode-text-muted">{description}</p>}
      </div>
      {actions && (
        <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>
      )}
    </header>
  );
}
