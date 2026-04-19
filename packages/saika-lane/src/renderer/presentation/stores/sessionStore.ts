// SPDX-License-Identifier: MIT
/**
 * Session management store
 *
 * @description
 * Session state management using Zustand.
 * - Session ID
 * - Mode (sighting / match)
 * - Shooting discipline
 * - Shot history
 * - Scores (total and per series)
 * - Connected device information
 */

import { create } from 'zustand';

import type { Discipline, SessionMode, ShotDto } from '@/shared/ipc/contracts';

/**
 * Session store state
 */
interface SessionState {
  /** Current session ID (null when no session is active) */
  currentSessionId: string | null;
  /** Current mode (sighting / match) */
  mode: SessionMode;
  /** Shooting discipline (null when not selected) */
  discipline: Discipline | null;
  /** Lane number */
  laneNumber: number;
  /** Shot history */
  shots: ShotDto[];
  /** Score array per series */
  seriesScores: number[];
  /** Total score */
  totalScore: number;
  /** Connected target manufacturer (null when disconnected) */
  manufacturer: string | null;
  /** Connected device ID (MT201, BP216, etc.; null when disconnected) */
  deviceId: string | null;
  /** Impact sound volume (0-100) */
  audioVolume: number;
}

/**
 * Session store actions
 */
interface SessionActions {
  /**
   * Set session ID
   * @param sessionId - Session ID (null to clear)
   */
  setSessionId: (sessionId: string | null) => void;

  /**
   * Set mode
   * @param mode - Session mode (SIGHTING | MATCH)
   */
  setMode: (mode: SessionMode) => void;

  /**
   * Set discipline
   * @param discipline - Shooting discipline
   */
  setDiscipline: (discipline: Discipline | null) => void;

  /**
   * Set lane number
   * @param laneNumber - Lane number
   */
  setLaneNumber: (laneNumber: number) => void;

  /**
   * Add a shot
   * @param shot - Shot DTO to add
   */
  addShot: (shot: ShotDto) => void;

  /**
   * Set the entire shot array
   * @param shots - Array of shot DTOs
   */
  setShots: (shots: ShotDto[]) => void;

  /**
   * Update scores
   * @param totalScore - Total score
   * @param seriesScores - Score array per series
   */
  updateScores: (totalScore: number, seriesScores: number[]) => void;

  /**
   * Set device information
   * @param manufacturer - Target manufacturer
   * @param deviceId - Device ID
   */
  setDeviceInfo: (manufacturer: string | null, deviceId: string | null) => void;

  /**
   * Set volume (0-100)
   * @param volume - Volume level
   */
  setAudioVolume: (volume: number) => void;

  /**
   * Reset session (restore to initial state)
   */
  resetSession: () => void;
}

/**
 * Initial state of the session store
 */
const initialState: SessionState = {
  currentSessionId: null,
  mode: 'SIGHTING',
  discipline: null,
  laneNumber: 1,
  shots: [],
  seriesScores: [],
  totalScore: 0,
  manufacturer: null,
  deviceId: null,
  audioVolume: 50,
};

/**
 * Session management store
 *
 * @example
 * ```typescript
 * const { currentSessionId, setSessionId } = useSessionStore();
 *
 * // Start session
 * setSessionId('session-123');
 *
 * // Switch mode
 * setMode('MATCH');
 *
 * // Add shot
 * addShot(shotDto);
 * ```
 */
export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  ...initialState,

  setSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },

  setMode: (mode) => {
    set({ mode });
  },

  setDiscipline: (discipline) => {
    set({ discipline });
  },

  setLaneNumber: (laneNumber) => {
    set({ laneNumber });
  },

  setAudioVolume: (audioVolume) => {
    set({ audioVolume: Math.max(0, Math.min(100, Math.round(audioVolume))) });
  },

  addShot: (shot) => {
    set((state) => ({
      shots: [...state.shots, shot], // Create a new array to preserve immutability
    }));
  },

  setShots: (shots) => {
    set({
      shots: [...shots], // Create a new array to preserve immutability
    });
  },

  updateScores: (totalScore, seriesScores) => {
    set({
      totalScore,
      seriesScores: [...seriesScores], // Create a new array to preserve immutability
    });
  },

  setDeviceInfo: (manufacturer, deviceId) => {
    set({ manufacturer, deviceId });
  },

  resetSession: () => {
    set((state) => ({
      ...initialState,
      manufacturer: state.manufacturer,
      deviceId: state.deviceId,
      audioVolume: state.audioVolume,
    }));
  },
}));
