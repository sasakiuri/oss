// SPDX-License-Identifier: MIT
import { SHOT_RADIUS_BY_DISCIPLINE } from '@/renderer/presentation/utils/targetDimensions';
import type { Discipline, ShotDto } from '@/shared/ipc/contracts';

/** Fill of earlier shots on screen and of every shot in print (opacity lets the rings show through). */
export const EARLIER_SHOT_FILL = 'rgba(68, 68, 68, 0.7)';

/**
 * Draws one shot marker: a filled disc with the thinnest black border and its label sized to fit inside.
 * The caller sets `textAlign = 'center'` and `textBaseline = 'middle'` once before drawing markers.
 */
export function drawShotMarker(
  ctx: CanvasRenderingContext2D,
  marker: { x: number; y: number; radius: number; fill: string; textColor: string; label: string },
): void {
  const { x, y, radius } = marker;
  ctx.fillStyle = marker.fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.stroke();

  const fontSize = Math.min(radius * 1.4, 56);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = marker.textColor;
  ctx.fillText(marker.label, x, y);
}

export function drawShots(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  recentShots: ShotDto[],
  discipline: Discipline,
  scoringGaugeRadiusMm: number = SHOT_RADIUS_BY_DISCIPLINE[discipline],
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Identify the most recent shot by order, because display shot numbers can repeat by mode.
  const latestShotId = recentShots.length > 0 ? recentShots[recentShots.length - 1]?.id : undefined;

  recentShots.forEach((shot) => {
    // Skip rendering for miss shots (x/y is null)
    if (shot.x === null || shot.y === null) {
      return;
    }

    // Scoring-gauge footprint: event selection overrides the discipline fallback.
    // No upper limit so it scales at the same rate as the target
    const shotRadius = scoringGaugeRadiusMm * scale;

    // Determine if this is the latest shot
    const isLatest = shot.id === latestShotId;

    // Color coding (opacity 0.7 allows background to show through slightly)
    let color: string;
    if (isLatest) {
      // Latest: color-coded by score
      if (shot.score >= 100) {
        color = 'rgba(254, 1, 0, 0.7)'; // 10 points: red (transparent)
      } else if (shot.score >= 90) {
        color = 'rgba(253, 254, 3, 0.7)'; // 9 points: yellow (transparent)
      } else {
        color = 'rgba(0, 102, 255, 0.7)'; // other: blue (transparent)
      }
    } else {
      color = EARLIER_SHOT_FILL;
    }

    // Remove shadow (keep it simple)
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    drawShotMarker(ctx, {
      x: centerX + shot.x * scale,
      y: centerY - shot.y * scale,
      radius: shotRadius,
      fill: color,
      // Yellow background → black text; others → white text
      textColor: isLatest && shot.score < 100 && shot.score >= 90 ? '#000000' : '#FFFFFF',
      label: `${shot.shotNumber}`,
    });
  });
}
