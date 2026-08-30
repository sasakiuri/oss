import { ClockAlert, FileSearch, Gauge, Settings, Trophy } from 'lucide-react';
import appIcon from '@/assets/images/appIcon.png';
import { useNavigationStore } from '../../../stores/ui/navigation.store';
import type { ActiveScreen } from '../../../stores/ui/navigation.store';

interface NavItem {
  id: ActiveScreen;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'tournament',
    label: 'Championships',
    shortLabel: 'Championships',
    icon: <Trophy size={19} aria-hidden="true" />,
  },
  {
    id: 'control',
    label: 'Competition Control',
    shortLabel: 'Control',
    icon: <Gauge size={19} aria-hidden="true" />,
  },
  {
    id: 'examinations',
    label: 'Target Examinations',
    shortLabel: 'Examinations',
    icon: <FileSearch size={19} aria-hidden="true" />,
  },
  {
    id: 'interruptions',
    label: 'Range Interruptions',
    shortLabel: 'Interruptions',
    icon: <ClockAlert size={19} aria-hidden="true" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: <Settings size={19} aria-hidden="true" />,
  },
];

export function Sidebar() {
  const activeScreen = useNavigationStore((s) => s.activeScreen);
  const setActiveScreen = useNavigationStore((s) => s.setActiveScreen);
  const primaryItems = navItems.filter((item) => item.id !== 'settings');
  const settingsItem = navItems.find((item) => item.id === 'settings');

  const renderItem = (item: NavItem) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setActiveScreen(item.id)}
      title={item.label}
      aria-label={item.label}
      aria-current={activeScreen === item.id ? 'page' : undefined}
      className={`relative flex h-12 w-full flex-col items-center justify-center gap-1 border-l-2 px-1 transition-colors sm:h-[60px] ${
        activeScreen === item.id
          ? 'border-l-vscode-primary bg-vscode-highlight text-vscode-text'
          : 'border-l-transparent text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
      }`}
    >
      <span
        className={`flex h-6 w-7 items-center justify-center transition-colors [&>svg]:h-[19px] [&>svg]:w-[19px] ${
          activeScreen === item.id ? 'text-vscode-accent' : ''
        }`}
      >
        {item.icon}
      </span>
      <span className="hidden whitespace-nowrap text-[10px] font-medium leading-none sm:block">{item.shortLabel}</span>
    </button>
  );

  return (
    <aside
      aria-label="Application navigation"
      className="flex w-14 shrink-0 flex-col border-r border-vscode-border bg-vscode-sidebar sm:w-[88px]"
    >
      <div className="flex h-[68px] items-center justify-center border-b border-vscode-border">
        <img src={appIcon} alt="Saika Director" title="Saika Director" className="h-8 w-8 sm:h-9 sm:w-9" />
        <h1 className="sr-only">Saika Director</h1>
      </div>
      <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col py-1">
        <div>{primaryItems.map(renderItem)}</div>
        {settingsItem && <div className="mt-auto">{renderItem(settingsItem)}</div>}
      </nav>
    </aside>
  );
}
