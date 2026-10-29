// SPDX-License-Identifier: MIT
import { competitionService } from '@/renderer/services/competitionService';
import type { CompetitionStateDto } from '@/shared/ipc/contracts';

import { useCompetitionStore } from './competitionStore';
import { useLogStore } from './logStore';

let revision = 0;

export function invalidateAthleteTargetControl(): void {
  revision += 1;
  useCompetitionStore.setState({ athleteTargetControlPending: false });
}

function reportFailure(error: unknown): void {
  useLogStore.getState().addEntry({
    id: `athlete-target-error-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `Failed to update athlete target mode: ${error instanceof Error ? error.message : String(error)}`,
    source: 'renderer',
  });
}

/** Orders command/query responses against newer events and current competition coordinates. */
async function load(
  request: (context: {
    competitionId: string;
    stageIndex: number;
    seriesIndex: number;
  }) => Promise<CompetitionStateDto>,
  selection = false,
): Promise<void> {
  const expected = useCompetitionStore.getState();
  const requestRevision = ++revision;
  if (!expected.competitionId || expected.phase !== 'ACTIVE') {
    useCompetitionStore.setState({ athleteTargetControlPending: false });
    return;
  }
  if (!selection && !expected.athleteTargetControlLoaded) {
    useCompetitionStore.setState({ athleteTargetControlPending: true });
  }
  try {
    const dto = await request({
      competitionId: expected.competitionId,
      stageIndex: expected.stageIndex,
      seriesIndex: expected.seriesIndex,
    });
    const current = useCompetitionStore.getState();
    if (
      requestRevision !== revision ||
      current.competitionId !== expected.competitionId ||
      current.phase !== expected.phase ||
      current.stageIndex !== expected.stageIndex ||
      current.seriesIndex !== expected.seriesIndex
    )
      return;
    if (
      dto.id !== current.competitionId ||
      dto.phase !== current.phase ||
      dto.currentStageIndex !== current.stageIndex ||
      dto.currentSeriesIndex !== current.seriesIndex
    ) {
      useCompetitionStore.setState({ athleteTargetControl: null, athleteTargetControlLoaded: false });
      return;
    }
    current.setAthleteTargetControl(dto.athleteTargetControl);
  } catch (error) {
    if (requestRevision === revision) {
      reportFailure(error);
      if (selection) await refreshAthleteTargetControl();
    }
  } finally {
    if (requestRevision === revision) useCompetitionStore.setState({ athleteTargetControlPending: false });
  }
}

export function refreshAthleteTargetControl(): Promise<void> {
  return load(({ competitionId }) => competitionService.getCompetitionState({ competitionId }));
}

export async function retryAthleteTargetControl(): Promise<void> {
  const current = useCompetitionStore.getState();
  if (current.phase === 'ACTIVE' && !current.athleteTargetControlLoaded && !current.athleteTargetControlPending)
    await refreshAthleteTargetControl();
}

export function selectAthleteTargetMode(mode: 'SIGHTING' | 'MATCH'): Promise<void> {
  return load((context) => competitionService.setAthleteTargetMode({ ...context, mode }), true);
}
