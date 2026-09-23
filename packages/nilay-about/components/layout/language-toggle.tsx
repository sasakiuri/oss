'use client';

import { useLanguage, useSetLanguage, type Language } from '@/store';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
];

/**
 * The language picker, in the plain style of the rest of the site.
 *
 * Both languages are named in their own language, and the one in use is marked rather than
 * removed: a reader looking for the way back has to see it is still there.
 */
export function LanguageToggle() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();

  return (
    <p className="mt-1 text-sm">
      <span className="mr-2">{language === 'ja' ? '言語:' : 'Language:'}</span>
      {LANGUAGES.map(({ value, label }, index) => (
        <span key={value}>
          {index > 0 && <span aria-hidden="true"> | </span>}
          <button
            type="button"
            lang={value}
            onClick={() => setLanguage(value)}
            aria-pressed={language === value}
            className={language === value ? 'font-bold underline' : 'underline'}
          >
            {label}
          </button>
        </span>
      ))}
    </p>
  );
}
