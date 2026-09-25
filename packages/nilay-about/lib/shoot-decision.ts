import type { StudySource } from './schemas/license-exam';

/**
 * Shoot-or-hold scenes and the aiming points of deer, wild boar and bears.
 *
 * A scene is decided by one thing: either it is safe and lawful to shoot, or there is a reason
 * not to. The reasons are the ones Japanese law and the published safety guidance name: the
 * backstop, the target, people and buildings in the line of fire, ricochet, the time of day, the
 * place, the season and the species. Nothing here depends on React or a store.
 */

export const shootReasons = [
  'shoot',
  'backstop',
  'target',
  'people',
  'ricochet',
  'time',
  'place',
  'season',
  'species',
] as const;
export type ShootReason = (typeof shootReasons)[number];

export type SceneAnimal = 'deer' | 'boar' | 'bear' | 'serow';

/** What the picture of a scene shows behind and around the animal. */
export interface SceneLayout {
  /** The ground behind the animal: a bank of earth, open sky over a ridge, water, rock or bamboo. */
  backdrop: 'bank' | 'skyline' | 'water' | 'rock' | 'bamboo' | 'field';
  light: 'day' | 'dusk' | 'night';
  house?: boolean;
  road?: boolean;
  person?: boolean;
  /** Something moving in the brush behind, not yet made out. */
  movement?: boolean;
  sign?: string;
}

export interface Scene {
  id: string;
  animal: SceneAnimal;
  /** The situation in words: date, time, place and anything the picture cannot say. */
  situation: string;
  layout: SceneLayout;
  answer: ShootReason;
  explanation: string;
  sources: StudySource[];
}

export interface SceneAnswer {
  shoot: boolean;
  reason: ShootReason | null;
}

/** Right only when both the decision and, for a hold, the reason are the scene's. */
export function isSceneAnswerCorrect(scene: Scene, answer: SceneAnswer): boolean {
  if (scene.answer === 'shoot') return answer.shoot;
  return !answer.shoot && answer.reason === scene.answer;
}

// The shuffle takes its random source as an argument, so a test can fix it.
export function shuffleScenes<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const held = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = held;
  }
  return result;
}

/** The animals whose aiming points are drawn. */
export type VitalAnimal = 'deer' | 'boar' | 'bear';
export type VitalZone = 'brain' | 'neck' | 'chest';

/** An ellipse in the drawing's own coordinates (a 400 × 260 side view, head to the left). */
export interface ZoneShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Where the zones sit on the side-view drawings. The drawings are schematic, made for this tool;
 * the positions follow the descriptions in the guidance each species cites (the brain in the
 * head, the neck vertebrae, and the heart and lungs in the chest just behind the foreleg).
 */
export const VITAL_ZONES: Record<VitalAnimal, Partial<Record<VitalZone, ZoneShape>>> = {
  deer: {
    brain: { cx: 70, cy: 62, rx: 11, ry: 9 },
    neck: { cx: 118, cy: 90, rx: 12, ry: 9 },
    chest: { cx: 160, cy: 150, rx: 32, ry: 28 },
  },
  boar: {
    brain: { cx: 80, cy: 128, rx: 11, ry: 9 },
    chest: { cx: 150, cy: 150, rx: 34, ry: 30 },
  },
  bear: {
    brain: { cx: 72, cy: 92, rx: 12, ry: 11 },
    neck: { cx: 110, cy: 108, rx: 14, ry: 14 },
    chest: { cx: 158, cy: 150, rx: 36, ry: 32 },
  },
};

/** The zone a point falls in, or null for a point outside every zone. */
export function zoneAt(animal: VitalAnimal, x: number, y: number): VitalZone | null {
  for (const [zone, shape] of Object.entries(VITAL_ZONES[animal]) as [VitalZone, ZoneShape][]) {
    const dx = (x - shape.cx) / shape.rx;
    const dy = (y - shape.cy) / shape.ry;
    if (dx * dx + dy * dy <= 1) return zone;
  }
  return null;
}
