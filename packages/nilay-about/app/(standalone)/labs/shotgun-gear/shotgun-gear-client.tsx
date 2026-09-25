'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  SelectField,
  StorageUnavailableNotice,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { GEAR_NAME_MAX_LENGTH, type ShotMaterial } from '@/lib/schemas/shotgun-gear';
import { MATERIAL_DENSITIES, SHOT_NUMBERS, TSS_DENSITY_SOURCE, shotNumberDiameterInches } from '@/lib/shot-pellets';
import { estimatedPelletCount, materialDensity, resolveSetup, setupLabel, type Cartridge } from '@/lib/shotgun-gear';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { gearStorageKey, useGearStore } from './_store';

type Message = [ja: string, en: string];

const MM_PER_INCH = 25.4;

interface CartridgeDraft {
  name: string;
  material: ShotMaterial;
  diameterMm: number;
  densityGcm3: number;
  chargeG: number;
  muzzleSpeedMps: number;
}

const emptyCartridge = (): CartridgeDraft => ({
  name: '',
  material: 'lead',
  diameterMm: NaN,
  densityGcm3: MATERIAL_DENSITIES.lead,
  chargeG: NaN,
  muzzleSpeedMps: NaN,
});

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={GEAR_NAME_MAX_LENGTH}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
      <h2 className="text-xl font-medium">{title}</h2>
      {children}
    </Card>
  );
}

export function ShotgunGearClient() {
  const gear = useGearStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(gearStorageKey);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const [gunName, setGunName] = useState('');
  const [gauge, setGauge] = useState('');
  const [barrels, setBarrels] = useState<{ label: string; lengthCm: number }[]>([{ label: '', lengthCm: NaN }]);
  const [chokeName, setChokeName] = useState('');
  const [constriction, setConstriction] = useState(NaN);
  const [cartridge, setCartridge] = useState<CartridgeDraft>(emptyCartridge);
  const [editingCartridge, setEditingCartridge] = useState<string | null>(null);
  const [setupGun, setSetupGun] = useState('');
  const [setupChoke, setSetupChoke] = useState('');
  const [setupCartridge, setSetupCartridge] = useState('');

  useEffect(() => {
    void Promise.all([useGearStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const report = (ok: boolean, done: Message, failed: Message) => setMessage(ok ? done : failed);
  const confirmDelete = (name: string) =>
    window.confirm(
      t(
        `「${name}」を削除しますか？ これを使う組み合わせも削除します。`,
        `Delete “${name}”? Combinations that use it are deleted too.`,
      ),
    );

  const addGun = () => {
    const ok = gear.addGun({
      name: gunName,
      gauge: gauge.trim(),
      barrels: barrels.map((barrel, index) => ({
        label: barrel.label.trim() || String(index + 1),
        lengthCm: Number.isFinite(barrel.lengthCm) && barrel.lengthCm > 0 ? barrel.lengthCm : null,
      })),
    });
    report(ok, ['銃を登録しました。', 'Gun added.'], ['銃の名前を入れてください。', 'Enter a name for the gun.']);
    if (ok) {
      setGunName('');
      setGauge('');
      setBarrels([{ label: '', lengthCm: NaN }]);
    }
  };

  const addChoke = () => {
    const ok = gear.addChoke({
      name: chokeName,
      constrictionMm: Number.isFinite(constriction) && constriction >= 0 ? constriction : null,
    });
    report(
      ok,
      ['チョークを登録しました。', 'Choke added.'],
      ['チョークの名前を入れてください。', 'Enter a name for the choke.'],
    );
    if (ok) {
      setChokeName('');
      setConstriction(NaN);
    }
  };

  const saveCartridge = () => {
    const entry = {
      name: cartridge.name,
      material: cartridge.material,
      diameterMm: cartridge.diameterMm,
      densityGcm3: cartridge.densityGcm3,
      chargeG: cartridge.chargeG,
      muzzleSpeedMps:
        Number.isFinite(cartridge.muzzleSpeedMps) && cartridge.muzzleSpeedMps > 0 ? cartridge.muzzleSpeedMps : null,
    };
    const ok = editingCartridge ? gear.updateCartridge({ ...entry, id: editingCartridge }) : gear.addCartridge(entry);
    report(
      ok,
      editingCartridge ? ['装弾を更新しました。', 'Cartridge updated.'] : ['装弾を登録しました。', 'Cartridge added.'],
      [
        '名前・粒の直径・密度・装弾量を入れてください（初速は空欄でもかまいません）。',
        'Enter a name, pellet diameter, density and shot charge (the velocity may be left blank).',
      ],
    );
    if (ok) {
      setCartridge(emptyCartridge());
      setEditingCartridge(null);
    }
  };

  const editCartridge = (item: Cartridge) => {
    setEditingCartridge(item.id);
    setCartridge({ ...item, muzzleSpeedMps: item.muzzleSpeedMps ?? NaN });
  };

  const [setupGunId, setupBarrelId] = setupGun.split('/');
  const addSetup = () => {
    const ok =
      !!setupGunId &&
      !!setupBarrelId &&
      gear.addSetup({
        gunId: setupGunId,
        barrelId: setupBarrelId,
        chokeId: setupChoke || null,
        cartridgeId: setupCartridge || null,
      });
    report(
      ok,
      ['組み合わせを登録しました。', 'Combination added.'],
      [
        '銃身を選んでください。同じ組み合わせは 1 つだけ登録できます。',
        'Choose a barrel. Each combination can be registered once.',
      ],
    );
  };

  const materialName = (material: ShotMaterial) =>
    ({
      lead: t('鉛', 'Lead'),
      iron: t('鉄（スチール）', 'Iron (steel)'),
      bismuth: t('ビスマス', 'Bismuth'),
      tss: t('TSS（メーカー公称）', 'TSS (maker’s figure)'),
      other: t('その他', 'Other'),
    })[material];
  const materialOptions = (['lead', 'iron', 'bismuth', 'tss', 'other'] as const).map((value) => {
    const density = materialDensity(value);
    return {
      value,
      label:
        density === null
          ? t('その他（密度を入力）', 'Other (enter the density)')
          : `${materialName(value)} ${density} g/cm³`,
    };
  });

  const barrelOptions = gear.guns.flatMap((gun) =>
    gun.barrels.map((barrel) => ({
      value: `${gun.id}/${barrel.id}`,
      label: gun.barrels.length > 1 ? `${gun.name}（${barrel.label}）` : gun.name,
    })),
  );

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('shotgun-gear').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language, 'record') : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={gearStorageKey} language={language} subject="record" />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <p className="text-sm text-on-surface-variant">
          {t(
            '登録した組み合わせと装弾は、クレーのスコアシート、散弾パターンの測定、散弾の粒数とエネルギー、リードの計算で選べます。',
            'Registered combinations and cartridges can be picked in the clay score sheet, shotgun pattern, shot pellet and lead tools.',
          )}
        </p>
        <p role="status" className="text-sm">
          {message ? t(...message) : ''}
        </p>

        <Section title={t('銃と銃身', 'Guns and barrels')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="gear-gun-name" label={t('銃の名前', 'Gun name')} value={gunName} onChange={setGunName} />
            <TextField
              id="gear-gun-gauge"
              label={t('番径（任意）', 'Gauge (optional)')}
              value={gauge}
              onChange={setGauge}
              placeholder="12"
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t('銃身', 'Barrels')}</legend>
            {barrels.map((barrel, index) => (
              <div key={index} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <TextField
                  id={`gear-barrel-${index}`}
                  label={t(`銃身 ${index + 1} の呼び名`, `Barrel ${index + 1} name`)}
                  value={barrel.label}
                  placeholder={t('例：上', 'e.g. Over')}
                  onChange={(label) =>
                    setBarrels(barrels.map((item, at) => (at === index ? { ...item, label } : item)))
                  }
                />
                <NumberField
                  label={t(`銃身 ${index + 1} の長さ（任意）`, `Barrel ${index + 1} length (optional)`)}
                  unit="cm"
                  value={barrel.lengthCm}
                  min={0}
                  onChange={(lengthCm) =>
                    setBarrels(barrels.map((item, at) => (at === index ? { ...item, lengthCm } : item)))
                  }
                />
                {barrels.length > 1 && (
                  <Button
                    variant="ghost"
                    aria-label={t(`銃身 ${index + 1} を外す`, `Remove barrel ${index + 1}`)}
                    onClick={() => setBarrels(barrels.filter((_, at) => at !== index))}
                  >
                    <LuTrash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={() => setBarrels([...barrels, { label: '', lengthCm: NaN }])}>
              <LuPlus aria-hidden="true" />
              {t('銃身を足す', 'Add a barrel')}
            </Button>
          </fieldset>
          <Button onClick={addGun}>{t('銃を登録', 'Add the gun')}</Button>
          {gear.guns.length > 0 && (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {gear.guns.map((gun) => (
                <li key={gun.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {gun.name}
                      {gun.gauge && (
                        <span className="text-on-surface-variant">{t(` ${gun.gauge} 番`, ` ${gun.gauge} gauge`)}</span>
                      )}
                    </p>
                    <p className="text-sm text-on-surface-variant">
                      {gun.barrels
                        .map((barrel) =>
                          barrel.lengthCm === null ? barrel.label : `${barrel.label} ${number(barrel.lengthCm)} cm`,
                        )
                        .join(t('・', ', '))}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={t(`${gun.name} を削除`, `Delete ${gun.name}`)}
                    onClick={() => confirmDelete(gun.name) && gear.removeGun(gun.id)}
                  >
                    {t('削除', 'Delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('チョーク', 'Chokes')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="gear-choke-name"
              label={t('チョークの名前', 'Choke name')}
              value={chokeName}
              placeholder={t('例：インプシリンダー', 'e.g. Improved Cylinder')}
              onChange={setChokeName}
            />
            <NumberField
              label={t('絞り（任意）', 'Constriction (optional)')}
              unit="mm"
              value={constriction}
              min={0}
              step={0.05}
              onChange={setConstriction}
              hint={t('銃身の内径とチョークの内径の差', 'Bore diameter less choke diameter')}
            />
          </div>
          <Button onClick={addChoke}>{t('チョークを登録', 'Add the choke')}</Button>
          {gear.chokes.length > 0 && (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {gear.chokes.map((choke) => (
                <li key={choke.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p>
                    <span className="font-medium">{choke.name}</span>
                    {choke.constrictionMm !== null && (
                      <span className="text-on-surface-variant">{` ${number(choke.constrictionMm, 2)} mm`}</span>
                    )}
                  </p>
                  <Button
                    variant="ghost"
                    aria-label={t(`${choke.name} を削除`, `Delete ${choke.name}`)}
                    onClick={() => confirmDelete(choke.name) && gear.removeChoke(choke.id)}
                  >
                    {t('削除', 'Delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('装弾', 'Cartridges')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="gear-cartridge-name"
              label={t('装弾の名前', 'Cartridge name')}
              value={cartridge.name}
              placeholder={t('例：練習用 7.5 号 24 g', 'e.g. Practice No. 7.5 24 g')}
              onChange={(name) => setCartridge({ ...cartridge, name })}
            />
            <SelectField
              label={t('材質', 'Material')}
              value={cartridge.material}
              options={materialOptions}
              onChange={(material) => {
                const density = materialDensity(material);
                setCartridge({ ...cartridge, material, densityGcm3: density ?? cartridge.densityGcm3 });
              }}
            />
            <SelectField
              label={t('号数から直径を入れる', 'Fill the diameter from a shot number')}
              value=""
              options={[
                { value: '', label: t('号数を選ぶ…', 'Choose a number…') },
                ...SHOT_NUMBERS.map((shotNumber) => ({
                  value: String(shotNumber),
                  label: t(
                    `${shotNumber} 号（${number(shotNumberDiameterInches(shotNumber) * MM_PER_INCH, 2)} mm）`,
                    `No. ${shotNumber} (${number(shotNumberDiameterInches(shotNumber) * MM_PER_INCH, 2)} mm)`,
                  ),
                })),
              ]}
              onChange={(value) =>
                value !== '' &&
                setCartridge({
                  ...cartridge,
                  diameterMm: Math.round(shotNumberDiameterInches(Number(value)) * MM_PER_INCH * 1000) / 1000,
                })
              }
              hint={t('SAAMI の号数の定義（17 − 号数）/100 インチ。', 'SAAMI shot size rule: (17 − number)/100 inch.')}
            />
            <NumberField
              label={t('粒の直径', 'Pellet diameter')}
              unit="mm"
              value={cartridge.diameterMm}
              min={0}
              step={0.01}
              onChange={(diameterMm) => setCartridge({ ...cartridge, diameterMm })}
            />
            <NumberField
              label={t('密度', 'Density')}
              unit="g/cm³"
              value={cartridge.densityGcm3}
              min={0}
              step={0.01}
              onChange={(densityGcm3) => setCartridge({ ...cartridge, densityGcm3 })}
            />
            <NumberField
              label={t('装弾量', 'Shot charge')}
              unit="g"
              value={cartridge.chargeG}
              min={0}
              step={0.5}
              onChange={(chargeG) => setCartridge({ ...cartridge, chargeG })}
            />
            <NumberField
              label={t('初速（任意）', 'Muzzle velocity (optional)')}
              unit="m/s"
              value={cartridge.muzzleSpeedMps}
              min={0}
              step={5}
              onChange={(muzzleSpeedMps) => setCartridge({ ...cartridge, muzzleSpeedMps })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCartridge}>
              {editingCartridge ? t('装弾を更新', 'Update the cartridge') : t('装弾を登録', 'Add the cartridge')}
            </Button>
            {editingCartridge && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingCartridge(null);
                  setCartridge(emptyCartridge());
                }}
              >
                {t('編集をやめる', 'Cancel editing')}
              </Button>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">
            {t(
              `TSS の密度は Federal が HEAVYWEIGHT TSS について公表している値（${TSS_DENSITY_SOURCE.checkedOn} 確認）で、他社のタングステン弾には当てはまりません。粒数は、すべての粒が入力した直径と密度の球だとした推定です。`,
              `The TSS density is the figure Federal publishes for HEAVYWEIGHT TSS (checked ${TSS_DENSITY_SOURCE.checkedOn}) and does not apply to other tungsten shot. Pellet counts assume every pellet is a sphere of the diameter and density entered.`,
            )}{' '}
            <a href={TSS_DENSITY_SOURCE.url} target="_blank" rel="noreferrer" className="underline" lang="en">
              {TSS_DENSITY_SOURCE.name}
            </a>
          </p>
          {gear.cartridges.length > 0 && (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {gear.cartridges.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-on-surface-variant">
                      {t(
                        `${materialName(item.material)}・${number(item.diameterMm, 2)} mm・${number(item.densityGcm3, 2)} g/cm³・${number(item.chargeG)} g${item.muzzleSpeedMps === null ? '' : `・${number(item.muzzleSpeedMps, 0)} m/s`}・約 ${number(estimatedPelletCount(item), 0)} 粒`,
                        `${materialName(item.material)}, ${number(item.diameterMm, 2)} mm, ${number(item.densityGcm3, 2)} g/cm³, ${number(item.chargeG)} g${item.muzzleSpeedMps === null ? '' : `, ${number(item.muzzleSpeedMps, 0)} m/s`}, about ${number(estimatedPelletCount(item), 0)} pellets`,
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      aria-label={t(`${item.name} を編集`, `Edit ${item.name}`)}
                      onClick={() => editCartridge(item)}
                    >
                      {t('編集', 'Edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={t(`${item.name} を削除`, `Delete ${item.name}`)}
                      onClick={() => confirmDelete(item.name) && gear.removeCartridge(item.id)}
                    >
                      {t('削除', 'Delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('組み合わせ（銃身 × チョーク × 装弾）', 'Combinations (barrel × choke × cartridge)')}>
          {barrelOptions.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {t('先に銃を登録してください。', 'Register a gun first.')}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label={t('銃身', 'Barrel')}
                  value={setupGun}
                  options={[{ value: '', label: t('選ぶ…', 'Choose…') }, ...barrelOptions]}
                  onChange={setSetupGun}
                />
                <SelectField
                  label={t('チョーク', 'Choke')}
                  value={setupChoke}
                  options={[
                    { value: '', label: t('指定しない', 'None') },
                    ...gear.chokes.map((choke) => ({ value: choke.id, label: choke.name })),
                  ]}
                  onChange={setSetupChoke}
                />
                <SelectField
                  label={t('装弾', 'Cartridge')}
                  value={setupCartridge}
                  options={[
                    { value: '', label: t('指定しない', 'None') },
                    ...gear.cartridges.map((item) => ({ value: item.id, label: item.name })),
                  ]}
                  onChange={setSetupCartridge}
                />
              </div>
              <Button onClick={addSetup}>{t('組み合わせを登録', 'Add the combination')}</Button>
            </>
          )}
          {gear.setups.length > 0 && (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {gear.setups.map((setup) => {
                const resolved = resolveSetup(gear, setup.id);
                if (!resolved) return null;
                const label = setupLabel(resolved);
                return (
                  <li key={setup.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <p className="min-w-0 font-medium">{label}</p>
                    <Button
                      variant="ghost"
                      aria-label={t(`組み合わせ ${label} を削除`, `Delete the combination ${label}`)}
                      onClick={() => gear.removeSetup(setup.id)}
                    >
                      {t('削除', 'Delete')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </AppLayout>
  );
}
