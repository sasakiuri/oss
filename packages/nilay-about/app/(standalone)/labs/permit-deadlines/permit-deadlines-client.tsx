'use client';

import { useEffect, useState } from 'react';
import { LuCalendarPlus, LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DateField,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  SectionNav,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { daysBetween, isIsoDate, parseIsoDate } from '@/lib/calendar-days';
import { buildIcs, downloadIcs, type IcsEvent } from '@/lib/ics';
import { labsTool } from '@/lib/labs-tools';
import {
  DORMANT_RULE_START,
  AGE_LAW_CHECKED_ON,
  LAW_CHECKED_ON,
  LAW_URLS,
  deadlineEvents,
  isSeptember14,
  judgeDormantGun,
  permitDeadlines,
  renewalChecklist,
  type PermitPurpose,
} from '@/lib/permit-deadlines';
import { LICENSE_NAMES } from '@/lib/prefecture-names';
import { LICENSE_TYPES, type LicenseType } from '@/lib/schemas/hunting-log';
import { ALARM_OPTIONS, PERMIT_DEADLINES_MAX_ITEMS, PERMIT_DEADLINES_MAX_LABEL } from '@/lib/schemas/permit-deadlines';
import { todayInJapan } from '@/lib/snare-gauge';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { PERMIT_DEADLINES_STORAGE_KEY, usePermitDeadlinesStore } from './_store';

const PURPOSE_NAMES: Record<PermitPurpose, { ja: string; en: string }> = {
  hunting: { ja: '狩猟', en: 'Hunting' },
  pestControl: { ja: '有害鳥獣駆除', en: 'Pest control' },
  targetShooting: { ja: '標的射撃', en: 'Target shooting' },
};

export function PermitDeadlinesClient() {
  const store = usePermitDeadlinesStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(PERMIT_DEADLINES_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [today] = useState(() => todayInJapan(new Date()));
  const [notice, setNotice] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([usePermitDeadlinesStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const permit = permitDeadlines(store.birthDate, store.permitFrom);
  const orderError = isIsoDate(store.birthDate) && isIsoDate(store.permitFrom) && store.permitFrom < store.birthDate;
  const events = deadlineEvents(store, LICENSE_NAMES);
  const extras = store.extras.filter((extra) => isIsoDate(extra.date));
  const checklist = renewalChecklist(store.gun, permit?.cognitiveTest ?? false);

  const formatDate = (value: string) => {
    const parsed = parseIsoDate(value);
    if (!parsed) return value;
    const [year, month, day] = parsed;
    return language === 'ja'
      ? `${year}年${month}月${day}日`
      : new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(
          new Date(Date.UTC(year, month - 1, day)),
        );
  };
  const remaining = (value: string) => {
    const days = daysBetween(today, value);
    if (days === 0) return t('今日', 'today');
    return days > 0 ? t(`あと ${days} 日`, `in ${days} days`) : t(`${-days} 日前`, `${-days} days ago`);
  };

  const exportIcs = () => {
    const icsEvents: IcsEvent[] = [
      ...events.map((event) => ({
        uid: `${event.key}@permit-deadlines.labs.nilay.jp`,
        start: event.start,
        end: event.end,
        summary: t(event.ja, event.en),
        description: `${t(event.basisJa, event.basisEn)} / ${t('Nilay Labs で計算', 'Worked out with Nilay Labs')}`,
        alarmDaysBefore: store.alarms,
      })),
      ...extras.map((extra) => ({
        uid: `extra-${extra.id}@permit-deadlines.labs.nilay.jp`,
        start: extra.date,
        summary: extra.label.trim() || t('期限', 'Deadline'),
        alarmDaysBefore: store.alarms,
      })),
    ];
    downloadIcs(
      `permit-deadlines-${today}.ics`,
      buildIcs(icsEvents, new Date(), t('所持許可・狩猟免許の期限', 'Permit and licence deadlines')),
    );
    setNotice(t(`${icsEvents.length} 件の予定を書き出しました。`, `Exported ${icsEvents.length} events.`));
  };

  const dormant = judgeDormantGun({
    grantedOn: isIsoDate(store.dormant.grantedOn) ? store.dormant.grantedOn : null,
    heldBeforeRuleStart: store.dormant.heldBeforeRuleStart,
    uses: store.dormant.uses
      .filter((use) => use.permitted)
      .map((use) => ({ purpose: use.purpose, lastUsedOn: isIsoDate(use.lastUsedOn) ? use.lastUsedOn : null })),
    on: today,
  });

  const alarmLabel = (days: (typeof ALARM_OPTIONS)[number]) =>
    days === 0
      ? t('当日', 'On the day')
      : days === 60
        ? t('2 か月前（60 日前）', 'Two months (60 days) before')
        : days === 30
          ? t('1 か月前（30 日前）', 'A month (30 days) before')
          : t('1 週間前', 'A week before');

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('permit-deadlines').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '日付・免許・追加した期限・チェックリスト・使用実績の入力をすべて消します。',
                  en: 'Clears the dates, licences, added deadlines, checklist and purpose use.',
                }}
                onReset={store.reset}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'permit', label: t('所持許可', 'Permit') },
            { id: 'licenses', label: t('狩猟免許', 'Licences') },
            { id: 'checklist', label: t('更新の持ち物', 'Renewal') },
            { id: 'dormant', label: t('用途の使用実績', 'Use') },
          ]}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {notice}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={PERMIT_DEADLINES_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('期限の一覧', 'Deadlines')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="permit" className="text-xl font-medium">
                {t('猟銃・空気銃の所持許可', 'Firearms possession permit')}
              </h2>
              <SegmentedControl
                legend={t('許可の種類', 'Gun')}
                orientation="inline"
                value={store.gun}
                options={[
                  { value: 'huntingGun', label: t('猟銃', 'Hunting gun') },
                  { value: 'airGun', label: t('空気銃', 'Air gun') },
                ]}
                onChange={(value) => store.set('gun', value as 'huntingGun' | 'airGun')}
              />
              <DateField
                label={t('生年月日', 'Date of birth')}
                value={store.birthDate}
                onChange={(value) => store.set('birthDate', value)}
              />
              <SegmentedControl
                legend={t('許可の区分', 'Permit')}
                value={store.permitBasis}
                options={[
                  { value: 'granted', label: t('新しく受けた許可', 'A new permit') },
                  { value: 'renewed', label: t('更新された許可', 'A renewed permit') },
                ]}
                onChange={(value) => store.set('permitBasis', value as 'granted' | 'renewed')}
              />
              <DateField
                label={
                  store.permitBasis === 'granted'
                    ? t('許可を受けた日', 'Permit granted on')
                    : t('更新前の許可の満了日', 'Last day of the permit before renewal')
                }
                value={store.permitFrom}
                onChange={(value) => store.set('permitFrom', value)}
                invalid={orderError}
                errorText={t('生年月日より後の日を入力してください。', 'Enter a day after the date of birth.')}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label={t('講習修了証明書の交付日（任意）', 'Course certificate issued (optional)')}
                  value={store.courseIssuedOn}
                  onChange={(value) => store.set('courseIssuedOn', value)}
                />
                {store.gun === 'huntingGun' && (
                  <DateField
                    label={t('技能講習修了証明書の交付日（任意）', 'Skills course certificate issued (optional)')}
                    value={store.skillsIssuedOn}
                    onChange={(value) => store.set('skillsIssuedOn', value)}
                  />
                )}
              </div>
            </Card>
          }
          secondary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="licenses" className="text-xl font-medium">
                    {t('狩猟免許', 'Hunting licences')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '新しく取った免許は試験を受けた日、更新した免許は更新前の満了日（9 月 14 日）を入力します。',
                      'For a new licence enter the exam day; for a renewed one, the last day before renewal (14 September).',
                    )}
                  </p>
                </div>
                {store.licenses.map((license, index) => {
                  const wrongDay = license.basis === 'renewed' && license.date !== '' && !isSeptember14(license.date);
                  return (
                    <fieldset key={license.id} className="space-y-4 rounded-sm border border-outline-variant p-4">
                      <legend className="px-1 text-sm font-medium">
                        {t(`免許 ${index + 1}`, `Licence ${index + 1}`)}
                      </legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectField
                          label={t('種類', 'Kind')}
                          value={license.type}
                          onChange={(value) => store.updateLicense(license.id, { type: value as LicenseType })}
                          options={LICENSE_TYPES.map((type) => ({ value: type, label: LICENSE_NAMES[type][language] }))}
                        />
                        <SelectField
                          label={t('入力する日', 'Date entered')}
                          value={license.basis}
                          onChange={(value) => store.updateLicense(license.id, { basis: value as 'exam' | 'renewed' })}
                          options={[
                            { value: 'exam', label: t('試験を受けた日', 'Exam day') },
                            { value: 'renewed', label: t('更新前の満了日', 'Last day before renewal') },
                          ]}
                        />
                      </div>
                      <DateField
                        label={
                          license.basis === 'exam'
                            ? t('試験を受けた日', 'Exam day')
                            : t('更新前の満了日', 'Last day before renewal')
                        }
                        value={license.date}
                        onChange={(value) => store.updateLicense(license.id, { date: value })}
                        invalid={wrongDay}
                        errorText={t(
                          '狩猟免許の有効期間は 9 月 14 日に満了します。免状の満了日を入力してください。',
                          'A hunting licence ends on 14 September. Enter the last day on the licence.',
                        )}
                      />
                      <Button type="button" variant="outline" onClick={() => store.removeLicense(license.id)}>
                        <LuTrash2 aria-hidden="true" />
                        {t('この免許を削除', 'Remove')}
                      </Button>
                    </fieldset>
                  );
                })}
                {store.licenses.length < 4 && (
                  <Button type="button" variant="outline" onClick={store.addLicense}>
                    <LuPlus aria-hidden="true" />
                    {t('狩猟免許を追加', 'Add a hunting licence')}
                  </Button>
                )}
              </Card>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="extras" className="text-xl font-medium">
                    {t('ほかの期限（任意）', 'Other deadlines (optional)')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '診断書を取る日、ハンター保険の満期、猟友会の会員証の期限など。',
                      'Such as when to get the doctor’s certificate, insurance end or club card expiry.',
                    )}
                  </p>
                </div>
                {store.extras.map((extra, index) => (
                  <div key={extra.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
                    <div className="min-w-0 space-y-2">
                      <label htmlFor={`extra-${extra.id}`} className="block text-sm font-medium">
                        {t(`項目 ${index + 1}`, `Item ${index + 1}`)}
                      </label>
                      <input
                        id={`extra-${extra.id}`}
                        type="text"
                        value={extra.label}
                        maxLength={PERMIT_DEADLINES_MAX_LABEL}
                        placeholder={t('例：ハンター保険の満期', 'e.g. insurance ends')}
                        onChange={(event) => store.updateExtra(extra.id, { label: event.target.value })}
                      />
                    </div>
                    <DateField
                      label={t('日付', 'Date')}
                      value={extra.date}
                      onChange={(value) => store.updateExtra(extra.id, { date: value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => store.removeExtra(extra.id)}
                      aria-label={t(`項目 ${index + 1} を削除`, `Remove item ${index + 1}`)}
                    >
                      <LuTrash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {store.extras.length < PERMIT_DEADLINES_MAX_ITEMS && (
                  <Button type="button" variant="outline" onClick={store.addExtra}>
                    <LuPlus aria-hidden="true" />
                    {t('期限を追加', 'Add a deadline')}
                  </Button>
                )}
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="deadlines" className="text-xl font-medium">
                {t('期限の一覧', 'Deadlines')}
              </h2>
              {events.length === 0 && extras.length === 0 ? (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {t(
                    '生年月日と許可の日、または狩猟免許の日付を入力してください。',
                    'Enter the date of birth and the permit date, or a hunting licence date.',
                  )}
                </p>
              ) : (
                <ol className="divide-y divide-outline-variant text-sm">
                  {[
                    ...events.map((event) => ({
                      key: event.key,
                      start: event.start,
                      end: event.end,
                      name: t(event.ja, event.en),
                      basis: t(event.basisJa, event.basisEn),
                    })),
                    ...extras.map((extra) => ({
                      key: extra.id,
                      start: extra.date,
                      end: undefined,
                      name: extra.label.trim() || t('期限', 'Deadline'),
                      basis: t('入力した日', 'Entered'),
                    })),
                  ]
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((row) => (
                      <li key={row.key} className="py-3">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-lg tabular-nums">
                          {row.end ? `${formatDate(row.start)} – ${formatDate(row.end)}` : formatDate(row.start)}
                        </p>
                        <p className="text-on-surface-variant">
                          {remaining(row.end ?? row.start)} ・ {row.basis}
                        </p>
                      </li>
                    ))}
                </ol>
              )}
              {permit?.cognitiveTest && (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {t(
                    '満了日に 75 歳以上になるため、更新では認知機能検査を受けます（銃刀法 第 4 条の 3、施行規則 第 16 条：満了の 2 か月前から 1 か月前まで）。',
                    'You will be 75 or older on the last day, so the renewal includes a cognitive test (Firearms Act art. 4-3; Regulation art. 16: two to one month before).',
                  )}
                </p>
              )}
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">{t('カレンダーの通知', 'Calendar reminders')}</legend>
                <div className="flex flex-wrap gap-x-5">
                  {ALARM_OPTIONS.map((days) => (
                    <label key={days} className="flex min-h-12 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={store.alarms.includes(days)}
                        onChange={(event) => store.toggleAlarm(days, event.target.checked)}
                      />
                      {alarmLabel(days)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button className="w-full" onClick={exportIcs} disabled={events.length === 0 && extras.length === 0}>
                <LuCalendarPlus aria-hidden="true" />
                {t('カレンダー（.ics）に書き出す', 'Export to calendar (.ics)')}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '通知を取り込まないカレンダーアプリもあります。書き出し直して取り込むと、同じ予定が更新されます。',
                  'Some calendar apps drop the reminders. Importing a later export updates the same events.',
                )}
              </p>
              {notice && <p className="text-sm">{notice}</p>}
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="checklist"
                title={t('更新の申請で出す書類', 'What to bring to a renewal')}
                summary={t(
                  `${checklist.filter((item) => store.checked.includes(item.id)).length} / ${checklist.length} 件を準備済み`,
                  `${checklist.filter((item) => store.checked.includes(item.id)).length} of ${checklist.length} ready`,
                )}
              >
                <ul className="space-y-1">
                  {checklist.map((item) => (
                    <li key={item.id}>
                      <label className="flex min-h-12 cursor-pointer items-start gap-3 py-1 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={store.checked.includes(item.id)}
                          onChange={(event) => store.toggleChecked(item.id, event.target.checked)}
                        />
                        <span>
                          {t(item.ja, item.en)}
                          <span lang="ja" className="block text-xs text-on-surface-variant">
                            {item.basis}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" onClick={store.clearChecked}>
                  {t('チェックを外す', 'Clear the ticks')}
                </Button>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '銃刀法施行規則 別表第二の猟銃（射撃競技の選手等を除く）と空気銃の更新の欄と、第 9 条・第 10 条・第 11 条・第 16 条・第 34 条によります。写真や手数料、書類の部数、予約の要否は都道府県警察の案内で確かめてください。',
                    'From the renewal rows of table 2 of the Firearms Regulation (hunting guns except competition shooters, and air guns) and its articles 9, 10, 11, 16 and 34. Check photos, fees, copies and booking with the prefectural police.',
                  )}
                </p>
              </ConditionSection>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="dormant" className="text-xl font-medium">
                    {t('許可の用途に使っているか（いわゆる眠り銃）', 'Is the gun used for its permitted purposes?')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '銃刀法 第 11 条第 5 項：引き続き 2 年以上、許可の用途に供していないと公安委員会が認めるとき、許可を取り消し（全部の用途）又は用途を変更（一部の用途）できます。1 丁ごとに確かめます。',
                      'Firearms Act art. 11(5): if the commission finds a gun not put to its permitted purposes for two years or more in a row, it can revoke the permit (all purposes) or drop the unused purposes. Check each gun separately.',
                    )}
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={store.dormant.heldBeforeRuleStart}
                    onChange={(event) => store.setDormant({ heldBeforeRuleStart: event.target.checked })}
                  />
                  {t(
                    `この銃の所持許可を ${DORMANT_RULE_START} より前から受けている`,
                    `This gun has been permitted since before ${DORMANT_RULE_START}`,
                  )}
                </label>
                <DateField
                  label={t(
                    'この銃の許可を受けた日（使っていない用途があるとき）',
                    'Permit granted on (needed for a purpose never used)',
                  )}
                  value={store.dormant.grantedOn}
                  onChange={(value) => store.setDormant({ grantedOn: value })}
                />
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    {t('許可の用途と、最後に使った日', 'Permitted purposes and the last day used')}
                  </legend>
                  {store.dormant.uses.map((use) => (
                    <div key={use.purpose} className="grid items-end gap-3 sm:grid-cols-2">
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={use.permitted}
                          onChange={(event) => store.updateUse(use.purpose, { permitted: event.target.checked })}
                        />
                        {t(PURPOSE_NAMES[use.purpose].ja, PURPOSE_NAMES[use.purpose].en)}
                      </label>
                      {use.permitted && (
                        <DateField
                          label={t(
                            `${PURPOSE_NAMES[use.purpose].ja}に最後に使った日`,
                            `Last used for ${PURPOSE_NAMES[use.purpose].en.toLowerCase()}`,
                          )}
                          value={use.lastUsedOn}
                          onChange={(value) => store.updateUse(use.purpose, { lastUsedOn: value })}
                          hint={t('許可の後に使っていなければ空欄。', 'Leave empty if not used since the permit.')}
                        />
                      )}
                    </div>
                  ))}
                </fieldset>
                <div role="status" className="rounded-sm bg-surface-container p-4 text-sm">
                  {!dormant.ok ? (
                    <p>
                      {dormant.reason === 'noPurpose'
                        ? t('許可の用途を選んでください。', 'Choose the permitted purposes.')
                        : dormant.reason === 'grantedOnMissing'
                          ? t(
                              '使っていない用途があるため、許可を受けた日を入力してください。',
                              'A purpose has not been used, so enter the day of the permit.',
                            )
                          : dormant.reason === 'future'
                            ? t('今日より後の日が入っています。', 'A date is after today.')
                            : dormant.reason === 'beforePermit'
                              ? t(
                                  '許可を受けた日より前の使用日が入っています。許可の後に使っていなければ空欄にしてください。',
                                  'A last use is before the day of the permit. Leave it empty if not used since the permit.',
                                )
                              : t('日付を確認してください。', 'Check the dates.')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-medium">
                        {dormant.outcome === 'none'
                          ? t(
                              '今日の時点で、条文の期間に達した用途はありません。',
                              'As of today no purpose has reached the period in the Act.',
                            )
                          : dormant.outcome === 'all'
                            ? t(
                                'すべての用途が条文の期間に達しています。許可の取消しの対象になりえます。',
                                'Every purpose has reached the period: the permit can be revoked.',
                              )
                            : t(
                                '一部の用途が条文の期間に達しています。その用途を除く変更の対象になりえます。',
                                'Some purposes have reached the period: they can be removed from the permit.',
                              )}
                      </p>
                      <p className="text-on-surface-variant">
                        {dormant.reading === 'transitional'
                          ? t(
                              `${DORMANT_RULE_START} より前からの許可のため、改正法 附則 第 5 条により「3 年以上・全部の用途」で読みます（同日以後に 2 年続けて使っていない用途が出た時点で通常の読み方になります）。`,
                              `Held since before ${DORMANT_RULE_START}: under Supplementary art. 5 of the 2024 amendment it reads “three years, all purposes” until some purpose goes two years unused after that day.`,
                            )
                          : t(
                              '銃刀法 第 11 条第 5 項（2 年以上）で読みます。',
                              'Read under art. 11(5): two years or more.',
                            )}
                      </p>
                      <ul className="space-y-1">
                        {dormant.purposes.map((status) => {
                          const end = dormant.reading === 'transitional' ? status.threeYearsEnd : status.twoYearsEnd;
                          return (
                            <li key={status.purpose}>
                              {t(PURPOSE_NAMES[status.purpose].ja, PURPOSE_NAMES[status.purpose].en)}：
                              {status.reached
                                ? t(`${formatDate(end)} に期間に達しました`, `reached the period on ${formatDate(end)}`)
                                : t(
                                    `${formatDate(end)} に期間に達します（${remaining(end)}）`,
                                    `reaches the period on ${formatDate(end)} (${remaining(end)})`,
                                  )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '警察庁の案内：射撃場で練習する際に猟銃等を使用しただけでは「狩猟・有害鳥獣駆除」のいずれの用途に供したともいえません。技能講習で使用しただけでは「狩猟・有害鳥獣駆除・標的射撃」のいずれの用途に供したともいえません。',
                      'National Police Agency: using the gun only for practice at a range is not use for hunting or pest control, and using it only at the skills course is not use for any of hunting, pest control or target shooting.',
                    )}
                  </li>
                  <li>
                    {t(
                      '期間は最後に使った日の翌日から数えます（民法 第 143 条）。',
                      'The period is counted from the day after the last use (Civil Code art. 143).',
                    )}
                  </li>
                </ul>
              </Card>
              <ConditionSection
                id="sources"
                title={t('計算方法と出典', 'Method and sources')}
                summary={t(
                  `e-Gov 法令検索（確認日 ${LAW_CHECKED_ON}）`,
                  `e-Gov law search (checked ${LAW_CHECKED_ON})`,
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      '所持許可の満了日：許可を受けた日の後の 3 回目の誕生日が経過するまで。更新された許可は、更新前の満了後の 3 回目の誕生日まで。2 月 29 日生まれは 2 月 28 日とみなす（銃刀法 第 7 条の 2）。',
                      'Permit: until the third birthday after the day of the permit has passed; a renewed permit, the third birthday after the old one ended. 29 February counts as 28 February (Firearms Act art. 7-2).',
                    )}
                  </li>
                  <li>
                    {t(
                      `認知機能検査：満了日における年齢が 75 歳以上の人（銃刀法 第 4 条の 3、第 7 条の 3 第 3 項）。年齢は年齢計算ニ関スル法律と民法 第 143 条により誕生日の前日に加わる（2 月 29 日生まれは平年の 2 月 28 日）ものとして数えます（確認日 ${AGE_LAW_CHECKED_ON}）。`,
                      `Cognitive test: holders 75 or older on the last day (Firearms Act art. 4-3, 7-3(3)). Age is counted under the Age Calculation Act and Civil Code art. 143: it is reached on the day before the birthday (28 February in common years for those born on 29 February) (checked ${AGE_LAW_CHECKED_ON}).`,
                    )}
                  </li>
                  <li>
                    {t(
                      '更新申請期間：満了日の 2 か月前から 1 か月前まで（銃刀法施行規則 第 34 条）。同じ日がない月は月末とし、月末の扱いは警察署で確かめてください。',
                      'Renewal window: two months to one month before the last day (Firearms Regulation art. 34). A month without the same day uses its last day; check month-end cases with the police.',
                    )}
                  </li>
                  <li>
                    {t(
                      '狩猟免許：試験を受けた日から起算して 3 年を経過した日の属する年の 9 月 14 日まで。更新は満了日の翌日に行われ、有効期間は 3 年（鳥獣保護管理法 第 44 条、同法施行規則 第 60 条）。',
                      'Hunting licence: to 14 September of the year in which three years from the exam pass; renewal takes effect the next day for three years (Wildlife Act art. 44, Regulation art. 60).',
                    )}
                  </li>
                  <li>
                    {t(
                      '講習修了証明書・技能講習修了証明書：交付を受けた日から起算して 3 年を経過しないもの（銃刀法 第 5 条の 2）。「起算して」は交付日を期間の初日に数えるため（初日不算入を定める民法 第 140 条の例外）、使える最後の日は 3 年後の同じ日の前日です（民法 第 143 条第 2 項）。2025 年 11 月 20 日交付なら 2028 年 11 月 19 日です。',
                      'Course and skills course certificates count for three years from and including the day of issue (Firearms Act art. 5-2: “counted from” the day of issue, which counts that day, unlike the general rule of Civil Code art. 140). The last day is the day before the same date three years later (Civil Code art. 143(2)): 19 November 2028 for one issued on 20 November 2025.',
                    )}
                  </li>
                </ul>
                <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <a href={LAW_URLS.firearmsAct} target="_blank" rel="noreferrer">
                    {t('銃刀法（e-Gov）', 'Firearms Act (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.firearmsRegulation} target="_blank" rel="noreferrer">
                    {t('銃刀法施行規則（e-Gov）', 'Firearms Regulation (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.ageAct} target="_blank" rel="noreferrer">
                    {t('年齢計算ニ関スル法律（e-Gov）', 'Age Calculation Act (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.civilCode} target="_blank" rel="noreferrer">
                    {t('民法 第 143 条（e-Gov）', 'Civil Code art. 143 (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.wildlifeAct} target="_blank" rel="noreferrer">
                    {t('鳥獣保護管理法（e-Gov）', 'Wildlife Act (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.wildlifeRegulation} target="_blank" rel="noreferrer">
                    {t('同法施行規則（e-Gov）', 'Wildlife Regulation (e-Gov)')}
                  </a>
                  <a href={LAW_URLS.npaLeaflet} target="_blank" rel="noreferrer">
                    {t(
                      '警察庁「令和７年３月１日から所持者の制度が変わります！」',
                      'National Police Agency leaflet on the 2025 changes (Japanese)',
                    )}
                  </a>
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '許可証・免状に書かれた日付が正式です。',
                    'The dates printed on the permit and licence are what count.',
                  )}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
