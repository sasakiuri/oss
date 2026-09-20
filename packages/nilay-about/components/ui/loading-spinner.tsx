'use client';

import { LuLoader } from 'react-icons/lu';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function LoadingSpinner({ size = 'md', className, label = '読み込み中' }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={label} className={cn('flex items-center justify-center', className)}>
      <LuLoader className={cn('animate-spin text-muted-foreground', sizeClasses[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  label?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({ isLoading, label, children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80" aria-busy="true">
          <LoadingSpinner size="lg" label={label} />
        </div>
      )}
    </div>
  );
}
