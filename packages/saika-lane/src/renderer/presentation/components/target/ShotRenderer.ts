// SPDX-License-Identifier: MIT
import { SHOT_RADIUS_BY_DISCIPLINE } from '@/renderer/presentation/utils/targetDimensions';
import type { Discipline, ShotDto } from '@/shared/ipc/contracts';

export function drawShots(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  recentShots: ShotDto[],
  discipline: Discipline,
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

    const x = centerX + shot.x * scale;
    const y = centerY - shot.y * scale;

    // Bullet size: per discipline (conforms to TARGET_SPEC.md)
    // No upper limit so it scales at the same rate as the target
    const borderWidth = 0.5; // as thin a border as possible
    const shotRadius = SHOT_RADIUS_BY_DISCIPLINE[discipline] * scale;

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
      // Previous: grey (transparent)
      color = 'rgba(68, 68, 68, 0.7)';
    }

    // Remove shadow (keep it simple)
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw impact point circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, shotRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Draw border (as thin as possible)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.arc(x, y, shotRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw shot number (sized to fit within the marker)
    const fontSize = Math.min(shotRadius * 1.4, 56);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle =
      isLatest && shot.score < 100 && shot.score >= 90
        ? '#000000' // yellow background → black text
        : '#FFFFFF'; // others → white text
    ctx.fillText(`${shot.shotNumber}`, x, y);
  });
}
