// SPDX-License-Identifier: MIT
/** Competition DTOs use primitive values for transport to the renderer. */

export interface TimerDto {
  remainingSeconds: number;
  totalSeconds: number;
  formattedRemaining: string;
  isExpired: boolean;
}

export interface CompetitionStateDto {
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
