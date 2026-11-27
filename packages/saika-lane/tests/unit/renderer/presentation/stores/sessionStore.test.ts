// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { SessionMode, ShotDto } from '@/shared/ipc/contracts';

describe('sessionStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { resetSession, setLaneNumber } = useSessionStore.getState();
    resetSession();
    setLaneNumber(1);
  });

  describe('initial state', () => {
    it('currentSessionId is null', () => {
      const { currentSessionId } = useSessionStore.getState();
      expect(currentSessionId).toBeNull();
    });

    it('mode is SIGHTING', () => {
      const { mode } = useSessionStore.getState();
      expect(mode).toBe('SIGHTING');
    });

    it('shots is an empty array', () => {
      const { shots } = useSessionStore.getState();
      expect(shots).toEqual([]);
      expect(shots).toHaveLength(0);
    });

    it('preparation shot number reset indices is an empty array', () => {
      const { preparationShotNumberResetIndices } = useSessionStore.getState();
      expect(preparationShotNumberResetIndices).toEqual([]);
    });
  });

  describe('setSessionId', () => {
    it('can set session ID', () => {
      const { setSessionId } = useSessionStore.getState();
      const sessionId = 'test-session-123';

      setSessionId(sessionId);

      const { currentSessionId } = useSessionStore.getState();
      expect(currentSessionId).toBe(sessionId);
    });

    it('can set session ID to null', () => {
      const { setSessionId } = useSessionStore.getState();

      setSessionId('test-session-123');
      setSessionId(null);

      const { currentSessionId } = useSessionStore.getState();
      expect(currentSessionId).toBeNull();
    });

    it('changing session ID does not affect other state', () => {
      const { setSessionId, mode, shots } = useSessionStore.getState();

      setSessionId('test-session-123');

      const stateAfter = useSessionStore.getState();
      expect(stateAfter.mode).toBe(mode);
      expect(stateAfter.shots).toEqual(shots);
    });
  });

  describe('setMode', () => {
    it('can change mode to MATCH', () => {
      const { setMode } = useSessionStore.getState();

      setMode('MATCH');

      const { mode } = useSessionStore.getState();
      expect(mode).toBe('MATCH');
    });

    it('can change mode to SIGHTING', () => {
      const { setMode } = useSessionStore.getState();

      setMode('MATCH');
      setMode('SIGHTING');

      const { mode } = useSessionStore.getState();
      expect(mode).toBe('SIGHTING');
    });

    it('changing mode does not affect other state', () => {
      const { setMode, currentSessionId, shots } = useSessionStore.getState();

      setMode('MATCH');

      const stateAfter = useSessionStore.getState();
      expect(stateAfter.currentSessionId).toBe(currentSessionId);
      expect(stateAfter.shots).toEqual(shots);
    });
  });

  describe('addShot', () => {
    it('can add a shot', () => {
      const { addShot } = useSessionStore.getState();
      const shot: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      addShot(shot);

      const { shots } = useSessionStore.getState();
      expect(shots).toHaveLength(1);
      expect(shots[0]).toEqual(shot);
    });

    it('can add multiple shots', () => {
      const { addShot } = useSessionStore.getState();
      const shot1: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };
      const shot2: ShotDto = {
        id: 'shot-2',
        shotNumber: 2,
        x: 0.5,
        y: 1.0,
        score: 10.8,
        timestamp: '2026-01-14T10:01:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      addShot(shot1);
      addShot(shot2);

      const { shots } = useSessionStore.getState();
      expect(shots).toHaveLength(2);
      expect(shots[0]).toEqual(shot1);
      expect(shots[1]).toEqual(shot2);
    });

    it('does not mutate existing shots array when adding (immutability)', () => {
      const { addShot, shots: initialShots } = useSessionStore.getState();
      const shot: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      addShot(shot);

      const { shots: newShots } = useSessionStore.getState();
      expect(newShots).not.toBe(initialShots);
      expect(initialShots).toHaveLength(0);
      expect(newShots).toHaveLength(1);
    });
  });

  describe('markPreparationShotNumberReset', () => {
    it('records the current shot index', () => {
      const { addShot, markPreparationShotNumberReset } = useSessionStore.getState();

      addShot({
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'SIGHTING',
        isRecorded: false,
        innerTen: false,
      });
      markPreparationShotNumberReset();

      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([1]);
    });

    it('does not add duplicate reset indices without intervening shots', () => {
      const { markPreparationShotNumberReset } = useSessionStore.getState();

      markPreparationShotNumberReset();
      markPreparationShotNumberReset();

      expect(useSessionStore.getState().preparationShotNumberResetIndices).toEqual([0]);
    });
  });

  describe('clearSessionData', () => {
    it('clears shots while preserving the active session context', () => {
      const { setSessionId, setMode, setDiscipline, addShot, clearSessionData } = useSessionStore.getState();
      setSessionId('test-session-123');
      setMode('MATCH');
      setDiscipline('AIR_RIFLE_10M');
      addShot({
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      });
      useSessionStore.getState().setCurrentSeriesStartIndex(1);

      clearSessionData();

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('test-session-123');
      expect(state.mode).toBe('MATCH');
      expect(state.discipline).toBe('AIR_RIFLE_10M');
      expect(state.currentSeriesStartIndex).toBe(0);
      expect(state.shots).toEqual([]);
    });
  });

  describe('resetSession', () => {
    it('can reset session state to initial state', () => {
      const { setSessionId, setMode, addShot, resetSession } = useSessionStore.getState();

      // Change state
      setSessionId('test-session-123');
      setMode('MATCH');
      addShot({
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      });

      useSessionStore.getState().setCurrentSeriesStartIndex(1);
      // Execute reset
      resetSession();

      // Verify reset to initial state
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
      expect(state.preparationShotNumberResetIndices).toEqual([]);
      expect(state.currentSeriesStartIndex).toBe(0);
    });

    it('preserves deviceId on reset', () => {
      const { setDeviceId, setSessionId, setMode, addShot, resetSession } = useSessionStore.getState();

      // Set device info and session state
      setDeviceId('MT201');
      setSessionId('test-session-123');
      setMode('MATCH');
      addShot({
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      });

      // Execute reset
      resetSession();

      // Session state is reset but device info is preserved
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
      expect(state.deviceId).toBe('MT201');
    });

    it('can reset multiple times without issues', () => {
      const { resetSession } = useSessionStore.getState();

      resetSession();
      resetSession();
      resetSession();

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
    });
  });

  describe('setAudioVolume', () => {
    it('can set volume correctly', () => {
      const { setAudioVolume } = useSessionStore.getState();

      setAudioVolume(75);

      expect(useSessionStore.getState().audioVolume).toBe(75);
    });

    it('clamps negative values to 0', () => {
      const { setAudioVolume } = useSessionStore.getState();

      setAudioVolume(-10);

      expect(useSessionStore.getState().audioVolume).toBe(0);
    });

    it('clamps values over 100 to 100', () => {
      const { setAudioVolume } = useSessionStore.getState();

      setAudioVolume(150);

      expect(useSessionStore.getState().audioVolume).toBe(100);
    });

    it('rounds decimal values', () => {
      const { setAudioVolume } = useSessionStore.getState();

      setAudioVolume(50.7);

      expect(useSessionStore.getState().audioVolume).toBe(51);
    });
  });

  describe('resetSession — audioVolume', () => {
    it('preserves audioVolume on reset', () => {
      const { setAudioVolume, setSessionId, resetSession } = useSessionStore.getState();

      setAudioVolume(80);
      setSessionId('test-session');

      resetSession();

      const state = useSessionStore.getState();
      expect(state.audioVolume).toBe(80);
      expect(state.currentSessionId).toBeNull();
    });
  });

  describe('resetSession — laneNumber', () => {
    it('preserves laneNumber on reset', () => {
      const { setLaneNumber, setSessionId, resetSession } = useSessionStore.getState();

      setLaneNumber(8);
      setSessionId('test-session');

      resetSession();

      const state = useSessionStore.getState();
      expect(state.laneNumber).toBe(8);
      expect(state.currentSessionId).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('session start -> add shots -> reset flow works correctly', () => {
      const { setSessionId, setMode, addShot, resetSession } = useSessionStore.getState();

      // Start session
      setSessionId('session-123');
      setMode('MATCH');

      // Add shots
      const shot1: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };
      const shot2: ShotDto = {
        id: 'shot-2',
        shotNumber: 2,
        x: 0.5,
        y: 1.0,
        score: 10.8,
        timestamp: '2026-01-14T10:01:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };
      addShot(shot1);
      addShot(shot2);

      // Verify state
      let state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('session-123');
      expect(state.mode).toBe('MATCH');
      expect(state.shots).toHaveLength(2);

      // Reset
      resetSession();

      // Verify initial state
      state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
    });

    it('scenario of switching from sighting mode to match mode', () => {
      const { setSessionId, setMode, addShot } = useSessionStore.getState();

      // Start session (sighting mode)
      setSessionId('session-456');
      setMode('SIGHTING');

      // Add sighting shot
      const sightingShot: ShotDto = {
        id: 'shot-sighting',
        shotNumber: 1,
        x: 2.0,
        y: 1.5,
        score: 10.2,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'SIGHTING',
        isRecorded: false,
        innerTen: false,
      };
      addShot(sightingShot);

      // Switch to match mode
      setMode('MATCH');

      // Add match shot
      const matchShot: ShotDto = {
        id: 'shot-match',
        shotNumber: 1,
        x: 1.0,
        y: 0.5,
        score: 10.7,
        timestamp: '2026-01-14T10:05:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };
      addShot(matchShot);

      // Verify state
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('session-456');
      expect(state.mode).toBe('MATCH');
      expect(state.shots).toHaveLength(2);
    });
  });

  describe('type safety', () => {
    it('SessionMode only accepts "SIGHTING" or "MATCH"', () => {
      const { setMode } = useSessionStore.getState();

      // Checked at TypeScript compile time,
      // this is a type definition verification, not a runtime test
      const validModes: SessionMode[] = ['SIGHTING', 'MATCH'];

      validModes.forEach((mode) => {
        setMode(mode);
        const { mode: currentMode } = useSessionStore.getState();
        expect(currentMode).toBe(mode);
      });
    });

    it('ShotDto has all required properties', () => {
      const { addShot } = useSessionStore.getState();

      const validShot: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: 2.0,
        score: 10.5,
        timestamp: '2026-01-14T10:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      };

      // Type-checked at TypeScript compile time
      addShot(validShot);

      const { shots } = useSessionStore.getState();
      expect(shots[0]).toHaveProperty('id');
      expect(shots[0]).toHaveProperty('shotNumber');
      expect(shots[0]).toHaveProperty('x');
      expect(shots[0]).toHaveProperty('y');
      expect(shots[0]).toHaveProperty('score');
      expect(shots[0]).toHaveProperty('timestamp');
      expect(shots[0]).toHaveProperty('mode');
      expect(shots[0]).toHaveProperty('isRecorded');
    });
  });
});
