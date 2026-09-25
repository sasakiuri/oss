'use client';

import { localPlan, sectorSweep } from '@/lib/drive-hunt';
import { compassPoint } from '@/lib/geodesy';
import type { DriveHuntPlan, ParticipantRole } from '@/lib/schemas/drive-hunt';
import { cn } from '@/lib/utils';
import type { Language } from '@/store';

export const roleNames: Record<ParticipantRole, { ja: string; en: string }> = {
  stand: { ja: '待ち場（タツ）', en: 'Stand' },
  beater: { ja: '勢子', en: 'Beater' },
  dog: { ja: '犬の担当', en: 'Dog handler' },
  leader: { ja: '責任者', en: 'Leader' },
  other: { ja: 'その他', en: 'Other' },
};

const plotSize = 440;
const margin = 40;

/**
 * The plan as it goes on paper: a plan of the stands to scale with north up and the no-fire
 * directions, the stand list, and the roster with a column to sign. Drawn without map tiles so it
 * prints the same anywhere.
 */
export function DriveHuntSheet({
  plan,
  language,
  className,
}: {
  plan: DriveHuntPlan;
  language: Language;
  className?: string;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const layout = localPlan(plan.stands.map((stand) => stand.position));
  const extent =
    Math.max(100, ...layout.map((point) => Math.max(Math.abs(point.east), Math.abs(point.north)))) + plan.sectorLength;
  const scale = (plotSize / 2 - margin) / extent;
  const toPlot = (east: number, north: number) => ({ x: plotSize / 2 + east * scale, y: plotSize / 2 - north * scale });
  const scaleMetres = [10, 20, 50, 100, 200, 500, 1000, 2000].filter((value) => value * scale <= 120).pop() ?? 10;
  const nameOf = (id: string | null) => plan.participants.find((participant) => participant.id === id)?.name || '—';
  const directions = (sectors: DriveHuntPlan['stands'][number]['noFire']) =>
    sectors.length === 0
      ? '—'
      : sectors
          .map(
            (sector) =>
              `${Math.round(sector.from)}°–${Math.round(sector.to)}°（${compassPoint(sector.from, language)}〜${compassPoint(sector.to, language)}）`,
          )
          .join('、');

  return (
    <section
      className={cn('space-y-4 bg-white p-6 text-sm text-black', className)}
      aria-label={t('印刷用の配置図', 'Printable plan')}
    >
      <h1 className="text-xl font-bold">{plan.title || t('巻き狩りの配置図', 'Drive hunt plan')}</h1>
      <p>
        {[
          plan.date && t(`日付: ${plan.date}`, `Date: ${plan.date}`),
          plan.meeting && t(`集合: ${plan.meeting}`, `Meeting: ${plan.meeting}`),
          plan.radio && t(`無線: ${plan.radio}`, `Radio: ${plan.radio}`),
        ]
          .filter(Boolean)
          .join('　')}
      </p>
      {plan.notes && <p className="whitespace-pre-wrap">{plan.notes}</p>}
      {plan.stands.length > 0 && (
        <svg
          viewBox={`0 0 ${plotSize} ${plotSize}`}
          className="mx-auto block h-auto w-full max-w-[12cm] border border-black"
          role="img"
          aria-label={t('待ち場の配置図', 'Plan of the stands')}
        >
          <g stroke="black" strokeWidth={1.5}>
            <line x1={plotSize - 24} y1={48} x2={plotSize - 24} y2={16} />
            <path d={`M${plotSize - 24} 12 l-5 10 h10 z`} fill="black" />
          </g>
          <text x={plotSize - 24} y={62} textAnchor="middle" fontSize={11}>
            {t('真北', 'N')}
          </text>
          {plan.stands.map((stand, index) => {
            const at = toPlot(layout[index]!.east, layout[index]!.north);
            return (
              <g key={stand.id}>
                {stand.noFire.map((sector, sectorIndex) => {
                  const steps = Math.max(2, Math.ceil(sectorSweep(sector) / 5));
                  const points = Array.from({ length: steps + 1 }, (_, step) => {
                    const bearing = ((sector.from + (sectorSweep(sector) * step) / steps) * Math.PI) / 180;
                    const length = plan.sectorLength * scale;
                    return `${at.x + Math.sin(bearing) * length},${at.y - Math.cos(bearing) * length}`;
                  });
                  return (
                    <polygon
                      key={sectorIndex}
                      points={[`${at.x},${at.y}`, ...points].join(' ')}
                      fill="rgba(0,0,0,0.15)"
                      stroke="black"
                      strokeWidth={0.8}
                      strokeDasharray="4 3"
                    />
                  );
                })}
                <circle cx={at.x} cy={at.y} r={10} fill="white" stroke="black" strokeWidth={1.5} />
                <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">
                  {stand.label}
                </text>
              </g>
            );
          })}
          <g>
            <line
              x1={16}
              y1={plotSize - 16}
              x2={16 + scaleMetres * scale}
              y2={plotSize - 16}
              stroke="black"
              strokeWidth={2}
            />
            <text x={16} y={plotSize - 22} fontSize={10}>
              {scaleMetres} m
            </text>
          </g>
        </svg>
      )}
      <p className="text-xs">
        {t(
          '斜線の扇は撃ってはいけない方向（扇の長さは安全な距離ではありません）。方位は真北基準。',
          'Hatched wedges are directions not to shoot; their length is not a safe distance. Bearings from true north.',
        )}
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-black p-1 text-left">{t('待ち場', 'Stand')}</th>
            <th className="border border-black p-1 text-left">{t('担当', 'Assigned')}</th>
            <th className="border border-black p-1 text-left">{t('撃ってはいけない方向', 'Do not shoot toward')}</th>
            <th className="border border-black p-1 text-left">{t('緯度・経度', 'Lat, long')}</th>
          </tr>
        </thead>
        <tbody>
          {plan.stands.map((stand) => (
            <tr key={stand.id}>
              <td className="border border-black p-1">{stand.label}</td>
              <td className="border border-black p-1">{nameOf(stand.assigneeId)}</td>
              <td className="border border-black p-1">{directions(stand.noFire)}</td>
              <td className="border border-black p-1 tabular-nums">
                {stand.position.latitude.toFixed(5)}, {stand.position.longitude.toFixed(5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full border-collapse break-inside-avoid">
        <caption className="text-left font-bold">{t('参加者名簿', 'Roster')}</caption>
        <thead>
          <tr>
            <th className="border border-black p-1 text-left">{t('氏名', 'Name')}</th>
            <th className="border border-black p-1 text-left">{t('役割', 'Role')}</th>
            <th className="border border-black p-1 text-left">{t('待ち場', 'Stand')}</th>
            <th className="w-1/3 border border-black p-1 text-left">
              {t('署名（説明を受けた）', 'Signature (briefed)')}
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.participants.map((participant) => (
            <tr key={participant.id} className="h-9">
              <td className="border border-black p-1">{participant.name}</td>
              <td className="border border-black p-1">{roleNames[participant.role][language]}</td>
              <td className="border border-black p-1">
                {plan.stands.find((stand) => stand.assigneeId === participant.id)?.label ?? ''}
              </td>
              <td className="border border-black p-1" />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
