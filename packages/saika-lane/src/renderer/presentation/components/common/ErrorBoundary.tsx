// SPDX-License-Identifier: MIT
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // console.error is intentional here: the main process captures all renderer
    // console-message events via webContents.on('console-message') and forwards
    // them to the file logger (see main.ts). Using console.error instead of an
    // IPC call is safer in this last-resort error boundary because the IPC bridge
    // itself may be unavailable when a render tree crashes.
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-vscode-bg p-8 text-vscode-text">
          <h1 className="mb-4 text-xl font-bold">Something went wrong</h1>
          <p className="mb-4 text-vscode-text-muted">{this.state.error?.message}</p>
          <button
            type="button"
            className="rounded bg-vscode-primary px-4 py-2 text-white hover:opacity-90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
