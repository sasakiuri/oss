// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import type {
  QualificationTimedTargetInterruptionRecommendationDto,
  QualificationTimedTargetRecoveryDecisionDto,
} from '@/shared/ipc/contracts';

import { FormButtons, Field, inputClass, formClass } from './InterruptionFields';
import { formatEnum } from './interruptionFormatting';
import { type FormProps } from './interruptionPresentationTypes';

export function QualificationRecoveryDecisionHistory({
  decisions,
}: {
  decisions: readonly QualificationTimedTargetRecoveryDecisionDto[];
}) {
  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <h4 className="text-[13px] font-semibold text-vscode-text">Official 25m recovery decisions</h4>
      <div className="mt-2 space-y-2">
        {decisions.map((decision, index) => (
          <div key={decision.id} className="border-l-2 border-vscode-border pl-3 text-xs leading-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-vscode-text">
                Decision {index + 1} · {decision.officialName}
              </span>
              <span className={decision.followsRecommendation ? 'text-vscode-success' : 'text-vscode-warning'}>
                {decision.followsRecommendation ? 'Matches recommendation' : 'Official variance'}
              </span>
            </div>
            <p className="text-vscode-text-muted">
              {decision.authorizedRecovery.extraSightingSeriesShots} extra sighting shots ·{' '}
              {decision.authorizedRecovery.minimumPauseAfterSightingSeconds ?? 0}s pause ·{' '}
              {formatEnum(decision.authorizedRecovery.seriesRecovery.treatment)} ·{' '}
              {decision.authorizedRecovery.seriesRecovery.shotsToFire} recovery shots
            </p>
            <p className="whitespace-pre-wrap text-vscode-text">{decision.statement}</p>
            <p className="text-vscode-dimmed">
              {decision.ruleReference} · {decision.incidentReportReference} ·{' '}
              {new Date(decision.decidedAt).toLocaleString()} · {decision.id.slice(0, 8)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function QualificationRecoveryDecisionForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const recommendation = interruption.recommendation;
  if (recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') {
    throw new Error('Qualification timed-target recommendation is unavailable');
  }
  const latest = interruption.qualificationTimedTargetRecoveryDecisions.at(-1) ?? null;
  const suggested = latest?.authorizedRecovery ?? authorizedRecoveryFrom(recommendation);
  const [sightingPauseSeconds, setSightingPauseSeconds] = useState(
    String(suggested.minimumPauseAfterSightingSeconds ?? 0),
  );
  const [extraSightingShots, setExtraSightingShots] = useState(String(suggested.extraSightingSeriesShots));
  const [treatment, setTreatment] = useState(suggested.seriesRecovery.treatment);
  const [shotsToFire, setShotsToFire] = useState(String(suggested.seriesRecovery.shotsToFire));
  const [completionMode, setCompletionMode] = useState<'SECONDS_PER_SHOT' | 'FIRST_EXPOSURE_OF_NEXT_SERIES'>(
    suggested.seriesRecovery.execution?.mode === 'SECONDS_PER_SHOT'
      ? 'SECONDS_PER_SHOT'
      : 'FIRST_EXPOSURE_OF_NEXT_SERIES',
  );
  const [secondsPerShot, setSecondsPerShot] = useState(
    String(
      suggested.seriesRecovery.execution?.mode === 'SECONDS_PER_SHOT'
        ? suggested.seriesRecovery.execution.secondsPerShot
        : 48,
    ),
  );
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [incidentReportReference, setIncidentReportReference] = useState('');
  const [ruleReference, setRuleReference] = useState(recommendation.ruleReferences.join('; '));
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const recoveryShots = Number(shotsToFire);
          const seriesRecovery =
            treatment === 'KEEP_RECORDED_SERIES'
              ? ({ treatment, shotsToFire: 0, execution: null } as const)
              : treatment === 'ANNUL_AND_REPEAT'
                ? ({
                    treatment,
                    shotsToFire: recoveryShots,
                    execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
                  } as const)
                : completionMode === 'SECONDS_PER_SHOT'
                  ? ({
                      treatment,
                      shotsToFire: recoveryShots,
                      execution: {
                        mode: completionMode,
                        secondsPerShot: Number(secondsPerShot),
                        totalSeconds: Number(secondsPerShot) * recoveryShots,
                      },
                    } as const)
                  : ({
                      treatment,
                      shotsToFire: recoveryShots,
                      execution: { mode: completionMode },
                    } as const);
          const response = await rangeInterruptionsService.recordQualificationTimedTargetRecoveryDecision({
            id: crypto.randomUUID(),
            caseId: interruption.id,
            ...(latest ? { supersedesDecisionId: latest.id } : {}),
            authorizedRecovery: {
              extraSightingSeriesShots: Number(extraSightingShots),
              ...(suggested.minimumPauseAfterSightingSeconds !== undefined || Number(sightingPauseSeconds) > 0
                ? { minimumPauseAfterSightingSeconds: Number(sightingPauseSeconds) }
                : {}),
              seriesRecovery,
            },
            statement,
            officialName,
            incidentReportReference,
            ruleReference,
            decidedAt: new Date().toISOString(),
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">
        {latest ? 'Supersede official 25m recovery decision' : 'Record official 25m recovery decision'}
      </h4>
      <p className="text-xs leading-5 text-vscode-warning">
        Check the suggested values before saving. Changes are recorded as an official deviation. Saving does not operate
        a Lane or change a score.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Extra sighting series shots">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={extraSightingShots}
            onChange={(event) => setExtraSightingShots(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Pause after sighting (seconds)">
          <input
            type="number"
            min="0"
            step="1"
            value={sightingPauseSeconds}
            onChange={(event) => setSightingPauseSeconds(event.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Series treatment">
          <select
            value={treatment}
            onChange={(event) =>
              setTreatment(
                event.target.value as 'KEEP_RECORDED_SERIES' | 'ANNUL_AND_REPEAT' | 'COMPLETE_REMAINING_SHOTS',
              )
            }
            className={inputClass}
          >
            <option value="KEEP_RECORDED_SERIES">Keep recorded series</option>
            <option value="ANNUL_AND_REPEAT">Annul and repeat</option>
            <option value="COMPLETE_REMAINING_SHOTS">Complete remaining shots</option>
          </select>
        </Field>
        {treatment !== 'KEEP_RECORDED_SERIES' && (
          <Field label="Authorized recovery shots">
            <input
              required
              type="number"
              min={treatment === 'ANNUL_AND_REPEAT' ? 1 : 0}
              step={1}
              value={shotsToFire}
              onChange={(event) => setShotsToFire(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        {treatment === 'COMPLETE_REMAINING_SHOTS' && (
          <Field label="Completion timing">
            <select
              value={completionMode}
              onChange={(event) =>
                setCompletionMode(event.target.value as 'SECONDS_PER_SHOT' | 'FIRST_EXPOSURE_OF_NEXT_SERIES')
              }
              className={inputClass}
            >
              <option value="SECONDS_PER_SHOT">Seconds per shot</option>
              <option value="FIRST_EXPOSURE_OF_NEXT_SERIES">First exposure of next series</option>
            </select>
          </Field>
        )}
        {treatment === 'COMPLETE_REMAINING_SHOTS' && completionMode === 'SECONDS_PER_SHOT' && (
          <Field label="Seconds per shot">
            <input
              required
              type="number"
              min={1}
              step={1}
              value={secondsPerShot}
              onChange={(event) => setSecondsPerShot(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Range Incident Report reference">
          <input
            required
            value={incidentReportReference}
            onChange={(event) => setIncidentReportReference(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Rule reference">
        <input
          required
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Decision statement">
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input
          required
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I confirm this is an official recovery decision, not an automatic Rule Pack action.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel={latest ? 'Supersede decision' : 'Record recovery decision'}
        onCancel={onCancel}
      />
    </form>
  );
}

function authorizedRecoveryFrom(recommendation: QualificationTimedTargetInterruptionRecommendationDto) {
  return {
    extraSightingSeriesShots: recommendation.extraSighting.shots,
    ...(recommendation.minimumPauseAfterSightingSeconds !== undefined
      ? { minimumPauseAfterSightingSeconds: recommendation.minimumPauseAfterSightingSeconds }
      : {}),
    seriesRecovery: recommendation.seriesRecovery,
  };
}
