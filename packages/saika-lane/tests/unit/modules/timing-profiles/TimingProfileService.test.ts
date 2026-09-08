// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { TimingProfileService, StoredTimingProfiles } from '@/main/modules/timing-profiles';
import type { ConnectionSettingsDto } from '@/shared/ipc/contracts';
import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/shared/mqtt/TimedTargetTimingSettings';

import { createMockStorage } from '../../../helpers/mockDependencies';

const id = '11111111-1111-4111-8111-111111111111';
const measured = { mode: 'BOUNDED' as const, maximumReceiptDelayMilliseconds: 180, clockUncertaintyMilliseconds: 8 };
const now = () => new Date('2026-09-09T00:00:00Z');
function setup() {
  const storage = createMockStorage();
  let connection: ConnectionSettingsDto | null = {
    portName: 'COM3',
    manufacturer: 'KOHTO',
    deviceId: 'target',
    serialNumber: 'serial-1',
  };
  let active = false;
  const env = { connection: () => connection, hasActiveCompetition: async () => active };
  const service = new TimingProfileService(new StoredTimingProfiles(storage), env, now);
  const request = () => ({
    id,
    expectedRevision: service.status().revision,
    name: 'Bay 1 measured connection',
    installationReference: 'Target serial-1, cable A, clock sync checked',
    measurementReference: 'Measurement log M-001, upper bounds incl. uncertainty',
    measuredBy: 'Range technician',
    measuredAt: '2026-09-08T08:00:00Z',
    settings: measured,
  });
  const apply = () =>
    service.apply({
      profileId: id,
      expectedRevision: service.status().revision,
      installationConfirmed: true,
      officialName: 'Range officer',
    });
  return {
    storage,
    env,
    service,
    request,
    apply,
    setConnection(value: ConnectionSettingsDto | null) {
      connection = value;
    },
    setActive(value: boolean) {
      active = value;
    },
  };
}
describe('measured timing profiles', () => {
  it('invalidates old measurements after a setup revision, survives restart and allows explicit manual operation', async () => {
    const f = setup();
    await f.service.save(f.request());
    await f.apply();
    const changed = await f.service.recordInstallation({
      expectedRevision: f.service.status().revision,
      description: 'Controller firmware 2; cable B; PTP clock',
      officialName: 'Technician',
    });
    expect(changed.state).toBe('REVIEW_REQUIRED');
    expect(changed.settings).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    await expect(f.apply()).rejects.toThrow('installation record changed');
    const restored = new TimingProfileService(new StoredTimingProfiles(f.storage), f.env, now);
    expect(restored.status().installation?.description).toContain('firmware 2');
    expect(restored.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    const newId = '22222222-2222-4222-8222-222222222222';
    await restored.save({ ...f.request(), id: newId });
    expect(restored.status().profiles[1]).toMatchObject({
      installationRevision: changed.installation?.revision,
      installationDescription: changed.installation?.description,
    });
    await restored.apply({
      profileId: newId,
      expectedRevision: restored.status().revision,
      installationConfirmed: true,
      officialName: 'Officer',
    });
    expect(restored.effectiveSettings()).toEqual(measured);
    await restored.setManualSettings({ ...measured, mode: 'TIMESTAMP' });
    expect(restored.status().state).toBe('MANUAL');
  });

  it('expires active bounds at the configured instant without changing stored evidence or firing windows', async () => {
    const f = setup();
    await expect(f.service.save({ ...f.request(), validUntil: f.request().measuredAt })).rejects.toThrow('expiry');
    await f.service.save({ ...f.request(), validUntil: '2026-09-09T01:00:00Z' });
    await f.apply();
    const before = f.storage.getAll();
    const expired = new TimingProfileService(
      new StoredTimingProfiles(f.storage),
      f.env,
      () => new Date('2026-09-09T01:00:00Z'),
    );
    expect(expired.status().issue).toContain('expired');
    expect(expired.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    await expect(
      expired.apply({
        profileId: id,
        expectedRevision: expired.status().revision,
        installationConfirmed: true,
        officialName: 'Officer',
      }),
    ).rejects.toThrow('expired');
    expect(f.storage.getAll()).toEqual(before);
  });

  it('rejects stale or active-competition installation changes before modifying the profile store', async () => {
    const f = setup();
    const request = {
      expectedRevision: f.service.status().revision,
      description: 'New wiring',
      officialName: 'Officer',
    };
    await f.service.save(f.request());
    const before = f.storage.getAll();
    await expect(f.service.recordInstallation(request)).rejects.toThrow('changed');
    f.setActive(true);
    await expect(
      f.service.recordInstallation({ ...request, expectedRevision: f.service.status().revision }),
    ).rejects.toThrow('Finish');
    expect(f.storage.getAll()).toEqual(before);
  });
  it('retains measurement input and recomputes candidate bounds before saving without applying them', async () => {
    const f = setup();
    const measurements = {
      sourceName: 'capture.json',
      receiptMarginMilliseconds: 10,
      clockMarginMilliseconds: 0,
      content: JSON.stringify([
        { kind: 'RECEIPT_DELAY', valueMilliseconds: 170, uncertaintyMilliseconds: 0 },
        { kind: 'CLOCK_OFFSET', valueMilliseconds: -7, uncertaintyMilliseconds: 1 },
      ]),
    };
    const analysis = f.service.analyzeMeasurements(measurements);
    expect(analysis.settings).toEqual(measured);
    await expect(
      f.service.save({ ...f.request(), measurements, settings: { ...measured, clockUncertaintyMilliseconds: 0 } }),
    ).rejects.toThrow('differ');
    expect(f.service.status().profiles).toHaveLength(0);
    await f.service.save({ ...f.request(), measurements });
    expect(f.service.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    const restored = new TimingProfileService(new StoredTimingProfiles(f.storage), f.env, now);
    expect(restored.status().profiles[0]!.measurementEvidence).toEqual({ request: measurements, analysis });
    await f.apply();
    expect(restored.effectiveSettings()).toEqual(measured);
  });
  it('keeps saved measurements independent of active bounds and retains evidence and application history after restart', async () => {
    const f = setup();
    await f.service.save(f.request());
    expect(f.service.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    expect(f.service.status().profiles[0]).toMatchObject({ id, measuredBy: 'Range technician', settings: measured });
    await f.apply();
    const restored = new TimingProfileService(new StoredTimingProfiles(f.storage), f.env, now);
    expect(restored.effectiveSettings()).toEqual(measured);
    expect(restored.status()).toMatchObject({
      state: 'ACTIVE',
      applications: [{ profileId: id, officialName: 'Range officer' }],
    });
    const write = vi.mocked(f.storage.setMany).mock.calls.at(-1)![0];
    expect(write).toHaveProperty('timedTarget.timingSettings', measured);
    expect(write).toHaveProperty('timedTarget.timingProfiles');
  });

  it('stops using measured bounds when the connection or external settings change, while manual operation remains available', async () => {
    const f = setup();
    await f.service.save(f.request());
    await f.apply();
    f.setConnection({ portName: 'COM4', manufacturer: 'KOHTO', serialNumber: 'serial-2' });
    expect(f.service.status().state).toBe('REVIEW_REQUIRED');
    expect(f.service.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    await expect(f.apply()).rejects.toThrow('different target connection');
    await f.service.setManualSettings({ ...measured, mode: 'TIMESTAMP' });
    expect(f.service.status().state).toBe('MANUAL');
    expect(f.service.effectiveSettings().mode).toBe('TIMESTAMP');
    expect(f.service.status().applications).toHaveLength(1);
    const other = setup();
    await other.service.save(other.request());
    await other.apply();
    other.storage.set('timedTarget.timingSettings', { ...measured, clockUncertaintyMilliseconds: 0 });
    expect(other.service.status().issue).toContain('no longer match');
    expect(other.service.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
  });

  it('rejects activation during competition and stale configuration previews without changing either stored value', async () => {
    const f = setup();
    await f.service.save(f.request());
    const expectedRevision = f.service.status().revision;
    await f.service.setManualSettings({ ...measured, maximumReceiptDelayMilliseconds: 99 });
    const before = f.storage.getAll();
    await expect(
      f.service.apply({ profileId: id, expectedRevision, installationConfirmed: true, officialName: 'Officer' }),
    ).rejects.toThrow('changed');
    f.setActive(true);
    await expect(f.apply()).rejects.toThrow('Finish the active competition');
    await expect(f.service.setManualSettings(measured)).rejects.toThrow('Finish the active competition');
    await expect(f.service.save({ ...f.request(), id: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow(
      'Finish the active competition',
    );
    expect(f.storage.getAll()).toEqual(before);
  });

  it('preserves unknown bounds, requires measurement evidence and connection identity, and refuses future measurements or overwriting a profile', async () => {
    const f = setup();
    await expect(f.service.save({ ...f.request(), measurementReference: '' })).rejects.toThrow();
    await expect(f.service.save({ ...f.request(), measuredAt: '2026-09-10T00:00:00Z' })).rejects.toThrow('future');
    await f.service.save({ ...f.request(), settings: { ...measured, maximumReceiptDelayMilliseconds: null } });
    await expect(f.service.save(f.request())).rejects.toThrow('immutable');
    await f.apply();
    expect(f.service.effectiveSettings().maximumReceiptDelayMilliseconds).toBeNull();
    f.setConnection(null);
    await expect(f.service.save({ ...f.request(), id: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow(
      'Save the target connection',
    );
  });

  it('keeps corrupt profile evidence visible as an error while timing assessment falls back to unknown bounds', () => {
    const f = setup();
    f.storage.set('timedTarget.timingProfiles', { profiles: 'invalid' });
    expect(() => f.service.status()).toThrow();
    expect(f.service.effectiveSettings()).toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
  });
  it('only reports complete, reproducible and current measurement evidence as verified', async () => {
    const f = setup();
    const changed = vi.fn();
    f.service.subscribe(changed);
    await f.service.recordInstallation({
      expectedRevision: f.service.status().revision,
      description: 'Firmware 2, cable A, synchronized clock',
      officialName: 'Technician',
    });
    const measurements = {
      sourceName: 'capture.json',
      receiptMarginMilliseconds: 10,
      clockMarginMilliseconds: 0,
      content: JSON.stringify([
        { kind: 'RECEIPT_DELAY', valueMilliseconds: 170, uncertaintyMilliseconds: 0 },
        { kind: 'CLOCK_OFFSET', valueMilliseconds: -7, uncertaintyMilliseconds: 1 },
      ]),
    };
    await f.service.save({ ...f.request(), measurements, validUntil: '2026-09-10T00:00:00Z' });
    expect(f.service.evidenceReport().state).toBe('INCOMPLETE');
    await f.apply();
    expect(f.service.evidenceReport()).toMatchObject({ state: 'VERIFIED', profileId: id, settings: measured });
    expect(changed).toHaveBeenCalledTimes(3);
    const restored = new TimingProfileService(new StoredTimingProfiles(f.storage), f.env, now);
    expect(restored.evidenceReport().state).toBe('VERIFIED');
    const store = new StoredTimingProfiles(f.storage);
    const state = store.load();
    state.profiles[0]!.measurementEvidence!.request.content = '[]';
    store.write(state);
    expect(restored.evidenceReport().state).toBe('INVALID');
    await f.service.setManualSettings(measured);
    expect(f.service.evidenceReport().state).toBe('INCOMPLETE');
    expect(f.service.effectiveSettings()).toEqual(measured);
  });

  it('never treats a manually entered profile as retained measurement evidence', async () => {
    const f = setup();
    await f.service.save(f.request());
    await f.apply();
    expect(f.service.evidenceReport()).toMatchObject({ state: 'INCOMPLETE', measurementSha256: null });
    expect(f.service.evidenceReport().issues).toContain('Retain the timing measurement samples');
    expect(f.service.evidenceReport().issues).toContain('A future measurement expiry is required');
  });
});
