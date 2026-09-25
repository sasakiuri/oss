'use client';

import { Card } from '@/components/ui';
import { FENCE_SOURCES, LEGAL_REQUIREMENTS, ORDINANCE_ARTICLE_74, SOURCES_CHECKED_ON } from '@/lib/electric-fence';
import type { Language } from '@/store';

/** The legal requirements, always shown rather than in a closed section. */
export function FenceLegal({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const ordinance = FENCE_SOURCES.ordinance;
  const interpretation = FENCE_SOURCES.interpretation;
  return (
    <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
      <h2 id="legal" className="text-xl font-medium">
        {t('電気さくの法令要件', 'Legal requirements for electric fences')}
      </h2>
      <section className="space-y-2">
        <h3 className="font-medium">
          <span lang="ja">{ordinance.title}</span>
        </h3>
        <blockquote lang="ja" className="border-l-4 border-outline-variant pl-3 text-sm text-on-surface-variant">
          {ORDINANCE_ARTICLE_74}
        </blockquote>
        {language === 'en' && (
          <p className="text-sm text-on-surface-variant">
            Electric fences are prohibited, except on fields, pasture or similar places to keep wild animals out or
            livestock in, installed so that the bare wire causes no electric shock or fire.
          </p>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">
          <span lang="ja">{interpretation.title}</span>
          {t('（要旨）', ' (summary)')}
        </h3>
        <ul className="space-y-2 text-sm">
          {LEGAL_REQUIREMENTS.map((requirement) => (
            <li key={requirement.item} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
              <span lang="ja" className="font-medium">
                {requirement.item}
              </span>
              <span lang={language}>{t(requirement.ja, requirement.en)}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-on-surface-variant">
        {t(
          `出典：e-Gov 法令検索「電気設備に関する技術基準を定める省令」（${ordinance.issued}）、経済産業省「電気設備の技術基準の解釈」（${interpretation.issued}）。${SOURCES_CHECKED_ON} 確認。`,
          `Sources: the ministerial ordinance at e-Gov (in force from 20 March 2023) and METI’s interpretation of the technical standards (revised 20 November 2025), checked on ${SOURCES_CHECKED_ON}.`,
        )}
      </p>
    </Card>
  );
}
