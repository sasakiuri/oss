// SPDX-License-Identifier: MIT
import type { VistaDefinition, VistaParticipant } from '@sasakiuri/saika-protocol/Vista';
import { useId } from 'react';

const colors = {
  background: '#1E1E1E',
  outer: '#E0E0E0',
  outerLine: '#2D2D2D',
  inner: '#02C38D',
  innerLine: '#FFFFFF',
  ten: '#FE0100',
  nine: '#FDFE03',
  lower: '#0066FF',
  previous: '#444444',
};

function shotColor(score: number | null, latest: boolean): string {
  if (!latest || score === null) return colors.previous;
  if (score >= 10) return colors.ten;
  return score >= 9 ? colors.nine : colors.lower;
}

export function Target({
  definition,
  shots,
  zoom,
}: {
  definition: VistaDefinition;
  shots: VistaParticipant['shots'];
  zoom: number;
}) {
  const clip = `target-${useId().replace(/:/g, '')}`;
  const target = definition.target;
  const half = target.outerDiameter / 2 / zoom;
  const radius = target.shotDiameter / 2;
  // Scale annotation sizes from a 400 px tile into the millimetre view box.
  const annotationScale = (half * 2) / 400;
  const rings = [...target.rings].sort((a, b) => b.diameter - a.diameter);
  const latest = shots.reduce<VistaParticipant['shots'][number] | undefined>(
    (a, b) => (!a || b.sequence > a.sequence ? b : a),
    undefined,
  );
  const missing = shots.filter((s) => s.x === null || s.y === null).length;
  const outside = shots.filter(
    (s) => s.x !== null && s.y !== null && (Math.abs(s.x) > half || Math.abs(s.y) > half),
  ).length;
  return (
    <div className="target-wrap">
      <svg
        className="target"
        viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
        role="img"
        aria-label={`${definition.name} target, ${zoom} times zoom, ${shots.length - missing} located shots`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={-half} y={-half} width={half * 2} height={half * 2} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect x={-half} y={-half} width={half * 2} height={half * 2} fill={colors.background} />
          {rings.map((ring) => {
            const inner = ring.diameter <= target.blackDiameter;
            return (
              <circle
                key={ring.score}
                r={ring.diameter / 2}
                fill={ring.score === 10 ? 'none' : inner ? colors.inner : colors.outer}
                stroke={inner || ring.score === 10 ? colors.innerLine : colors.outerLine}
                strokeWidth={2 * annotationScale}
                data-ring={ring.score}
              />
            );
          })}
          <g
            fontFamily="sans-serif"
            fontWeight="bold"
            fontSize={16 * annotationScale}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {rings.map((ring, index) => {
              if (ring.score > 8) return null;
              const currentRadius = ring.diameter / 2;
              const nextRadius = (rings[index + 1]?.diameter ?? 0) / 2;
              const midpoint = (currentRadius + nextRadius) / 2;
              const labelRadius = ring.score <= 2 ? Math.max(currentRadius - 10 * annotationScale, midpoint) : midpoint;
              return (
                <g key={ring.score} fill={ring.diameter <= target.blackDiameter ? colors.innerLine : colors.outerLine}>
                  <text x={0} y={-labelRadius}>
                    {ring.score}
                  </text>
                  <text x={0} y={labelRadius}>
                    {ring.score}
                  </text>
                  <text x={-labelRadius} y={0}>
                    {ring.score}
                  </text>
                  <text x={labelRadius} y={0}>
                    {ring.score}
                  </text>
                </g>
              );
            })}
          </g>
          {shots.map((shot) => {
            if (shot.x === null || shot.y === null) return null;
            const isLatest = shot.id === latest?.id;
            const color = shotColor(shot.score, isLatest);
            return (
              <g key={shot.id}>
                <circle
                  data-shot-id={shot.id}
                  cx={shot.x}
                  cy={-shot.y}
                  r={radius}
                  fill={color}
                  fillOpacity={shot.recorded ? 0.7 : 0.4}
                  stroke={shot.corrected ? '#ff795c' : '#000000'}
                  strokeWidth={0.5 * annotationScale}
                />
                <text
                  x={shot.x}
                  y={-shot.y}
                  fill={color === colors.nine ? '#000000' : '#FFFFFF'}
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  fontSize={Math.min(radius * 1.4, 56 * annotationScale)}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {shot.sequence}
                </text>
                {isLatest && (
                  <circle
                    data-latest-helper="true"
                    cx={shot.x}
                    cy={-shot.y}
                    r={Math.max(radius * 1.8, half * 0.06)}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(0.2, half * 0.012)}
                    strokeDasharray={`${half * 0.04} ${half * 0.02}`}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {(missing > 0 || outside > 0) && (
        <div className="target-notice">
          {outside > 0 && <span>{outside} outside view</span>}
          {missing > 0 && <span>{missing} without coordinates</span>}
        </div>
      )}
    </div>
  );
}
