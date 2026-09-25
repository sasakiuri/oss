'use client';

import { useRef, useState, type MouseEvent } from 'react';

import { SegmentedControl } from '@/components/labs';
import { Button } from '@/components/ui';
import { VITAL_ZONES, zoneAt, type VitalAnimal, type VitalZone, type ZoneShape } from '@/lib/shoot-decision';
import type { Language } from '@/store';

import { STUDY_SOURCES } from '../license-exam/sources';

import { AnimalShape } from './animal-shapes';

const zoneLabels: Record<VitalZone, { ja: string; en: string }> = {
  brain: { ja: '頭部（脳）', en: 'Head (brain)' },
  neck: { ja: '頸部（頸椎）', en: 'Neck (spine)' },
  chest: { ja: '胸部（心臓・肺）', en: 'Chest (heart and lungs)' },
};

const zoneColours: Record<VitalZone, string> = { brain: '#d93025', neck: '#f29900', chest: '#1a73e8' };

const animalLabels: Record<VitalAnimal, { ja: string; en: string }> = {
  deer: { ja: 'シカ', en: 'Deer' },
  boar: { ja: 'イノシシ', en: 'Wild boar' },
  bear: { ja: 'クマ', en: 'Bear' },
};

/** What the cited guidance says about each animal's aiming points, in its own terms. */
const notes: Record<VitalAnimal, { ja: string; source: keyof typeof STUDY_SOURCES; locator: string }> = {
  deer: {
    ja: '頭頸部を狙う場合、狙うのは脳と頸椎で、脳は頭部の中で占める割合が小さく、頸椎は首全体の太さに対して細い。胸部は心臓や肺が集まる「バイタルゾーン」で範囲が広く、精密な射撃が難しい場合の狙点に向くが、心臓より後方にずれると第 1 胃に当たるおそれがある。頸椎は第 1〜3 頸椎が望ましい。',
    source: 'hokkaidoDeer',
    locator: 'p.3〜9',
  },
  boar: {
    ja: 'イノシシの急所はクマと同様に頭部（脳）、喉元から胸部（心臓・肺）。正面から胸部を狙うとよく、鼻筋（緩傾斜部）に当たると跳弾しやすい。',
    source: 'moeEmergency',
    locator: 'p.110',
  },
  bear: {
    ja: '急所は頭頸部（脳・脊髄）と胸部（肺・心臓）。頭蓋骨は厚く跳弾のおそれがあるため正面ではなく側面を撃つ。胸部は頭頸部より当てやすいが、即倒せず逃走や反撃のおそれがある。首は短くよく動くため外れやすい。',
    source: 'moeEmergency',
    locator: 'p.107〜108',
  },
};

const ellipse = (shape: ZoneShape, colour: string, key: string) => (
  <ellipse
    key={key}
    cx={shape.cx}
    cy={shape.cy}
    rx={shape.rx}
    ry={shape.ry}
    fill={colour}
    fillOpacity="0.45"
    stroke={colour}
    strokeWidth="2"
  />
);

/**
 * The aiming points of deer, boar and bears: tap where you would aim, then see the zones.
 * The drawing is schematic, and the zones follow the guidance quoted beneath it.
 */
export function Vitals({ language, onTried }: { language: Language; onTried: () => void }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [animal, setAnimal] = useState<VitalAnimal>('deer');
  const [shot, setShot] = useState<{ x: number; y: number } | null>(null);
  const [showZones, setShowZones] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const aim = (event: MouseEvent<SVGSVGElement>) => {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!element || !matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setShot({ x: point.x, y: point.y });
    setShowZones(true);
    onTried();
  };

  const hit = shot ? zoneAt(animal, shot.x, shot.y) : null;
  const note = notes[animal];
  const reference = STUDY_SOURCES[note.source];

  return (
    <div className="space-y-4">
      <SegmentedControl
        legend={t('動物', 'Animal')}
        orientation="inline"
        value={animal}
        options={(Object.keys(animalLabels) as VitalAnimal[]).map((value) => ({
          value,
          label: t(animalLabels[value].ja, animalLabels[value].en),
        }))}
        onChange={(value) => {
          setAnimal(value as VitalAnimal);
          setShot(null);
          setShowZones(false);
        }}
      />
      <p className="text-sm text-on-surface-variant">
        {t('横向きの図で、狙う位置をタップしてください。', 'Tap where you would aim on the side view.')}
      </p>
      <svg
        ref={svg}
        viewBox="0 0 400 260"
        className="h-auto w-full cursor-crosshair rounded-md bg-surface-container"
        role="img"
        aria-label={t(
          `${animalLabels[animal].ja}の横向きの模式図`,
          `Side view of a ${animalLabels[animal].en.toLowerCase()}`,
        )}
        onClick={aim}
      >
        <AnimalShape animal={animal} fill="#8d7b68" />
        {showZones &&
          (Object.entries(VITAL_ZONES[animal]) as [VitalZone, ZoneShape][]).map(([zone, shape]) =>
            ellipse(shape, zoneColours[zone], zone),
          )}
        {shot && (
          <g stroke="#000" strokeWidth="2">
            <line x1={shot.x - 8} y1={shot.y} x2={shot.x + 8} y2={shot.y} />
            <line x1={shot.x} y1={shot.y - 8} x2={shot.x} y2={shot.y + 8} />
          </g>
        )}
      </svg>
      <p className="font-medium" aria-live="polite">
        {shot === null
          ? ''
          : hit
            ? t(`${zoneLabels[hit].ja}に当たる位置です。`, `That is on the ${zoneLabels[hit].en.toLowerCase()}.`)
            : t(
                '急所から外れています。手負いにするおそれがあります。',
                'That misses the vital zones and risks wounding.',
              )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setShowZones(!showZones)} aria-pressed={showZones}>
          {showZones ? t('急所を隠す', 'Hide zones') : t('急所を表示', 'Show zones')}
        </Button>
        <ul className="flex flex-wrap gap-3 text-sm">
          {(Object.keys(VITAL_ZONES[animal]) as VitalZone[]).map((zone) => (
            <li key={zone} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-full"
                style={{ background: zoneColours[zone] }}
              />
              {t(zoneLabels[zone].ja, zoneLabels[zone].en)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-sm bg-surface-container p-4 text-sm">
        <p lang="ja">{note.ja}</p>
        <p className="mt-2 text-xs text-on-surface-variant" lang="ja">
          {t('出典', 'Source')}:{' '}
          <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
            {reference.name}
          </a>
          （{reference.publisher}、{reference.version}）{note.locator}
        </p>
      </div>
    </div>
  );
}
