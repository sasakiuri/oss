'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import type { ImagePoint } from '@/lib/hunter-map';

export interface MapMarker {
  id: string;
  label: string;
  point: ImagePoint;
  /** Where the fit puts this point's latitude and longitude, drawn as a line from the placed point. */
  predicted: ImagePoint | null;
  active: boolean;
}

export interface MapZone {
  id: string;
  label: string;
  points: readonly ImagePoint[];
  /** Drawn thicker, for the area the position is in or nearest. */
  emphasised: boolean;
}

interface MapViewProps {
  /** Areas traced on the picture. */
  zones?: readonly MapZone[];
  /** The area being traced, not yet closed. */
  draft?: readonly ImagePoint[];
  /** The saved picture. It is shown through an object URL made here and released when it changes. */
  data: ArrayBuffer;
  type: string;
  size: { width: number; height: number };
  markers: readonly MapMarker[];
  /**
   * The device's position on the picture, and its accuracy circle on the ground: `metres` in plane
   * units, mapped through the linear part of the fit, so an affine fit draws it as the ellipse it is.
   */
  position: { point: ImagePoint; metres: number; linear: { a: number; b: number; d: number; e: number } } | null;
  /** The saved picture could not be drawn. */
  onImageError: () => void;
  /** True while the next tap places a reference point; otherwise a tap does nothing and the view only scrolls. */
  placing: boolean;
  zoom: number;
  onPick: (point: ImagePoint) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  label: string;
  describedBy: string;
}

const tapSlop = 10;
const pointColour = '#8430ce';
const activeColour = '#b3261e';
const positionColour = '#1a73e8';

/**
 * The map picture in a scrolling frame, with the reference points and the position drawn over it.
 *
 * The overlay is SVG in the picture's own pixels, so it stays in register at every zoom; marker sizes
 * are set from how many picture pixels one screen pixel covers, so they keep a constant size on screen.
 */
export function MapView({
  data,
  type,
  size,
  markers,
  zones = [],
  draft = [],
  position,
  placing,
  zoom,
  onPick,
  viewportRef,
  label,
  describedBy,
  onImageError,
}: MapViewProps) {
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportRef]);

  // Set on the element rather than kept in state: the URL is a resource to release, not something to render from.
  useEffect(() => {
    const element = imageRef.current;
    if (!element || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([data], { type }));
    element.src = url;
    return () => {
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [data, type]);

  // Picture pixels per screen pixel. Before the frame is measured, a size that suits a phone.
  const unit = viewportWidth > 0 ? size.width / (viewportWidth * zoom) : size.width / 400;

  const readPoint = (event: React.PointerEvent<HTMLDivElement>): ImagePoint | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((event.clientX - rect.left) / rect.width) * size.width;
    const y = ((event.clientY - rect.top) / rect.height) * size.height;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };

  return (
    <div
      ref={viewportRef}
      className="max-h-[70dvh] overflow-auto overscroll-contain rounded-sm border border-outline-variant bg-white"
    >
      <div
        role="img"
        aria-label={label}
        aria-describedby={describedBy}
        className="relative"
        style={{ width: `${zoom * 100}%`, cursor: placing ? 'crosshair' : 'default' }}
        onPointerDown={(event) => {
          pressRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const press = pressRef.current;
          pressRef.current = null;
          // A swipe scrolls the frame; only a tap in placing mode places a point.
          if (!press || !placing) return;
          if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > tapSlop) return;
          const point = readPoint(event);
          if (point) onPick(point);
        }}
        onPointerCancel={() => {
          pressRef.current = null;
        }}
      >
        {/* A local object URL, which next/image cannot optimise. The size holds the frame before it decodes. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          alt=""
          width={size.width}
          height={size.height}
          draggable={false}
          onError={onImageError}
          className="block h-auto w-full select-none"
        />
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {zones.map((zone) => (
            <g key={zone.id}>
              <polygon
                points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="rgba(179,38,30,0.12)"
                stroke={activeColour}
                strokeWidth={unit * (zone.emphasised ? 4 : 2)}
                strokeLinejoin="round"
              />
              {zone.points[0] && (
                <text
                  x={zone.points.reduce((sum, point) => sum + point.x, 0) / zone.points.length}
                  y={zone.points.reduce((sum, point) => sum + point.y, 0) / zone.points.length}
                  fill={activeColour}
                  fontSize={unit * 13}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                  stroke="#ffffff"
                  strokeWidth={unit * 3}
                  paintOrder="stroke"
                >
                  {zone.label}
                </text>
              )}
            </g>
          ))}
          {draft.length > 0 && (
            <g>
              <polyline
                points={draft.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={activeColour}
                strokeWidth={unit * 2}
                strokeDasharray={`${unit * 6} ${unit * 4}`}
              />
              {draft.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={unit * 4} fill={activeColour} />
              ))}
            </g>
          )}
          {markers.map((marker) => {
            const colour = marker.active ? activeColour : pointColour;
            return (
              <g key={marker.id}>
                {marker.predicted && (
                  <line
                    x1={marker.point.x}
                    y1={marker.point.y}
                    x2={marker.predicted.x}
                    y2={marker.predicted.y}
                    stroke={colour}
                    strokeWidth={unit * 2}
                    strokeDasharray={`${unit * 4} ${unit * 3}`}
                  />
                )}
                <circle
                  cx={marker.point.x}
                  cy={marker.point.y}
                  r={unit * 9}
                  fill="rgba(255,255,255,0.9)"
                  stroke={colour}
                  strokeWidth={unit * 2.5}
                />
                <text
                  x={marker.point.x}
                  y={marker.point.y}
                  fill={colour}
                  fontSize={unit * 11}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {marker.label}
                </text>
              </g>
            );
          })}
          {position && (
            <g>
              {/* The ground circle mapped through the fit: SVG's matrix(a b c d e f) sends (x, y) to
                  (a·x + c·y + e, b·x + d·y + f). Drawn at its true size, never enlarged. */}
              <circle
                cx={0}
                cy={0}
                r={position.metres}
                transform={`matrix(${position.linear.a} ${position.linear.d} ${position.linear.b} ${position.linear.e} ${position.point.x} ${position.point.y})`}
                fill="rgba(26,115,232,0.15)"
                stroke={positionColour}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                data-testid="accuracy-area"
              />
              <circle
                cx={position.point.x}
                cy={position.point.y}
                r={unit * 5}
                fill={positionColour}
                stroke="#ffffff"
                strokeWidth={unit * 2}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
