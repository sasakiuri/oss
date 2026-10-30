// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { closeLane, launchLane, type RunningLane } from './fixtures';

let running: RunningLane | undefined;
test.afterEach(async () => closeLane(running));

test('requires Sighting before Match at a three-position boundary and accepts 1 then 2 without a sighter', async () => {
  running = await launchLane();
  const page = await running.app.firstWindow();
  const competitionId = await page.evaluate(async () => {
    const api = window.electronAPI;
    const started = await api.competition.startCompetition({ competitionTypeId: 'R3P60' });
    if (!started.success) throw new Error('Competition start failed');
    const id = started.data.competitionId;
    const requireSuccess = (result: { success: boolean }) => {
      if (!result.success) throw new Error('Progress command failed');
    };
    requireSuccess(await api.competition.startStage({ competitionId: id }));
    requireSuccess(await api.competition.endStage({ competitionId: id }));
    requireSuccess(await api.competition.advanceStage({ competitionId: id }));
    requireSuccess(await api.competition.startNextSeries({ competitionId: id }));
    const state = await api.competition.getCompetitionState({ competitionId: id });
    if (!state.success) throw new Error('Competition query failed');
    requireSuccess(await api.commands.switchMode({ sessionId: state.data.sessionId, mode: 'MATCH' }));
    for (let i = 0; i < 20; i++)
      requireSuccess(
        await api.commands.recordShot({
          sessionId: state.data.sessionId,
          impactPoint: { x: 0, y: 0 },
          timestamp: new Date().toISOString(),
        }),
      );
    const boundary = await api.competition.getCompetitionState({ competitionId: id });
    if (!boundary.success || boundary.data.currentSeriesIndex !== 2 || boundary.data.seriesShotCount !== 0)
      throw new Error('The fixture did not reach the first Prone series');
    return id;
  });
  const match = page.getByRole('button', { name: 'Match', exact: true });
  await expect(match).toBeDisabled();
  await expect(match).toHaveAccessibleDescription('Switch to Sighting before selecting Match.');
  await page.keyboard.press('Numpad2');
  await expect(match).toBeDisabled();
  await page.keyboard.press('Numpad1');
  await expect(page.getByRole('button', { name: 'Sighting', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(match).toBeEnabled();
  await page.keyboard.press('Numpad2');
  await expect(match).toHaveAttribute('aria-pressed', 'true');
  const state = await page.evaluate(
    async (id) => window.electronAPI.competition.getCompetitionState({ competitionId: id }),
    competitionId,
  );
  expect(state.success && state.data.seriesShotCount).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
