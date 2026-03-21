// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { SessionMode, ShotDto } from '@/shared/ipc/contracts';

describe('sessionStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { resetSession } = useSessionStore.getState();
    resetSession();
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

    it('seriesScores is an empty array', () => {
      const { seriesScores } = useSessionStore.getState();
      expect(seriesScores).toEqual([]);
      expect(seriesScores).toHaveLength(0);
    });

    it('totalScore is 0', () => {
      const { totalScore } = useSessionStore.getState();
      expect(totalScore).toBe(0);
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
      const { setSessionId, mode, shots, totalScore } = useSessionStore.getState();

      setSessionId('test-session-123');

      const stateAfter = useSessionStore.getState();
      expect(stateAfter.mode).toBe(mode);
      expect(stateAfter.shots).toEqual(shots);
      expect(stateAfter.totalScore).toBe(totalScore);
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
      const { setMode, currentSessionId, shots, totalScore } = useSessionStore.getState();

      setMode('MATCH');

      const stateAfter = useSessionStore.getState();
      expect(stateAfter.currentSessionId).toBe(currentSessionId);
      expect(stateAfter.shots).toEqual(shots);
      expect(stateAfter.totalScore).toBe(totalScore);
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

  describe('updateScores', () => {
    it('can update scores', () => {
      const { updateScores } = useSessionStore.getState();

      updateScores(105.5, [52.5, 53.0]);

      const { totalScore, seriesScores } = useSessionStore.getState();
      expect(totalScore).toBe(105.5);
      expect(seriesScores).toEqual([52.5, 53.0]);
    });

    it('can reset scores to 0', () => {
      const { updateScores } = useSessionStore.getState();

      updateScores(105.5, [52.5, 53.0]);
      updateScores(0, []);

      const { totalScore, seriesScores } = useSessionStore.getState();
      expect(totalScore).toBe(0);
      expect(seriesScores).toEqual([]);
    });

    it('does not mutate existing seriesScores array when updating (immutability)', () => {
      const { updateScores, seriesScores: initialScores } = useSessionStore.getState();

      updateScores(105.5, [52.5, 53.0]);

      const { seriesScores: newScores } = useSessionStore.getState();
      expect(newScores).not.toBe(initialScores);
      expect(initialScores).toHaveLength(0);
      expect(newScores).toHaveLength(2);
    });

    it('updating scores does not affect other state', () => {
      const { updateScores, currentSessionId, mode, shots } = useSessionStore.getState();

      updateScores(105.5, [52.5, 53.0]);

      const stateAfter = useSessionStore.getState();
      expect(stateAfter.currentSessionId).toBe(currentSessionId);
      expect(stateAfter.mode).toBe(mode);
      expect(stateAfter.shots).toEqual(shots);
    });
  });

  describe('resetSession', () => {
    it('can reset session state to initial state', () => {
      const { setSessionId, setMode, addShot, updateScores, resetSession } = useSessionStore.getState();

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
      updateScores(105.5, [52.5, 53.0]);

      // Execute reset
      resetSession();

      // Verify reset to initial state
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
      expect(state.seriesScores).toEqual([]);
      expect(state.totalScore).toBe(0);
    });

    it('preserves manufacturer and deviceId on reset', () => {
      const { setDeviceInfo, setSessionId, setMode, addShot, updateScores, resetSession } = useSessionStore.getState();

      // Set device info and session state
      setDeviceInfo('KOHTO', 'MT201');
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
      updateScores(10.5, [10.5]);

      // Execute reset
      resetSession();

      // Session state is reset but device info is preserved
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
      expect(state.totalScore).toBe(0);
      expect(state.seriesScores).toEqual([]);
      expect(state.manufacturer).toBe('KOHTO');
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
      expect(state.seriesScores).toEqual([]);
      expect(state.totalScore).toBe(0);
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

  describe('integration scenarios', () => {
    it('session start -> add shots -> update scores -> reset flow works correctly', () => {
      const { setSessionId, setMode, addShot, updateScores, resetSession } = useSessionStore.getState();

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

      // Update scores
      updateScores(21.3, [21.3]);

      // Verify state
      let state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('session-123');
      expect(state.mode).toBe('MATCH');
      expect(state.shots).toHaveLength(2);
      expect(state.totalScore).toBe(21.3);
      expect(state.seriesScores).toEqual([21.3]);

      // Reset
      resetSession();

      // Verify initial state
      state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
      expect(state.totalScore).toBe(0);
      expect(state.seriesScores).toEqual([]);
    });

    it('scenario of switching from sighting mode to match mode', () => {
      const { setSessionId, setMode, addShot, updateScores } = useSessionStore.getState();

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

      // Update scores (match shots only)
      updateScores(10.7, [10.7]);

      // Verify state
      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('session-456');
      expect(state.mode).toBe('MATCH');
      expect(state.shots).toHaveLength(2);
      expect(state.totalScore).toBe(10.7);
      expect(state.seriesScores).toEqual([10.7]);
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
