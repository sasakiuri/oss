'use client';

import { useEffect, useId, useState } from 'react';
import { LuDices, LuMapPin, LuPlus, LuPrinter, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  GeoMap,
  LanguageMenu,
  NumberField,
  ResetButton,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
  locationFaultText,
  useCurrentPosition,
  type MapShape,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { drawLots, sectorRing, secureRandom } from '@/lib/drive-hunt';
import { gsiTilesCheckedOn } from '@/lib/gsi-tiles';
import { labsTool } from '@/lib/labs-tools';
import {
  DRIVE_NOTE_MAX,
  DRIVE_TEXT_MAX,
  MAX_NO_FIRE_SECTORS,
  MAX_STANDS,
  participantRoleSchema,
  type ParticipantRole,
} from '@/lib/schemas/drive-hunt';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useDriveHuntStore } from './_store';
import { DriveHuntSheet, roleNames } from './drive-hunt-sheet';

export function DriveHuntClient() {
  const state = useDriveHuntStore();
  const {
    edit,
    addStand,
    updateStand,
    removeStand,
    addSector,
    updateSector,
    removeSector,
    addParticipant,
    removeParticipant,
    updateParticipant,
    assign,
    reset,
  } = useDriveHuntStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<ParticipantRole>('stand');
  const [drawn, setDrawn] = useState(false);
  const { locate, locating, fault } = useCurrentPosition();
  const ids = {
    title: useId(),
    date: useId(),
    meeting: useId(),
    radio: useId(),
    notes: useId(),
    name: useId(),
    map: useId(),
  };
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useDriveHuntStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const sectorLengthValid =
    Number.isFinite(state.sectorLength) && state.sectorLength >= 50 && state.sectorLength <= 3000;

  const shapes: MapShape[] = [];
  for (const stand of state.stands) {
    if (sectorLengthValid)
      stand.noFire.forEach((sector, index) =>
        shapes.push({
          kind: 'polygon',
          id: `${stand.id}-${index}`,
          points: sectorRing(stand.position, sector, state.sectorLength),
          colour: '#b3261e',
          fill: 'rgba(179,38,30,0.2)',
          width: 1.5,
          dashed: true,
        }),
      );
  }
  for (const stand of state.stands)
    shapes.push({ kind: 'marker', id: stand.id, at: stand.position, label: stand.label || '?', colour: '#1b1b1f' });

  const standTakers = state.participants.filter((participant) => participant.role === 'stand');
  const text = (id: string, label: string, value: string, onChange: (value: string) => void, max = DRIVE_TEXT_MAX) => (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} type="text" maxLength={max} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('drive-hunt').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '配置図・待ち場・参加者をすべて消します。',
                  en: 'Clears the plan, the stands and the roster.',
                }}
                onReset={() => {
                  setPlacing(false);
                  setDrawn(false);
                  reset();
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t(
            '撃つ前に、矢先（弾の行く先）に人や人家がないことを確かめてください。',
            'Before firing, check that no people or houses are where the shot is going.',
          )}
        </p>
        <ToolLayout
          proportions="workspace"
          resultLabel={t('待ち場と抽選', 'Stands and draw')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="plan" className="text-xl font-medium">
                  {t('1. 猟の概要', '1. The hunt')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text(ids.title, t('名称（猟場・班など）', 'Name (ground, party)'), state.title, (title) =>
                    edit({ title }),
                  )}
                  <div className="min-w-0 space-y-2">
                    <label htmlFor={ids.date} className="block text-sm font-medium">
                      {t('日付', 'Date')}
                    </label>
                    <input
                      id={ids.date}
                      type="date"
                      value={state.date}
                      onChange={(event) => edit({ date: event.target.value })}
                    />
                  </div>
                  {text(ids.meeting, t('集合場所・時刻', 'Meeting place and time'), state.meeting, (meeting) =>
                    edit({ meeting }),
                  )}
                  {text(ids.radio, t('無線のチャンネル・連絡方法', 'Radio channel, contact'), state.radio, (radio) =>
                    edit({ radio }),
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor={ids.notes} className="block text-sm font-medium">
                    {t(
                      '注意事項（開始・終了の合図、勢子の進む方向など）',
                      'Notes (start and end signals, the beaters’ direction)',
                    )}
                  </label>
                  <textarea
                    id={ids.notes}
                    rows={3}
                    maxLength={DRIVE_NOTE_MAX}
                    value={state.notes}
                    onChange={(event) => edit({ notes: event.target.value })}
                    className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
                  />
                </div>
              </Card>

              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="stands" className="text-xl font-medium">
                  {t('2. 待ち場と撃ってはいけない方向', '2. Stands and no-fire directions')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={placing ? 'default' : 'outline'}
                    aria-pressed={placing}
                    disabled={state.stands.length >= MAX_STANDS}
                    onClick={() => setPlacing(!placing)}
                  >
                    <LuPlus aria-hidden="true" />
                    {t('地図で待ち場を追加', 'Add stands on the map')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={locating || state.stands.length >= MAX_STANDS}
                    onClick={() =>
                      void locate().then((position) => {
                        if (position) addStand({ latitude: position.latitude, longitude: position.longitude });
                      })
                    }
                  >
                    <LuMapPin aria-hidden="true" />
                    {locating ? t('取得中…', 'Locating…') : t('現在地を待ち場にする', 'Add my location')}
                  </Button>
                </div>
                {fault && (
                  <p role="alert" className="text-sm text-destructive">
                    {locationFaultText(fault, language)}
                  </p>
                )}
                {placing && (
                  <p className="rounded-sm bg-surface-container p-3 text-sm font-medium">
                    {t(
                      '地図をタップするごとに待ち場を置きます。終わったらもう一度ボタンを押してください。',
                      'Each tap on the map adds a stand. Press the button again when done.',
                    )}
                  </p>
                )}
                <GeoMap
                  language={language}
                  label={t('待ち場の地図', 'Map of the stands')}
                  describedBy={ids.map}
                  shapes={shapes}
                  picking={placing}
                  onPick={(point) => addStand(point)}
                  fitKey={state.stands.length === 0 ? 'none' : state.stands[0]!.id}
                />
                <p id={ids.map} className="text-xs text-on-surface-variant">
                  {t(
                    '黒い番号が待ち場、赤い扇が撃ってはいけない方向です。',
                    'Black numbers are stands, red wedges the directions not to shoot.',
                  )}
                </p>
                <NumberField
                  label={t('扇を描く長さ', 'Length of the wedges')}
                  value={state.sectorLength}
                  unit="m"
                  min={50}
                  max={3000}
                  step={50}
                  invalid={!sectorLengthValid}
                  errorText={t('50〜3,000 m です。', '50 to 3,000 m.')}
                  hint={t('表示用の長さで、安全な距離ではありません。', 'Drawing length only, not a safe distance.')}
                  onChange={(sectorLength) => edit({ sectorLength })}
                />
                <ol className="space-y-3">
                  {state.stands.map((stand, index) => (
                    <li
                      key={stand.id}
                      className="space-y-3 rounded-sm border border-outline-variant p-3"
                      aria-label={t(`待ち場 ${index + 1}`, `Stand ${index + 1}`)}
                    >
                      <div className="grid grid-cols-[6rem_1fr_auto] items-end gap-3">
                        <div className="space-y-1">
                          <label htmlFor={`${stand.id}-label`} className="block text-sm font-medium">
                            {t('番号', 'Label')}
                          </label>
                          <input
                            id={`${stand.id}-label`}
                            type="text"
                            maxLength={20}
                            value={stand.label}
                            onChange={(event) => updateStand(stand.id, { label: event.target.value })}
                          />
                        </div>
                        <SelectField
                          label={t('担当', 'Assigned')}
                          value={stand.assigneeId ?? ''}
                          onChange={(value) => updateStand(stand.id, { assigneeId: value || null })}
                          options={[
                            { value: '', label: t('未定', 'Not yet') },
                            ...state.participants.map((participant) => ({
                              value: participant.id,
                              label: participant.name || t('（名前なし）', '(no name)'),
                            })),
                          ]}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(`待ち場 ${stand.label} を削除`, `Delete stand ${stand.label}`)}
                          onClick={() => removeStand(stand.id)}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                      </div>
                      {stand.noFire.map((sector, sectorIndex) => (
                        <div key={sectorIndex} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                          <NumberField
                            label={t('撃たない方向 から', 'No fire from')}
                            value={sector.from}
                            unit="°"
                            min={0}
                            max={360}
                            step={5}
                            invalid={!(sector.from >= 0 && sector.from <= 360)}
                            errorText={t('0〜360 です。', '0 to 360.')}
                            onChange={(from) => updateSector(stand.id, sectorIndex, { ...sector, from })}
                          />
                          <NumberField
                            label={t('まで（右回り）', 'to (clockwise)')}
                            value={sector.to}
                            unit="°"
                            min={0}
                            max={360}
                            step={5}
                            invalid={!(sector.to >= 0 && sector.to <= 360)}
                            errorText={t('0〜360 です。', '0 to 360.')}
                            onChange={(to) => updateSector(stand.id, sectorIndex, { ...sector, to })}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('この方向を削除', 'Delete this direction')}
                            onClick={() => removeSector(stand.id, sectorIndex)}
                          >
                            <LuTrash2 aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stand.noFire.length >= MAX_NO_FIRE_SECTORS}
                        onClick={() => addSector(stand.id)}
                      >
                        {t('撃ってはいけない方向を追加', 'Add a no-fire direction')}
                      </Button>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '方向は真北から右回りの角度です（北 0°、東 90°）。隣の待ち場・勢子の進む方向・道路・人家の方向を入れてください。',
                    'Directions are degrees clockwise from true north (north 0°, east 90°). Add the directions of neighbouring stands, the beaters, roads and houses.',
                  )}
                </p>
              </Card>

              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="roster" className="text-xl font-medium">
                  {t('3. 参加者', '3. Roster')}
                </h2>
                <form
                  className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!newName.trim()) return;
                    if (addParticipant({ name: newName.trim(), role: newRole })) setNewName('');
                  }}
                >
                  <div className="min-w-0 space-y-2">
                    <label htmlFor={ids.name} className="block text-sm font-medium">
                      {t('氏名', 'Name')}
                    </label>
                    <input
                      id={ids.name}
                      type="text"
                      maxLength={DRIVE_TEXT_MAX}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  </div>
                  <SelectField
                    className="col-span-2 sm:col-span-1"
                    label={t('役割', 'Role')}
                    value={newRole}
                    onChange={setNewRole}
                    options={participantRoleSchema.options.map((role) => ({
                      value: role,
                      label: roleNames[role][language],
                    }))}
                  />
                  <Button type="submit" disabled={!newName.trim()}>
                    {t('追加', 'Add')}
                  </Button>
                </form>
                <ul className="divide-y divide-outline-variant">
                  {state.participants.map((participant) => (
                    <li key={participant.id} className="grid grid-cols-[1fr_10rem_auto] items-center gap-3 py-2">
                      <span className="break-words">{participant.name}</span>
                      <select
                        aria-label={t(`${participant.name} の役割`, `Role of ${participant.name}`)}
                        value={participant.role}
                        onChange={(event) =>
                          updateParticipant(participant.id, { role: event.target.value as ParticipantRole })
                        }
                      >
                        {participantRoleSchema.options.map((role) => (
                          <option key={role} value={role}>
                            {roleNames[role][language]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t(`${participant.name} を削除`, `Remove ${participant.name}`)}
                        onClick={() => removeParticipant(participant.id)}
                      >
                        <LuTrash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="draw" className="text-xl font-medium">
                {t('待ち場の抽選', 'Drawing lots for stands')}
              </h2>
              <Button
                disabled={state.stands.length === 0 || standTakers.length === 0}
                onClick={() => {
                  if (
                    state.stands.some((stand) => stand.assigneeId !== null) &&
                    !window.confirm(
                      t(
                        'いまの割り当てを抽選で置き換えます。よろしいですか？',
                        'Replace the current assignments with a draw?',
                      ),
                    )
                  )
                    return;
                  assign(drawLots(state.stands, state.participants, secureRandom));
                  setDrawn(true);
                }}
              >
                <LuDices aria-hidden="true" />
                {t('抽選する', 'Draw lots')}
              </Button>
              {drawn && (
                <p role="status" className="text-sm">
                  {t('抽選しました。', 'Lots drawn.')}
                  {standTakers.length > state.stands.length &&
                    t(
                      ` 待ち場より人が ${standTakers.length - state.stands.length} 人多く、外れた人がいます。`,
                      ` ${standTakers.length - state.stands.length} more people than stands; some were left out.`,
                    )}
                </p>
              )}
              <ul className="space-y-1 text-sm">
                {state.stands.map((stand) => (
                  <li key={stand.id} className="flex justify-between gap-3 border-b border-outline-variant py-1">
                    <span className="font-medium">{t(`待ち場 ${stand.label}`, `Stand ${stand.label}`)}</span>
                    <span>
                      {state.participants.find((participant) => participant.id === stand.assigneeId)?.name ??
                        t('未定', 'Not yet')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-on-surface-variant">
                {t('役割が「待ち場」の人を 1 人ずつ割り当てます。', 'Each person with the stand role gets one stand.')}
              </p>
              <Button variant="outline" onClick={() => window.print()}>
                <LuPrinter aria-hidden="true" />
                {t('配置図と名簿を印刷', 'Print the plan and roster')}
              </Button>
            </Card>
          }
          extras={
            <ConditionSection
              id="notes"
              title={t('配置図と出典', 'Plan and sources')}
              summary={t('地図: 地理院タイル', 'Map: GSI Tiles')}
            >
              <p className="text-sm text-on-surface-variant">
                {t(
                  '印刷する配置図は待ち場の位置を縮尺どおりに描いた略図で、地図の画像は入りません。',
                  'The printed plan is a to-scale sketch of the stands, without the map picture.',
                )}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t(
                  `地図: 地理院タイル（${gsiTilesCheckedOn} 確認）。`,
                  `Map: GSI Tiles (checked ${gsiTilesCheckedOn}).`,
                )}
              </p>
            </ConditionSection>
          }
        />
      </div>
      <DriveHuntSheet plan={state.lastValidPlan} language={language} className="hidden print:block" />
    </AppLayout>
  );
}
