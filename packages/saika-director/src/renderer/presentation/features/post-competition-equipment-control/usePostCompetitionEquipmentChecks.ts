import { useCallback, useEffect, useRef, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { postCompetitionEquipmentControlService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type {
  ConfirmEquipmentControlFailurePayload,
  IssueEquipmentControlNoticePayload,
  PostCompetitionEquipmentCheckDto,
  RecordEquipmentControlTestPayload,
  SelectEquipmentControlAthletesPayload,
  VoidEquipmentControlCheckPayload,
} from '@/shared/ipc/contracts';

import { mergeChecks } from './equipmentControlRules';

/**
 * Commands of the equipment-control workspace. Each merges the checks it returns and reports how many records it
 * updated. `onSaved` runs once the command succeeded, before the list changes. Each resolves `true` on success.
 */
export interface EquipmentControlCommands {
  select: (input: SelectEquipmentControlAthletesPayload, onSaved: () => void) => Promise<boolean>;
  issueNotice: (input: IssueEquipmentControlNoticePayload) => Promise<boolean>;
  recordTest: (input: RecordEquipmentControlTestPayload) => Promise<boolean>;
  confirmFailure: (input: ConfirmEquipmentControlFailurePayload) => Promise<boolean>;
  voidCheck: (input: VoidEquipmentControlCheckPayload) => Promise<boolean>;
}

/**
 * Owns the post-competition equipment checks of one event: the query, the commands, and their busy state, error and
 * notice. Only the newest query updates the list.
 */
export function usePostCompetitionEquipmentChecks(championshipId: string, eventId: string) {
  const [checks, setChecks] = useState<PostCompetitionEquipmentCheckDto[]>([]);
  const { busy, error, setError, run } = useAsyncAction();
  const [notice, setNotice] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    try {
      const response = await postCompetitionEquipmentControlService.list({ championshipId });
      if (version !== requestVersion.current) return;
      setChecks(unwrap(response).filter((check) => check.eventId === eventId));
    } catch (caught) {
      if (version === requestVersion.current) setError(errorMessage(caught));
    }
  }, [championshipId, eventId]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const apply = (operation: () => Promise<PostCompetitionEquipmentCheckDto | PostCompetitionEquipmentCheckDto[]>) =>
    run(async () => {
      setNotice(null);
      const changed = await operation();
      const changedChecks = Array.isArray(changed) ? changed : [changed];
      setChecks((current) => mergeChecks(current, changedChecks).filter((check) => check.eventId === eventId));
      setNotice(`${changedChecks.length} equipment-control record(s) updated.`);
    });

  const commands: EquipmentControlCommands = {
    select: (input, onSaved) =>
      apply(async () => {
        const selected = unwrap(await postCompetitionEquipmentControlService.select(input));
        onSaved();
        return selected;
      }),
    issueNotice: (input) => apply(async () => unwrap(await postCompetitionEquipmentControlService.issueNotice(input))),
    recordTest: (input) => apply(async () => unwrap(await postCompetitionEquipmentControlService.recordTest(input))),
    confirmFailure: (input) =>
      apply(async () => unwrap(await postCompetitionEquipmentControlService.confirmFailure(input))),
    voidCheck: (input) => apply(async () => unwrap(await postCompetitionEquipmentControlService.voidCheck(input))),
  };

  return { checks, busy, error, notice, load, commands };
}
