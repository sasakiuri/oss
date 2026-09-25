'use client';

import { useEffect, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  LanguageMenu,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  ToolLayout,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { labsTool } from '@/lib/labs-tools';
import {
  DEER_MEAN_AGE,
  DEER_WEAR_CLASSES,
  TEETH_AGE_CHECKED_ON,
  TEETH_AGE_SOURCES,
  boarAge,
  deerAge,
  type DeerIncisor,
  type DeerWear,
  type MolarState,
  type ThirdMolarState,
} from '@/lib/teeth-age';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

type Species = 'deer' | 'boar';
const WEARS: readonly DeerWear[] = ['I', 'II', 'III', 'IV'];

/**
 * A few questions about the lower jaw, answered with the jaw in hand. Nothing is saved: the answer
 * goes onto the capture record as the estimated age.
 */
export function TeethAgeClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [species, setSpecies] = useState<Species>('deer');
  const [incisor, setIncisor] = useState<DeerIncisor | null>(null);
  const [wear, setWear] = useState<DeerWear | null>(null);
  const [m1, setM1] = useState<MolarState | null>(null);
  const [m2, setM2] = useState<MolarState | null>(null);
  const [m3, setM3] = useState<ThirdMolarState | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void rehydrateLanguage().then(() => setReady(true));
  }, []);

  const estimate = species === 'deer' ? deerAge(incisor, wear) : boarAge({ m1, m2, m3 });
  const molar = (legend: string, value: MolarState | null, onChange: (value: MolarState) => void) => (
    <SegmentedControl
      legend={legend}
      orientation="inline"
      value={value ?? ''}
      onChange={(next) => onChange(next as MolarState)}
      options={[
        { value: 'none', label: t('まだ無い', 'Not yet') },
        { value: 'erupting', label: t('生えかけ', 'Coming through') },
        { value: 'erupted', label: t('生えそろった', 'Fully through') },
      ]}
    />
  );

  // The boar is read from the back of the jaw forwards: once the third molar is there, the first two are.
  const askSecond = m3 === 'none';
  const askFirst = askSecond && m2 === 'none';

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('teeth-age').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <ToolLayout
          resultLabel={t('年齢の目安', 'Age class')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="questions" className="text-xl font-medium">
                {t('下あごの歯を見る', 'Look at the lower jaw')}
              </h2>
              <SegmentedControl
                legend={t('動物', 'Animal')}
                orientation="inline"
                value={species}
                onChange={(value) => setSpecies(value as Species)}
                options={[
                  { value: 'deer', label: t('ニホンジカ', 'Sika deer') },
                  { value: 'boar', label: t('イノシシ', 'Wild boar') },
                ]}
              />
              {species === 'deer' ? (
                <>
                  <SegmentedControl
                    legend={t(
                      '下あごの中央の前歯（第一切歯）',
                      'The middle front teeth of the lower jaw (first incisors)',
                    )}
                    orientation="inline"
                    value={incisor ?? ''}
                    onChange={(value) => setIncisor(value as DeerIncisor)}
                    options={[
                      { value: 'deciduous', label: t('乳歯', 'Milk teeth') },
                      { value: 'permanent', label: t('永久歯', 'Permanent') },
                    ]}
                  />
                  {incisor === 'permanent' && (
                    <SegmentedControl
                      legend={t('第一切歯の摩滅（すり減り）', 'Wear of the first incisor')}
                      orientation="vertical"
                      value={wear ?? ''}
                      onChange={(value) => setWear(value as DeerWear)}
                      options={WEARS.map((value) => ({
                        value,
                        label: `${value}：${DEER_WEAR_CLASSES[value][language]}`,
                      }))}
                    />
                  )}
                </>
              ) : (
                <>
                  <SegmentedControl
                    legend={t('いちばん奥の臼歯（第三後臼歯）', 'The rearmost molar (third molar)')}
                    orientation="vertical"
                    value={m3 ?? ''}
                    onChange={(value) => setM3(value as ThirdMolarState)}
                    options={[
                      { value: 'none', label: t('まだ無い', 'Not yet') },
                      { value: 'm3-1', label: t('第 1・第 2 咬頭まで出ている', 'Cusps 1 and 2 are through') },
                      { value: 'm3-2', label: t('第 3・第 4 咬頭まで出ている', 'Up to cusps 3 and 4') },
                      { value: 'm3-3', label: t('第 5・第 6 咬頭まで出ている', 'Up to cusps 5 and 6') },
                      { value: 'full', label: t('最後の第 7 咬頭まで出ている', 'The last, 7th cusp is through') },
                    ]}
                  />
                  {askSecond && molar(t('第二後臼歯', 'The second molar'), m2, setM2)}
                  {askFirst && molar(t('第一後臼歯', 'The first molar'), m1, setM1)}
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '後臼歯は前臼歯より後ろの臼歯で、前から第一・第二・第三と数えます。',
                      'Molars are the cheek teeth behind the premolars, counted first, second and third from the front.',
                    )}
                  </p>
                </>
              )}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('年齢の目安', 'Age class')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={species === 'deer' ? t('ニホンジカ', 'Sika deer') : t('イノシシ', 'Wild boar')}
                  value={estimate ? estimate.label[language] : '—'}
                  note={estimate ? undefined : t('質問に答えると表示します。', 'Answer the questions to see it.')}
                />
              </ResultPanel>
              {estimate && <p className="text-sm">{estimate.basis[language]}</p>}
              {species === 'deer' && incisor === 'permanent' && wear && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `この摩滅クラスの平均年齢（兵庫県本州部）：オス ${DEER_MEAN_AGE[wear].male} 歳、メス ${DEER_MEAN_AGE[wear].female} 歳。クラス III 以上ではオスの方が摩滅が早く進みます。`,
                    `Mean age in this class (Hyogo, Honshu): males ${DEER_MEAN_AGE[wear].male}, females ${DEER_MEAN_AGE[wear].female} years. From class III, males wear faster.`,
                  )}
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                {species === 'deer'
                  ? t(
                      '兵庫県で捕獲されたシカ 249 頭の調査によります。摩滅の速さは食物や生息環境で変わります。正確な年齢は歯根のセメント質の年輪で調べます。',
                      'From a study of 249 deer taken in Hyogo. Wear depends on food and habitat. An exact age needs the cementum annuli of the tooth root.',
                    )
                  : t(
                      '兵庫県のイノシシ 517 頭の調査によります。歯の萌出には 7〜8 か月の個体差があり、月齢の査定はできません。誕生日は便宜上 5 月 1 日としています。',
                      'From a study of 517 wild boar in Hyogo. Eruption varies by 7 to 8 months between animals, so the age in months cannot be told. The study takes 1 May as the birthday.',
                    )}
              </p>
            </Card>
          }
          extras={
            <ConditionSection
              id="sources"
              title={t('出典', 'Sources')}
              summary={t(
                `兵庫県の調査 2 件（${TEETH_AGE_CHECKED_ON} 確認）`,
                `Two studies from Hyogo (checked ${TEETH_AGE_CHECKED_ON})`,
              )}
            >
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {Object.values(TEETH_AGE_SOURCES).map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                      {source.title}
                    </a>
                    <span className="text-on-surface-variant">　{source.note}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-on-surface-variant">
                {t(
                  'シカは第一切歯の摩滅クラス（表 2）と、摩滅クラスごとの年齢の範囲（摘要）。イノシシは後臼歯の萌出の時期（5-3-1、図 6）。',
                  'Deer: the wear classes of the first incisor and the age range of each. Wild boar: when each molar comes through.',
                )}
              </p>
              {language === 'en' && <p className="text-xs text-on-surface-variant">The sources are in Japanese.</p>}
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
