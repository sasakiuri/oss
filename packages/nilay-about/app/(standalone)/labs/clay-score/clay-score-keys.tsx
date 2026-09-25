'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui';
import { actionForKey, type KeyAction, type KeyMap } from '@/lib/clay-score';

type Language = 'ja' | 'en';

/** Keys typed into a field belong to the field, never to the score sheet. */
function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** How a key reads on screen: the printable ones as themselves, the rest by name. */
export function keyLabel(key: string | null, language: Language): string {
  if (key === null) return language === 'ja' ? '（なし）' : '(none)';
  const names: Record<string, [string, string]> = {
    ' ': ['スペース', 'Space'],
    ArrowLeft: ['←', '←'],
    ArrowRight: ['→', '→'],
    ArrowUp: ['↑', '↑'],
    ArrowDown: ['↓', '↓'],
    AudioVolumeUp: ['音量＋', 'Volume up'],
    AudioVolumeDown: ['音量−', 'Volume down'],
  };
  const name = names[key];
  return name ? name[language === 'ja' ? 0 : 1] : key;
}

/**
 * Listens for the assigned keys while it is enabled, and hands every key to `onCapture` instead while
 * one is being assigned. A key with a modifier is left to the browser, so shortcuts keep working.
 */
export function useKeyInput({
  enabled,
  keyMap,
  capturing,
  onAction,
  onCapture,
}: {
  enabled: boolean;
  keyMap: KeyMap;
  capturing: KeyAction | null;
  onAction: (action: KeyAction) => void;
  onCapture: (key: string | null) => void;
}) {
  // The listener is added once and reads the latest values from here, so it never goes stale.
  const latest = useRef({ enabled, keyMap, capturing, onAction, onCapture });
  useEffect(() => {
    latest.current = { enabled, keyMap, capturing, onAction, onCapture };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const current = latest.current;
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (current.capturing) {
        event.preventDefault();
        // Escape cancels the assignment and keeps the key there was.
        current.onCapture(event.key === 'Escape' ? null : event.key);
        return;
      }
      if (!current.enabled || typingInField(event.target)) return;
      const action = actionForKey(current.keyMap, event.key);
      if (!action) return;
      event.preventDefault();
      current.onAction(action);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

interface ClayKeySettingsProps {
  language: Language;
  enabled: boolean;
  keyMap: KeyMap;
  capturing: KeyAction | null;
  /** The actions this sheet can take: no second barrel without barrels, no direction for skeet. */
  actions: readonly KeyAction[];
  actionName: (action: KeyAction) => string;
  onEnabledChange: (enabled: boolean) => void;
  onCapture: (action: KeyAction | null) => void;
  onClear: (action: KeyAction) => void;
}

export function ClayKeySettings({
  language,
  enabled,
  keyMap,
  capturing,
  actions,
  actionName,
  onEnabledChange,
  onCapture,
  onClear,
}: ClayKeySettingsProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="space-y-4">
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        {t('キーで記録する', 'Record with keys')}
      </label>
      <p className="text-sm text-on-surface-variant">
        {t(
          '方向のキーを押してから結果のキーを押すと、方向も記録します。Bluetooth のシャッターリモコンやページめくりリモコンも、キーを割り当てれば使えます。音量キーは、ブラウザーや端末によってはページに届きません。',
          'Press a direction key before a result key to record the direction too. Bluetooth camera-shutter and page-turner remotes work once their key is assigned. Volume keys may not reach the page on some browsers and devices.',
        )}
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('キーの割り当て', 'Key assignments')}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-2 text-left font-medium">
              {t('操作', 'Action')}
            </th>
            <th scope="col" className="py-2 text-left font-medium">
              {t('キー', 'Key')}
            </th>
            <th scope="col" className="py-2">
              <span className="sr-only">{t('変更', 'Change')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action} className="border-t border-outline-variant">
              <th scope="row" className="py-2 text-left font-normal">
                {actionName(action)}
              </th>
              <td className="py-2 font-mono">
                {capturing === action
                  ? t('キーを押してください（Esc でやめる）', 'Press a key (Esc to cancel)')
                  : keyLabel(keyMap[action], language)}
              </td>
              <td className="py-2 text-right">
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    variant="outline"
                    aria-label={t(`${actionName(action)}のキーを割り当てる`, `Assign a key to ${actionName(action)}`)}
                    onClick={() => onCapture(capturing === action ? null : action)}
                  >
                    {t('割り当てる', 'Assign')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={keyMap[action] === null}
                    aria-label={t(`${actionName(action)}のキーを外す`, `Clear the key for ${actionName(action)}`)}
                    onClick={() => onClear(action)}
                  >
                    {t('外す', 'Clear')}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
