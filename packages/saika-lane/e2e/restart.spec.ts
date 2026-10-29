// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { closeLane, launchLane, relaunchLane, type RunningLane } from './fixtures';

let running: RunningLane | undefined;
test.afterEach(async () => closeLane(running));

test('keeps standalone shots, session and series position after a process restart', async () => {
  running = await launchLane();
  const page = await running.app.firstWindow();
  const before = await page.evaluate(async () => {
    const api = window.electronAPI;
    const run = await api.startup.getStartupState();
    if (!run.success || !run.data.competitionId) throw new Error('Startup failed');
    const competitionId = run.data.competitionId;
    const requireSuccess = (result: { success: boolean }) => {
      if (!result.success) throw new Error('Progress command failed');
    };
    requireSuccess(await api.competition.startStage({ competitionId }));
    requireSuccess(await api.competition.endStage({ competitionId }));
    requireSuccess(await api.competition.advanceStage({ competitionId }));
    requireSuccess(await api.competition.startNextSeries({ competitionId }));
    const state = await api.competition.getCompetitionState({ competitionId });
    if (!state.success) throw new Error('Competition query failed');
    for (let i = 0; i < 3; i++)
      requireSuccess(
        await api.commands.recordShot({
          sessionId: state.data.sessionId,
          impactPoint: { x: 0, y: 0 },
          timestamp: new Date().toISOString(),
        }),
      );
    const history = await api.queries.getShotHistory({ sessionId: state.data.sessionId });
    if (!history.success) throw new Error('Shot history failed');
    return {
      competitionId,
      sessionId: state.data.sessionId,
      stage: state.data.currentStageIndex,
      series: state.data.currentSeriesIndex,
      shots: history.data.shots,
    };
  });
  expect(before.shots).toHaveLength(3);
  running = await relaunchLane(running);
  const restored = await running.app.firstWindow();
  const after = await restored.evaluate(async () => {
    const api = window.electronAPI;
    const run = await api.startup.getStartupState();
    if (!run.success || !run.data.competitionId || !run.data.sessionId) throw new Error('Restore failed');
    const [state, history] = await Promise.all([
      api.competition.getCompetitionState({ competitionId: run.data.competitionId }),
      api.queries.getShotHistory({ sessionId: run.data.sessionId }),
    ]);
    if (!state.success || !history.success) throw new Error('Restored queries failed');
    return {
      competitionId: state.data.id,
      sessionId: state.data.sessionId,
      stage: state.data.currentStageIndex,
      series: state.data.currentSeriesIndex,
      shots: history.data.shots,
    };
  });
  expect(after).toEqual(before);
  await expect(restored.getByText('Series 1', { exact: true })).toBeVisible();
  await expect(
    restored.getByRole('complementary', { name: 'Side Panel' }).getByText('Match', { exact: true }),
  ).toBeVisible();
  await expect(restored.getByText('No session started', { exact: true })).toHaveCount(0);
});
