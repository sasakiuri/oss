'use client';

import { useEffect, useRef, useState } from 'react';

import type { Point } from '@/lib/shot-group';

import type { Calibration, ImageSize, Impact } from './_store';

export type PointerMode = 'impact' | 'aim' | 'scaleA' | 'scaleB';

interface GroupCanvasProps {
  imageUrl: string | null;
  imageSize: ImageSize;
  calibration: Calibration;
  aim: Point;
  impacts: Impact[];
  /** The pair the extreme spread was measured across, drawn as the line between them. */
  extremePair: readonly [number, number] | null;
  mpiPoint: Point | null;
  mode: PointerMode;
  onPick: (point: Point) => void;
  /** The decoded photo, so the screen can both size the frame and read its pixels. */
  onImageLoad: (photo: HTMLImageElement) => void;
  onImageError: () => void;
  label: string;
  describedBy: string;
}

// Large photos are drawn at a capped resolution: the overlay is what needs to stay sharp.
const maxCanvasPixels = 1600;
const tapSlop = 10;
/**
 * The overlay is drawn in photo pixels, so on a narrow screen it shrinks with the photo. Below this
 * many CSS pixels per drawing unit the impact numbers (nine units high) could no longer be read, so
 * the markers stop shrinking there and grow relative to the photo instead.
 */
const minUnitCssPx = 1.25;

const aimColour = '#1a73e8';
const impactColour = '#1f1f1f';
const spreadColour = '#b3261e';
const mpiColour = '#1e8e3e';
const scaleColour = '#8430ce';

export function GroupCanvas({
  imageUrl,
  imageSize,
  calibration,
  aim,
  impacts,
  extremePair,
  mpiPoint,
  mode,
  onPick,
  onImageLoad,
  onImageError,
  label,
  describedBy,
}: GroupCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setDisplayWidth(entry.contentRect.width);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const element = new Image();
    element.onload = () => {
      if (cancelled) return;
      setImage(element);
      onImageLoad(element);
    };
    element.onerror = () => {
      if (!cancelled) onImageError();
    };
    element.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, onImageLoad, onImageError]);

  // The decoded element outlives its object URL, so a replaced photo is never drawn.
  const photo = imageUrl !== null && image?.src === imageUrl ? image : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { width, height } = imageSize;
    const density = Math.min(1, maxCanvasPixels / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    context.setTransform(density, 0, 0, density, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    if (photo) context.drawImage(photo, 0, 0, width, height);

    const unit = Math.max(Math.max(width, height) / 400, displayWidth > 0 ? (width / displayWidth) * minUnitCssPx : 0);
    const outlined = (draw: () => void, colour: string, weight: number, dash: number[] = []) => {
      context.setLineDash(dash);
      context.lineWidth = weight + unit * 1.5;
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.beginPath();
      draw();
      context.stroke();
      context.lineWidth = weight;
      context.strokeStyle = colour;
      context.beginPath();
      draw();
      context.stroke();
      context.setLineDash([]);
    };

    // The extreme spread runs under the holes it was measured between, so the line never hides a hole.
    const first = extremePair && impacts[extremePair[0]];
    const second = extremePair && impacts[extremePair[1]];
    if (first && second)
      outlined(
        () => {
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
        },
        spreadColour,
        unit * 1.2,
      );

    // An upright cross for the aim point and a diagonal one for the mean point of impact: the two
    // markers differ in shape as well as in colour, so neither is told apart by hue alone.
    const arm = unit * 9;
    outlined(
      () => {
        context.moveTo(aim.x - arm, aim.y);
        context.lineTo(aim.x + arm, aim.y);
        context.moveTo(aim.x, aim.y - arm);
        context.lineTo(aim.x, aim.y + arm);
      },
      aimColour,
      unit * 1.4,
    );
    outlined(() => context.arc(aim.x, aim.y, unit * 4, 0, Math.PI * 2), aimColour, unit);
    if (mpiPoint)
      outlined(
        () => {
          const diagonal = arm * 0.75;
          context.moveTo(mpiPoint.x - diagonal, mpiPoint.y - diagonal);
          context.lineTo(mpiPoint.x + diagonal, mpiPoint.y + diagonal);
          context.moveTo(mpiPoint.x + diagonal, mpiPoint.y - diagonal);
          context.lineTo(mpiPoint.x - diagonal, mpiPoint.y + diagonal);
        },
        mpiColour,
        unit * 1.4,
      );

    outlined(
      () => {
        context.moveTo(calibration.a.x, calibration.a.y);
        context.lineTo(calibration.b.x, calibration.b.y);
      },
      scaleColour,
      unit * 1.2,
    );
    context.font = `${unit * 12}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const [key, point] of [
      ['A', calibration.a],
      ['B', calibration.b],
    ] as const) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(point.x, point.y, unit * 5, 0, Math.PI * 2);
      context.fill();
      outlined(() => context.arc(point.x, point.y, unit * 5, 0, Math.PI * 2), scaleColour, unit * 1.2);
      context.fillStyle = scaleColour;
      context.fillText(key, point.x, point.y + unit * 0.5);
    }

    context.font = `${unit * 9}px sans-serif`;
    impacts.forEach((impact, index) => {
      const widest = extremePair?.includes(index) ?? false;
      context.beginPath();
      context.arc(impact.x, impact.y, unit * 3, 0, Math.PI * 2);
      context.fillStyle = impactColour;
      context.fill();
      context.lineWidth = unit * 1.2;
      // The two holes the group is measured across carry the colour of the line that joins them.
      context.strokeStyle = widest ? spreadColour : '#ffffff';
      context.stroke();
      // Numbered to match the list below the drawing, which is where a shot is deleted. The number
      // sits on a disc of its own, so it stays legible over a dark or a busy photo.
      const labelX = impact.x + unit * 7;
      const labelY = impact.y - unit * 6;
      context.fillStyle = 'rgba(255, 255, 255, 0.92)';
      context.beginPath();
      context.arc(labelX, labelY, unit * 4.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = impactColour;
      context.fillText(String(index + 1), labelX, labelY);
    });
  }, [photo, imageSize, calibration, aim, impacts, extremePair, mpiPoint, displayWidth]);

  const readPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * imageSize.width,
      y: ((event.clientY - rect.top) / rect.height) * imageSize.height,
    };
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      // Dragging a marker must not scroll the page; tapping to record an impact still can.
      style={{ touchAction: mode === 'impact' ? 'pan-y' : 'none' }}
      className="block h-auto w-full cursor-crosshair rounded-sm border border-outline-variant bg-white"
      onPointerDown={(event) => {
        const point = readPoint(event);
        if (!point) return;
        pressRef.current = { x: event.clientX, y: event.clientY, dragging: mode !== 'impact' };
        if (mode === 'impact') return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onPick(point);
      }}
      onPointerMove={(event) => {
        if (!pressRef.current?.dragging) return;
        const point = readPoint(event);
        if (point) onPick(point);
      }}
      onPointerUp={(event) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (!press) return;
        if (press.dragging) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        // A tap records an impact; a swipe that scrolled the page does not.
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > tapSlop) return;
        const point = readPoint(event);
        if (point) onPick(point);
      }}
      onPointerCancel={() => {
        pressRef.current = null;
      }}
    />
  );
}
