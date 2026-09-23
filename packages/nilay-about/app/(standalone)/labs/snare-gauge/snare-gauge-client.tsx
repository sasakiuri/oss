'use client';

import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { LuPrinter } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  formatCentimetres,
  getSnareGaugeLayout,
  defaultSnareGaugeSize,
  getSnareRequirements,
  isPastDate,
  todayInJapan,
  isPossiblyApplicable,
  type EvaluatedSnareCase,
  type SnareCaseState,
  type SnareGaugeSizeMm,
  type SnareRequirements,
  type SnareTargetSpecies,
} from '@/lib/snare-gauge';
import { SNARE_DATA_CHECKED_ON, SNARE_PREFECTURE_RULES, type SnareSource } from '@/lib/snare-gauge-data';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { SNARE_GAUGE_STORAGE_KEY, initialSnareGaugeSettings, useSnareGaugeStore } from './_store';
import styles from './snare-gauge-print.module.css';
import { SnareGaugeSheet, type SnareGaugeSheetText } from './snare-gauge-sheet';

const REGULATION_URL = 'https://laws.e-gov.go.jp/law/414M60001000028';
const MEASURING_NOTICE_URL = 'https://www.env.go.jp/nature/choju/effort/effort6/effort6-R03/ref04.pdf';
const GUNMA_RULE_URL = 'https://www.pref.gunma.jp/page/7144.html';

const SPECIES: readonly SnareTargetSpecies[] = ['boar', 'deer', 'other'];

function speciesName(species: SnareTargetSpecies, language: Language): string {
  if (language === 'ja') return species === 'boar' ? 'イノシシ' : species === 'deer' ? 'ニホンジカ' : 'その他の獣類';
  return species === 'boar' ? 'Wild boar' : species === 'deer' ? 'Sika deer' : 'Other mammals';
}

function limitText(limitMm: number | null, language: Language): string {
  if (limitMm === null) return language === 'ja' ? '上限なし' : 'No limit';
  return language === 'ja' ? `${formatCentimetres(limitMm)} cm 以下` : `${formatCentimetres(limitMm)} cm or less`;
}

/** The relaxed limits that may apply, in a few words, or null when none may apply today. */
function possibleLimitText(requirements: SnareRequirements, language: Language): string | null {
  if (requirements.possibleLimits.length === 0) return null;
  return requirements.possibleLimits.map((limit) => limitText(limit, language)).join(language === 'ja' ? '／' : ' / ');
}

function stateText(state: SnareCaseState, language: Language): string {
  const ja = language === 'ja';
  switch (state) {
    case 'conditional':
      return ja ? '区域・条件に当たる場合' : 'If the area and conditions are met';
    case 'inPeriod':
      return ja ? '期間内（区域・条件に当たる場合）' : 'In period (if the area and conditions are met)';
    case 'outOfPeriod':
      return ja ? '期間外' : 'Out of period';
    case 'periodUndetermined':
      return ja ? '期間は毎年決まります（判定しません）' : 'Period set each year; not checked here';
    case 'disputed':
      return ja ? '資料が食い違うため適用しません' : 'Not applied: prefectural documents disagree';
    case 'expired':
      return ja ? '計画の期間が過ぎています' : 'The plan period has ended';
  }
}

export function SnareGaugeClient() {
  const { prefecture, species, gaugeMm: chosenGaugeMm, setPrefecture, setSpecies, setGaugeMm } = useSnareGaugeStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((state) => state.available);
  const storageDiscarded = useDiscardedSave(SNARE_GAUGE_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState('');
  // Bumped by a timer to re-render; the date is read on every render.
  const [, setTick] = useState(0);
  // Set when a print met a gauge size that lapsed with the date.
  const [printNotice, setPrintNotice] = useState<'stopped' | 'switched' | null>(null);

  /**
   * Resets a gauge size that has lapsed by the date in Japan to 12 cm and renders it before
   * printing. Returns true when it did.
   */
  const settleGaugeForPrint = useCallback((): boolean => {
    const state = useSnareGaugeStore.getState();
    const fresh = getSnareRequirements(state.prefecture, state.species, todayInJapan(new Date()));
    if (fresh.gaugeSizesMm.includes(state.gaugeMm)) return false;
    flushSync(() => {
      state.setGaugeMm(defaultSnareGaugeSize());
      setTick((tick) => tick + 1);
    });
    return true;
  }, []);

  useEffect(() => {
    // Ctrl/Cmd+P and the browser menu print without the button, so they are checked here too.
    const beforePrint = () => {
      if (settleGaugeForPrint()) setPrintNotice('switched');
    };
    window.addEventListener('beforeprint', beforePrint);
    return () => window.removeEventListener('beforeprint', beforePrint);
  }, [settleGaugeForPrint]);

  useEffect(() => {
    void Promise.all([useSnareGaugeStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    // The periods and plan ends turn on the date, so a page left open over midnight renders again.
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  // A fixed date until mounted, so the server HTML and the first client render agree.
  const today = ready ? todayInJapan(new Date()) : SNARE_DATA_CHECKED_ON;
  const requirements = getSnareRequirements(prefecture, species, today);
  // A relaxed size lapses with its relaxation; the statutory size is used from then on.
  const gaugeOffered = requirements.gaugeSizesMm.includes(chosenGaugeMm);
  const gaugeMm = gaugeOffered ? chosenGaugeMm : defaultSnareGaugeSize();

  useEffect(() => {
    if (ready && !gaugeOffered) setGaugeMm(defaultSnareGaugeSize());
  }, [ready, gaugeOffered, setGaugeMm]);
  const print = () => {
    if (settleGaugeForPrint()) {
      setPrintNotice('stopped');
      return;
    }
    setPrintNotice(null);
    window.print();
  };
  const rule = requirements.prefecture;
  const placeName = rule ? (language === 'ja' ? rule.name : rule.nameEn) : t('法令の基準', 'The national rule');
  const layout = getSnareGaugeLayout(gaugeMm);
  const statutory = limitText(requirements.statutoryLimitMm, language);
  const possible = possibleLimitText(requirements, language);

  const summaryMessage = t(
    `${placeName}・${speciesName(species, language)}：輪の直径は法令の基準で${statutory}。${possible ? `条件つきで${possible}の場合あり。` : ''}ゲージ ${formatCentimetres(gaugeMm)} cm。`,
    `${placeName}, ${speciesName(species, language)}: loop diameter ${statutory} (national rule).${possible ? ` ${possible} may be allowed under conditions.` : ''} Gauge: ${formatCentimetres(gaugeMm)} cm.`,
  );
  // Announced once the choice settles.
  useEffect(() => {
    const timer = window.setTimeout(() => setSummary(summaryMessage), 700);
    return () => window.clearTimeout(timer);
  }, [summaryMessage]);

  const sheetText: SnareGaugeSheetText = {
    title: t(
      `くくりわなの輪の内径ゲージ　${formatCentimetres(gaugeMm)} cm（${gaugeMm} mm）`,
      `Snare loop gauge  ${formatCentimetres(gaugeMm)} cm (${gaugeMm} mm)`,
    ),
    longAxis: t('内径の最大長の直線', 'Longest inner line'),
    measured: t(`直角に交わる内径を測る：${gaugeMm} mm`, `Measure at right angles: ${gaugeMm} mm`),
    strip: t(`止まり帯 ${gaugeMm} mm`, `No-go strip ${gaugeMm} mm`),
    stripHow: t(
      '架設した輪の内側に、最大長の直線と直角に当てる。すき間が残れば上限超過、収まらないかちょうどなら上限以下。',
      'Lay it inside the set loop at right angles to the longest inner line. Room to spare: over the limit. No fit or an exact fit: within it.',
    ),
    slit: t('ワイヤー 4 mm（参考）', 'Wire 4 mm (reference)'),
    ruler: t('100 mm 確認線：定規で測る', '100 mm check line: measure with a ruler'),
    footer: t(
      `「実際のサイズ（100%）」で印刷／目安です。適否は都道府県の案内に従ってください（確認日 ${SNARE_DATA_CHECKED_ON}）`,
      `Print at Actual size (100%). A guide only; follow the prefecture's guidance (checked ${SNARE_DATA_CHECKED_ON}).`,
    ),
  };

  const caseLine = ({ relaxation, state }: EvaluatedSnareCase, index: number) => (
    <li
      key={index}
      className={cn(
        'space-y-1 rounded-sm p-3',
        isPossiblyApplicable(state) ? 'bg-surface-container' : 'border border-outline-variant',
      )}
    >
      <p className="font-medium">
        {relaxation.species.map((value) => speciesName(value, language)).join(t('・', ', '))}：
        {limitText(relaxation.limitMm, language)}
        {relaxation.limitMm === null && t('（ゲージ不要）', ' (no gauge needed)')}
      </p>
      <p className="text-on-surface-variant">
        {t('状態：', 'Status: ')}
        {stateText(state, language)}
      </p>
      {/* Only the prefecture's own wording is marked as Japanese. */}
      <p className="text-on-surface-variant">
        {t('区域：', 'Area: ')}
        <span lang="ja">{relaxation.area}</span>
      </p>
      {relaxation.period && (
        <p className="text-on-surface-variant">
          {t('期間：', 'Period: ')}
          <span lang="ja">{relaxation.period}</span>
        </p>
      )}
      {relaxation.conditions?.map((condition) => (
        <p key={condition} className="text-on-surface-variant">
          {t('条件：', 'Condition: ')}
          <span lang="ja">{condition}</span>
        </p>
      ))}
      {relaxation.disputed && (
        <p lang="ja" className="text-on-surface-variant">
          {relaxation.disputed}
        </p>
      )}
      <SourceList sources={relaxation.evidence} language={language} />
    </li>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('snare-gauge').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '都道府県・獣種・ゲージの大きさを初期値に戻します。',
                  en: 'Resets the prefecture, species and gauge size.',
                }}
                onReset={() => useSnareGaugeStore.setState({ ...initialSnareGaugeSettings })}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted from the first paint; a live region inserted with its text is not announced. */}
      <p className="sr-only" role="status" lang={language}>
        {storageDiscarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {ready ? summary : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={SNARE_GAUGE_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('適用される要件', 'Requirements that apply')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="choice" className="text-xl font-medium">
                {t('都道府県と獣種', 'Prefecture and species')}
              </h2>
              <SelectField
                fieldId="snare-gauge-prefecture"
                label={t('狩猟をする都道府県', 'Prefecture where you hunt')}
                value={prefecture}
                onChange={setPrefecture}
                options={[
                  { value: 'national', label: t('選ばない（法令の基準のみ）', 'None (the national rule only)') },
                  ...SNARE_PREFECTURE_RULES.map((entry) => ({
                    value: entry.code,
                    label: language === 'ja' ? entry.name : entry.nameEn,
                  })),
                ]}
                hint={t(
                  '都道府県の緩和は狩猟だけに適用されます。許可捕獲は許可証・従事者証の条件に従います。',
                  'Prefectural relaxations apply to hunting only. Capture under permit follows the permit conditions.',
                )}
              />
              <SegmentedControl
                legend={t('捕獲する獣', 'Target animal')}
                value={species}
                onChange={(value) => setSpecies(value as SnareTargetSpecies)}
                orientation="inline"
                options={SPECIES.map((value) => ({ value, label: speciesName(value, language) }))}
              />
              <p className="text-xs text-on-surface-variant">
                {t(
                  '鳥類、ヒグマ、ツキノワグマの捕獲等にわなを使うことは禁止されています（施行規則第 10 条第 3 項第 8 号）。',
                  'Traps may not be used to take birds, brown bears or Asian black bears (Regulation art. 10(3)(viii)).',
                )}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="requirements" className="text-xl font-medium">
                {t('適用される要件', 'Requirements that apply')}
              </h2>
              <ResultPanel className={possible ? 'sm:grid-cols-2' : undefined}>
                <ResultFigure
                  size="lead"
                  label={t(
                    `輪の直径（${rule ? `${placeName}・` : ''}${speciesName(species, language)}）`,
                    `Loop diameter (${rule ? `${placeName}, ` : ''}${speciesName(species, language)})`,
                  )}
                  value={statutory}
                  note={possible ? t('法令の基準', 'National rule') : undefined}
                />
                {possible && (
                  <ResultFigure
                    label={t('条件つきの緩和', 'Relaxed, under conditions')}
                    value={possible}
                    note={t('区域・期間・条件は下を確認', 'See the area, period and conditions below')}
                  />
                )}
              </ResultPanel>
              {requirements.expired && rule?.validUntil && (
                <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {t(
                    `緩和の根拠の計画は ${rule.validUntil} までのため、法令の基準で表示しています。現在の扱いは${rule.name}に確認してください。`,
                    `The plan behind this relaxation ran until ${rule.validUntil}. The national rule is shown; ask ${rule.nameEn} for the current rules.`,
                  )}
                </p>
              )}
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="font-medium">{t('締付け防止金具', 'Tightening stopper')}：</span>
                  {t('装着が必要', 'Required')}
                  {prefecture === 'kagoshima' &&
                    species !== 'other' &&
                    t(
                      '（鹿児島県の計画の対象地域では「締め付け防止機能」を装備したものも可）',
                      ' (in Kagoshima’s plan areas, a snare with a stopping function is also accepted)',
                    )}
                </li>
                <li>
                  <span className="font-medium">{t('よりもどし', 'Swivel')}：</span>
                  {requirements.swivelRequired ? t('装着が必要', 'Required') : t('法令の定めなし', 'Not set by law')}
                </li>
                <li>
                  <span className="font-medium">{t('ワイヤーの直径', 'Wire diameter')}：</span>
                  {requirements.wireMinMm === null
                    ? t('法令の定めなし', 'Not set by law')
                    : t(`${requirements.wireMinMm} mm 以上`, `${requirements.wireMinMm} mm or more`)}
                </li>
              </ul>
              {rule && (
                <section className="space-y-3 text-sm">
                  <h3 className="font-medium">
                    {t(`${rule.name}の条件つきの緩和`, `Conditional relaxation in ${rule.nameEn}`)}
                    {requirements.status === 'unconfirmed' && t('（未確認）', ' (not confirmed)')}
                  </h3>
                  {language === 'en' && (
                    <p className="text-on-surface-variant">Prefectural details are quoted in Japanese.</p>
                  )}
                  {requirements.cases.length > 0 ? (
                    <ul className="space-y-2">{requirements.cases.map(caseLine)}</ul>
                  ) : rule.status === 'relaxed' ? (
                    <p className="text-on-surface-variant">
                      {species === 'other'
                        ? t(
                            '県の緩和はイノシシ・ニホンジカが対象です。その他の獣類は法令の基準によります。',
                            'The relaxation covers wild boar and sika deer. Other mammals follow the national rule.',
                          )
                        : t(
                            'この獣種には緩和の記載がありません。法令の基準によります。',
                            'No relaxation is published for this species. The national rule applies.',
                          )}
                    </p>
                  ) : null}
                  {rule.status === 'none' && rule.validUntil && isPastDate(rule.validUntil, today) && (
                    <p className="text-on-surface-variant">
                      {t(
                        `緩和なしの根拠とした資料の期間（${rule.validUntil} まで）が過ぎたため、未確認として法令の基準で表示しています。`,
                        `The source for no relaxation ran until ${rule.validUntil}, so this is shown as not confirmed, with the national rule.`,
                      )}
                    </p>
                  )}
                  {rule.notes.map((note) => (
                    <p key={note} lang="ja" className="text-on-surface-variant">
                      {note}
                    </p>
                  ))}
                  {rule.validUntil && requirements.cases.length > 0 && (
                    <p className="text-on-surface-variant">
                      {t(`根拠とした計画の期間：${rule.validUntil} まで`, `Plan period: until ${rule.validUntil}`)}
                    </p>
                  )}
                  {rule.sources.length > 0 && <SourceList sources={rule.sources} language={language} />}
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      '出典は県の案内と管理計画です（告示本文は未確認）。区域・条件に当たるかは、狩猟者登録をする都道府県に確認してください。',
                      'Sources are prefectural guidance and plans (public notices not checked). Ask the prefecture where you register whether the area and conditions apply to you.',
                    )}
                  </p>
                </section>
              )}
            </Card>
          }
          secondary={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="gauge" className="text-xl font-medium">
                {t('実寸ゲージを印刷', 'Print a real-size gauge')}
              </h2>
              {requirements.hasNoLimitCase && (
                <p className="rounded-sm bg-surface-container p-3 text-sm">
                  {t(
                    '上限なしの緩和に当たる場合、ゲージは不要です。当たらない場合は 12 cm のゲージを使います。',
                    'Where a no-limit relaxation applies, no gauge is needed. Otherwise use the 12 cm gauge.',
                  )}
                </p>
              )}
              {requirements.gaugeSizesMm.length > 1 && (
                <SegmentedControl
                  legend={t('ゲージの内径', 'Gauge size')}
                  value={String(gaugeMm)}
                  onChange={(value) => setGaugeMm(Number(value) as SnareGaugeSizeMm)}
                  orientation="inline"
                  options={requirements.gaugeSizesMm.map((size) => ({
                    value: String(size),
                    label: `${formatCentimetres(size)} cm`,
                  }))}
                />
              )}
              <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                <SnareGaugeSheet
                  layout={layout}
                  text={sheetText}
                  label={t(
                    `${formatCentimetres(gaugeMm)} cm のゲージの印刷プレビュー`,
                    `Print preview of the ${formatCentimetres(gaugeMm)} cm gauge`,
                  )}
                  className="mx-auto max-h-[32rem] w-full drop-shadow-sm"
                />
                <figcaption className="text-center text-xs text-on-surface-variant">
                  {t('A4 への配置。画面上は実寸ではありません。', 'Layout on A4. Not actual size on screen.')}
                </figcaption>
              </figure>
              <Button className="w-full" onClick={print}>
                <LuPrinter aria-hidden="true" />
                {t('印刷する', 'Print')}
              </Button>
              {/* Mounted from the start so its first message is announced. */}
              <p role="status" lang={language} className={printNotice ? 'text-sm text-destructive' : 'sr-only'}>
                {printNotice === 'stopped'
                  ? t(
                      '日付が変わり、選んだ大きさが使えなくなったため、印刷せずに 12 cm に戻しました。確認してから印刷し直してください。',
                      'The date has changed and the chosen size no longer applies. Nothing was printed and the gauge is back at 12 cm. Check the page and print again.',
                    )
                  : printNotice === 'switched'
                    ? t(
                        '日付が変わり、選んだ大きさが使えなくなったため、印刷する内容を 12 cm のゲージに切り替えました。',
                        'The date has changed and the chosen size no longer applies, so the 12 cm gauge is printed instead.',
                      )
                    : ''}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '「実際のサイズ（100%）」で印刷し、100 mm 確認線を定規で測ってください。',
                  'Print at Actual size (100%) and measure the 100 mm check line with a ruler.',
                )}
                {gaugeMm === 200 &&
                  t(
                    '20 cm の円は用紙の端近くまであり、プリンターによっては欠けます。',
                    ' The 20 cm circle comes close to the paper edges and some printers clip it.',
                  )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="measuring"
                title={t('輪の直径の測り方', 'How the loop is measured')}
                summary={t(
                  'わなを架設した状態で、内径の最大長の直線に直角に交わる内径を測る。',
                  'With the snare set, measure the inner diameter at right angles to the longest inner line.',
                )}
              >
                <div className="space-y-3 text-sm">
                  <MeasuringFigure language={language} />
                  <blockquote
                    lang="ja"
                    className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                  >
                    <p>
                      なお、輪の直径 12
                      センチメートルの計測は、内径の最大長の直線に直角に交わる内径を計測するものとする。
                    </p>
                  </blockquote>
                  <p>
                    <a href={MEASURING_NOTICE_URL} target="_blank" rel="noreferrer">
                      {t(
                        '環境省「くくりわなに関する捕獲規制」（参考資料4、環境省自然環境局野生生物課長通知の抜粋）',
                        'Ministry of the Environment, capture rules for snares (Reference 4, excerpt of the Wildlife Division notice)',
                      )}
                    </a>
                  </p>
                  <blockquote lang="ja" className="border-l-4 border-outline-variant pl-4 text-on-surface-variant">
                    <p>
                      ※上記9及び10に記載されているくくりわなの直径は、わなを架設した状態で内径の最大長の直線に直角に交わる内径を計測します。
                    </p>
                  </blockquote>
                  <p>
                    <a href={GUNMA_RULE_URL} target="_blank" rel="noreferrer">
                      {t('群馬県「群馬県における狩猟のルール」', 'Gunma Prefecture, hunting rules in Gunma')}
                    </a>
                  </p>
                  <ul className="list-disc space-y-2 pl-5 text-on-surface-variant">
                    <li>
                      {t(
                        '止まり帯は、輪の内側に最大長の直線と直角に当てます。すき間が残れば上限超過、収まらなければ上限以下です。ちょうど収まるときは上限と同じで、違反ではありません。紙の帯ではちょうどかどうか見分けにくいので、定規やノギスで測ってください。',
                        'Lay the no-go strip inside the loop at right angles to the longest inner line. Room to spare: over the limit. Does not fit: within it. An exact fit equals the limit, which is allowed. A paper strip cannot reliably show an exact fit, so check with a ruler or calipers.',
                      )}
                    </li>
                    <li>
                      {t(
                        'ワイヤーの 4 mm のすき間は参考用です。太さはノギスなどで測ってください。',
                        'The 4 mm slit is for reference. Measure the wire with calipers.',
                      )}
                    </li>
                  </ul>
                </div>
              </ConditionSection>
              <ConditionSection
                id="legal"
                title={t('法令の定め', 'What the law requires')}
                summary={t(
                  '鳥獣保護管理法施行規則 第 10 条第 3 項第 8 号から第 10 号',
                  'Wildlife Act Enforcement Regulation art. 10(3)(viii) to (x)',
                )}
              >
                <div className="space-y-3 text-sm">
                  {language === 'en' && (
                    <p className="text-on-surface-variant">
                      Japanese text of the prohibited hunting methods that concern traps.
                    </p>
                  )}
                  <blockquote
                    lang="ja"
                    className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                  >
                    <p>３　法第十二条第一項第三号の環境大臣が禁止する猟法は、次に掲げる猟法とする。</p>
                    <p>
                      八　鳥類並びにＵｒｓｕｓ　ａｒｃｔｏｓ（ヒグマ）及びＵｒｓｕｓ　ｔｈｉｂｅｔａｎｕｓ（ツキノワグマ）の捕獲等をするため、わなを使用する方法
                    </p>
                    <p>
                      九　Ｓｕｓ　ｓｃｒｏｆａ（イノシシ）及びＣｅｒｖｕｓ　ｎｉｐｐｏｎ（ニホンジカ）の捕獲等をするため、くくりわな（輪の直径が十二センチメートルを超えるもの、締付け防止金具が装着されていないもの、よりもどしが装着されていないもの又はワイヤーの直径が四ミリメートル未満であるものに限る。）、おし又はとらばさみを使用する方法
                    </p>
                    <p>
                      十　Ｕｒｓｕｓ　ａｒｃｔｏｓ（ヒグマ）、Ｕｒｓｕｓ　ｔｈｉｂｅｔａｎｕｓ（ツキノワグマ）、Ｓｕｓ　ｓｃｒｏｆａ（イノシシ）及びＣｅｒｖｕｓ　ｎｉｐｐｏｎ（ニホンジカ）以外の獣類の捕獲等をするため、くくりわな（輪の直径が十二センチメートルを超えるもの又は締付け防止金具が装着されていないものに限る。）、おし又はとらばさみを使用する方法
                    </p>
                  </blockquote>
                  <p>
                    <a href={REGULATION_URL} target="_blank" rel="noreferrer">
                      {t(
                        '鳥獣の保護及び管理並びに狩猟の適正化に関する法律施行規則（e-Gov 法令検索）',
                        'The Enforcement Regulation (e-Gov)',
                      )}
                    </a>
                    <span className="text-on-surface-variant">
                      {t(`（確認日 ${SNARE_DATA_CHECKED_ON}）`, ` (checked ${SNARE_DATA_CHECKED_ON})`)}
                    </span>
                  </p>
                  <p className="text-on-surface-variant">
                    {t(
                      '都道府県は第二種特定鳥獣管理計画に基づく特例（法第 14 条）で、対象鳥獣の狩猟に限りこの禁止を一部解除することがあります。',
                      'A prefecture may lift part of this prohibition for the species of its management plan, for hunting only, under Act art. 14.',
                    )}
                  </p>
                </div>
              </ConditionSection>
            </>
          }
        />
      </div>
      <div className={styles.sheet}>
        <SnareGaugeSheet layout={layout} text={sheetText} actualSize className="block" />
      </div>
    </AppLayout>
  );
}

/** The documents a case or a prefecture rests on, each with the words quoted from it. */
function SourceList({ sources, language }: { sources: readonly SnareSource[]; language: Language }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">
        {language === 'ja' ? `出典（確認日 ${SNARE_DATA_CHECKED_ON}）` : `Sources (checked ${SNARE_DATA_CHECKED_ON})`}
      </p>
      <ul className="space-y-2">
        {sources.map((source, index) => (
          <li key={index} lang="ja" className="space-y-1">
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
            {source.quote && (
              <blockquote className="border-l-4 border-outline-variant pl-3 text-on-surface-variant">
                {source.quote}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Not to scale: a set loop is rarely round, and the diameter that counts is the one across its narrow way. */
function MeasuringFigure({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 0 200 110"
        role="img"
        aria-label={t(
          '楕円形の輪で、最大長の直線に直角に交わる内径を測る図',
          'An oval loop, measured across at right angles to its longest inner line',
        )}
        className={cn('mx-auto w-full max-w-sm text-on-surface')}
      >
        <ellipse cx={100} cy={55} rx={80} ry={40} fill="none" stroke="currentColor" strokeWidth={2} />
        <path d="M 20 55 H 180" fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" />
        <path d="M 100 15 V 95" fill="none" stroke="currentColor" strokeWidth={2.5} />
        <text x={140} y={50} fontSize={9} textAnchor="middle" fill="currentColor">
          {t('最大長の直線', 'Longest line')}
        </text>
        <text x={104} y={80} fontSize={9} fill="currentColor">
          {t('ここを測る', 'Measure here')}
        </text>
      </svg>
      <figcaption className="text-center text-xs text-on-surface-variant">
        {t('図は実寸ではありません。', 'Not to scale.')}
      </figcaption>
    </figure>
  );
}
