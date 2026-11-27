import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import {
  adjudicationCasesService,
  finalRecoveriesService,
  incidentReportsService,
  protestsService,
  rangeInterruptionsService,
  scoringDecisionsService,
  targetExaminationsService,
} from '@/renderer/services';
import { errorMessage, unwrap, unwrapData } from '@/renderer/services/serviceError';
import type {
  AdjudicationCaseDto,
  AppendAdjudicationCaseEntryPayload,
  CreateAdjudicationCasePayload,
  LinkAdjudicationArtifactPayload,
  UnlinkAdjudicationArtifactPayload,
} from '@/shared/ipc/contracts';

import { type ArtifactCandidate, artifactCandidates } from './artifactCandidates';

/**
 * Commands of the adjudication case workspace. One busy flag and one error cover the queries and every command.
 * `onSaved` runs after the list shows the saved case and before the busy flag clears; it lets a form clear its draft.
 * Each resolves `true` when the command succeeded.
 */
export interface AdjudicationCaseCommands {
  readonly create: (payload: CreateAdjudicationCasePayload, onSaved: () => void) => Promise<boolean>;
  readonly linkArtifact: (payload: LinkAdjudicationArtifactPayload, onSaved: () => void) => Promise<boolean>;
  readonly unlinkArtifact: (payload: UnlinkAdjudicationArtifactPayload, onSaved: () => void) => Promise<boolean>;
  readonly appendEntry: (payload: AppendAdjudicationCaseEntryPayload, onSaved: () => void) => Promise<boolean>;
}

/**
 * Owns an event's adjudication cases and the official records they can link: the queries, the selection (the first
 * case unless the selected one is still listed) and the commands. A command updates the case in the list without
 * querying again.
 */
export function useAdjudicationCases(eventId: string) {
  const [cases, setCases] = useState<AdjudicationCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [candidates, setCandidates] = useState<ArtifactCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        caseResponse,
        incidentResponse,
        protestResponse,
        decisionResponse,
        recoveryResponse,
        interruptionResponse,
        examinationResponse,
      ] = await Promise.all([
        adjudicationCasesService.list({ scopeType: 'EVENT', scopeId: eventId }),
        incidentReportsService.listByEvent({ eventId }),
        protestsService.list({ scopeType: 'EVENT', scopeId: eventId }),
        scoringDecisionsService.listByEvent({ eventId }),
        finalRecoveriesService.listByEvent({ eventId }),
        rangeInterruptionsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
        targetExaminationsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
      ]);
      const listed = unwrap(caseResponse);
      const incidents = unwrap(incidentResponse);
      const protests = unwrap(protestResponse);
      const decisions = unwrap(decisionResponse);
      const recoveries = unwrap(recoveryResponse);
      const interruptions = unwrap(interruptionResponse);
      const examinations = unwrap(examinationResponse);
      setCases(listed);
      setSelectedId((current) => (listed.some((value) => value.id === current) ? current : (listed[0]?.id ?? '')));
      setCandidates(
        artifactCandidates({
          reports: incidents.reports,
          interruptions,
          examinations,
          decisions: decisions.decisions,
          protests,
          recoveries,
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [eventId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cases.find((value) => value.id === selectedId) ?? null, [cases, selectedId]);

  const change = (request: () => ReturnType<typeof adjudicationCasesService.appendEntry>, onSaved: () => void) =>
    run(async () => {
      const value = unwrapData(await request(), 'Case operation failed');
      setCases((current) => current.map((item) => (item.id === value.id ? value : item)));
      setSelectedId(value.id);
      onSaved();
    });

  const commands: AdjudicationCaseCommands = {
    create: (payload, onSaved) =>
      run(async () => {
        const created = unwrap(await adjudicationCasesService.create(payload));
        setCases((current) => [...current, created]);
        setSelectedId(created.id);
        onSaved();
      }),
    linkArtifact: (payload, onSaved) => change(() => adjudicationCasesService.linkArtifact(payload), onSaved),
    unlinkArtifact: (payload, onSaved) => change(() => adjudicationCasesService.unlinkArtifact(payload), onSaved),
    appendEntry: (payload, onSaved) => change(() => adjudicationCasesService.appendEntry(payload), onSaved),
  };

  return { cases, selectedId, setSelectedId, selected, candidates, loading, saving, error, load, commands };
}
