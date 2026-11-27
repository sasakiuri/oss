import { useCallback, useEffect, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { startListsService } from '@/renderer/services';
import { errorMessage, unwrap, unwrapData } from '@/renderer/services/serviceError';
import type {
  DistributeStartListPayload,
  StartListApprovalPayload,
  StartListDisciplineGroupDto,
  StartListDistributionModeDto,
  StartListKindDto,
  StartListVersionDto,
} from '@/shared/ipc/contracts';

/** A new snapshot version as the form holds it: the times are `datetime-local` values. */
export interface StartListSnapshotInput {
  listKind: StartListKindDto;
  disciplineGroup: StartListDisciplineGroupDto;
  distributionMode: StartListDistributionModeDto;
  scheduledStartAt: string;
  publicationDueAt: string;
  createdBy: string;
}

/** Start List commands. Each resolves `true` when the command succeeded and the versions were reloaded. */
export interface StartListCommands {
  createVersion: (input: StartListSnapshotInput) => Promise<boolean>;
  approveContent: (input: StartListApprovalPayload) => Promise<boolean>;
  approvePaperless: (input: StartListApprovalPayload) => Promise<boolean>;
  distribute: (input: DistributeStartListPayload) => Promise<boolean>;
  voidVersion: (input: StartListApprovalPayload) => Promise<boolean>;
  withdrawDistribution: (input: StartListApprovalPayload) => Promise<boolean>;
}

type StartListCommandResponse = Awaited<ReturnType<typeof startListsService.createVersion>>;

/** Owns the stored Start List versions of one event, the selected version and the version commands. */
export function useStartListVersions(eventId: string) {
  const [versions, setVersions] = useState<StartListVersionDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const { busy, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setError(null);
    try {
      const listed = unwrap(await startListsService.list({ eventId }));
      setVersions(listed);
      setSelectedId((current) => (listed.some((value) => value.id === current) ? current : (listed[0]?.id ?? '')));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [eventId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  // A command selects the version it returns, then reloads the list.
  const mutate = (operation: () => Promise<StartListCommandResponse>) =>
    run(async () => {
      const version = unwrapData(await operation(), 'Start List operation failed');
      setSelectedId(version.id);
      await load();
    });

  const commands: StartListCommands = {
    // The times are converted inside the command so that an invalid value is reported like a failed command.
    createVersion: (input) =>
      mutate(() =>
        startListsService.createVersion({
          eventId,
          listKind: input.listKind,
          disciplineGroup: input.disciplineGroup,
          distributionMode: input.distributionMode,
          scheduledStartAt: new Date(input.scheduledStartAt).toISOString(),
          publicationDueAt: new Date(input.publicationDueAt).toISOString(),
          createdBy: input.createdBy,
        }),
      ),
    approveContent: (input) => mutate(() => startListsService.approveContent(input)),
    approvePaperless: (input) => mutate(() => startListsService.approvePaperless(input)),
    distribute: (input) => mutate(() => startListsService.distribute(input)),
    voidVersion: (input) => mutate(() => startListsService.voidVersion(input)),
    withdrawDistribution: (input) => mutate(() => startListsService.withdrawDistribution(input)),
  };

  return {
    versions,
    selected: versions.find((value) => value.id === selectedId) ?? versions[0] ?? null,
    select: setSelectedId,
    busy,
    error,
    load,
    commands,
  };
}
