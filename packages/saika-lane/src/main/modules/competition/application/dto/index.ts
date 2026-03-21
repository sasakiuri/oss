// SPDX-License-Identifier: MIT
/**
 * Competition Application layer DTO (Data Transfer Object) definitions
 *
 * Converts domain models to primitive types and returns them to the Renderer layer.
 */

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
}

export interface CompetitionTypeDto {
  id: string;
  name: string;
}
