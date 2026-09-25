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
          '狩猟・射撃の計算、試験の練習、記録に使えます。利用登録は不要です。',
          'Calculators, practice tests and logs for hunting and shooting. No sign-up required.',
        )}
      </p>
      <p>
        {t(
          'オフラインで使うツールは、事前に一度開いてください。通知や地図の取得などには通信が必要です。',
          'Open tools before going offline. Notifications, map downloads and some other features need a connection.',
        )}
      </p>
      <p>
        <Link href="/labs/data">{t('保存データの書き出し・読み込み', 'Export or import saved data')}</Link>
      </p>

      <nav aria-label={t('ツールの分類', 'Tool categories')}>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {labsCategories.map((category) => (
            <li key={category.id}>
              <a href={`#labs-${category.id}`}>{category.title[language]}</a>
            </li>
          ))}
        </ul>
      </nav>

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
