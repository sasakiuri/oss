import { LuSkipForward, LuEye, LuRefreshCw } from 'react-icons/lu';

import { AppFooter } from '@/components/labs';

interface SlideshowControlsProps {
  onNext: () => void;
  onShowAnswer: () => void;
  onRestart: () => void;
}

export function SlideshowControls({ onNext, onShowAnswer, onRestart }: SlideshowControlsProps) {
  const actions = [
    { label: '次へ', shortcut: '右矢印キーまたはスペースキー', icon: LuSkipForward, onClick: onNext },
    { label: '正解を表示', shortcut: 'Enterキー', icon: LuEye, onClick: onShowAnswer },
    { label: 'リセット', shortcut: 'Rキー', icon: LuRefreshCw, onClick: onRestart },
  ];
  return (
    <AppFooter>
      {actions.map(({ label, shortcut, icon: Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={`${label}（${shortcut}）`}
          className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[48px] py-2 text-on-surface-variant transition-colors duration-200 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
          <span className="text-xs font-medium">{label}</span>
        </button>
      ))}
    </AppFooter>
  );
}
