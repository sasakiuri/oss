import { describe, expect, it } from 'vitest';

import { createHomeTargetStore } from '@/features/home-target/store';

describe('home target form state', () => {
  it('isolates separate calculator instances and resets all form values', () => {
    const first = createHomeTargetStore();
    const second = createHomeTargetStore();
    first.getState().setLanguage('en');
    first.getState().setHeightOfEye({ number: 180, unit: 'cm' });
    first.getState().setDistanceToTarget({ number: 7, unit: 'm' });
    expect(second.getState().language).toBe('ja');
    expect(second.getState().heightOfEye.number).toBe(170);
    first.getState().reset();
    expect(first.getState().language).toBe('ja');
    expect(first.getState().heightOfEye.number).toBe(170);
    expect(first.getState().distanceToTarget.number).toBe(5);
  });

  it('selects a preset and preserves its values when switching to custom', () => {
    const store = createHomeTargetStore();
    store.getState().selectDiscipline('AR10');
    expect(store.getState().discipline.distance).toEqual({ number: 10, unit: 'm' });
    store.getState().selectDiscipline('CUSTOM');
    expect(store.getState().discipline.key).toBe('CUSTOM');
    expect(store.getState().discipline.distance).toEqual({ number: 10, unit: 'm' });
    store.getState().setDiscipline({ ...store.getState().discipline, distance: { number: 20, unit: 'm' } });
    store.getState().selectDiscipline('AR10');
    expect(store.getState().discipline.distance.number).toBe(10);
  });

  it('rejects an unknown discipline without changing the form', () => {
    const store = createHomeTargetStore();
    const previous = store.getState().discipline;
    expect(() => store.getState().selectDiscipline('MISSING')).toThrow('Unknown discipline');
    expect(store.getState().discipline).toBe(previous);
  });
});
