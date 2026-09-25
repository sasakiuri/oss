import { describe, expect, it } from 'vitest';

import { STUDY_SOURCES } from '@/app/(standalone)/labs/license-exam/sources';
import { reasonLabels, scenes } from '@/app/(standalone)/labs/shoot-decision/scenes';
import { isSceneAnswerCorrect, shootReasons, shuffleScenes, VITAL_ZONES, zoneAt } from '@/lib/shoot-decision';

describe('the scenes', () => {
  it('each cite a known source, have unique ids and a labelled answer', () => {
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
    for (const scene of scenes) {
      expect(scene.sources.length).toBeGreaterThan(0);
      for (const source of scene.sources) expect(Object.keys(STUDY_SOURCES)).toContain(source.doc);
      expect(reasonLabels[scene.answer]).toBeDefined();
    }
  });

  it('cover shooting and every reason not to, with deer, boar and bears', () => {
    const answers = new Set(scenes.map((scene) => scene.answer));
    for (const reason of shootReasons) expect({ reason, asked: answers.has(reason) }).toEqual({ reason, asked: true });
    const animals = new Set(scenes.map((scene) => scene.animal));
    for (const animal of ['deer', 'boar', 'bear'] as const) expect(animals.has(animal)).toBe(true);
  });
});

describe('marking a scene', () => {
  const hold = scenes.find((scene) => scene.answer === 'time')!;
  const shoot = scenes.find((scene) => scene.answer === 'shoot')!;

  it('needs the right reason for a hold', () => {
    expect(isSceneAnswerCorrect(hold, { shoot: false, reason: 'time' })).toBe(true);
    expect(isSceneAnswerCorrect(hold, { shoot: false, reason: 'place' })).toBe(false);
    expect(isSceneAnswerCorrect(hold, { shoot: true, reason: null })).toBe(false);
  });

  it('takes a shot as right only where shooting is', () => {
    expect(isSceneAnswerCorrect(shoot, { shoot: true, reason: null })).toBe(true);
    expect(isSceneAnswerCorrect(shoot, { shoot: false, reason: 'backstop' })).toBe(false);
  });

  it('shuffles without losing a scene', () => {
    const shuffled = shuffleScenes(scenes, () => 0.3);
    expect([...shuffled].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...scenes].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });
});

describe('the aiming zones', () => {
  it('find the zone at its centre and nothing far outside', () => {
    for (const [animal, zones] of Object.entries(VITAL_ZONES) as [keyof typeof VITAL_ZONES, typeof VITAL_ZONES.deer][])
      for (const [zone, shape] of Object.entries(zones))
        expect({ animal, zone: zoneAt(animal, shape.cx, shape.cy) }).toEqual({ animal, zone });
    expect(zoneAt('deer', 350, 20)).toBeNull();
    expect(zoneAt('boar', 290, 145)).toBeNull();
  });

  it('draws a neck zone only where the guidance names one', () => {
    expect(VITAL_ZONES.boar.neck).toBeUndefined();
    expect(VITAL_ZONES.deer.neck).toBeDefined();
    expect(VITAL_ZONES.bear.neck).toBeDefined();
  });
});
