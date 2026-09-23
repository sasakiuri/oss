'use client';

import Link from 'next/link';

import { labsCategories, labsTool, labsTools, type LabsToolSlug } from '@/lib/labs-tools';
import { useLanguage } from '@/store';

/** The other tools in the same category, under a tool page. */
export function RelatedTools({ slug }: { slug: LabsToolSlug }) {
  const language = useLanguage();
  const { category } = labsTool(slug);
  const categoryTitle = labsCategories.find((entry) => entry.id === category)?.title[language];
  const others = labsTools.filter((tool) => tool.category === category && tool.slug !== slug);

  return (
    <nav
      aria-labelledby="related-tools"
      lang={language}
      className="border-t border-outline-variant bg-surface-container-low print:hidden"
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <h2 id="related-tools" className="text-base font-medium">
          {categoryTitle}
        </h2>
        {others.length > 0 && (
          <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {others.map((tool) => (
              <li key={tool.slug}>
                <Link href={`/labs/${tool.slug}`} className="font-medium text-primary hover:underline">
                  {tool.title[language]}
                </Link>
                {'japaneseOnly' in tool && tool.japaneseOnly && language === 'en' && (
                  <span className="text-sm text-on-surface-variant"> (Japanese only)</span>
                )}
                <p className="text-sm text-on-surface-variant">{tool.summary[language]}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-sm">
          <Link href="/labs" className="text-primary hover:underline">
            {language === 'ja' ? 'すべてのツール' : 'All tools'}
          </Link>
        </p>
      </div>
    </nav>
  );
}
