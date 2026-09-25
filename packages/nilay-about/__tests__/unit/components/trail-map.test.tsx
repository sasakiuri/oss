import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrailMap } from '@/app/(standalone)/labs/wounded-game/trail-map';
import type { TrailEntry } from '@/lib/schemas/wounded-game';

const entry = (id: string, at: string, kind: TrailEntry['kind'], latitude: number | null): TrailEntry => ({
  id,
  at,
  kind,
  note: '',
  position: latitude === null ? null : { latitude, longitude: 138.5, accuracyMeters: 10 },
});

describe('the trail map', () => {
  it('asks for positions while none is logged', () => {
    render(
      <TrailMap language="ja" entries={[entry('a', '2026-11-15T07:00', 'shot-site', null)]} kindLabel={(k) => k} />,
    );
    expect(screen.getByText('位置付きの記録はまだありません。')).toBeInTheDocument();
  });

  it('numbers the placed entries in time order and gives the last one from the shot site', () => {
    render(
      <TrailMap
        language="en"
        entries={[
          entry('b', '2026-11-15T07:20', 'blood', 35.5009),
          entry('a', '2026-11-15T07:00', 'shot-site', 35.5),
          entry('c', '2026-11-15T07:25', 'note', null),
        ]}
        kindLabel={(kind) => kind}
      />,
    );
    expect(screen.getByText('1. shot-site')).toBeInTheDocument();
    expect(screen.getByText('2. blood')).toBeInTheDocument();
    // 0.0009° of latitude is about 100 m, due north.
    expect(
      screen.getByText(/^Last entry: 100 m from the shot site in a straight line, bearing 0° \(N/),
    ).toBeInTheDocument();
  });
});
