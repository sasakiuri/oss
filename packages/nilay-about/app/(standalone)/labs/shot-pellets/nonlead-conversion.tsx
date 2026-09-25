'use client';

import { useMemo, useState } from 'react';

import { NumberField } from '@/components/labs';
import type { PelletLoad } from '@/lib/schemas/shot-pellets';
import {
  MATERIAL_DENSITIES,
  TSS_DENSITY_SOURCE,
  chargeToKilograms,
  densityToKgPerM3,
  diameterFromMeters,
  diameterToMeters,
  equivalentPellet,
  speedToMetersPerSecond,
  toFootPounds,
  type Conditions,
  type PelletMaterial,
  type PelletUnits,
} from '@/lib/shot-pellets';
import { toMeters } from '@/lib/sight-adjustment';

const TARGETS: readonly Exclude<PelletMaterial, 'lead'>[] = ['iron', 'bismuth', 'tss'];

interface NonLeadConversionProps {
  load: PelletLoad;
  units: PelletUnits;
  conditions: Conditions | null;
  referenceDistance: number;
  language: 'ja' | 'en';
}

/**
 * For condition A, the steel, bismuth and TSS pellet that carries the same energy at the comparison
 * distance, by flying each one with the same model. The muzzle velocity of the non-lead load is the
 * reader's, since non-lead loads are often driven faster; it starts as A's.
 */
export function NonLeadConversion({ load, units, conditions, referenceDistance, language }: NonLeadConversionProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [speed, setSpeed] = useState(NaN);
  const targetSpeed = Number.isFinite(speed) ? speed : load.muzzleSpeed;
  const speedUnitLabel = units.speedUnit === 'mps' ? 'm/s' : 'fps';
  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const rows = useMemo(() => {
    if (!conditions) return null;
    const reference = {
      diameterMeters: diameterToMeters(load.diameter, units.diameterUnit),
      densityKgPerM3: densityToKgPerM3(load.density),
      muzzleSpeedMs: speedToMetersPerSecond(load.muzzleSpeed, units.speedUnit),
      chargeKg: chargeToKilograms(load.shotCharge, units.shotChargeUnit),
    };
    const distanceMeters = toMeters(referenceDistance, units.distanceUnit);
    const muzzleSpeedMs = speedToMetersPerSecond(targetSpeed, units.speedUnit);
    if (
      ![...Object.values(reference), distanceMeters, muzzleSpeedMs].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      return null;
    return TARGETS.map((material) => ({
      material,
      pellet: equivalentPellet(
        reference,
        { densityKgPerM3: densityToKgPerM3(MATERIAL_DENSITIES[material]), muzzleSpeedMs },
        distanceMeters,
        conditions,
      ),
    }));
  }, [load, units, conditions, referenceDistance, targetSpeed]);

  const materialName = (material: PelletMaterial) =>
    ({
      lead: t('鉛', 'Lead'),
      iron: t('鉄（スチール）', 'Iron (steel)'),
      bismuth: t('ビスマス', 'Bismuth'),
      tss: t('TSS（Federal 公称）', 'TSS (Federal figure)'),
    })[material];

  return (
    <div className="space-y-4">
      <NumberField
        label={t('非鉛弾の初速', 'Non-lead muzzle velocity')}
        unit={speedUnitLabel}
        value={targetSpeed}
        min={0}
        onChange={setSpeed}
        invalid={!(targetSpeed > 0)}
        errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
        hint={t('非鉛弾の装弾に表示された初速', 'As printed on the non-lead load')}
      />
      {rows === null ? (
        <p className="text-sm text-destructive">
          {t(
            '条件 A と比較する距離を正しく入れると表示します。',
            'Complete condition A and the comparison distance to see this.',
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {t('同じエネルギーの非鉛弾', 'Non-lead pellets with the same energy')}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="py-2 text-left font-medium">
                  {t('材質', 'Material')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('粒の直径', 'Diameter')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('近い号数', 'Nearest number')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('同じ装弾量の粒数', 'Pellets in the same charge')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('エネルギー', 'Energy')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ material, pellet }) => (
                <tr key={material} className="border-t border-outline-variant">
                  <th scope="row" className="py-2 text-left font-normal">
                    {materialName(material)}
                    <span className="block text-xs text-on-surface-variant">{`${MATERIAL_DENSITIES[material]} g/cm³`}</span>
                  </th>
                  {pellet ? (
                    <>
                      <td className="py-2 text-right tabular-nums">
                        {`${number(diameterFromMeters(pellet.diameterMeters, 'mm'), 2)} mm`}
                        <span className="block text-xs text-on-surface-variant">{`${number(diameterFromMeters(pellet.diameterMeters, 'inch'), 3)} in`}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {pellet.nearestShotNumber === null
                          ? t('号数の範囲外', 'Outside the numbers')
                          : t(`${pellet.nearestShotNumber} 号`, `No. ${pellet.nearestShotNumber}`)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{number(pellet.count, 0)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {`${number(pellet.energyJoules, 2)} J`}
                        <span className="block text-xs text-on-surface-variant">{`${number(toFootPounds(pellet.energyJoules), 2)} ft-lb`}</span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-2 text-right text-on-surface-variant">
                      {t('この条件では求められません', 'No answer for these inputs')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="space-y-2 text-xs text-on-surface-variant">
        <li>
          {t(
            '粒数は、条件 A と同じ重さの装弾量に入る数です。',
            'Pellet counts are for the same weight of charge as condition A.',
          )}
        </li>
        <li>
          {t(
            `近い号数は SAAMI の式（直径 = (17 − 号数)/100 インチ）で、差が半号（0.127 mm）以内のときだけ示します。密度は鉄 7.87・ビスマス 9.79 g/cm³ が英国王立化学会の周期表の純金属の値、TSS 18 g/cm³ は Federal が HEAVYWEIGHT TSS について公表している値（${TSS_DENSITY_SOURCE.checkedOn} 確認）で、他社のタングステン弾には当てはまりません。`,
            `Nearest numbers use SAAMI's rule (diameter = (17 − number)/100 inch) and are shown only within half a size (0.127 mm). Densities: iron 7.87 and bismuth 9.79 g/cm³ are the pure metals from the Royal Society of Chemistry periodic table; TSS 18 g/cm³ is Federal's published figure for HEAVYWEIGHT TSS (checked ${TSS_DENSITY_SOURCE.checkedOn}) and does not apply to other tungsten shot.`,
          )}{' '}
          <a href={TSS_DENSITY_SOURCE.url} target="_blank" rel="noreferrer" className="underline" lang="en">
            {TSS_DENSITY_SOURCE.name}
          </a>
        </li>
        <li>
          {t(
            '粒の硬さ・変形・パターンは材質で変わります。銃身とチョークが非鉛弾に使えるかは、銃と装弾のメーカーの指示に従ってください。',
            'Hardness, deformation and pattern differ by material. Follow the gun and ammunition makers’ instructions on whether a barrel and choke may be used with non-lead shot.',
          )}
        </li>
      </ul>
    </div>
  );
}
