'use client';

import type { TargetLeadResult } from '@/lib/target-lead';

const SIZE = 240;
const PAD = 24;

interface LeadDiagramsProps {
  result: TargetLeadResult;
  crossingAngleDegrees: number;
  elevationDegrees: number;
  climbDegrees: number;
  language: 'ja' | 'en';
}

/**
 * Two sketches of the answer, not to scale with the page: what the shooter sees (the target when the
 * trigger is pulled and the point to aim at, in degrees of swing), and the ground from above (the
 * shooter, the target's path and the meeting point). Both are scaled to fit, and a text alternative
 * gives the same figures as the result panel.
 */
export function LeadDiagrams({
  result,
  crossingAngleDegrees,
  elevationDegrees,
  climbDegrees,
  language,
}: LeadDiagramsProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const format = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  // Shooter's view: the target at the centre, the aiming point offset by the swing in each direction.
  const h = result.horizontalDegrees;
  const v = result.verticalDegrees;
  const reach = Math.max(Math.abs(h), Math.abs(v), 0.5) * 1.25;
  const viewScale = (SIZE / 2 - PAD) / reach;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const ax = cx + h * viewScale;
  const ay = cy - v * viewScale;

  // From above: the shooter at the bottom centre, the target out in front at the range.
  const heading = (crossingAngleDegrees * Math.PI) / 180;
  // Lengths on the ground: the range and the target's travel laid flat.
  const along = result.distanceMeters * Math.cos((elevationDegrees * Math.PI) / 180);
  const travel = result.targetSpeedMps * result.totalSeconds * Math.cos((climbDegrees * Math.PI) / 180);
  const meetX = Math.sin(heading) * travel;
  const meetY = along - Math.cos(heading) * travel;
  const extent = Math.max(along, Math.abs(meetY), Math.abs(meetX), 1) * 1.1;
  const mapScale = (SIZE - 2 * PAD) / extent;
  const toX = (x: number) => SIZE / 2 + x * mapScale;
  const toY = (y: number) => SIZE - PAD - y * mapScale;

  const viewLabel = t(
    `射手から見た図。的の中心から、横に ${format(Math.abs(h), 2)} 度${h >= 0 ? '進行方向へ' : ''}、縦に ${format(Math.abs(v), 2)} 度${v >= 0 ? '上' : '下'}を狙います。`,
    `Shooter’s view. Aim ${format(Math.abs(h), 2)}° sideways${h >= 0 ? ' ahead' : ''} and ${format(Math.abs(v), 2)}° ${v >= 0 ? 'above' : 'below'} the target.`,
  );
  const mapLabel = t(
    `真上から見た図。的は水平に ${format(along)} m 先から ${format(travel)} m 進んで弾と会います。`,
    `From above. The target, ${format(along)} m out along the ground, moves ${format(travel)} m before the shot meets it.`,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <figure className="space-y-2">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={viewLabel} className="h-auto w-full">
          <rect x={0} y={0} width={SIZE} height={SIZE} className="fill-surface-container-low" />
          <line x1={0} x2={SIZE} y1={cy} y2={cy} className="stroke-outline-variant" strokeWidth={1} />
          <line x1={cx} x2={cx} y1={0} y2={SIZE} className="stroke-outline-variant" strokeWidth={1} />
          <line
            x1={cx}
            y1={cy}
            x2={ax}
            y2={ay}
            className="stroke-on-surface-variant"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <circle cx={cx} cy={cy} r={7} className="fill-tertiary" />
          <circle cx={ax} cy={ay} r={9} fill="none" className="stroke-primary" strokeWidth={2} />
          <line x1={ax - 13} x2={ax + 13} y1={ay} y2={ay} className="stroke-primary" strokeWidth={2} />
          <line x1={ax} x2={ax} y1={ay - 13} y2={ay + 13} className="stroke-primary" strokeWidth={2} />
          <text x={cx + 10} y={cy + 20} className="fill-on-surface text-[11px]">
            {t('的', 'Target')}
          </text>
          <text x={ax + 12} y={ay - 12} className="fill-on-surface text-[11px]">
            {t('狙う点', 'Aim')}
          </text>
        </svg>
        <figcaption className="text-xs text-on-surface-variant">{t('射手から見た図', 'Shooter’s view')}</figcaption>
      </figure>
      <figure className="space-y-2">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={mapLabel} className="h-auto w-full">
          <rect x={0} y={0} width={SIZE} height={SIZE} className="fill-surface-container-low" />
          <line x1={toX(0)} y1={toY(0)} x2={toX(meetX)} y2={toY(meetY)} className="stroke-primary" strokeWidth={2} />
          <line
            x1={toX(0)}
            y1={toY(along)}
            x2={toX(meetX)}
            y2={toY(meetY)}
            className="stroke-tertiary"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          <line
            x1={toX(0)}
            y1={toY(0)}
            x2={toX(0)}
            y2={toY(along)}
            className="stroke-outline-variant"
            strokeWidth={1}
          />
          <circle cx={toX(0)} cy={toY(0)} r={5} className="fill-on-surface" />
          <circle cx={toX(0)} cy={toY(along)} r={6} className="fill-tertiary" />
          <circle cx={toX(meetX)} cy={toY(meetY)} r={6} fill="none" className="stroke-primary" strokeWidth={2} />
          <text x={toX(0) + 8} y={toY(0) - 4} className="fill-on-surface text-[11px]">
            {t('射手', 'Shooter')}
          </text>
          <text x={toX(0) + 8} y={toY(along) + 4} className="fill-on-surface text-[11px]">
            {t('的（発砲時）', 'Target at the shot')}
          </text>
          <text x={toX(meetX) + 8} y={toY(meetY) - 8} className="fill-on-surface text-[11px]">
            {t('会合点', 'Meeting point')}
          </text>
        </svg>
        <figcaption className="text-xs text-on-surface-variant">{t('真上から見た図', 'From above')}</figcaption>
      </figure>
    </div>
  );
}
