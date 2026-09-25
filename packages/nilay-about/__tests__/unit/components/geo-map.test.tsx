import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GeoMap, type MapShape } from '@/components/labs';
import { toWorld } from '@/lib/gsi-tiles';

// jsdom has no PointerEvent, and without one a pointer event carries no coordinates at all.
if (typeof window.PointerEvent === 'undefined')
  Object.defineProperty(window, 'PointerEvent', {
    value: class PointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    },
  });

// jsdom lays nothing out, so the frame is given the size a phone would give it.
const width = 400;
const height = 300;
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
});
afterAll(() => vi.restoreAllMocks());

const centre = { latitude: 35.5, longitude: 138.5 };
const shapes: MapShape[] = [
  { kind: 'marker', id: 'a', at: centre, label: '1' },
  { kind: 'circle', id: 'b', center: centre, radiusMetres: 500 },
];

describe('GeoMap', () => {
  it('shows GSI tiles for the view, credits them and draws the shapes', () => {
    const { container } = render(<GeoMap language="ja" label="地図" shapes={shapes} />);
    const tiles = container.querySelectorAll('img');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles)
      expect(tile.getAttribute('src')).toMatch(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/std\//);
    expect(screen.getByRole('link', { name: '地理院タイル' })).toHaveAttribute(
      'href',
      'https://maps.gsi.go.jp/development/ichiran.html',
    );
    expect(container.querySelector('svg text')?.textContent).toBe('1');
    expect(container.querySelectorAll('[role="application"] svg path')).toHaveLength(1);
  });

  it('requests no tile and credits nothing with the background off', () => {
    const { container } = render(<GeoMap language="en" label="Map" shapes={shapes} defaultLayer="none" />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'GSI Tiles' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Background'), { target: { value: 'pale' } });
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/xyz/pale/');
  });

  it('reports the latitude and longitude of a tap while picking, but not of a drag', () => {
    const onPick = vi.fn();
    render(
      <GeoMap
        language="en"
        label="Map"
        shapes={[]}
        picking
        onPick={onPick}
        initialView={{ center: centre, zoom: 15 }}
      />,
    );
    const map = screen.getByRole('application', { name: 'Map' });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: width / 2, clientY: height / 2 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: width / 2, clientY: height / 2 });
    expect(onPick).toHaveBeenCalledTimes(1);
    const picked = onPick.mock.calls[0]![0] as { latitude: number; longitude: number };
    expect(picked.latitude).toBeCloseTo(centre.latitude, 8);
    expect(picked.longitude).toBeCloseTo(centre.longitude, 8);

    fireEvent.pointerDown(map, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map, { pointerId: 2, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(map, { pointerId: 2, clientX: 160, clientY: 100 });
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('pans with the arrow keys and picks the centre with Enter', () => {
    const onPick = vi.fn();
    render(
      <GeoMap
        language="en"
        label="Map"
        shapes={[]}
        picking
        onPick={onPick}
        initialView={{ center: centre, zoom: 15 }}
      />,
    );
    const map = screen.getByRole('application', { name: 'Map' });
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    fireEvent.keyDown(map, { key: 'Enter' });
    const picked = onPick.mock.calls[0]![0] as { latitude: number; longitude: number };
    // One press moves the view 64 screen pixels east.
    expect(toWorld(picked, 15).x - toWorld(centre, 15).x).toBeCloseTo(64, 6);
  });
});
