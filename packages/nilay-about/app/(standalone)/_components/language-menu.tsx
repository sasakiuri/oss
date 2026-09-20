'use client';

import { useState, useRef, useEffect } from 'react';
import { LuLanguages, LuCheck } from 'react-icons/lu';

import { Button } from '@/components/ui';

type Language = 'ja' | 'en';

interface LanguageMenuProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

/**
 * Material Design 3 Menu (Language Selector)
 *
 * M3 Specifications:
 * - Corner radius: 4dp (extra-small)
 * - Elevation: Level 2
 * - Min width: 112dp
 * - Max width: 280dp
 * - Item height: 48dp
 * - Item padding: 12dp horizontal
 * - Typography: Label Large (14sp)
 */
export function LanguageMenu({ language, onLanguageChange }: LanguageMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (lang: Language) => {
    onLanguageChange(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* M3 Icon Button (Standard) */}
      <Button
        variant="ghost"
        size="icon"
        className="text-on-surface"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="言語を選択"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <LuLanguages className="h-6 w-6" />
      </Button>

      {/* M3 Menu container */}
      {isOpen && (
        <div
          role="menu"
          className={[
            'absolute right-0 top-full z-50 mt-2',
            'min-w-[112px]',
            'rounded', // M3: 4dp corner radius
            'bg-surface-container',
            'py-2', // M3: 8dp vertical padding
            'shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_2px_rgba(0,0,0,0.15)]', // elevation 2
            'animate-in fade-in slide-in-from-top-2 duration-200',
          ].join(' ')}
        >
          {/* M3 Menu Item */}
          <button
            role="menuitem"
            className={[
              'flex w-full items-center gap-3',
              'h-12 px-3', // M3: 48dp height, 12dp padding
              'text-sm font-medium', // Label Large
              'text-on-surface',
              'transition-colors duration-200',
              'hover:bg-on-surface/8',
              'focus-visible:outline-none focus-visible:bg-on-surface/12',
              language === 'en' ? 'bg-secondary-container' : '',
            ].join(' ')}
            onClick={() => handleSelect('en')}
          >
            {language === 'en' && <LuCheck className="h-5 w-5 text-primary" />}
            <span className={language === 'en' ? '' : 'ml-8'}>English</span>
          </button>
          <button
            role="menuitem"
            className={[
              'flex w-full items-center gap-3',
              'h-12 px-3',
              'text-sm font-medium',
              'text-on-surface',
              'transition-colors duration-200',
              'hover:bg-on-surface/8',
              'focus-visible:outline-none focus-visible:bg-on-surface/12',
              language === 'ja' ? 'bg-secondary-container' : '',
            ].join(' ')}
            onClick={() => handleSelect('ja')}
          >
            {language === 'ja' && <LuCheck className="h-5 w-5 text-primary" />}
            <span className={language === 'ja' ? '' : 'ml-8'}>日本語</span>
          </button>
        </div>
      )}
    </div>
  );
}
