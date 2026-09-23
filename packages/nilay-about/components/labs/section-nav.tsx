'use client';

import type { Language } from '@/store';

interface SectionNavProps {
  language: Language;
  /** Each id must be on the matching section. `standalone.css` keeps the landing clear of the bars. */
  sections: readonly { id: string; label: string }[];
}

/**
 * Jump links for the tools that run to several screens.
 *
 * The longest tools reach some 6,800 px on a phone. They are already cut into named sections, but
 * the only way to reach one was to scroll past the others.
 */
export function SectionNav({ language, sections }: SectionNavProps) {
  return (
    <nav
      aria-label={language === 'ja' ? 'このページの中を移動' : 'Jump to a section of this page'}
      className="border-b border-outline-variant bg-surface print:hidden"
    >
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-1 sm:px-6">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm text-on-surface-variant hover:bg-surface-container"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
