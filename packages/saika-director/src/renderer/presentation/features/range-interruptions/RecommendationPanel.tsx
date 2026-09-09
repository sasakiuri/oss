// SPDX-License-Identifier: MIT
import { ClockAlert } from 'lucide-react';

import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

import { Detail } from './InterruptionFields';
import { formatEnum, formatDuration } from './interruptionFormatting';

export function RecommendationPanel({ interruption }: { interruption: RangeInterruptionCaseDto }) {
  const recommendation = interruption.recommendation!;
  if (recommendation.type === 'QUALIFICATION_TIMED_TARGET') {
    const recovery = recommendation.seriesRecovery;
    const execution =
      recovery.execution?.mode === 'SECONDS_PER_SHOT'
        ? `${recovery.execution.secondsPerShot}s per shot · ${recovery.execution.totalSeconds}s total`
        : recovery.execution?.mode === 'FIRST_EXPOSURE_OF_NEXT_SERIES'
          ? 'Start on the first exposure of the next competition series'
          : recovery.execution?.mode === 'SAME_TIMED_TARGET_PROGRAM'
            ? 'Repeat with the same timed-target program'
            : 'No recovery firing';
    return (
      <section className="rounded-[3px] border border-vscode-warning/60 bg-vscode-bg p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-vscode-warning">
          <ClockAlert size={14} aria-hidden="true" /> ISSF 25m Qualification recommendation — not an authorization
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Detail label="Recorded interruption" value={formatDuration(recommendation.interruptionSeconds)} />
          <Detail label="Stage" value={recommendation.stageId} />
          <Detail
            label="Extra sighting series"
            value={
              recommendation.extraSighting.required ? `${recommendation.extraSighting.shots} shots` : 'Not required'
            }
          />
          <Detail label="Series treatment" value={formatEnum(recovery.treatment)} />
          <Detail label="Recovery shots" value={String(recovery.shotsToFire)} />
          {recommendation.minimumPauseAfterSightingSeconds !== undefined && (
            <Detail
              label="Pause after sighting"
              value={formatDuration(recommendation.minimumPauseAfterSightingSeconds)}
            />
          )}
          <Detail label="Execution" value={execution} />
          <Detail label="Rules" value={recommendation.ruleReferences.join('; ')} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-vscode-text-muted">{recommendation.explanation}</p>
        <p className="mt-2 text-xs leading-5 text-vscode-warning">
          Record the Jury decision separately. This recommendation does not annul shots or start a Lane program.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-[3px] border border-vscode-warning/60 bg-vscode-bg p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-vscode-warning">
        <ClockAlert size={14} aria-hidden="true" /> ISSF recommendation — not yet an authorization
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <Detail label="Recorded time lost" value={formatDuration(recommendation.lostTimeSeconds)} />
        <Detail label="Preserved remaining time" value={formatDuration(recommendation.baseRemainingSeconds)} />
        <Detail
          label="Suggested addition beyond preserved time"
          value={formatDuration(recommendation.suggestedAdditionalSeconds)}
        />
        <Detail
          label="Suggested resume time"
          value={formatDuration(recommendation.suggestedAuthorizedRemainingSeconds)}
        />
        <Detail
          label="Unlimited sighting shots"
          value={recommendation.unlimitedSightingShots ? 'Suggested' : 'Not suggested'}
        />
        <Detail label="Rules" value={recommendation.ruleReferences} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-vscode-text-muted">{recommendation.explanation}</p>
    </section>
  );
}
