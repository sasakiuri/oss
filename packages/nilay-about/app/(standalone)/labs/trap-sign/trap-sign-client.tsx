'use client';

import { useEffect, useId, useState } from 'react';
import { LuPrinter } from 'react-icons/lu';

import { AppHeader, AppLayout, ConditionSection, LanguageMenu, SegmentedControl, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { labsTool } from '@/lib/labs-tools';
import {
  HEADLINE_TEXT,
  SIGN_FIELD_MAX_LENGTH,
  SIGN_HEADLINES,
  SIGN_PAPERS,
  TRAP_SIGN_SOURCES,
  TRAP_SIGN_SOURCES_CHECKED_ON,
  layoutSign,
  signLines,
  type SignFields,
  type SignHeadline,
  type SignPaper,
} from '@/lib/trap-sign';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { SignSheet } from './sign-sheet';

type TextField = 'target' | 'period' | 'setter' | 'contact';

/**
 * The sign carries a name and a telephone number, so nothing on it is saved: it is made, printed
 * and left.
 */
export function TrapSignClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [paper, setPaper] = useState<SignPaper>('a4');
  const [fields, setFields] = useState<SignFields>({
    headline: 'trap',
    target: '',
    period: '',
    setter: '',
    contact: '',
    english: false,
  });
  const formId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void rehydrateLanguage().then(() => setReady(true));
  }, []);

  const layout = layoutSign(signLines(fields), paper);
  const { widthMm, heightMm } = SIGN_PAPERS[paper];

  const fieldLabel = (field: TextField) =>
    ({
      target: t('対象の鳥獣（任意）', 'Target species (optional)'),
      period: t('設置期間（任意）', 'Period (optional)'),
      setter: t('設置者（任意）', 'Set by (optional)'),
      contact: t('連絡先（任意）', 'Contact (optional)'),
    })[field];
  const placeholder = (field: TextField) =>
    ({
      target: 'イノシシ・ニホンジカ',
      period: '令和8年11月15日〜令和9年2月15日',
      setter: '○○猟友会',
      contact: '000-0000-0000',
    })[field];

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('trap-sign').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      {/* The paper size of this page's print follows the choice. */}
      <style>{`@media print { @page { size: ${paper === 'a4' ? 'A4' : 'A3'} portrait; margin: 0; } }`}</style>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <ToolLayout
          resultLabel={t('プレビューと印刷', 'Preview and print')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="sign" className="text-xl font-medium">
                {t('看板の内容', 'What the sign says')}
              </h2>
              <SegmentedControl
                legend={t('見出し', 'Headline')}
                orientation="inline"
                value={fields.headline}
                options={SIGN_HEADLINES.map((value) => ({ value, label: HEADLINE_TEXT[value].ja }))}
                onChange={(value) => setFields((state) => ({ ...state, headline: value as SignHeadline }))}
              />
              {(['target', 'period', 'setter', 'contact'] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <label htmlFor={`${formId}-${field}`} className="block text-sm font-medium">
                    {fieldLabel(field)}
                  </label>
                  <input
                    id={`${formId}-${field}`}
                    type="text"
                    maxLength={SIGN_FIELD_MAX_LENGTH}
                    value={fields[field]}
                    placeholder={placeholder(field)}
                    onChange={(event) => setFields((state) => ({ ...state, [field]: event.target.value }))}
                  />
                </div>
              ))}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={fields.english}
                  onChange={(event) => setFields((state) => ({ ...state, english: event.target.checked }))}
                />
                {t('英語の行を加える', 'Add English lines')}
              </label>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('プレビューと印刷', 'Preview and print')}</h2>
              <SegmentedControl
                legend={t('用紙', 'Paper')}
                orientation="inline"
                value={paper}
                options={(['a4', 'a3'] as const).map((value) => ({ value, label: value.toUpperCase() }))}
                onChange={(value) => setPaper(value as SignPaper)}
              />
              <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                <SignSheet
                  layout={layout}
                  label={t('印刷する看板のプレビュー', 'Preview of the sign')}
                  className="mx-auto max-h-[32rem] w-full drop-shadow-sm"
                />
                <figcaption className="text-center text-sm text-on-surface-variant">
                  {t(
                    `${paper.toUpperCase()} 縦（${widthMm} × ${heightMm} mm）`,
                    `${paper.toUpperCase()} portrait (${widthMm} × ${heightMm} mm)`,
                  )}
                </figcaption>
              </figure>
              <Button className="w-full" onClick={() => window.print()}>
                <LuPrinter aria-hidden="true" />
                {t('印刷する', 'Print')}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '屋外では耐水紙に印刷するか、ラミネートしてください。わな本体には別に、住所・氏名・登録番号などの標識が要ります。',
                  'Outdoors, print on waterproof paper or laminate it. Each trap still needs its own tag with the address, name and registration number.',
                )}
              </p>
            </Card>
          }
          extras={
            <ConditionSection
              id="rules"
              title={t('看板についての定め', 'Rules on signs')}
              summary={t(
                '和歌山県は、12 cm を超えるくくりわなを使う条件にしています。',
                'Wakayama makes a sign a condition for snares over 12 cm.',
              )}
            >
              <ul className="space-y-3 text-sm">
                {Object.values(TRAP_SIGN_SOURCES).map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                    <p lang="ja" className="mt-1 text-on-surface-variant">
                      「{source.quote}」
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-on-surface-variant">
                {t(`確認日 ${TRAP_SIGN_SOURCES_CHECKED_ON}`, `Checked ${TRAP_SIGN_SOURCES_CHECKED_ON}`)}
              </p>
            </ConditionSection>
          }
        />
      </div>
      <div className="hidden print:block print:absolute print:top-0 print:left-0">
        <SignSheet layout={layout} actualSize className="block" />
      </div>
    </AppLayout>
  );
}
