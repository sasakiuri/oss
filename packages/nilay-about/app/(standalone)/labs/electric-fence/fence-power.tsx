'use client';

import { ConditionSection, NumberField } from '@/components/labs';
import type { FenceResult, FenceSpecies } from '@/lib/electric-fence';
import {
  KYOTO_BEAR_ENERGY_GUIDE,
  PANEL_LOSS_FACTOR,
  POWER_SOURCES,
  POWER_SOURCES_CHECKED_ON,
  costEstimate,
  dangerSigns,
  kyotoBearEnergy,
  solarSizing,
  type CostLine,
} from '@/lib/electric-fence-power';
import type { Language } from '@/store';

import { PRICE_IDS, usePowerStore, type PowerNumberKey, type PriceId } from './_store/power';

interface FencePowerProps {
  result: FenceResult | null;
  perimeterM: number;
  species: FenceSpecies;
  language: Language;
}

const orNaN = (value: number | null) => value ?? Number.NaN;
const orNull = (value: number) => (Number.isFinite(value) ? value : null);

/** The energiser, the solar panel and battery, the fittings, and the cost. */
export function FencePower({ result, perimeterM, species, language }: FencePowerProps) {
  const power = usePowerStore();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const wireM = result ? result.base.energizedWireM : null;
  const bear = species === 'bear' ? kyotoBearEnergy(perimeterM) : null;
  const solar = solarSizing({
    energizerW: orNaN(power.energizerW),
    hoursPerDay: orNaN(power.hoursPerDay),
    batteryV: orNaN(power.batteryV),
    peakSunHours: orNaN(power.peakSunHours),
    daysWithoutSun: orNaN(power.daysWithoutSun),
    usablePercent: orNaN(power.usablePercent),
  });
  const signs = dangerSigns(perimeterM, orNaN(power.signSpacingM));

  const quantities: Record<PriceId, number> = {
    wire: result?.total.energizedWireM ?? 0,
    cord: result?.total.cordM ?? 0,
    post: result ? result.total.posts + result.total.outerPosts : 0,
    insulator: result?.total.insulators ?? 0,
    grip: result?.total.grips ?? 0,
    connector: result?.total.connectors ?? 0,
    energizer: 1,
    panel: power.solar ? 1 : 0,
    battery: power.solar ? 1 : 0,
    sign: signs ?? 0,
    earthRod: orNaN(power.earthRods),
    tester: orNaN(power.testers),
    breaker: power.mains ? 1 : 0,
  };
  const lines: CostLine[] = PRICE_IDS.map((id) => ({
    id,
    quantity: quantities[id],
    unitPrice: orNaN(power.prices[id] ?? null),
  }));
  const cost = costEstimate(lines, power.subsidyPercent ?? 0);

  const priceLabel = (id: PriceId) =>
    ({
      wire: t('柵線（通電、1 m）', 'Powered wire (per m)'),
      cord: t('非通電のひも（1 m）', 'Unpowered cord (per m)'),
      post: t('支柱（1 本）', 'Post (each)'),
      insulator: t('ガイシ（1 個）', 'Insulator (each)'),
      grip: t('ゲートグリップ（1 個）', 'Gate handle (each)'),
      connector: t('連結線（1 本）', 'Connecting lead (each)'),
      energizer: t('電源装置（本器）', 'Energiser'),
      panel: t('ソーラーパネル', 'Solar panel'),
      battery: t('バッテリー', 'Battery'),
      sign: t('危険表示板（1 枚）', 'Danger sign (each)'),
      earthRod: t('アース棒（1 本）', 'Earth rod (each)'),
      tester: t('検電器（1 台）', 'Fence tester (each)'),
      breaker: t('漏電遮断器', 'Earth-leakage breaker'),
    })[id];

  const field = (key: PowerNumberKey, label: string, unit: string, hint?: string, check = (v: number) => v > 0) => (
    <NumberField
      label={label}
      unit={unit}
      value={orNaN(power[key])}
      onChange={(value) => power.setNumber(key, orNull(value))}
      invalid={power[key] !== null && !check(power[key])}
      errorText={t('正しい数値を入力してください。', 'Enter a valid number.')}
      hint={hint}
    />
  );

  return (
    <ConditionSection
      id="power"
      title={t('電源装置・ソーラー・付帯資材・費用', 'Energiser, solar, fittings and cost')}
      summary={
        wireM === null
          ? t('柵の計算ができると表示します。', 'Shown once the fence is calculated.')
          : t(
              `電源装置は最大電線長 ${number(wireM, 0)} m 以上${cost && cost.totalYen > 0 ? `・概算 ${number(cost.totalYen, 0)} 円` : ''}`,
              `Energiser rated for ${number(wireM, 0)} m or more${cost && cost.totalYen > 0 ? `, about ¥${number(cost.totalYen, 0)}` : ''}`,
            )
      }
    >
      <div className="space-y-6 text-sm">
        <section className="space-y-2">
          <h3 className="text-base font-medium">{t('電源装置（本器）の能力', 'Energiser rating')}</h3>
          {wireM !== null && (
            <p className="text-base">
              {t(
                `通電する柵線は計 ${number(wireM, 0)} m（予備を含まない）です。カタログの「最大電線長」「最大有効さく線距離」がこれ以上の機種を選びます。`,
                `The powered wire totals ${number(wireM, 0)} m without the spare. Choose a model whose catalogue maximum wire length is at least this.`,
              )}
            </p>
          )}
          {species === 'bear' && (
            <div className="rounded-sm bg-surface-container p-3">
              <p className="font-medium">{t('クマ用の目安（京都府）', 'Guide for a bear fence (Kyoto)')}</p>
              <ul className="mt-1 list-disc pl-5">
                {KYOTO_BEAR_ENERGY_GUIDE.map((row) => (
                  <li key={row.joules} className={bear?.joules === row.joules ? 'font-medium' : undefined}>
                    {t(
                      `${row.joules} J：保全対象の周囲長 ${row.perimeterM[0]}〜${row.perimeterM[1]} m`,
                      `${row.joules} J: perimeter protected ${row.perimeterM[0]}–${row.perimeterM[1]} m`,
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                {bear
                  ? t(
                      `周囲 ${number(perimeterM, 0)} m は ${bear.joules} J の目安に入ります。`,
                      `A ${number(perimeterM, 0)} m perimeter falls under ${bear.joules} J.`,
                    )
                  : t('周囲 900 m を超える場合は、この目安の範囲外です。', 'Beyond 900 m the guide does not apply.')}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {t(
                  '京都府は 4,000 V 以上の機械とし、ジュールは測り方がメーカーごとに違うため比べられないとしています。',
                  'Kyoto asks for 4,000 V or more. Makers measure joules differently, so they cannot be compared across makers.',
                )}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-medium">{t('ソーラーパネルとバッテリー', 'Solar panel and battery')}</h3>
          <label className="flex min-h-10 cursor-pointer items-center gap-3">
            <input type="checkbox" checked={power.solar} onChange={(event) => power.setSolar(event.target.checked)} />
            {t('ソーラーで給電する', 'Powered by solar')}
          </label>
          {power.solar && (
            <>
              <div className="grid grid-cols-2 items-start gap-4">
                {field(
                  'energizerW',
                  t('本器の消費電力', 'Energiser power draw'),
                  'W',
                  t('カタログの値', 'From the catalogue'),
                )}
                {field(
                  'hoursPerDay',
                  t('1 日の稼働時間', 'Hours a day'),
                  t('時間', 'h'),
                  undefined,
                  (v) => v > 0 && v <= 24,
                )}
                {field('batteryV', t('バッテリー電圧', 'Battery voltage'), 'V')}
                {field(
                  'peakSunHours',
                  t('ピーク日照時間', 'Peak sun hours'),
                  t('時間/日', 'h/day'),
                  t(
                    '設置場所の日射量（kWh/m²/日）の少ない月の値。NEDO の日射量データベースで調べられます。',
                    'The site’s solar radiation (kWh/m²/day) in a poor month, from NEDO’s solar radiation database.',
                  ),
                )}
                {field(
                  'daysWithoutSun',
                  t('日照なしで動かす日数', 'Days without sun'),
                  t('日', 'days'),
                  undefined,
                  (v) => v >= 0,
                )}
                {field(
                  'usablePercent',
                  t('使ってよい容量', 'Usable capacity'),
                  '%',
                  t(
                    'Kencove は定格容量の 40〜50 % より深く放電しないよう勧めています。',
                    'Kencove advises not discharging below 40–50 % of rated capacity.',
                  ),
                  (v) => v > 0 && v <= 100,
                )}
              </div>
              {solar ? (
                <dl className="grid grid-cols-2 gap-3 rounded-sm bg-surface-container p-4">
                  <div>
                    <dt className="text-on-surface-variant">{t('パネル出力の目安', 'Panel')}</dt>
                    <dd className="text-2xl font-medium tabular-nums">{number(solar.panelW)} W</dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">{t('バッテリー容量の目安', 'Battery')}</dt>
                    <dd className="text-2xl font-medium tabular-nums">{number(solar.batteryAh)} Ah</dd>
                  </div>
                  <p className="col-span-2 text-xs text-on-surface-variant">
                    {t(
                      `1 日 ${number(solar.dailyWh, 2)} Wh（${number(solar.dailyAh, 2)} Ah）。パネルは 1 日の Wh ÷ ピーク日照時間 × ${PANEL_LOSS_FACTOR}、バッテリーは 1 日の Ah × 日数 ÷ 使ってよい容量。`,
                      `${number(solar.dailyWh, 2)} Wh (${number(solar.dailyAh, 2)} Ah) a day. Panel = daily Wh ÷ peak sun hours × ${PANEL_LOSS_FACTOR}; battery = daily Ah × days ÷ usable share.`,
                    )}
                  </p>
                </dl>
              ) : (
                <p className="text-on-surface-variant">
                  {t(
                    '本器の消費電力・ピーク日照時間・日数を入れると計算します。',
                    'Enter the power draw, peak sun hours and days to size them.',
                  )}
                </p>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                <li>
                  {t(
                    '計算は米国の資材販売店 Kencove の方法です。メーカーが本器に合わせたパネル・バッテリーを指定している場合はそれに従ってください。',
                    'The method is that of Kencove, a US fencing supplier. Where the maker specifies a panel and battery for the energiser, follow it.',
                  )}
                </li>
                <li>
                  {t(
                    'ソーラー式の本器は過充電・過放電の防止機能があるものとされています（農林水産省 別表3）。京都府は、日本海側では冬の日照不足に備えて出力に余裕のあるパネルを勧めています。',
                    'Solar energisers are to have over-charge and over-discharge protection (Ministry of Agriculture, table 3). Kyoto advises a panel with spare output on the Sea of Japan side for the dull winters.',
                  )}
                </li>
              </ul>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-medium">{t('付帯資材', 'Fittings')}</h3>
          <div className="grid grid-cols-2 items-start gap-4">
            {field(
              'signSpacingM',
              t('危険表示板の間隔', 'Danger sign spacing'),
              'm',
              t(
                '法令は「人が見やすいように適当な間隔で」とし、距離は定めていません。',
                'The rule says only “at suitable intervals where people can see them”; no distance is set.',
              ),
            )}
            {field(
              'earthRods',
              t('アース棒の本数', 'Earth rods'),
              t('本', ''),
              t(
                '本数・長さは本器の説明書に従います（日本電気さく協議会）。1 m 以上離して湿った所に（京都府）。',
                'Number and length per the energiser’s manual (association); at least 1 m apart in damp ground (Kyoto).',
              ),
              (v) => v >= 0,
            )}
            {field('testers', t('検電器', 'Fence testers'), t('台', ''), undefined, (v) => v >= 0)}
          </div>
          <p>
            {signs === null
              ? ''
              : t(`危険表示板 ${signs} 枚（周囲 ÷ 間隔）`, `${signs} danger signs (perimeter ÷ spacing)`)}
          </p>
          <label className="flex min-h-10 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={power.mains}
              onChange={(event) => power.setMains(event.target.checked)}
            />
            <span>
              {t(
                '家庭のコンセントなど 30 V 以上の電源から給電し、人が容易に立ち入る場所に設置する',
                'Fed from mains or another supply of 30 V or more, where people can easily go',
              )}
            </span>
          </label>
          {power.mains && (
            <p className="rounded-sm bg-surface-container p-3">
              {t(
                '漏電遮断器（電流動作型、定格感度電流 15 mA 以下、動作時間 0.1 秒以下）が必要です（電気設備の技術基準の解釈 第192条第四号）。',
                'An earth-leakage breaker (current-operated, 15 mA or less, 0.1 s or less) is required (interpretation of the technical standards, art. 192(iv)).',
              )}
            </p>
          )}
          <p className="text-on-surface-variant">
            {t(
              '電路には専用の開閉器（スイッチ）も必要です（同第五号）。経済産業省のチラシは、本器に付いている場合は追加不要としています。',
              'The circuit also needs its own switch (item v). The ministry’s leaflet says none is needed if the energiser has one.',
            )}
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-medium">{t('費用の概算', 'Cost estimate')}</h3>
          <p className="text-on-surface-variant">{t('数量は予備を含みます。', 'Quantities include the spare.')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="py-2 pr-3 font-medium">{t('資材', 'Item')}</th>
                  <th className="py-2 pr-3 font-medium">{t('数量', 'Quantity')}</th>
                  <th className="py-2 pr-3 font-medium">{t('単価（円）', 'Unit price (¥)')}</th>
                  <th className="py-2 font-medium">{t('小計（円）', 'Subtotal (¥)')}</th>
                </tr>
              </thead>
              <tbody>
                {lines
                  .filter((line) => !(Number.isFinite(line.quantity) && line.quantity === 0))
                  .map((line) => (
                    <tr key={line.id} className="border-b border-outline-variant">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {priceLabel(line.id as PriceId)}
                      </th>
                      <td className="py-2 pr-3">{Number.isFinite(line.quantity) ? number(line.quantity) : '—'}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          aria-label={t(
                            `${priceLabel(line.id as PriceId)}の単価`,
                            `Unit price: ${priceLabel(line.id as PriceId)}`,
                          )}
                          value={Number.isFinite(line.unitPrice) ? line.unitPrice : ''}
                          onChange={(event) =>
                            power.setPrice(
                              line.id as PriceId,
                              event.target.value === '' ? null : Number(event.target.value),
                            )
                          }
                          className="w-28"
                        />
                      </td>
                      <td className="py-2">
                        {Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) && line.unitPrice >= 0
                          ? number(line.quantity * line.unitPrice, 0)
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="max-w-xs">
            {field(
              'subsidyPercent',
              t('補助率', 'Subsidy share'),
              '%',
              t('任意', 'Optional'),
              (v) => v >= 0 && v <= 100,
            )}
          </div>
          {cost && (
            <p className="text-lg font-medium tabular-nums">
              {t(`合計 ${number(cost.totalYen, 0)} 円`, `Total ¥${number(cost.totalYen, 0)}`)}
              {power.subsidyPercent
                ? t(`・自己負担 ${number(cost.selfYen, 0)} 円`, `, own share ¥${number(cost.selfYen, 0)}`)
                : ''}
            </p>
          )}
          {cost && cost.missing.length > 0 && (
            <p className="text-on-surface-variant">
              {t(
                `単価が未入力の資材 ${cost.missing.length} 件は合計に含みません。`,
                `${cost.missing.length} items without a price are left out.`,
              )}
            </p>
          )}
        </section>

        <section className="space-y-1">
          <h3 className="text-base font-medium">{t('出典', 'Sources')}</h3>
          <ul className="space-y-1 text-on-surface-variant">
            {Object.values(POWER_SOURCES).map((source) => (
              <li key={source.url} lang="ja">
                {source.publisher}「
                <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                  {source.title}
                </a>
                」
              </li>
            ))}
          </ul>
          <p className="text-xs text-on-surface-variant">
            {t(`確認日 ${POWER_SOURCES_CHECKED_ON}`, `Checked ${POWER_SOURCES_CHECKED_ON}`)}
          </p>
        </section>
      </div>
    </ConditionSection>
  );
}
