'use client';

import { useEffect, useRef, useState } from 'react';

import type { Quad } from '@/lib/homography';
import type { IssfTarget } from '@/lib/issf-target';
import { placeImpact, type PhotoFrame, type Point } from '@/lib/shot-group';

import type { AlignMode, ImageSize, Shot } from './_store';

export type TargetPointerMode = 'shot' | 'centre' | 'edge' | 'corner';

interface TargetCanvasProps {
  imageUrl: string | null;
  imageSize: ImageSize;
  target: IssfTarget;
  /** Null while the photo is not lined up: the rings are not drawn then. */
  frame: PhotoFrame | null;
  centre: Point;
  alignMode: AlignMode;
  edge: Point;
  corners: Quad;
  shots: readonly Shot[];
  mode: TargetPointerMode;
  onPick: (point: Point) => void;
  onImageLoad: (photo: HTMLImageElement) => void;
  onImageError: () => void;
  label: string;
  describedBy: string;
}

const maxCanvasPixels = 1600;
const tapSlop = 10;
const shotColour = '#1a73e8';
const sighterColour = '#5f6368';
const alignColour = '#8430ce';

/**
 * The target drawn from the Rule Book's ring sizes, or a photo with those rings laid over it where
 * the alignment puts them. Rings are drawn as mapped polygons, so through the corner marks they
 * come out as the ovals the camera saw.
 */
export function TargetCanvas({
  imageUrl,
  imageSize,
  target,
  frame,
  centre,
  alignMode,
  edge,
  corners,
  shots,
  mode,
  onPick,
  onImageLoad,
  onImageError,
  label,
  describedBy,
}: TargetCanvasProps) {
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

    const circle = (radiusMm: number, offset: Point = { x: 0, y: 0 }) => {
      if (!frame) return false;
      const points = Array.from({ length: 72 }, (_, index) => {
        const angle = (index / 72) * Math.PI * 2;
        return placeImpact(
          { x: offset.x + radiusMm * Math.cos(angle), y: offset.y + radiusMm * Math.sin(angle) },
          centre,
          frame,
        );
      });
      if (points.some((point) => point === null)) return false;
      context.beginPath();
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point!.x, point!.y);
        else context.lineTo(point!.x, point!.y);
      });
      context.lineTo(points[0]!.x, points[0]!.y);
      return true;
    };

    if (frame) {
      if (!photo && circle(target.blackMm / 2)) {
        context.fillStyle = '#1f1f1f';
        context.fill();
      }
      target.ringDiametersMm.forEach((diameter, index) => {
        const ring = index + 1;
        if (!circle(diameter / 2)) return;
        context.lineWidth = unit * 0.5;
        context.strokeStyle = photo ? 'rgba(26, 115, 232, 0.8)' : ring >= target.blackFromRing ? '#ffffff' : '#1f1f1f';
        context.stroke();
      });
    }

    // What the photo is lined up with: the centre and a point on the black's edge, or the four marks.
    if (photo) {
      const handles: [string, Point][] =
        alignMode === 'corners'
          ? [['+', centre], ...corners.map((point, index): [string, Point] => [String(index + 1), point])]
          : [
              ['+', centre],
              ['E', edge],
            ];
      context.font = `${unit * 10}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const [key, point] of handles) {
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.beginPath();
        context.arc(point.x, point.y, unit * 5, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = unit;
        context.strokeStyle = alignColour;
        context.stroke();
        context.fillStyle = alignColour;
        context.fillText(key, point.x, point.y + unit * 0.5);
      }
    }

    if (frame) {
      context.font = `${unit * 8}px sans-serif`;
      let number = 0;
      shots.forEach((shot) => {
        const colour = shot.sighter ? sighterColour : shotColour;
        if (!circle(target.calibreMm / 2, shot)) return;
        context.fillStyle = shot.sighter ? 'rgba(95, 99, 104, 0.45)' : 'rgba(26, 115, 232, 0.45)';
        context.fill();
        context.lineWidth = unit * 0.6;
        context.strokeStyle = colour;
        context.stroke();
        const at = placeImpact(shot, centre, frame);
        if (!at) return;
        const text = shot.sighter ? 'S' : String(++number);
        context.fillStyle = 'rgba(255, 255, 255, 0.92)';
        context.beginPath();
        context.arc(at.x + unit * 7, at.y - unit * 6, unit * 4.5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = colour;
        context.fillText(text, at.x + unit * 7, at.y - unit * 5.5);
      });
    }
  }, [photo, imageSize, target, frame, centre, alignMode, edge, corners, shots]);

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
