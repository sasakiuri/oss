'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LuExpand, LuLocateFixed, LuMinus, LuPlus } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { circleRing, type GeoPoint } from '@/lib/geodesy';
import {
  baseLayers,
  clampZoom,
  fitView,
  fromWorld,
  gsiTileListUrl,
  metresPerPixel,
  tilesForView,
  toWorld,
  type BaseLayerId,
} from '@/lib/gsi-tiles';
import { cn } from '@/lib/utils';

/**
 * A slippy map on the GSI tiles, shared by the field tools.
 *
 * Everything drawn on it is given in latitude and longitude and projected to the screen on every
 * render, so shapes stay in register at every zoom and there is no second copy of the geometry to
 * keep in step. The tiles are plain images: GSI does not send CORS headers, so they are never read
 * back through a canvas. With the background set to なし (none) no tile is requested at all.
 */

type Language = 'ja' | 'en';

export type MapLayerChoice = BaseLayerId | 'none';

interface ShapeStyle {
  /** Stroke colour. */
  colour?: string;
  /** Fill for areas; none when left out. */
  fill?: string;
  width?: number;
  dashed?: boolean;
}

export type MapShape =
  | ({ kind: 'marker'; id: string; at: GeoPoint; label?: string } & Pick<ShapeStyle, 'colour'>)
  | ({ kind: 'line'; id: string; points: readonly GeoPoint[] } & ShapeStyle)
  | ({ kind: 'polygon'; id: string; points: readonly GeoPoint[] } & ShapeStyle)
  | ({ kind: 'circle'; id: string; center: GeoPoint; radiusMetres: number } & ShapeStyle);

export interface MapImageOverlay {
  /** The picture's bytes; shown through an object URL made here and released when it changes. */
  data: ArrayBuffer;
  type: string;
  width: number;
  height: number;
  /** Where a pixel of the picture lies on the ground, or null where it cannot be placed. */
  toGeo: (point: { x: number; y: number }) => GeoPoint | null;
  /** 0 to 1. */
  opacity: number;
}

export interface MapPosition {
  latitude: number;
  longitude: number;
  /** Metres, the 95% radius the Geolocation API reports. */
  accuracy: number;
}

export interface GeoMapProps {
  language: Language;
  /** The accessible name of the map. */
  label: string;
  /** The id of text that describes what is drawn, read after the name. */
  describedBy?: string;
  shapes: readonly MapShape[];
  position?: MapPosition | null;
  imageOverlay?: MapImageOverlay | null;
  /** While true, a tap (not a drag) on the map reports its latitude and longitude to `onPick`. */
  picking?: boolean;
  onPick?: (point: GeoPoint) => void;
  /** Shown before there is anything to fit the view to. */
  initialView?: { center: GeoPoint; zoom: number };
  /** The view is refitted to the shapes (and position) whenever this changes, and once at the start. */
  fitKey?: string | number;
  defaultLayer?: MapLayerChoice;
  className?: string;
}

/** Japan, whole, for a map with nothing on it yet. */
const japan = { center: { latitude: 36.2, longitude: 138.3 }, zoom: 5 };
const tapSlop = 8;
const positionColour = '#1a73e8';
const defaultColour = '#b3261e';
const meshDivisions = 6;

interface View {
  center: GeoPoint;
  zoom: number;
}

export function GeoMap({
  language,
  label,
  describedBy,
  shapes,
  position = null,
  imageOverlay = null,
  picking = false,
  onPick,
  initialView,
  fitKey,
  defaultLayer = 'std',
  className,
}: GeoMapProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>(initialView ?? japan);
  const [layer, setLayer] = useState<MapLayerChoice>(defaultLayer);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; start: { x: number; y: number }; view: View; moved: boolean }
    | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; view: View }
    | null
  >(null);
  const clipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const layerSelectId = useId();

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setSize({ width: frame.clientWidth, height: frame.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const fitPoints = useMemo(() => {
    const points: GeoPoint[] = [];
    for (const shape of shapes) {
      if (shape.kind === 'marker') points.push(shape.at);
      else if (shape.kind === 'circle') points.push(...circleRing(shape.center, shape.radiusMetres, 8));
      else points.push(...shape.points);
    }
    if (position) points.push(position);
    return points;
  }, [shapes, position]);

  const fit = useCallback(() => {
    if (size.width === 0) return;
    const fitted = fitView(fitPoints, size.width, size.height);
    if (fitted) setView(fitted);
  }, [fitPoints, size.width, size.height]);

  // Fit once the frame has a size, and again whenever the caller asks for it through `fitKey`.
  // Adjusted while rendering, as React recommends for state that follows a prop.
  const [fittedFor, setFittedFor] = useState<{ key: unknown } | null>(null);
  if (size.width > 0 && (fittedFor === null || fittedFor.key !== fitKey)) {
    setFittedFor({ key: fitKey });
    const fitted = fitView(fitPoints, size.width, size.height);
    if (fitted) setView(fitted);
  }

  const centreWorld = toWorld(view.center, view.zoom);
  const toScreen = (point: GeoPoint) => {
    const world = toWorld(point, view.zoom);
    return { x: world.x - centreWorld.x + size.width / 2, y: world.y - centreWorld.y + size.height / 2 };
  };
  const fromScreen = (current: View, x: number, y: number): GeoPoint => {
    const centre = toWorld(current.center, current.zoom);
    return fromWorld({ x: centre.x + x - size.width / 2, y: centre.y + y - size.height / 2 }, current.zoom);
  };

  /** A new view at `zoom` that keeps the ground under screen point (x, y) where it is. */
  const zoomAround = (current: View, zoom: number, x: number, y: number): View => {
    const nextZoom = clampZoom(zoom);
    const anchor = fromScreen(current, x, y);
    const world = toWorld(anchor, nextZoom);
    return {
      zoom: nextZoom,
      center: fromWorld({ x: world.x - (x - size.width / 2), y: world.y - (y - size.height / 2) }, nextZoom),
    };
  };

  const panBy = (current: View, dx: number, dy: number): View => {
    const centre = toWorld(current.center, current.zoom);
    return { zoom: current.zoom, center: fromWorld({ x: centre.x - dx, y: centre.y - dy }, current.zoom) };
  };

  // Wheel zoom needs a listener that may cancel the page scroll, which React's is not.
  const viewRef = useRef(view);
  const zoomAroundRef = useRef(zoomAround);
  useLayoutEffect(() => {
    viewRef.current = view;
    zoomAroundRef.current = zoomAround;
  });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const step = -Math.sign(event.deltaY) * (event.ctrlKey ? 0.25 : 0.5);
      if (step === 0) return;
      setView(
        zoomAroundRef.current(
          viewRef.current,
          viewRef.current.zoom + step,
          event.clientX - rect.left,
          event.clientY - rect.top,
        ),
      );
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  const local = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startGesture = () => {
    const list = [...pointers.current.values()];
    if (list.length === 1) gesture.current = { kind: 'pan', start: list[0]!, view, moved: false };
    else if (list.length >= 2) {
      const [p, q] = list as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = {
        kind: 'pinch',
        distance: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)),
        mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
        view,
      };
    }
  };

  const tiles =
    layer === 'none' ? [] : tilesForView(baseLayers[layer], view.center, view.zoom, size.width, size.height);
  const photoTooFar = layer === 'photo' && tiles.length === 0 && size.width > 0;

  const path = (points: readonly GeoPoint[], closed: boolean) =>
    points.length === 0
      ? ''
      : points
          .map((point, index) => {
            const { x, y } = toScreen(point);
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ') + (closed ? ' Z' : '');

  const overlayRef = useRef<SVGGElement>(null);
  useOverlayUrl(overlayRef, imageOverlay?.data ?? null, imageOverlay?.type ?? '');
  const overlayTriangles = (() => {
    if (!imageOverlay || size.width === 0) return [];
    const { width, height, toGeo } = imageOverlay;
    const grid: ({ u: number; v: number; x: number; y: number } | null)[][] = [];
    for (let row = 0; row <= meshDivisions; row += 1) {
      const line: ({ u: number; v: number; x: number; y: number } | null)[] = [];
      for (let column = 0; column <= meshDivisions; column += 1) {
        const u = (width * column) / meshDivisions;
        const v = (height * row) / meshDivisions;
        const geo = toGeo({ x: u, y: v });
        const screen = geo && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude) ? toScreen(geo) : null;
        line.push(screen ? { u, v, ...screen } : null);
      }
      grid.push(line);
    }
    const triangles: { id: string; matrix: string; points: string }[] = [];
    for (let row = 0; row < meshDivisions; row += 1) {
      for (let column = 0; column < meshDivisions; column += 1) {
        const corners = [
          grid[row]![column],
          grid[row]![column + 1],
          grid[row + 1]![column + 1],
          grid[row + 1]![column],
        ];
        for (const [index, triangle] of [
          [corners[0], corners[1], corners[2]],
          [corners[0], corners[2], corners[3]],
        ].entries()) {
          const matrix = triangleMatrix(triangle);
          if (!matrix) continue;
          triangles.push({
            id: `${clipPrefix}-${row}-${column}-${index}`,
            matrix,
            points: triangle.map((corner) => `${corner!.u},${corner!.v}`).join(' '),
          });
        }
      }
    }
    return triangles;
  })();

  const scaleBar = (() => {
    if (size.width === 0) return null;
    const metres = metresPerPixel(view.center.latitude, view.zoom) * 100;
    const nice = [1, 2, 5]
      .flatMap((base) => [1, 10, 100, 1000, 10000, 100000].map((power) => base * power))
      .sort((p, q) => p - q)
      .filter((value) => value <= metres)
      .pop();
    if (!nice) return null;
    return { pixels: (nice / metres) * 100, text: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
  })();

  const positionScreen = position ? toScreen(position) : null;
  const positionRadius = position ? position.accuracy / metresPerPixel(position.latitude, view.zoom) : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={layerSelectId} className="text-sm font-medium">
          {t('背景', 'Background')}
        </label>
        <select
          id={layerSelectId}
          value={layer}
          onChange={(event) => setLayer(event.target.value as MapLayerChoice)}
          className="!w-auto"
        >
          {(Object.keys(baseLayers) as BaseLayerId[]).map((id) => (
            <option key={id} value={id}>
              {baseLayers[id].name[language]}
            </option>
          ))}
          <option value="none">{t('なし（地図を取得しない）', 'None (no map requested)')}</option>
        </select>
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('縮小', 'Zoom out')}
            onClick={() => setView((current) => zoomAround(current, current.zoom - 1, size.width / 2, size.height / 2))}
          >
            <LuMinus aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('拡大', 'Zoom in')}
            onClick={() => setView((current) => zoomAround(current, current.zoom + 1, size.width / 2, size.height / 2))}
          >
            <LuPlus aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label={t('全体を表示', 'Fit everything')} onClick={fit}>
            <LuExpand aria-hidden="true" />
          </Button>
          {position && (
            <Button
              variant="outline"
              size="icon"
              aria-label={t('現在地を中心に', 'Centre on my position')}
              onClick={() => setView((current) => ({ ...current, center: { ...position } }))}
            >
              <LuLocateFixed aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div
        ref={frameRef}
        role="application"
        aria-roledescription={t('地図', 'map')}
        aria-label={label}
        aria-describedby={describedBy}
        tabIndex={0}
        className="relative h-[60dvh] max-h-[640px] min-h-72 touch-none overflow-hidden rounded-sm border border-outline-variant bg-[#f4f1e8] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{ cursor: picking ? 'crosshair' : 'grab' }}
        onKeyDown={(event) => {
          const step = 64;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const move = moves[event.key];
          if (move) {
            event.preventDefault();
            setView((current) => panBy(current, move[0], move[1]));
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            setView((current) => zoomAround(current, current.zoom + 1, size.width / 2, size.height / 2));
          } else if (event.key === '-') {
            event.preventDefault();
            setView((current) => zoomAround(current, current.zoom - 1, size.width / 2, size.height / 2));
          } else if (picking && (event.key === 'Enter' || event.key === ' ')) {
            // The keyboard picks the centre of the view, marked by the crosshair below.
            event.preventDefault();
            onPick?.(view.center);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pointers.current.set(event.pointerId, local(event));
          startGesture();
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, local(event));
          const current = gesture.current;
          if (!current) return;
          if (current.kind === 'pan') {
            const point = pointers.current.get(event.pointerId)!;
            const dx = point.x - current.start.x;
            const dy = point.y - current.start.y;
            if (!current.moved && Math.hypot(dx, dy) <= tapSlop) return;
            current.moved = true;
            setView(panBy(current.view, dx, dy));
          } else {
            const list = [...pointers.current.values()];
            if (list.length < 2) return;
            const [p, q] = list as [{ x: number; y: number }, { x: number; y: number }];
            const distance = Math.max(1, Math.hypot(p.x - q.x, p.y - q.y));
            const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
            const zoomed = zoomAround(
              current.view,
              current.view.zoom + Math.log2(distance / current.distance),
              current.mid.x,
              current.mid.y,
            );
            setView(panBy(zoomed, mid.x - current.mid.x, mid.y - current.mid.y));
          }
        }}
        onPointerUp={(event) => {
          const current = gesture.current;
          const point = pointers.current.get(event.pointerId);
          pointers.current.delete(event.pointerId);
          if (current?.kind === 'pan' && !current.moved && picking && point && pointers.current.size === 0)
            onPick?.(fromScreen(view, point.x, point.y));
          // A finger lifted from a pinch leaves a pan with the other, starting where it is now.
          if (pointers.current.size > 0) {
            startGesture();
            if (gesture.current?.kind === 'pan') gesture.current.moved = true;
          } else gesture.current = null;
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          gesture.current = null;
        }}
      >
        {tiles.map((tile) => (
          // Remote tiles at computed positions: next/image would neither place nor size them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute max-w-none"
            style={{ left: tile.left, top: tile.top, width: tile.size, height: tile.size }}
            onError={(event) => {
              // A tile outside the survey (open sea) is a 404; leave the background showing.
              event.currentTarget.style.visibility = 'hidden';
            }}
          />
        ))}
        <svg
          aria-hidden="true"
          width={size.width}
          height={size.height}
          className="pointer-events-none absolute inset-0"
        >
          {overlayTriangles.length > 0 && (
            <g ref={overlayRef} opacity={imageOverlay?.opacity ?? 1}>
              <defs>
                {overlayTriangles.map((triangle) => (
                  <clipPath key={triangle.id} id={triangle.id} clipPathUnits="userSpaceOnUse">
                    <polygon points={triangle.points} />
                  </clipPath>
                ))}
              </defs>
              {overlayTriangles.map((triangle) => (
                <image
                  key={triangle.id}
                  width={imageOverlay!.width}
                  height={imageOverlay!.height}
                  preserveAspectRatio="none"
                  transform={triangle.matrix}
                  clipPath={`url(#${triangle.id})`}
                />
              ))}
            </g>
          )}
          {shapes.map((shape) => {
            if (shape.kind === 'marker') return null;
            const colour = shape.colour ?? defaultColour;
            const stroke = {
              stroke: colour,
              strokeWidth: shape.width ?? 2.5,
              strokeDasharray: shape.dashed ? '8 6' : undefined,
              strokeLinejoin: 'round' as const,
            };
            if (shape.kind === 'line')
              return <path key={shape.id} d={path(shape.points, false)} fill="none" {...stroke} />;
            const ring = shape.kind === 'polygon' ? shape.points : circleRing(shape.center, shape.radiusMetres);
            return <path key={shape.id} d={path(ring, true)} fill={shape.fill ?? 'none'} {...stroke} />;
          })}
          {positionScreen && (
            <g>
              <circle
                cx={positionScreen.x}
                cy={positionScreen.y}
                r={positionRadius}
                fill="rgba(26,115,232,0.15)"
                stroke={positionColour}
                strokeWidth={1.5}
              />
              <circle
                cx={positionScreen.x}
                cy={positionScreen.y}
                r={6}
                fill={positionColour}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}
          {shapes.map((shape) => {
            if (shape.kind !== 'marker') return null;
            const { x, y } = toScreen(shape.at);
            const colour = shape.colour ?? defaultColour;
            return (
              <g key={shape.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={shape.label ? 11 : 6}
                  fill="rgba(255,255,255,0.92)"
                  stroke={colour}
                  strokeWidth={2.5}
                />
                {shape.label && (
                  <text
                    x={x}
                    y={y}
                    fill={colour}
                    fontSize={shape.label.length > 2 ? 9 : 12}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {shape.label}
                  </text>
                )}
              </g>
            );
          })}
          {picking && size.width > 0 && (
            <g stroke="#1b1b1f" strokeWidth={1.5}>
              <line x1={size.width / 2 - 10} y1={size.height / 2} x2={size.width / 2 + 10} y2={size.height / 2} />
              <line x1={size.width / 2} y1={size.height / 2 - 10} x2={size.width / 2} y2={size.height / 2 + 10} />
            </g>
          )}
        </svg>
        {photoTooFar && (
          <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-sm bg-white/90 px-3 py-1 text-xs">
            {t('写真は拡大すると表示されます。', 'Zoom in to see the photo.')}
          </p>
        )}
        {scaleBar && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-white/85 px-1 text-[11px] leading-tight">
            <div className="border-x-2 border-b-2 border-[#1b1b1f]" style={{ width: scaleBar.pixels, height: 6 }} />
            {scaleBar.text}
          </div>
        )}
        {layer !== 'none' && (
          <p className="absolute right-0 bottom-0 rounded-tl-sm bg-white/85 px-1.5 py-0.5 text-[11px]">
            {t('出典: ', 'Source: ')}
            <a
              href={gsiTileListUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {t('地理院タイル', 'GSI Tiles')}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/** The SVG matrix that carries a triangle of picture pixels onto its three screen points. */
function triangleMatrix(
  triangle: readonly ({ u: number; v: number; x: number; y: number } | null | undefined)[],
): string | null {
  const [p0, p1, p2] = triangle;
  if (!p0 || !p1 || !p2) return null;
  const du1 = p1.u - p0.u;
  const dv1 = p1.v - p0.v;
  const du2 = p2.u - p0.u;
  const dv2 = p2.v - p0.v;
  const det = du1 * dv2 - du2 * dv1;
  if (det === 0) return null;
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x;
  const dy2 = p2.y - p0.y;
  const a = (dx1 * dv2 - dx2 * dv1) / det;
  const c = (dx2 * du1 - dx1 * du2) / det;
  const b = (dy1 * dv2 - dy2 * dv1) / det;
  const d = (dy2 * du1 - dy1 * du2) / det;
  const e = p0.x - a * p0.u - c * p0.v;
  const f = p0.y - b * p0.u - d * p0.v;
  const values = [a, b, c, d, e, f];
  return values.every(Number.isFinite) ? `matrix(${values.join(' ')})` : null;
}

/**
 * Gives every <image> in the overlay group the picture through one object URL, released when the
 * picture changes. Set on the elements rather than kept in state: it is a resource to release,
 * not something to render from, and the triangles come and go as the view moves.
 */
function useOverlayUrl(group: React.RefObject<SVGGElement | null>, data: ArrayBuffer | null, type: string) {
  const url = useRef<string | null>(null);
  useEffect(() => {
    if (!data || typeof URL.createObjectURL !== 'function') return;
    const next = URL.createObjectURL(new Blob([data], { type }));
    url.current = next;
    applyHref(group.current, next);
    return () => {
      url.current = null;
      URL.revokeObjectURL(next);
    };
  }, [group, data, type]);
  // Triangles drawn by a later render get the URL too.
  useEffect(() => applyHref(group.current, url.current));
}

function applyHref(group: SVGGElement | null, url: string | null) {
  if (!group || !url) return;
  for (const image of group.querySelectorAll('image'))
    if (image.getAttribute('href') !== url) image.setAttribute('href', url);
}
