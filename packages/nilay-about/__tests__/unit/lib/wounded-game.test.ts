import { describe, expect, it } from 'vitest';

import { woundedGameStateSchema, type TrailEntry } from '@/lib/schemas/wounded-game';
import {
  EARTH_RADIUS_METERS,
  addMinutes,
  classifyHit,
  distanceMeters,
  distancesFromShotSite,
  findingsFor,
  minutesBetween,
  sortEntries,
  sources,
  toLocalDateTime,
  waitAdvice,
} from '@/lib/wounded-game';

describe('reading the hit from the signs', () => {
  it('takes the hunter’s impression when no sign speaks for a place', () => {
    expect(classifyHit('chest', [])).toBe('chest');
    expect(classifyHit('gut', [])).toBe('gut');
    expect(classifyHit('outside-cavity', ['bright-red'])).toBe('outside-cavity');
    expect(classifyHit('unsure', ['dark-red', 'hair-bone'])).toBe('unsure');
  });

  it('lets a sign on the ground outrank the impression', () => {
    expect(classifyHit('unsure', ['frothy'])).toBe('chest');
    expect(classifyHit('outside-cavity', ['frothy'])).toBe('chest');
    expect(classifyHit('chest', ['gut-fluid'])).toBe('gut');
  });

  it('puts a sign of the gut before a sign of the lungs', () => {
    expect(classifyHit('unsure', ['frothy', 'gut-fluid'])).toBe('gut');
  });
});

describe('the waits the sources give', () => {
  // Missouri Bowhunter Safety Course: chest 20-30 min, gut 6 h or more, in doubt 30-60 min, outside the
  // cavity at once. Missouri Hunter Safety Course: 30 min to 1 h unless the deer is in sight.
  // Missouri Conservationist 2001-10: at least 15 min when sure of a good shot, 1 h or more otherwise.
  it('gives a chest hit 15 to 30 minutes across the sources', () => {
    const advice = waitAdvice('chest', []);
    expect(advice.guides.map((guide) => [guide.sourceId, guide.minMinutes, guide.maxMinutes])).toEqual([
      ['mo-bow-when', 20, 30],
      ['mdc-basics', 15, null],
      ['mo-hunter-trailing', 30, 60],
    ]);
    expect(advice.longestMinimum).toBe(30);
    expect(advice.shortestMinimum).toBe(15);
  });

  it('asks for six hours after a gut hit', () => {
    const advice = waitAdvice('unsure', ['gut-fluid']);
    expect(advice.hitClass).toBe('gut');
    expect(advice.longestMinimum).toBe(360);
    expect(advice.shortestMinimum).toBe(30);
  });

  it('shows the spread when a source says to follow at once', () => {
    const advice = waitAdvice('outside-cavity', []);
    expect(advice.longestMinimum).toBe(60);
    expect(advice.shortestMinimum).toBe(0);
    expect(advice.guides[0]).toMatchObject({ sourceId: 'mo-bow-when', minMinutes: 0, maxMinutes: 0 });
  });

  it('sets the wait aside when the downed animal is in sight', () => {
    // Missouri Hunter Safety Course: "unless the downed deer is in sight".
    expect(waitAdvice('chest', ['down-in-sight']).downInSight).toBe(true);
    expect(waitAdvice('chest', ['frothy']).downInSight).toBe(false);
  });

  it('waits an hour when the hit is uncertain', () => {
    const advice = waitAdvice('unsure', []);
    expect(advice.longestMinimum).toBe(60);
    expect(advice.shortestMinimum).toBe(30);
  });

  it('cites a source that exists for every guide', () => {
    for (const impression of ['chest', 'gut', 'outside-cavity', 'unsure'] as const)
      for (const guide of waitAdvice(impression, []).guides) {
        const source = sources[guide.sourceId];
        if (!source) throw new Error(`No source registered for ${guide.sourceId}.`);
        expect(source.url).toMatch(/^https:\/\//);
      }
  });
});

describe('what the sources say about each sign', () => {
  it('says nothing when nothing is ticked and the hit is not in the gut', () => {
    expect(findingsFor('chest', [])).toEqual([]);
  });

  it('adds the food rule to any gut hit, once', () => {
    expect(findingsFor('gut', []).map((finding) => finding.id)).toEqual(['not-for-food']);
    const gutFindings = findingsFor('gut', ['gut-fluid']);
    expect(gutFindings.map((finding) => finding.id)).toEqual(['intestine', 'not-for-food']);
    expect(gutFindings[1]!.sourceIds).toEqual(['mhlw']);
  });

  it('keeps the order the signs were ticked in, without repeats', () => {
    expect(findingsFor('unsure', ['no-blood', 'hair-bone', 'bright-red']).map((finding) => finding.id)).toEqual([
      'not-a-miss',
      'hit-sign',
      'hair-exit',
      'arterial',
    ]);
  });
});

describe('local times', () => {
  it('adds minutes across midnight, the month and a leap day', () => {
    expect(addMinutes('2026-09-23T23:40', 30)).toBe('2026-09-24T00:10');
    expect(addMinutes('2026-09-30T20:00', 360)).toBe('2026-10-01T02:00');
    expect(addMinutes('2028-02-28T22:00', 180)).toBe('2028-02-29T01:00');
    expect(addMinutes('2026-09-23T10:00', 0)).toBe('2026-09-23T10:00');
  });

  it('refuses a time that does not exist', () => {
    expect(addMinutes('', 30)).toBeNull();
    expect(addMinutes('2026-02-30T10:00', 30)).toBeNull();
    expect(addMinutes('2026-09-23T24:00', 30)).toBeNull();
    expect(addMinutes('2026-09-23T10:60', 30)).toBeNull();
    expect(addMinutes('2026-09-23T10:00', Number.NaN)).toBeNull();
  });

  it('counts the minutes between two times, backwards as a negative', () => {
    expect(minutesBetween('2026-09-23T23:50', '2026-09-24T00:20')).toBe(30);
    expect(minutesBetween('2026-09-23T10:00', '2026-09-23T09:59')).toBe(-1);
    expect(minutesBetween('2026-09-23T10:00', 'later')).toBeNull();
  });

  it('writes the device clock the way the time field does', () => {
    expect(toLocalDateTime(new Date(2026, 8, 3, 7, 5, 59))).toBe('2026-09-03T07:05');
  });
});

describe('distances on the trail', () => {
  const at = (lat: number, lon: number) => ({ latitude: lat, longitude: lon, accuracyMeters: null });

  it('measures one degree of latitude as πR/180', () => {
    // 6 371 008.8 m × π / 180 = 111 195.08 m.
    expect(distanceMeters(at(0, 0), at(1, 0))).toBeCloseTo(111195.08, 1);
    expect(distanceMeters(at(0, 0), at(1, 0))).toBeCloseTo((EARTH_RADIUS_METERS * Math.PI) / 180, 6);
  });

  it('shrinks a degree of longitude by the cosine of the latitude', () => {
    // 111 195.08 m × cos 35° × 0.001 = 91.086 m.
    expect(distanceMeters(at(35, 135), at(35, 135.001))).toBeCloseTo(91.086, 2);
    expect(distanceMeters(at(35, 135), at(35, 135))).toBe(0);
  });

  const entry = (id: string, at: string, kind: TrailEntry['kind'], position: TrailEntry['position']): TrailEntry => ({
    id,
    at,
    kind,
    note: '',
    position,
  });

  it('sorts by time and keeps the written order within a minute', () => {
    const entries = [
      entry('b', '2026-09-23T10:05', 'blood', null),
      entry('a', '2026-09-23T10:00', 'shot-site', null),
      entry('c', '2026-09-23T10:05', 'note', null),
    ];
    expect(sortEntries(entries).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('measures from the first shot site that has a position', () => {
    const entries = [
      entry('late-site', '2026-09-23T11:00', 'shot-site', at(35, 135.002)),
      entry('blood', '2026-09-23T10:10', 'blood', at(35.001, 135)),
      entry('site-without-fix', '2026-09-23T09:55', 'shot-site', null),
      entry('site', '2026-09-23T10:00', 'shot-site', at(35, 135)),
      entry('note', '2026-09-23T10:20', 'note', null),
    ];
    const distances = distancesFromShotSite(entries);
    expect([...distances.keys()]).toEqual(['blood', 'late-site']);
    expect(distances.get('blood')).toBeCloseTo(111.195, 2);
    expect(distances.get('late-site')).toBeCloseTo(182.17, 1);
  });

  it('has nothing to measure from without a located shot site', () => {
    expect(distancesFromShotSite([entry('blood', '2026-09-23T10:10', 'blood', at(35, 135))]).size).toBe(0);
  });
});

describe('the saved state', () => {
  const valid = { shotAt: '', impression: 'unsure', cues: [], entries: [] };

  it('accepts an empty start and a full entry', () => {
    expect(woundedGameStateSchema.safeParse(valid).success).toBe(true);
    expect(
      woundedGameStateSchema.safeParse({
        ...valid,
        shotAt: '2026-09-23T16:30',
        cues: ['frothy'],
        entries: [
          {
            id: 'x',
            at: '2026-09-23T16:45',
            kind: 'blood',
            note: '倒木の手前',
            position: { latitude: 35, longitude: 135, accuracyMeters: 8 },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects a date or time that does not exist, as the calculation does', () => {
    expect(woundedGameStateSchema.safeParse({ ...valid, shotAt: '2026-02-30T25:99' }).success).toBe(false);
    expect(woundedGameStateSchema.safeParse({ ...valid, shotAt: '2026-02-30T10:00' }).success).toBe(false);
    expect(woundedGameStateSchema.safeParse({ ...valid, shotAt: '2026-09-23T24:00' }).success).toBe(false);
    expect(woundedGameStateSchema.safeParse({ ...valid, shotAt: '2028-02-29T23:59' }).success).toBe(true);
    expect(
      woundedGameStateSchema.safeParse({
        ...valid,
        entries: [{ id: 'x', at: '2026-13-01T10:00', kind: 'blood', note: '', position: null }],
      }).success,
    ).toBe(false);
  });

  it('rejects repeated signs, unknown kinds and positions off the globe', () => {
    expect(woundedGameStateSchema.safeParse({ ...valid, cues: ['frothy', 'frothy'] }).success).toBe(false);
    expect(woundedGameStateSchema.safeParse({ ...valid, shotAt: '16:30' }).success).toBe(false);
    const entryWith = (changes: object) => ({
      ...valid,
      entries: [{ id: 'x', at: '2026-09-23T16:45', kind: 'blood', note: '', position: null, ...changes }],
    });
    expect(woundedGameStateSchema.safeParse(entryWith({ kind: 'dog' })).success).toBe(false);
    expect(
      woundedGameStateSchema.safeParse(entryWith({ position: { latitude: 91, longitude: 0, accuracyMeters: null } }))
        .success,
    ).toBe(false);
  });
});
