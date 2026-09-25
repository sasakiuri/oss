import { castSideLabel, type FitSheet } from '@/lib/gun-fit';

type Language = 'ja' | 'en';

/**
 * A side view of a stock with where each length is taken, drawn to show the points, not to scale:
 * length of pull from the front trigger to the middle of the butt, and the drops down from the line
 * of the rib to the comb and to the heel.
 */
export function StockDiagram({ language, className }: { language: Language; className?: string }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <svg
      viewBox="0 0 400 170"
      role="img"
      aria-label={t(
        '測る位置の図：引き長は前の引き金から床尾の中央まで、コム落差とヒール落差はリブの延長線からコムとヒールまでの縦の距離。',
        'Where to measure: length of pull from the front trigger to the middle of the butt; drop at comb and at heel measured down from the line of the rib.',
      )}
      className={className}
    >
      {/* The line of the rib, carried back over the stock. */}
      <line x1={10} y1={30} x2={390} y2={30} stroke="currentColor" strokeWidth={1} strokeDasharray="6 4" />
      <text x={12} y={22} fontSize={11} fill="currentColor">
        {t('リブの延長線', 'Line of the rib')}
      </text>
      {/* Receiver and stock outline. */}
      <path
        d="M10 30 H150 V60 L175 75 L200 68 Q260 50 350 55 L372 60 L372 140 L330 140 Q250 110 205 100 L165 110 L150 90 H10 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {/* Trigger. */}
      <path d="M165 90 Q160 105 170 112" fill="none" stroke="currentColor" strokeWidth={2} />
      {/* Length of pull. */}
      <line x1={168} y1={125} x2={372} y2={125} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#fit-arrow)" />
      <text x={200} y={122} fontSize={11} fill="currentColor">
        {t('引き長', 'Length of pull')}
      </text>
      {/* Drop at comb and at heel. */}
      <line x1={205} y1={30} x2={205} y2={64} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#fit-arrow)" />
      <text x={210} y={48} fontSize={11} fill="currentColor">
        {t('コム落差', 'Drop at comb')}
      </text>
      <line x1={360} y1={30} x2={360} y2={57} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#fit-arrow)" />
      <text x={290} y={48} fontSize={11} fill="currentColor">
        {t('ヒール落差', 'Drop at heel')}
      </text>
      <defs>
        <marker id="fit-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

/** The sheet as printed on A4: the measurements with empty boxes for any left blank, and the figure. */
export function FitPrintSheet({ sheet, language }: { sheet: FitSheet; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const unit = sheet.unit === 'mm' ? 'mm' : 'in';
  const value = (length: number | null) => (length === null ? '' : `${length} ${unit}`);
  const rows: [string, string][] = [
    [
      t('引き長（前の引き金 → 床尾の中央）', 'Length of pull (front trigger to middle of butt)'),
      value(sheet.lengthOfPull),
    ],
    [t('コム落差', 'Drop at comb'), value(sheet.dropAtComb)],
    [t('ヒール落差', 'Drop at heel'), value(sheet.dropAtHeel)],
    [
      t('キャスト（床尾の中央の横のずれ）', 'Cast (sideways offset of the middle of the butt)'),
      sheet.cast === null ? '' : `${value(sheet.cast)} ${castSideLabel(sheet.castSide, language)}`,
    ],
  ];
  return (
    <div lang={language} style={{ padding: '15mm', color: '#000', fontSize: '11pt' }}>
      <h1 style={{ fontSize: '16pt', marginBottom: '6mm' }}>{t('銃床の寸法シート', 'Stock dimension sheet')}</h1>
      <p>
        {t('銃', 'Gun')}: {sheet.name || '＿＿＿＿＿＿＿＿＿＿'}　{t('射手', 'Shooter')}:{' '}
        {sheet.shooter || '＿＿＿＿＿＿＿＿'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6mm 0' }}>
        <tbody>
          {rows.map(([label, text]) => (
            <tr key={label}>
              <th style={{ border: '1px solid #000', padding: '3mm', textAlign: 'left', fontWeight: 'normal' }}>
                {label}
              </th>
              <td style={{ border: '1px solid #000', padding: '3mm', width: '45mm' }}>{text}</td>
            </tr>
          ))}
          <tr>
            <th style={{ border: '1px solid #000', padding: '3mm', textAlign: 'left', fontWeight: 'normal' }}>
              {t('メモ', 'Note')}
            </th>
            <td style={{ border: '1px solid #000', padding: '3mm', height: '25mm', whiteSpace: 'pre-wrap' }}>
              {sheet.note}
            </td>
          </tr>
        </tbody>
      </table>
      <StockDiagram language={language} className="block h-auto w-full" />
      <p style={{ fontSize: '9pt', marginTop: '4mm' }}>
        {t(
          'キャストは銃の後ろから銃口の方向を見たときの向き。測り方の定義：Orvis「Shotgun Stock & Measurements」、Browning「How do you determine the proper fit of your shotgun stock?」。',
          'Cast is seen from behind the gun looking towards the muzzle. Definitions: Orvis, “Shotgun Stock & Measurements”; Browning, “How do you determine the proper fit of your shotgun stock?”.',
        )}
      </p>
    </div>
  );
}
