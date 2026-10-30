// SPDX-License-Identifier: MIT
/** Competition DTOs use primitive values for transport to the renderer. */

export interface TimerDto {
  remainingSeconds: number;
  totalSeconds: number;
  formattedRemaining: string;
  isExpired: boolean;
}

export interface CompetitionStateDto {
  acc: 'RING' | 'DECIMAL';
  interruption: {
    interruptionId: string;
    status: 'PAUSED' | 'RESUME_PENDING' | 'SIGHTING' | 'RUNNING_MATCH';
    remainingSeconds: number;
    unlimitedSightingShots: boolean;
    restartHold: boolean;
    remainingTimeVerified?: boolean;
  } | null;
  athleteTargetControl: {
    officialSighting: boolean;
    sightingAllowed: boolean;
    matchAllowed: boolean;
    matchUnavailableReason: 'SIGHTING_REQUIRED' | null;
    selected: 'SIGHTING' | 'MATCH' | null;
    effective: 'SIGHTING' | 'MATCH';
  } | null;
  id: string;
  sessionId: string;
  phase: string;
  currentStageIndex: number;
  currentSeriesIndex: number;
  seriesShotCount: number;
  timer: TimerDto;
  currentStageName: string;
  scored: boolean;
  shotsPerSeries: number;
  targetProfileId?: string;
  scoringGaugeProfileId?: string;
}

export interface CompetitionTypeDto {
  id: string;
  name: string;
}
