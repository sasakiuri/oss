import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-sm border border-vscode-border bg-vscode-bg-light p-[18px] ${className}`}>{children}</div>
  );
}
