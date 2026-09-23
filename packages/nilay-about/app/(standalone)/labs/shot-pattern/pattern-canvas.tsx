'use client';

import { useEffect, useRef, useState } from 'react';

import { getInnerDiameterCm, type Point } from '@/lib/shot-pattern';

import type { Calibration, ImageSize, Shot } from './_store';

export type PointerMode = 'shot' | 'centre' | 'scaleA' | 'scaleB';

interface PatternCanvasProps {
  imageUrl: string | null;
  imageSize: ImageSize;
  calibration: Calibration;
  centre: Point;
  diameterCm: number;
  cmPerPixel: number | null;
  shots: Shot[];
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

const circleColour = '#1a73e8';
const outsideColour = '#b3261e';
const scaleColour = '#8430ce';

export function PatternCanvas({
  imageUrl,
  imageSize,
  calibration,
  centre,
  diameterCm,
  cmPerPixel,
  shots,
  mode,
  onPick,
  onImageLoad,
  onImageError,
  label,
  describedBy,
}: PatternCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

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

    const unit = Math.max(width, height) / 400;
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

    if (cmPerPixel !== null && diameterCm > 0) {
      const radius = diameterCm / 2 / cmPerPixel;
      const innerRadius = getInnerDiameterCm(diameterCm) / 2 / cmPerPixel;
      outlined(() => context.arc(centre.x, centre.y, radius, 0, Math.PI * 2), circleColour, unit * 1.6);
      outlined(() => context.arc(centre.x, centre.y, innerRadius, 0, Math.PI * 2), circleColour, unit, [
        unit * 4,
        unit * 4,
      ]);
      outlined(
        () => {
          context.moveTo(centre.x - radius, centre.y);
          context.lineTo(centre.x + radius, centre.y);
          context.moveTo(centre.x, centre.y - radius);
          context.lineTo(centre.x, centre.y + radius);
        },
        circleColour,
        unit * 0.8,
        [unit * 2, unit * 3],
      );
    }

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

    const radius = cmPerPixel !== null && diameterCm > 0 ? diameterCm / 2 / cmPerPixel : Infinity;
    for (const shot of shots) {
      const inside = Math.hypot(shot.x - centre.x, shot.y - centre.y) <= radius;
      context.beginPath();
      context.arc(shot.x, shot.y, unit * 3, 0, Math.PI * 2);
      // Hits and misses differ in fill as well as colour so the drawing never relies on hue alone.
      context.fillStyle = inside ? circleColour : '#ffffff';
      context.fill();
      context.lineWidth = unit * 1.2;
      context.strokeStyle = inside ? '#ffffff' : outsideColour;
      context.stroke();
    }
  }, [photo, imageSize, calibration, centre, diameterCm, cmPerPixel, shots]);

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
      // Dragging a marker must not scroll the page; tapping to record a shot still can.
      style={{ touchAction: mode === 'shot' ? 'pan-y' : 'none' }}
      className="block h-auto w-full cursor-crosshair rounded-sm border border-outline-variant bg-white"
      onPointerDown={(event) => {
        const point = readPoint(event);
        if (!point) return;
        pressRef.current = { x: event.clientX, y: event.clientY, dragging: mode !== 'shot' };
        if (mode === 'shot') return;
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
        // A tap records a shot; a swipe that scrolled the page does not.
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
