import { LuTriangleAlert, LuRefreshCw } from 'react-icons/lu';

import { cn } from '@/lib/utils';

import { Button } from './button';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({ title = 'エラーが発生しました', message, onRetry, className }: ErrorMessageProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
      <LuTriangleAlert className="h-10 w-10 text-destructive mb-4" aria-hidden="true" />
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-4">
          <LuRefreshCw className="mr-2 h-4 w-4" />
          再試行
        </Button>
      )}
    </div>
  );
}
