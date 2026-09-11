// SPDX-License-Identifier: MIT
import type { VistaDefinition, VistaParticipant } from '@sasakiuri/saika-protocol/Vista';
import { useId } from 'react';

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
          <rect x={-half} y={-half} width={half * 2} height={half * 2} fill="#eee9dc" />
          <circle r={target.blackDiameter / 2} fill="#22272b" />
          {[...target.rings]
            .sort((a, b) => b.diameter - a.diameter)
            .map((ring) => (
              <circle
                key={ring.score}
                r={ring.diameter / 2}
                fill="none"
                stroke={ring.diameter <= target.blackDiameter ? '#8e938e' : '#65665f'}
                strokeWidth={0.16}
                data-ring={ring.score}
              />
            ))}
          {shots.map((shot) =>
            shot.x === null || shot.y === null ? null : (
              <g key={shot.id}>
                <circle
                  data-shot-id={shot.id}
                  cx={shot.x}
                  cy={-shot.y}
                  r={radius}
                  fill={shot.id === latest?.id ? '#e9fc53' : '#f8fafc'}
                  fillOpacity={shot.recorded ? 0.9 : 0.4}
                  stroke={shot.corrected ? '#ff795c' : '#1d2328'}
                  strokeWidth={0.2}
                />
                {shot.id === latest?.id && (
                  <circle
                    data-latest-helper="true"
                    cx={shot.x}
                    cy={-shot.y}
                    r={Math.max(radius * 1.8, half * 0.06)}
                    fill="none"
                    stroke="#e9fc53"
                    strokeWidth={Math.max(0.2, half * 0.012)}
                    strokeDasharray={`${half * 0.04} ${half * 0.02}`}
                  />
                )}
              </g>
            ),
          )}
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
