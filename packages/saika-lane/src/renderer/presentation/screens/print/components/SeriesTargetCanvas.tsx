// SPDX-License-Identifier: MIT
import { useLayoutEffect, useRef } from 'react';

import { drawShotMarker, EARLIER_SHOT_FILL } from '@/renderer/presentation/components/target/ShotRenderer';
import { getTargetRadii } from '@/renderer/presentation/components/target/targetRadii';
import { drawTarget } from '@/renderer/presentation/components/target/TargetRingRenderer';
import { SHOT_RADIUS_BY_DISCIPLINE } from '@/renderer/presentation/utils/targetDimensions';
import type { Discipline, ScoreSheetShotDto } from '@/shared/ipc/contracts';

interface SeriesTargetCanvasProps {
  shots: ScoreSheetShotDto[];
  discipline: Discipline;
  size?: number;
  /** Display shot labels as a sequence across the supplied shots. */
  sequentialShotNumbers?: boolean;
}

export function SeriesTargetCanvas({
  shots,
  discipline,
  size = 120,
  sequentialShotNumbers = false,
}: SeriesTargetCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const internalSize = size * dpr;
    canvas.width = internalSize;
    canvas.height = internalSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;

    // Auto-zoom: determine viewRadiusMm based on shot positions
    const radii = getTargetRadii(discipline);
    const validShots = shots
      .map((shot, index) => ({
        ...shot,
        shotNumber: sequentialShotNumbers ? index + 1 : shot.shotNumber,
      }))
      .filter((s): s is ScoreSheetShotDto & { x: number; y: number } => s.x !== null && s.y !== null);

    let viewRadiusMm: number;
    if (validShots.length > 0) {
      const maxShotDistance = Math.max(...validShots.map((s) => Math.sqrt(s.x * s.x + s.y * s.y)));
      // Add shot bullet radius (~3mm) + small padding (~2mm)
      const paddedDistance = maxShotDistance + 5;

      // Find the smallest ring that encompasses all shots
      const ringEntries = Object.entries(radii)
        .map(([score, r]) => ({ score: Number(score), radius: r }))
        .sort((a, b) => a.radius - b.radius);

      const enclosingRing = ringEntries.find((r) => r.radius >= paddedDistance);
      viewRadiusMm = enclosingRing ? enclosingRing.radius * 1.1 : paddedDistance * 1.1;
    } else {
      // No shots with coordinates: show up to 6-point ring as default
      viewRadiusMm = (radii[6] ?? 12) * 1.3;
    }

    const padding = 4; // px
    const scale = (size / 2 - padding) / viewRadiusMm;

    // Draw target with rings (includes dark '#1E1E1E' background for contrast)
    drawTarget(ctx, centerX, centerY, scale, discipline, {
      showLabels: false,
      ringLineWidth: 0.5,
    });

    // Draw shots -- for print: uniform grey for all shots, with numbers
    const shotRadius = SHOT_RADIUS_BY_DISCIPLINE[discipline] * scale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const shot of validShots) {
      drawShotMarker(ctx, {
        x: centerX + shot.x * scale,
        y: centerY - shot.y * scale,
        radius: shotRadius,
        fill: EARLIER_SHOT_FILL,
        textColor: '#FFFFFF',
        label: `${shot.shotNumber}`,
      });
    }
  }, [shots, discipline, size, sequentialShotNumbers]);

  return <canvas ref={canvasRef} className="series-target-canvas" style={{ width: size, height: size }} />;
}
