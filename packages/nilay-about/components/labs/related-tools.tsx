'use client';

import Link from 'next/link';

import { labsCategories, labsTool, type LabsToolSlug } from '@/lib/labs-tools';
import { useLanguage } from '@/store';

/** Links back to the tool's category and the full list. */
export function RelatedTools({ slug }: { slug: LabsToolSlug }) {
  const language = useLanguage();
  const { category } = labsTool(slug);
  const categoryTitle = labsCategories.find((entry) => entry.id === category)?.title[language];

  return (
    <nav
      aria-label={language === 'ja' ? 'ツール一覧' : 'Tool directory'}
      lang={language}
      className="border-t border-outline-variant bg-surface-container-low print:hidden"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-sm sm:px-8">
        <Link href={`/labs#labs-${category}`} className="py-2 text-primary hover:underline">
          {categoryTitle}
        </Link>
        <Link href="/labs" className="py-2 text-primary hover:underline">
          {language === 'ja' ? 'すべてのツール' : 'All tools'}
        </Link>
      </div>
    </nav>
  );
}
