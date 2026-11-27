import { useCallback, useEffect, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { incidentReportsService, irregularShotCasesService, scoringDecisionsService } from '@/renderer/services';
import { errorMessage, unwrap, unwrapData } from '@/renderer/services/serviceError';
import type {
  AddIrregularShotEvidencePayload,
  AppendIrregularShotCaseEntryPayload,
  CreateIrregularShotCasePayload,
  IrregularShotCaseDto,
  RangeIncidentReportDto,
  ResultScope,
  ScoringDecisionDto,
} from '@/shared/ipc/contracts';

/** A new case as the form holds it: the times are `datetime-local` values. */
export type IrregularShotCaseInput = Omit<CreateIrregularShotCasePayload, 'eventId' | 'competitionId' | 'resultScope'>;

/**
 * Commands of the irregular shot case workspace. Opening a case uses the panel's busy flag; `onSaved` runs after the
 * list shows the new case and before the busy flag clears. A case card keeps its own busy flag for the case commands.
 * Every command reports its error in the panel error and resolves `true` when it succeeded.
 */
export interface IrregularShotCaseCommands {
  readonly create: (input: IrregularShotCaseInput, onSaved: () => void) => Promise<boolean>;
  readonly addEvidence: (payload: AddIrregularShotEvidencePayload) => Promise<boolean>;
  readonly appendEntry: (payload: AppendIrregularShotCaseEntryPayload) => Promise<boolean>;
}

/**
 * Owns the irregular shot cases of one competition with the open incident reports and the active scoring decisions
 * they can resolve with. A command updates the case in the list without querying again.
 */
export function useIrregularShotCases({
  eventId,
  competitionId,
  resultScope,
}: {
  eventId: string;
  competitionId: string;
  resultScope: ResultScope;
}) {
  const [cases, setCases] = useState<IrregularShotCaseDto[]>([]);
  const [reports, setReports] = useState<RangeIncidentReportDto[]>([]);
  const [decisions, setDecisions] = useState<ScoringDecisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseResponse, reportResponse, decisionResponse] = await Promise.all([
        irregularShotCasesService.list({ eventId, resultScope }),
        incidentReportsService.listByEvent({ eventId }),
        scoringDecisionsService.listByEvent({ eventId, resultScope }),
      ]);
      const listed = unwrap(caseResponse);
      const reportStatus = unwrap(reportResponse);
      const decisionList = unwrap(decisionResponse);
      setCases(listed.filter((value) => value.competitionId === competitionId));
      setReports(reportStatus.reports.filter((report) => !report.voided));
      setDecisions(
        decisionList.decisions.filter(
          (decision) =>
            decision.active &&
            decision.type !== 'REVOCATION' &&
            (!decision.sourceCompetitionId || decision.sourceCompetitionId === competitionId),
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId, eventId, resultScope, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (request: () => ReturnType<typeof irregularShotCasesService.appendEntry>) => {
    setError(null);
    try {
      const changed = unwrapData(await request(), 'Operation failed');
      setCases((current) => current.map((item) => (item.id === changed.id ? changed : item)));
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    }
  };

  const commands: IrregularShotCaseCommands = {
    // The times are converted inside the command so that an invalid value is reported like a failed command.
    create: (input, onSaved) =>
      run(async () => {
        const created = unwrap(
          await irregularShotCasesService.create({
            eventId,
            competitionId,
            resultScope,
            ...input,
            windowStartAt: new Date(input.windowStartAt).toISOString(),
            windowEndAt: new Date(input.windowEndAt).toISOString(),
            occurredAt: new Date(input.occurredAt).toISOString(),
          }),
        );
        setCases((current) => [...current, created]);
        onSaved();
      }),
    addEvidence: (payload) => change(() => irregularShotCasesService.addEvidence(payload)),
    appendEntry: (payload) => change(() => irregularShotCasesService.appendEntry(payload)),
  };

  return { cases, reports, decisions, loading, saving, error, load, commands };
}
