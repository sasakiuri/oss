// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetAudioPlaybackForTest } from '@/renderer/presentation/hooks/useAudioPlayback';
import { useEventSubscriptions } from '@/renderer/presentation/hooks/useEventSubscriptions';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useFinalCueStore } from '@/renderer/presentation/stores/finalCueStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';
import { stubShotAudio } from '../../../../helpers/shotAudio';

// Mock shot sound asset
vi.mock('@/assets/sounds/shot.wav', () => ({
  default: 'mock-shot-sound.wav',
}));

describe('useEventSubscriptions', () => {
  let api: MockedElectronAPI;
  let audio: ReturnType<typeof stubShotAudio>;

  beforeEach(() => {
    _resetAudioPlaybackForTest();
    useSessionStore.getState().resetSession();
    useConnectionStore.getState().disconnect();
    useFinalCueStore.getState().setCue('00000000-0000-4000-8000-000000000000', null);
    api = installMockElectronAPI();
    audio = stubShotAudio();
  });

  afterEach(() => {
    _resetAudioPlaybackForTest();
    vi.unstubAllGlobals();
  });

  describe('event subscription registration', () => {
    it('registers all event listeners on mount', () => {
      renderHook(() => useEventSubscriptions());

      expect(api.on.sessionStarted).toHaveBeenCalledTimes(1);
      expect(api.on.modeSwitched).toHaveBeenCalledTimes(1);
      expect(api.on.sessionReset).toHaveBeenCalledTimes(1);
      expect(api.on.connectionStatusChanged).toHaveBeenCalledTimes(1);
      expect(api.on.shotRecorded).toHaveBeenCalledTimes(2);
      expect(api.on.competitionCueChanged).toHaveBeenCalledTimes(1);
      expect(api.on.updateStateChanged).toHaveBeenCalledTimes(1);
    });

    it('unregisters all event listeners on unmount', () => {
      const unsubSessionStarted = vi.fn();
      const unsubModeSwitched = vi.fn();
      const unsubSessionReset = vi.fn();
      const unsubConnectionStatusChanged = vi.fn();
      const unsubShotRecorded = vi.fn();
      const unsubCompetitionCueChanged = vi.fn();
      const unsubUpdateStateChanged = vi.fn();

      api.on.sessionStarted.mockReturnValue(unsubSessionStarted);
      api.on.modeSwitched.mockReturnValue(unsubModeSwitched);
      api.on.sessionReset.mockReturnValue(unsubSessionReset);
      api.on.connectionStatusChanged.mockReturnValue(unsubConnectionStatusChanged);
      api.on.shotRecorded.mockReturnValue(unsubShotRecorded);
      api.on.competitionCueChanged.mockReturnValue(unsubCompetitionCueChanged);
      api.on.updateStateChanged.mockReturnValue(unsubUpdateStateChanged);

      const { unmount } = renderHook(() => useEventSubscriptions());

      unmount();

      expect(unsubSessionStarted).toHaveBeenCalledTimes(1);
      expect(unsubModeSwitched).toHaveBeenCalledTimes(1);
      expect(unsubSessionReset).toHaveBeenCalledTimes(1);
      expect(unsubConnectionStatusChanged).toHaveBeenCalledTimes(1);
      expect(unsubShotRecorded).toHaveBeenCalledTimes(2);
      expect(unsubCompetitionCueChanged).toHaveBeenCalledTimes(1);
      expect(unsubUpdateStateChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('competitionCueChanged event', () => {
    it('stores the active Final command cue', () => {
      renderHook(() => useEventSubscriptions());

      const competitionId = '11111111-1111-4111-8111-111111111111';
      const cue = {
        schemaVersion: 1 as const,
        competitionId,
        runId: '22222222-2222-4222-8222-222222222222',
        cueId: '33333333-3333-4333-8333-333333333333',
        confirmationEntryId: '44444444-4444-4444-8444-444444444444',
        branch: 'MAIN' as const,
        iteration: 0,
        stepId: 'final-single-1',
        actor: 'CRO' as const,
        kind: 'COMMAND' as const,
        text: 'START',
        ruleReference: 'ISSF 6.17',
        effect: { type: 'OPEN_FIRING' as const, purpose: 'MATCH' as const },
        publishedAt: '2026-09-02T09:00:00.000Z',
      };

      act(() => emit('competitionCueChanged', { competitionId, cue }));

      expect(useFinalCueStore.getState()).toMatchObject({ competitionId, cue });
    });
  });

  describe('sessionStarted event', () => {
    it('updates the store on sessionStarted event', () => {
      renderHook(() => useEventSubscriptions());

      emit('sessionStarted', {
        sessionId: 'session-abc',
        discipline: 'AIR_RIFLE_10M',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.currentSessionId).toBe('session-abc');
      expect(sessionState.mode).toBe('SIGHTING');
    });
  });

  describe('modeSwitched event', () => {
    it('updates the store on modeSwitched event', () => {
      renderHook(() => useEventSubscriptions());

      emit('modeSwitched', {
        sessionId: 'session-abc',
        mode: 'MATCH',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.mode).toBe('MATCH');
    });
  });

  describe('sessionReset event', () => {
    it('clears shooting data while preserving session context on sessionReset', () => {
      useSessionStore.getState().setSessionId('session-abc');
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().setShots([
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 0,
          y: 0,
          score: 105,
          innerTen: false,
          timestamp: '2026-01-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
        },
      ]);

      renderHook(() => useEventSubscriptions());

      emit('sessionReset', {
        sessionId: 'session-abc',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.currentSessionId).toBe('session-abc');
      expect(sessionState.mode).toBe('MATCH');
      expect(sessionState.shots).toEqual([]);
    });
  });

  describe('connectionStatusChanged event', () => {
    it('updates the store on connected event', () => {
      useConnectionStore.setState({ selectedDeviceId: 'MT201' });

      renderHook(() => useEventSubscriptions());

      emit('connectionStatusChanged', {
        connectionId: 'conn-123',
        status: 'connected',
        manufacturer: 'KOHTO',
        portPath: '/dev/ttyUSB0',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('connected');
      expect(connectionState.connectionId).toBe('conn-123');

      const sessionState = useSessionStore.getState();
      expect(sessionState.deviceId).toBe('MT201');
    });

    it('resets the store on disconnected event', () => {
      useConnectionStore.getState().setConnection('conn-123', 'MT201');
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useEventSubscriptions());

      emit('connectionStatusChanged', {
        connectionId: 'conn-123',
        status: 'disconnected',
        reason: 'Device removed',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('disconnected');
      expect(connectionState.connectionId).toBeNull();

      const sessionState = useSessionStore.getState();
      expect(sessionState.deviceId).toBeNull();
    });

    it('does not update the store on connected event without manufacturer', () => {
      renderHook(() => useEventSubscriptions());

      emit('connectionStatusChanged', {
        connectionId: 'conn-123',
        status: 'connected',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('disconnected');
      expect(connectionState.connectionId).toBeNull();

      const sessionState = useSessionStore.getState();
      expect(sessionState.deviceId).toBeNull();
    });
  });

  describe('shotRecorded event', () => {
    it('adds a shot on shotRecorded event', () => {
      renderHook(() => useEventSubscriptions());

      emit('shotRecorded', {
        sessionId: 'session-abc',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0.5,
          y: -0.3,
          score: 10.2,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'SIGHTING',
          isRecorded: true,
          innerTen: false,
        },
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.shots).toHaveLength(1);
      expect(sessionState.shots[0]).toEqual({
        id: 'shot-1',
        shotNumber: 1,
        x: 0.5,
        y: -0.3,
        score: 10.2,
        timestamp: '2026-02-15T10:00:00Z',
        mode: 'SIGHTING',
        isRecorded: true,
        innerTen: false,
      });
    });

    it('does not play shot sound on shotRecorded (played on shotReceived instead)', async () => {
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useEventSubscriptions());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotRecorded', {
        sessionId: 'session-abc',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0.5,
          y: -0.3,
          score: 10.2,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      });

      expect(audio.start).not.toHaveBeenCalled();
    });
  });

  describe('shotReceived event (low-latency audio playback)', () => {
    it('plays shot sound for MT201 device', async () => {
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useEventSubscriptions());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotReceived', {});

      expect(audio.start).toHaveBeenCalledTimes(1);
    });

    it.each(['DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG_KT_RDT_ZIE_1_PISTOL'])(
      'plays shot sound for a validated DISAG RedDot hit from %s',
      async (deviceId) => {
        useSessionStore.getState().setDeviceId(deviceId);

        renderHook(() => useEventSubscriptions());
        await audio.flushAudioLoad();

        audio.start.mockClear();

        emit('shotReceived', {});

        expect(audio.start).toHaveBeenCalledTimes(1);
      },
    );

    it('does not play shot sound for unsupported devices', async () => {
      useSessionStore.getState().setDeviceId('HS10');

      renderHook(() => useEventSubscriptions());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotReceived', {});

      expect(audio.start).not.toHaveBeenCalled();
    });
  });
});
