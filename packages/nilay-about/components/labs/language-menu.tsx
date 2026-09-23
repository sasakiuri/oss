'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LuLanguages, LuCheck } from 'react-icons/lu';

import { Button } from '@/components/ui';

interface LanguageMenuProps {
  language: 'ja' | 'en';
  onLanguageChange: (lang: 'ja' | 'en') => void;
}

export function LanguageMenu({ language, onLanguageChange }: LanguageMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={language === 'ja' ? '言語を選択' : 'Select language'}>
          <LuLanguages aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        className="min-w-40 rounded-xl border border-outline-variant bg-surface p-2 shadow-lg"
      >
        {(['ja', 'en'] as const).map((lang) => (
          <DropdownMenu.Item
            key={lang}
            onSelect={() => onLanguageChange(lang)}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 text-on-surface outline-none focus:bg-primary-container"
          >
            <span className="w-5">{language === lang && <LuCheck aria-hidden="true" />}</span>
            {lang === 'ja' ? '日本語' : 'English'}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
