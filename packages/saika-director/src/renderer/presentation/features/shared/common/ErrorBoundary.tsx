import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Uncaught error in React tree:', error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-vscode-bg text-vscode-text p-8">
          <div className="text-red-400 text-xl font-semibold mb-4">An unexpected error occurred</div>
          <div className="text-vscode-dimmed text-sm mb-6 max-w-md text-center">
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            onClick={this.handleReload}
            className="rounded bg-vscode-primary px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
