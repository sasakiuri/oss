import { useCallback, useEffect, useState } from 'react';

import { athleteSanctionsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import type { AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import type { AthleteSanctionCommands } from './athleteSanctionTypes';

/**
 * Owns a championship's identity and sanction workspace: the query, the commands, and their busy state, error and
 * notice. Each command replaces the workspace with the one it returns.
 */
export function useAthleteSanctionsWorkspace(championshipId: string) {
  const [workspace, setWorkspace] = useState<AthleteSanctionWorkspaceDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setError(null);
    const response = await athleteSanctionsService.getWorkspace({ championshipId });
    if (!response.success) setError(response.error.message);
    else setWorkspace(response.data);
  }, [championshipId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a command that returns its notice. The previous notice is cleared when the command starts. */
  const perform = (operation: () => Promise<string>) =>
    run(async () => {
      setNotice(null);
      setNotice(await operation());
    });

  const commands: AthleteSanctionCommands = {
    synchronize: (input) =>
      perform(async () => {
        const result = unwrap(await athleteSanctionsService.synchronizeIssfIdentities(input));
        setWorkspace(result.workspace);
        return `${result.identitiesCreated} identity record(s) created; ${result.participantsLinked} event entry link(s) added.`;
      }),
    createIdentity: (input) =>
      perform(async () => {
        setWorkspace(unwrap(await athleteSanctionsService.createIdentity(input)));
        return 'Manual championship identity created.';
      }),
    linkParticipant: (input) =>
      perform(async () => {
        setWorkspace(unwrap(await athleteSanctionsService.linkParticipant(input)));
        return 'Event entry linked to the championship identity.';
      }),
    unlinkParticipant: (input) =>
      perform(async () => {
        setWorkspace(unwrap(await athleteSanctionsService.unlinkParticipant(input)));
        return 'Event entry link reversed. The audit history was retained.';
      }),
    imposeSanction: (input) =>
      perform(async () => {
        setWorkspace(unwrap(await athleteSanctionsService.imposeSanction(input)));
        return `${input.classificationCode} recorded. Review the affected results again.`;
      }),
    revokeSanction: (input) =>
      perform(async () => {
        setWorkspace(unwrap(await athleteSanctionsService.revokeSanction(input)));
        return 'Sanction revoked. The revocation and original decision remain in the audit history.';
      }),
  };

  return { workspace, busy, error, notice, load, commands };
}
