"use client";

import { ReactNode } from "react";
import { ErrorMessage, EmptyState, LoadingSpinner } from "@/components/ui";
import type { IconType } from "react-icons";

interface AsyncBoundaryProps<T> {
  // Data states
  data: T | undefined | null;
  isLoading: boolean;
  error: Error | null;

  // Render functions
  children: (data: T) => ReactNode;

  // Loading state
  loadingComponent?: ReactNode;
  loadingLabel?: string;

  // Error state
  onRetry?: () => void;
  errorTitle?: string;
  errorMessage?: string;

  // Empty state
  isEmpty?: (data: T) => boolean;
  emptyIcon?: IconType;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;

  // Styling
  className?: string;
}

/**
 * Declarative async state boundary component
 * Handles loading, error, and empty states consistently
 */
export function AsyncBoundary<T>({
  data,
  isLoading,
  error,
  children,
  loadingComponent,
  loadingLabel = "読み込み中",
  onRetry,
  errorTitle = "エラーが発生しました",
  errorMessage = "データの取得に失敗しました。",
  isEmpty,
  emptyIcon,
  emptyTitle = "データがありません",
  emptyDescription,
  emptyAction,
  className,
}: AsyncBoundaryProps<T>) {
  if (isLoading) {
    return (
      loadingComponent || (
        <div className={className}>
          <LoadingSpinner label={loadingLabel} className="py-12" />
        </div>
      )
    );
  }

  if (error) {
    return (
      <div className={className}>
        <ErrorMessage
          title={errorTitle}
          message={errorMessage}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (!data || (isEmpty && isEmpty(data))) {
    return (
      <div className={className}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return <>{children(data)}</>;
}

/**
 * Simplified version for common use cases
 */
interface SimpleAsyncBoundaryProps {
  isLoading: boolean;
  error: Error | null;
  isEmpty?: boolean;
  children: ReactNode;
  loadingComponent?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage?: string;
  className?: string;
}

export function SimpleAsyncBoundary({
  isLoading,
  error,
  isEmpty,
  children,
  loadingComponent,
  errorMessage = "データの取得に失敗しました。",
  onRetry,
  emptyMessage = "データがありません",
  className,
}: SimpleAsyncBoundaryProps) {
  if (isLoading) {
    return loadingComponent || <LoadingSpinner className={className} />;
  }

  if (error) {
    return (
      <ErrorMessage message={errorMessage} onRetry={onRetry} className={className} />
    );
  }

  if (isEmpty) {
    return <EmptyState title={emptyMessage} className={className} />;
  }

  return <>{children}</>;
}
