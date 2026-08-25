import { Bug } from 'lucide-react';
import { useConnectionStore } from '../../../stores/system/connection.store';
import { useDebugLog } from '../../../hooks/useDebugLog';

export function StatusBar() {
  const isConnected = useConnectionStore((state) => state.isConnected);
  const connectedChannels = useConnectionStore((state) => state.connectedChannels);
  const { isVisible, toggleVisibility } = useDebugLog();

  return (
    <footer className="relative z-20 flex h-7 shrink-0 items-center justify-between border-t border-vscode-border bg-vscode-sidebar px-3 text-[11px]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-vscode-success' : 'bg-vscode-dimmed'}`}
            />
          </span>
          <span className={isConnected ? 'text-vscode-success' : 'text-vscode-text-muted'}>
            {isConnected ? `Network online · ${connectedChannels.length} Lanes` : 'Network offline'}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-pressed={isVisible}
        onClick={toggleVisibility}
        className={`flex h-6 items-center gap-1.5 px-2 transition-colors ${
          isVisible
            ? 'bg-vscode-primary/15 text-vscode-accent'
            : 'text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
        }`}
      >
        <Bug size={13} aria-hidden="true" />
        <span>Debug</span>
      </button>
    </footer>
  );
}
