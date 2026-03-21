// SPDX-License-Identifier: MIT
import { useLayoutEffect, useRef } from 'react';

import { getTargetRadii } from '@/renderer/presentation/components/target/targetRadii';
import { drawTarget } from '@/renderer/presentation/components/target/TargetRingRenderer';
import type { Discipline, ScoreSheetShotDto } from '@/shared/ipc/contracts';

/** Bullet radius per discipline (mm) -- per TARGET_SPEC.md */
const SHOT_RADIUS_MM: Record<Discipline, number> = {
  BEAM_RIFLE_10M: 3.0,
  AIR_RIFLE_10M: 2.25,
  AIR_PISTOL_10M: 2.25,
  RIFLE_50M: 2.8,
  PISTOL_25M: 4.5,
};

interface SeriesTargetCanvasProps {
  shots: ScoreSheetShotDto[];
  discipline: Discipline;
  size?: number;
}

export function SeriesTargetCanvas({ shots, discipline, size = 120 }: SeriesTargetCanvasProps): React.JSX.Element {
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
    const validShots = shots.filter(
      (s): s is ScoreSheetShotDto & { x: number; y: number } => s.x !== null && s.y !== null,
    );

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
    const shotRadius = SHOT_RADIUS_MM[discipline] * scale;
    const borderWidth = 0.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const shot of validShots) {
      const x = centerX + shot.x * scale;
      const y = centerY - shot.y * scale;

      // Uniform grey (opacity 0.7)
      ctx.fillStyle = 'rgba(68, 68, 68, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y, shotRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      ctx.arc(x, y, shotRadius, 0, 2 * Math.PI);
      ctx.stroke();

      // Shot number (white text)
      const fontSize = Math.min(shotRadius * 1.4, 56);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`${shot.shotNumber}`, x, y);
    }
  }, [shots, discipline, size]);

  return <canvas ref={canvasRef} className="series-target-canvas" style={{ width: size, height: size }} />;
}
