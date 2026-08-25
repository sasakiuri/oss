import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <header className="flex min-h-[68px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-vscode-border bg-vscode-bg-light px-5 py-3">
      <div className="flex min-w-0 flex-1 basis-[28rem] items-center gap-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-r border-vscode-border pr-3 text-vscode-accent [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold leading-6 text-vscode-text">{title}</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-vscode-text-muted">{description}</p>
        </div>
      </div>
      {actions && (
        <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>
      )}
    </header>
  );
}
