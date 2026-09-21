'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const themes = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: 'システム既定', icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="表示テーマを選ぶ"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-white hover:bg-white/10"
        >
          <Sun className="hidden h-5 w-5 dark:block" aria-hidden="true" />
          <Moon className="h-5 w-5 dark:hidden" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        aria-label="表示テーマ"
        className="z-[60] max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 text-ink shadow-lg print:hidden"
      >
        <DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>
          {themes.map(({ value, label, icon: Icon }) => (
            <DropdownMenu.RadioItem
              key={value}
              value={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm [overflow-wrap:anywhere] data-[highlighted]:bg-muted-strong"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{label}</span>
              <span className="ml-auto w-4 shrink-0">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-4 w-4" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </span>
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
