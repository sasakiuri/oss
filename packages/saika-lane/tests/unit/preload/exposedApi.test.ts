// SPDX-License-Identifier: MIT
/**
 * Pins the API the preload script exposes to the renderer: every namespace, every method name, the IPC channel
 * each method invokes with the payload it forwards, and the channel each event subscription listens on. The
 * exposed object is the renderer's only way into the main process, so any change here must be deliberate.
 */
import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener },
}));

import '@/preload/preload';
import { eventsContract } from '@/shared/ipc/contracts';

const PROBE = { probe: true };

/** `namespace.method` → the arguments of the one `ipcRenderer.invoke` call it makes when called with PROBE. */
const expectedInvocations: Record<string, unknown[]> = {
  'startup.getStartupState': ['query:getStartupState'],
  'startup.setAsideSavedRun': ['command:setAsideSavedRun'],
  'startup.retryStartup': ['command:retryStartup'],
  'commands.recordShot': ['command:recordShot', PROBE],
  'commands.switchMode': ['command:switchMode', PROBE],
  'usb.connect': ['usb:connect', PROBE],
  'usb.disconnect': ['usb:disconnect', PROBE],
  'usb.listPorts': ['usb:listPorts'],
  'usb.getDevicesByManufacturer': ['usb:getDevicesByManufacturer', PROBE],
  'queries.getSessionScore': ['query:getSessionScore', PROBE],
  'queries.getShotHistory': ['query:getShotHistory', PROBE],
  'competition.startCompetition': ['command:startCompetition', PROBE],
  'competition.startStage': ['command:startStage', PROBE],
  'competition.startNextSeries': ['command:startNextSeries', PROBE],
  'competition.endStage': ['command:endStage', PROBE],
  'competition.advanceStage': ['command:advanceStage', PROBE],
  'competition.finishCompetition': ['command:finishCompetition', PROBE],
  'competition.setAthleteTargetMode': ['command:setAthleteTargetMode', PROBE],
  'competition.getCompetitionState': ['query:getCompetitionState', PROBE],
  'competition.getCompetitionTypes': ['query:getCompetitionTypes'],
  'settings.saveConnectionSettings': ['settings:save-connection-settings', PROBE],
  'settings.getConnectionSettings': ['settings:get-connection-settings'],
  'settings.saveUserPreferences': ['settings:save-user-preferences', PROBE],
  'settings.getUserPreferences': ['settings:get-user-preferences'],
  'settings.saveAppSettings': ['settings:save-app-settings', PROBE],
  'settings.getAppSettings': ['settings:get-app-settings'],
  'settings.getSettingsFileInfo': ['settings:get-settings-file-info'],
  'settings.savePrintSettings': ['settings:savePrintSettings', PROBE],
  'report.getScoreSheet': ['query:getScoreSheet', PROBE],
  'report.openPrintWindow': ['command:openPrintWindow', PROBE],
  'report.listPrinters': ['report:listPrinters'],
  'report.printReady': ['report:printReady', PROBE],
  'window.toggleFullscreen': ['command:toggleFullscreen'],
  'window.minimize': ['command:minimize'],
  'window.maximize': ['command:maximize'],
  'window.close': ['command:close'],
  'window.getWindowState': ['query:getWindowState'],
  'mqtt.connectMqtt': ['mqtt:connect', PROBE],
  'mqtt.disconnectMqtt': ['mqtt:disconnect'],
  'mqtt.getMqttStatus': ['mqtt:getStatus'],
  'mqtt.getDirectorMembership': ['mqtt:getDirectorMembership'],
  'mqtt.getSafetyState': ['mqtt:getSafetyState'],
  'mqtt.getRangeOfficerRequest': ['mqtt:getRangeOfficerRequest'],
  'mqtt.requestRangeOfficer': ['mqtt:requestRangeOfficer', PROBE],
  'mqtt.clearRangeOfficerRequest': ['mqtt:clearRangeOfficerRequest', PROBE],
  'mqtt.getQualificationMalfunctionSignal': ['mqtt:getQualificationMalfunctionSignal'],
  'mqtt.declareQualificationMalfunction': ['mqtt:declareQualificationMalfunction', PROBE],
  'mqtt.clearQualificationMalfunctionSignal': ['mqtt:clearQualificationMalfunctionSignal', PROBE],
  'mqtt.getEstComplaintSignal': ['mqtt:getEstComplaintSignal'],
  'mqtt.getEstComplaintContext': ['mqtt:getEstComplaintContext'],
  'mqtt.declareEstComplaint': ['mqtt:declareEstComplaint', PROBE],
  'mqtt.clearEstComplaintSignal': ['mqtt:clearEstComplaintSignal', PROBE],
  'mqtt.saveMqttSettings': ['mqtt:saveSettings', PROBE],
  'mqtt.getMqttSettings': ['mqtt:getSettings'],
  'timedTarget.analyzeMeasurements': ['timedTarget:analyzeMeasurements', PROBE],
  'timedTarget.getTimingProfiles': ['timedTarget:getTimingProfiles'],
  'timedTarget.recordTimingInstallation': ['timedTarget:recordTimingInstallation', PROBE],
  'timedTarget.saveTimingProfile': ['timedTarget:saveTimingProfile', PROBE],
  'timedTarget.applyTimingProfile': ['timedTarget:applyTimingProfile', PROBE],
  'timedTarget.getState': ['timedTarget:getState'],
  'timedTarget.getTimingSettings': ['timedTarget:getTimingSettings'],
  'timedTarget.setTimingSettings': ['timedTarget:setTimingSettings', PROBE],
  'timedTarget.cancel': ['timedTarget:cancel', PROBE],
  'vista.getStatus': ['vista:getStatus'],
  'vista.resetPairing': ['vista:resetPairing', PROBE],
  'vista.setEnabled': ['vista:setEnabled', PROBE],
  'updates.getUpdateState': ['updater:get-update-state'],
  'updates.checkForUpdates': ['updater:check-for-updates'],
  'updates.quitAndInstall': ['updater:quit-and-install'],
};

/** Event subscription name → the channel it listens on. */
const expectedEventChannels: Record<string, string> = {
  shotReceived: 'event:shotReceived',
  shotRecorded: 'event:shotRecorded',
  positionExtraNullified: 'event:positionExtraNullified',
  connectionStatusChanged: 'event:connectionStatusChanged',
  sessionStarted: 'event:sessionStarted',
  modeSwitched: 'event:modeSwitched',
  sessionReset: 'event:sessionReset',
  error: 'error',
  logMessage: 'log:message',
  competitionStarted: 'event:competitionStarted',
  phaseChanged: 'event:phaseChanged',
  competitionProgressChanged: 'event:competitionProgressChanged',
  timerTick: 'event:timerTick',
  timerExpired: 'event:timerExpired',
  competitionInterruptionChanged: 'event:competitionInterruptionChanged',
  safetyStopChanged: 'event:safetyStopChanged',
  competitionCueChanged: 'event:competitionCueChanged',
  timedTargetSequenceChanged: 'event:timedTargetSequenceChanged',
  seriesCompleted: 'event:seriesCompleted',
  competitionFinished: 'event:competitionFinished',
  mqttStatusChanged: 'event:mqttStatusChanged',
  directorMembershipChanged: 'event:directorMembershipChanged',
  fullscreenChanged: 'event:fullscreenChanged',
  updateStateChanged: 'event:updateStateChanged',
};

const api = electron.exposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown>;

function namespaceMethods(namespace: string): Record<string, (...args: unknown[]) => unknown> {
  return api[namespace] as Record<string, (...args: unknown[]) => unknown>;
}

describe('exposed preload API', () => {
  it('exposes one electronAPI object with these top-level members', () => {
    expect(electron.exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('electronAPI', api);
    expect(Object.fromEntries(Object.entries(api).map(([key, value]) => [key, typeof value]))).toEqual({
      appVersion: 'string',
      commands: 'object',
      competition: 'object',
      hasNativeWindowFrame: 'boolean',
      mqtt: 'object',
      on: 'object',
      queries: 'object',
      report: 'object',
      settings: 'object',
      startup: 'object',
      timedTarget: 'object',
      updates: 'object',
      usb: 'object',
      vista: 'object',
      window: 'object',
    });
  });

  it('exposes exactly these procedure methods', () => {
    const exposed = Object.entries(api)
      .filter(([namespace, value]) => namespace !== 'on' && typeof value === 'object')
      .flatMap(([namespace]) =>
        Object.entries(namespaceMethods(namespace)).map(([name, method]) => {
          expect(method, `${namespace}.${name}`).toBeTypeOf('function');
          return `${namespace}.${name}`;
        }),
      );

    expect(exposed.sort()).toEqual(Object.keys(expectedInvocations).sort());
  });

  it.each(Object.entries(expectedInvocations))('%s invokes its channel once', (path, expectedArgs) => {
    const [namespace, name] = path.split('.') as [string, string];
    electron.invoke.mockClear();

    void namespaceMethods(namespace)[name]!(PROBE);

    expect(electron.invoke).toHaveBeenCalledOnce();
    expect(electron.invoke.mock.calls[0]).toEqual(expectedArgs);
  });

  it('exposes exactly these event subscriptions', () => {
    expect(Object.keys(namespaceMethods('on')).sort()).toEqual(Object.keys(expectedEventChannels).sort());
  });

  it.each(Object.entries(expectedEventChannels))('on.%s listens on %s', (name, channel) => {
    electron.on.mockClear();
    electron.removeListener.mockClear();
    const listener = vi.fn();

    // The bridge drops payloads outside the event schema (see createEventBridge.test.ts); let the probe through.
    const schema = eventsContract.events[name as keyof typeof eventsContract.events].schema;
    const accepted = vi.spyOn(schema, 'safeParse').mockReturnValue({ success: true, data: PROBE } as never);

    const unsubscribe = namespaceMethods('on')[name]!(listener) as () => void;

    expect(electron.on).toHaveBeenCalledExactlyOnceWith(channel, expect.any(Function));
    const handler = electron.on.mock.calls[0]![1] as (event: unknown, data: unknown) => void;
    handler({}, PROBE);
    accepted.mockRestore();
    expect(listener).toHaveBeenCalledExactlyOnceWith(PROBE);
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(channel, handler);
  });
});
