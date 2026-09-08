import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { OperatorAccessPanel } from '../../operator-access/OperatorAccessPanel';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-full flex-col bg-vscode-bg">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-sm border border-vscode-accent bg-vscode-primary px-3 py-2 font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <div className="border-b border-vscode-border px-3 py-1 text-right">
        <OperatorAccessPanel />
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="app-content-grid min-w-0 flex-1 overflow-auto focus:outline-none"
        >
          <div className="min-h-full flex-1">{children}</div>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
