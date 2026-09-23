'use client';

import Link from 'next/link';

import { labsCategories, labsTools } from '@/lib/labs-tools';
import { useLanguage } from '@/store';

export function LabsIndex() {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>{t('狩猟・射撃のツール (Labs)', 'Hunting and shooting tools (Labs)')}</h1>

      <p>
        {t(
          '狩猟と射撃のための計算・練習・記録のツールです。登録不要で、入力した内容はこのブラウザーの中だけに保存します。',
          'Calculators, practice tests and logs for hunting and shooting. No sign-up; what you enter stays in this browser.',
        )}
      </p>

      {labsCategories.map((category) => {
        const tools = labsTools.filter((tool) => tool.category === category.id);
        return (
          <section key={category.id} aria-labelledby={`labs-${category.id}`}>
            <hr />
            <h2 id={`labs-${category.id}`}>{category.title[language]}</h2>
            <dl>
              {tools.map((tool) => (
                <div key={tool.slug} className="mb-4">
                  <dt className="font-bold">
                    <Link href={`/labs/${tool.slug}`}>{tool.title[language]}</Link>
                    {'japaneseOnly' in tool && tool.japaneseOnly && language === 'en' && (
                      <span className="font-normal"> (Japanese only)</span>
                    )}
                  </dt>
                  <dd className="ml-8">{tool.summary[language]}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
