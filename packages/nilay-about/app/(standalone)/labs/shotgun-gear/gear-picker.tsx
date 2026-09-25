'use client';

import Link from 'next/link';

import { SelectField } from '@/components/labs';
import { resolveSetup, setupLabel, type Cartridge, type ResolvedSetup } from '@/lib/shotgun-gear';

import { useGearStore } from './_store';

type Language = 'ja' | 'en';

interface GearPickerProps {
  language: Language;
  /** Setups fill a gun, a choke and a cartridge; cartridges fill only a load. */
  kind: 'setup' | 'cartridge';
  label?: string;
  hint?: string;
  onPickSetup?: (setup: ResolvedSetup) => void;
  onPickCartridge?: (cartridge: Cartridge) => void;
  className?: string;
}

/**
 * A choice from the gear registry that writes into the tool's own fields. It holds no value of its
 * own: picking an entry copies it in, and the fields stay editable, so a later change to the registry
 * never rewrites what a tool has already saved.
 */
export function GearPicker({ language, kind, label, hint, onPickSetup, onPickCartridge, className }: GearPickerProps) {
  const gear = useGearStore();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const setups = gear.setups.flatMap((setup) => {
    const resolved = resolveSetup(gear, setup.id);
    return resolved ? [resolved] : [];
  });
  const options =
    kind === 'setup'
      ? setups.map((resolved) => ({ value: resolved.setup.id, label: setupLabel(resolved) }))
      : gear.cartridges.map((cartridge) => ({ value: cartridge.id, label: cartridge.name }));

  if (options.length === 0)
    return (
      <p className={className ? `${className} text-sm text-on-surface-variant` : 'text-sm text-on-surface-variant'}>
        {kind === 'setup'
          ? t('銃・チョーク・装弾の組み合わせを', 'Register a gun, choke and cartridge combination in ')
          : t('装弾を', 'Register cartridges in ')}
        <Link href="/labs/shotgun-gear" className="underline">
          {t('装備の登録', 'Shotgun Gear')}
        </Link>
        {t('で登録すると、ここから選べます。', ' to pick them here.')}
      </p>
    );

  return (
    <SelectField
      className={className}
      label={
        label ??
        (kind === 'setup'
          ? t('登録した装備から入れる', 'Fill from registered gear')
          : t('登録した装弾から入れる', 'Fill from a registered cartridge'))
      }
      value=""
      hint={hint}
      options={[{ value: '', label: t('選ぶ…', 'Choose…') }, ...options]}
      onChange={(id) => {
        if (id === '') return;
        if (kind === 'setup') {
          const resolved = resolveSetup(gear, id);
          if (resolved) onPickSetup?.(resolved);
        } else {
          const cartridge = gear.cartridges.find((item) => item.id === id);
          if (cartridge) onPickCartridge?.(cartridge);
        }
      }}
    />
  );
}
