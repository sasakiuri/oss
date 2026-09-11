// SPDX-License-Identifier: MIT
/**
 * TargetDisplay component
 *
 * Canvas-based target visualization component that displays:
 * - Target rings (10.9 to 1.0 points)
 * - Shot impact points
 * - Zoom controls
 */

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { Discipline, ShotDto } from '@/shared/ipc/contracts';
import { getScoringGaugeRadiusMm, type ScoringGaugeProfileId, type TargetScoringProfileId } from '@/shared/target';

import { withDisplayShotNumbers } from '../utils/displayShotNumbers';
import { calculateAutoZoom, calculateFixedZoom, type ZoomMode } from '../utils/zoomCalculator';

import { drawShots } from './target/ShotRenderer';
import { getTargetRadii, getTargetRadiiForProfile } from './target/targetRadii';
import { drawTarget } from './target/TargetRingRenderer';

const MAX_RECENT_SHOTS = 8;

/**
 * TargetDisplay component props
 */
export interface TargetDisplayProps {
  /** Shot data array */
  shots: ShotDto[];
  /** Shooting discipline for target specification */
  discipline: Discipline;
  /** Zoom mode controlled by parent */
  zoomMode: ZoomMode;
  /** Shot indices where Preparation display shot numbers are initialized */
  preparationShotNumberResetIndices?: readonly number[];
  /** Optional stage-specific ISSF face (for 25m precision vs rapid-fire). */
  targetProfileId?: TargetScoringProfileId;
  /** Optional event-selected scoring geometry, independent from the face. */
  scoringGaugeProfileId?: ScoringGaugeProfileId;
  /** Optional CSS class name */
  className?: string;
}

/**
 * TargetDisplay component
 */
export const TargetDisplay: React.FC<TargetDisplayProps> = memo(function TargetDisplay({
  shots,
  discipline,
  zoomMode,
  preparationShotNumberResetIndices = [],
  targetProfileId,
  scoringGaugeProfileId,
  className = '',
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(800);
  const scoringGaugeRadiusMm = scoringGaugeProfileId ? getScoringGaugeRadiusMm(scoringGaugeProfileId) : undefined;

  const displayShots = useMemo(
    () => withDisplayShotNumbers(shots, { preparationResetIndices: preparationShotNumberResetIndices }),
    [shots, preparationShotNumberResetIndices],
  );

  // Only display the most recent 8 shots
  const recentShots = useMemo(() => {
    const recent = displayShots.slice(-MAX_RECENT_SHOTS);
    return recent;
  }, [displayShots]);

  // Calculate zoom level (switch based on mode)
  const effectiveZoom = useMemo(() => {
    const canvasRadius = canvasSize / 2;
    const targetRadii = targetProfileId ? getTargetRadiiForProfile(targetProfileId) : getTargetRadii(discipline);

    if (zoomMode === 'AUTO') {
      return calculateAutoZoom(recentShots, discipline, canvasRadius, targetRadii, scoringGaugeRadiusMm);
    } else {
      return calculateFixedZoom(zoomMode, discipline, targetRadii, canvasRadius);
    }
  }, [zoomMode, recentShots, discipline, targetProfileId, scoringGaugeRadiusMm, canvasSize]);

  // Update canvas size based on container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const { clientWidth, clientHeight } = container;
      // Fit to the shorter dimension (square)
      const size = Math.min(clientWidth, clientHeight);
      setCanvasSize(size);
    };

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Render canvas when shots, zoom, or discipline changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = effectiveZoom * 5; // Base scale factor

    drawTarget(ctx, centerX, centerY, scale, discipline, { targetProfileId });
    drawShots(ctx, centerX, centerY, scale, recentShots, discipline, scoringGaugeRadiusMm);
  }, [recentShots, effectiveZoom, discipline, targetProfileId, scoringGaugeRadiusMm, canvasSize]);

  return (
    <div ref={containerRef} className={`flex h-full w-full items-center justify-center ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        style={{ width: `${canvasSize}px`, height: `${canvasSize}px` }}
        className="rounded border border-zinc-700 bg-zinc-900"
        aria-label="Target display with shot impact points"
      />
    </div>
  );
});
