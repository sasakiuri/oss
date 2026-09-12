import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`border-t border-vscode-border/70 py-4 ${className}`}>{children}</div>;
}
