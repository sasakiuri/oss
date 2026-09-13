// SPDX-License-Identifier: MIT
// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp, resetAppInitialization, type AppServices } from '@/main/composition/createContainer';
import { SqliteEstBackupCapturePlanRepository } from '@/main/modules/est-backup-capture';
import { MqttTransport } from '@/main/modules/mqtt/infra/MqttTransport';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';
import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { championshipContract, eventsContract } from '@/shared/ipc/contracts';
import {
  backupCaptureReadinessContract,
  type BackupCaptureReadinessDto,
} from '@/shared/ipc/contracts/backupCaptureReadiness.contract';
import { operatorAccessContract } from '@/shared/ipc/contracts/operatorAccess.contract';
import {
  publicationReviewPolicyContract,
  type PublicationReviewPolicyStatus,
} from '@/shared/ipc/contracts/publicationReviewPolicy.contract';

const desktop = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  brokerRunning: false,
}));

vi.mock('electron', () => ({
  app: { getPath: () => desktop.userData, getVersion: () => '0.4.0', isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      if (desktop.handlers.has(channel)) throw new Error(`Duplicate native IPC channel: ${channel}`);
      desktop.handlers.set(channel, handler);
    },
  },
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
}));
vi.mock('@/main/modules/mqtt/infra/MqttTransport', async () => {
  const { FakeMqttTransport } = await import('../../../helpers/FakeMqttTransport');
  return { MqttTransport: FakeMqttTransport };
});
vi.mock('@/main/modules/mqtt/infra/EmbeddedMqttBroker', () => ({
  EmbeddedMqttBroker: class {
    readonly port: number;
    constructor({ port }: { port: number }) {
      this.port = port;
    }
    get running() {
      return desktop.brokerRunning;
    }
    async start() {
      desktop.brokerRunning = true;
    }
    async stop() {
      desktop.brokerRunning = false;
    }
  },
}));

describe('Director application composition', () => {
  let application: AppServices | undefined;
  let registry: ServiceRegistry;
  let directory: string;
  const beforeInstall = vi.fn(async () => undefined);
  const onInstallError = vi.fn();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'saika-director-composition-'));
    desktop.userData = directory;
    desktop.handlers.clear();
    desktop.brokerRunning = false;
    resetAppInitialization();
    competitionTypeRegistry._reset();
    for (const method of ['log', 'info', 'debug', 'warn', 'error'] as const)
      vi.spyOn(console, method).mockImplementation(() => undefined);
    const load = vi.spyOn(ModuleLoader.prototype, 'load');
    application = createApp(join(directory, 'dist/preload/index.js'), { beforeInstall, onInstallError });
    registry = load.mock.calls[0]![1];
  });

  afterEach(async () => {
    await application?.lifecycle.stopAll();
    application = undefined;
    vi.restoreAllMocks();
    competitionTypeRegistry._reset();
    resetAppInitialization();
    await rm(directory, { recursive: true, force: true });
  });

  async function invoke<T>(channel: string, payload?: unknown, senderId = 1): Promise<T> {
    const handler = desktop.handlers.get(channel);
    expect(handler, `Missing IPC registration: ${channel}`).toBeTypeOf('function');
    return handler!({ sender: { id: senderId } }, payload) as Promise<T>;
  }

  async function createEvent(eventType = 'BP60') {
    const championship = await invoke<{ success: boolean; data: string }>(championshipContract.channels.create, {
      name: 'Composition championship',
      date: '2026-09-13',
      venue: 'Test range',
    });
    expect(championship.success).toBe(true);
    const event = await invoke<{ success: boolean; data: string }>(championshipContract.channels.createEvent, {
      championshipId: championship.data,
      name: 'Qualification',
      eventType,
    });
    expect(event.success).toBe(true);
    return { championshipId: championship.data, eventId: event.data };
  }

  it('connects championship commands and result readers to the same migrated database', async () => {
    const { championshipId, eventId } = await createEvent();
    expect(application!.databaseManager.getDatabase()).toBe(registry.database);
    expect(await invoke(championshipContract.channels.getDetail, { id: championshipId })).toMatchObject({
      success: true,
      data: { id: championshipId, events: [{ id: eventId, eventType: 'BP60' }] },
    });
    await expect(registry.qualificationResultsReader.getByEvent(eventId)).resolves.toEqual([]);
    expect(() => createApp('/another/preload.js', { beforeInstall, onInstallError })).toThrow('Double initialization');
    expect(application!.updater.getState()).toMatchObject({ status: 'unsupported', currentVersion: '0.4.0' });
  });

  it('enforces saved backup capture readiness through the shared competition start checks', async () => {
    const { eventId } = await createEvent();
    const competitionId = randomUUID();
    const initial = await invoke<{ success: true; data: BackupCaptureReadinessDto }>(
      backupCaptureReadinessContract.channels.get,
      { competitionId },
    );
    expect(initial.data.health.state).toBe('DISABLED');
    const settings = {
      competitionId,
      eventId,
      mode: 'REQUIRED',
      maximumAgeMilliseconds: 15_000,
      expectedRevision: initial.data.revision,
    };
    expect(await invoke(backupCaptureReadinessContract.channels.save, settings)).toMatchObject({
      success: true,
      data: { health: { state: 'STOPPED' } },
    });
    const scope = { competitionId, phase: 'MATCH' as const, laneIds: [] };
    expect(registry.competitionStartReadiness.getStartIssues(scope)).toContainEqual(
      expect.objectContaining({ code: 'BACKUP_CAPTURE_HEALTH', blocking: true }),
    );
    expect(() => registry.competitionStartReadiness.assertAllowed(scope)).toThrow('Cannot start MATCH');
    expect(await invoke(backupCaptureReadinessContract.channels.save, settings)).toMatchObject({
      success: false,
      error: { message: expect.stringContaining('reload') },
    });
    const target = registry.operationalSettingTargets.find(({ id }) => id === 'backup-capture')!;
    expect((await target.read(competitionId)).mode).toBe('REQUIRED');
    await target.write(competitionId, 'DISABLED');
    expect(() => registry.competitionStartReadiness.assertAllowed(scope)).not.toThrow();
    const plans = new SqliteEstBackupCapturePlanRepository(registry.database);
    plans.save({
      eventId,
      sourceLabel: 'Independent CSV',
      feed: { adapter: 'file', options: { path: '/unused.csv' } },
      parser: null,
      intervalMilliseconds: 1000,
      snapshotMode: 'COMPLETE_FILES',
      resumeOnStartup: false,
      enabled: false,
    });
    expect(await invoke(backupCaptureReadinessContract.channels.sources)).toEqual({
      success: true,
      data: [{ eventId, label: 'Qualification · Independent CSV' }],
    });
    await expect(registry.estBackupCaptureService.start(randomUUID(), 1000)).rejects.toThrow('existing event');
  });

  it('uses current operator identity for publication signatures and denies unauthenticated writes', async () => {
    const { eventId } = await createEvent();
    expect(
      await invoke(operatorAccessContract.channels.saveAccount, {
        id: null,
        name: 'Test Jury',
        password: 'a-long-test-password',
        permissions: ['ADMIN'],
        officialRoles: ['RTS_JURY'],
        disabled: false,
      }),
    ).toMatchObject({ success: true, data: { actor: { name: 'Test Jury' } } });
    expect(await invoke(operatorAccessContract.channels.setEnabled, { enabled: true })).toMatchObject({
      success: true,
      data: { enabled: true },
    });
    const status = await invoke<{ success: true; data: PublicationReviewPolicyStatus }>(
      publicationReviewPolicyContract.channels.get,
      { eventId, resultScope: 'QUALIFICATION' },
    );
    const request = {
      eventId,
      resultScope: 'QUALIFICATION',
      mode: 'PINNED',
      settings: status.data.effectiveSettings,
      expectedRevision: status.data.revision,
      officialName: 'Untrusted request name',
      reason: 'Approve the event review policy',
    };
    expect(await invoke(publicationReviewPolicyContract.channels.save, request, 2)).toMatchObject({
      success: false,
      error: { message: expect.stringContaining('Sign in') },
    });
    expect(await invoke(publicationReviewPolicyContract.channels.save, request)).toMatchObject({
      success: true,
      data: { history: [{ signingEvidence: { method: 'AUTHENTICATED', recordedBy: 'Test Jury' } }] },
    });
    expect(
      await invoke(publicationReviewPolicyContract.channels.get, { eventId, resultScope: 'QUALIFICATION' }, 2),
    ).toMatchObject({ success: true, data: { mode: 'PINNED' } });
  });

  it('applies operational publication settings to live policy defaults', async () => {
    const { eventId } = await createEvent();
    const mappings = [
      ['publication-observations', 'requireObservationReviews'],
      ['publication-equipment', 'requireEquipmentChecksComplete'],
      ['publication-protests', 'requireProtestCasesComplete'],
      ['publication-incidents', 'requireIncidentReports'],
      ['publication-recoveries', 'requireFinalRecoveriesComplete'],
    ] as const;
    for (const [id, key] of mappings) {
      const target = registry.operationalSettingTargets.find((entry) => entry.id === id)!;
      await target.write(eventId, 'REQUIRED');
      expect((await target.read(eventId)).mode).toBe('REQUIRED');
      expect(application!.appConfigService.get(`resultPublication.${key}`)).toBe(true);
      const status = await invoke<{ success: true; data: PublicationReviewPolicyStatus }>(
        publicationReviewPolicyContract.channels.get,
        { eventId, resultScope: 'QUALIFICATION' },
      );
      expect(status.data.effectiveSettings[key]).toBe(true);
      await target.write(eventId, 'DISABLED');
      expect((await target.read(eventId)).mode).toBe('DISABLED');
    }
    const authentication = registry.operationalSettingTargets.find(({ id }) => id === 'operator-access')!;
    expect((await authentication.read(eventId)).mode).toBe('DISABLED');
    expect(() => authentication.write(eventId, 'REQUIRED')).toThrow('administrator');
  });

  it('starts module transports and stops them before closing the database and event forwarding', async () => {
    const send = vi.fn();
    application!.windowManager.registerMainWindow({
      on: vi.fn(),
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow);
    const disconnect = vi.spyOn(MqttTransport.prototype, 'disconnect');
    await application!.lifecycle.startAll();
    expect(desktop.brokerRunning).toBe(true);
    registry.eventBus.emit({ type: 'TimerTick', remainingTime: 42, phase: 'MATCH', timestamp: 1 });
    expect(send).toHaveBeenCalledWith(eventsContract.channels.timerTick, { remainingTime: 42, phase: 'MATCH' });
    disconnect.mockClear();
    const stopCapture = vi.spyOn(registry.estBackupCaptureService, 'dispose');
    const closeDatabase = vi.spyOn(application!.databaseManager, 'close');
    await application!.lifecycle.stopAll();
    expect(disconnect).toHaveBeenCalled();
    expect(stopCapture).toHaveBeenCalled();
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(closeDatabase.mock.invocationCallOrder[0]!);
    expect(stopCapture.mock.invocationCallOrder[0]).toBeLessThan(closeDatabase.mock.invocationCallOrder[0]!);
    expect(desktop.brokerRunning).toBe(false);
    expect(registry.database.open).toBe(false);
    send.mockClear();
    registry.eventBus.emit({ type: 'TimerTick', remainingTime: 41, phase: 'MATCH', timestamp: 2 });
    expect(send).not.toHaveBeenCalled();
    application = undefined;
  });
});
