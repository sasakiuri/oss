// SPDX-License-Identifier: MIT

import type { Discipline } from '@/shared/ipc/contracts';

import { type TargetZoneConfig, getTargetZoneConfig } from './targetColors';
import { getTargetRadii } from './targetRadii';

const SCORE_LABEL_FONT = 'bold 16px sans-serif';
const LABEL_OFFSET = 10;
const RING_LINE_WIDTH = 2;

function drawScoreLabels(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radii: Record<number, number>,
  scale: number,
  config: TargetZoneConfig,
): void {
  ctx.font = SCORE_LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let score = 1; score <= config.maxLabelScore; score++) {
    const currentRadius = (radii[score] ?? 0) * scale;
    const nextRadius = (radii[score + 1] ?? 0) * scale;

    // Bias 1-2 point labels outward (prevent clipping, keep within ring width)
    const labelRadius =
      score <= 2
        ? Math.max(currentRadius - LABEL_OFFSET, (currentRadius + nextRadius) / 2)
        : (currentRadius + nextRadius) / 2;

    // Text color based on zone coloring
    const textColor =
      score < config.innerZoneStartScore ? config.colors.outerRings.labelText : config.colors.innerRings.labelText;
    ctx.fillStyle = textColor;

    // Draw in 4 directions
    ctx.fillText(`${score}`, centerX, centerY - labelRadius); // top
    ctx.fillText(`${score}`, centerX, centerY + labelRadius); // bottom
    ctx.fillText(`${score}`, centerX - labelRadius, centerY); // left
    ctx.fillText(`${score}`, centerX + labelRadius, centerY); // right
  }
}

export function drawTarget(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  discipline: Discipline,
  options?: { showLabels?: boolean; ringLineWidth?: number },
): void {
  // Clear canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = '#1E1E1E';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const config = getTargetZoneConfig(discipline);
  const radii = getTargetRadii(discipline);

  // Draw rings from outside to inside
  const ringScores = Object.keys(radii)
    .map(Number)
    .sort((a, b) => a - b);

  ringScores.forEach((score) => {
    const radius = (radii[score] ?? 0) * scale;

    // Zone-based coloring (unified across all disciplines)
    if (score >= 10) {
      ctx.fillStyle = config.colors.innerTen.fill;
      ctx.strokeStyle = config.colors.innerTen.stroke;
    } else if (score >= config.innerZoneStartScore) {
      ctx.fillStyle = config.colors.innerRings.fill;
      ctx.strokeStyle = config.colors.innerRings.stroke;
    } else {
      ctx.fillStyle = config.colors.outerRings.fill;
      ctx.strokeStyle = config.colors.outerRings.stroke;
    }

    // Draw ring
    const ringLineWidth = options?.ringLineWidth ?? RING_LINE_WIDTH;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    // Skip fill for the 10-ring only
    if (score !== 10) {
      ctx.fill();
    }
    // Adjust radius to draw the stroke entirely inside the circle
    ctx.lineWidth = ringLineWidth;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - ringLineWidth / 2, 0, 2 * Math.PI);
    ctx.stroke();
  });

  // Draw score labels (unified across all disciplines)
  if (options?.showLabels !== false) {
    drawScoreLabels(ctx, centerX, centerY, radii, scale, config);
  }
}
