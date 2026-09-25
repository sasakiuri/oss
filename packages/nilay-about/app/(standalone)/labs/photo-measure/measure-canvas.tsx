'use client';

import { useEffect, useRef, useState } from 'react';

import type { Outline } from '@/lib/outline-model';
import type { Point } from '@/lib/photo-measure';

import type { ImageSize, OutlinePrompt, PointerMode } from './_store';

interface MeasureCanvasProps {
  photo: HTMLImageElement | null;
  imageSize: ImageSize;
  referenceA: Point | null;
  referenceB: Point | null;
  body: Point[];
  antlers: Point[][];
  prompts: OutlinePrompt[];
  outline: Outline | null;
  mode: PointerMode;
  onPick: (point: Point) => void;
  /** A dragged reference end has been let go. */
  onRelease: () => void;
  label: string;
  describedBy: string;
}

const maxCanvasPixels = 1600;
const tapSlop = 10;
const minUnitCssPx = 1.25;

const referenceColour = '#8430ce';
const bodyColour = '#1a73e8';
const antlerColour = '#c5221f';
const keepColour = '#1e8e3e';

/** The photo with everything placed on it. Points are held in photo pixels. */
export function MeasureCanvas({
  photo,
  imageSize,
  referenceA,
  referenceB,
  body,
  antlers,
  prompts,
  outline,
  mode,
  onPick,
  onRelease,
  label,
  describedBy,
}: MeasureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressRef = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
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

    if (outline) {
      // The mask is at the model's fitted size; a small canvas of its own is scaled over the photo.
      const layer = document.createElement('canvas');
      layer.width = outline.fit.width;
      layer.height = outline.fit.height;
      const layerContext = layer.getContext('2d');
      if (layerContext) {
        const pixels = layerContext.createImageData(layer.width, layer.height);
        outline.mask.forEach((inside, index) => {
          if (!inside) return;
          pixels.data[index * 4] = 30;
          pixels.data[index * 4 + 1] = 142;
          pixels.data[index * 4 + 2] = 62;
          pixels.data[index * 4 + 3] = 110;
        });
        layerContext.putImageData(pixels, 0, 0);
        context.drawImage(layer, 0, 0, width, height);
      }
    }

    const unit = Math.max(Math.max(width, height) / 400, displayWidth > 0 ? (width / displayWidth) * minUnitCssPx : 0);
    const outlined = (draw: () => void, colour: string, weight: number) => {
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
    };
    const path = (points: readonly Point[], colour: string) => {
      if (points.length > 1)
        outlined(
          () => {
            context.moveTo(points[0]!.x, points[0]!.y);
            for (const point of points.slice(1)) context.lineTo(point.x, point.y);
          },
          colour,
          unit * 1.4,
        );
      for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, unit * 3, 0, Math.PI * 2);
        context.fillStyle = colour;
        context.fill();
        context.lineWidth = unit;
        context.strokeStyle = '#ffffff';
        context.stroke();
      }
    };

    if (referenceA && referenceB)
      outlined(
        () => {
          context.moveTo(referenceA.x, referenceA.y);
          context.lineTo(referenceB.x, referenceB.y);
        },
        referenceColour,
        unit * 1.2,
      );
    context.font = `${unit * 12}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const [key, point] of [
      ['A', referenceA],
      ['B', referenceB],
    ] as const) {
      if (!point) continue;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(point.x, point.y, unit * 5, 0, Math.PI * 2);
      context.fill();
      outlined(() => context.arc(point.x, point.y, unit * 5, 0, Math.PI * 2), referenceColour, unit * 1.2);
      context.fillStyle = referenceColour;
      context.fillText(key, point.x, point.y + unit * 0.5);
    }

    path(body, bodyColour);
    for (const antler of antlers) path(antler, antlerColour);

    // A plus for a tap on the animal and a cross for one to leave out, told apart by shape as well as colour.
    for (const prompt of prompts) {
      const arm = unit * 6;
      outlined(
        () => {
          if (prompt.foreground) {
            context.moveTo(prompt.x - arm, prompt.y);
            context.lineTo(prompt.x + arm, prompt.y);
            context.moveTo(prompt.x, prompt.y - arm);
            context.lineTo(prompt.x, prompt.y + arm);
          } else {
            context.moveTo(prompt.x - arm, prompt.y - arm);
            context.lineTo(prompt.x + arm, prompt.y + arm);
            context.moveTo(prompt.x + arm, prompt.y - arm);
            context.lineTo(prompt.x - arm, prompt.y + arm);
          }
        },
        prompt.foreground ? keepColour : antlerColour,
        unit * 1.6,
      );
    }
  }, [photo, imageSize, referenceA, referenceB, body, antlers, prompts, outline, displayWidth]);

  const readPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * imageSize.width,
      y: ((event.clientY - rect.top) / rect.height) * imageSize.height,
    };
  };

  // The two reference ends are dragged into place; every other mode adds a point with each tap.
  const drags = mode === 'referenceA' || mode === 'referenceB';

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      style={{ touchAction: drags ? 'none' : 'pan-y' }}
      className="block h-auto w-full cursor-crosshair rounded-sm border border-outline-variant bg-white"
      onPointerDown={(event) => {
        const point = readPoint(event);
        if (!point) return;
        pressRef.current = { x: event.clientX, y: event.clientY, dragging: drags };
        if (!drags) return;
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
          onRelease();
          return;
        }
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
