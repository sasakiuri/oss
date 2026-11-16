import { useCallback, useEffect, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { operatorAccessService, resultsBooksService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

type Input<F extends (input: never) => unknown> = Omit<Parameters<F>[0], 'championshipId'>;

/** A record claim as the form holds it: `achievedAt` is a `datetime-local` value. */
export type RecordClaimInput = Omit<Input<typeof resultsBooksService.createRecordClaim>, 'achievedAt'> & {
  achievedAt: string;
};

/**
 * Results Book commands for one championship. Each resolves `true` when it succeeded; `onSaved` runs right after the
 * returned workspace is stored, while the command still counts as busy.
 */
export interface ResultsBookCommands {
  appointOfficial: (input: Input<typeof resultsBooksService.appointOfficial>, onSaved: () => void) => Promise<boolean>;
  revokeOfficial: (input: Input<typeof resultsBooksService.revokeOfficial>) => Promise<boolean>;
  createRecordClaim: (input: RecordClaimInput, onSaved: () => void) => Promise<boolean>;
  appendRecordClaimEntry: (input: Input<typeof resultsBooksService.appendRecordClaimEntry>) => Promise<boolean>;
  generateBook: (input: Input<typeof resultsBooksService.generateBook>) => Promise<boolean>;
  signBook: (input: Input<typeof resultsBooksService.signBook>) => Promise<boolean>;
  finalizeBook: (input: Input<typeof resultsBooksService.finalizeBook>) => Promise<boolean>;
  exportBook: (bookId: string, format: 'JSON' | 'HTML' | 'PDF') => Promise<boolean>;
}

type WorkspaceResponse = Awaited<ReturnType<typeof resultsBooksService.appointOfficial>>;

/** Owns the Results Book workspace of one championship, the signing accounts and every Results Book command. */
export function useResultsBookWorkspace(championshipId: string) {
  const [workspace, setWorkspace] = useState<ResultsBookWorkspaceDto | null>(null);
  const [signingAccounts, setSigningAccounts] = useState<{ id: string; name: string }[]>([]);
  const { busy, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [response, accounts] = await Promise.all([
        resultsBooksService.getWorkspace({ championshipId }),
        operatorAccessService.getSigningAccounts(),
      ]);
      if (!response.success) setError(response.error.message);
      else setWorkspace(response.data);
      if (accounts.success) setSigningAccounts(accounts.data);
      else setError(accounts.error.message);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [championshipId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (request: () => Promise<WorkspaceResponse>, onSaved?: () => void) =>
    run(async () => {
      setWorkspace(unwrap(await request()));
      onSaved?.();
    });

  const commands: ResultsBookCommands = {
    appointOfficial: (input, onSaved) =>
      mutate(() => resultsBooksService.appointOfficial({ championshipId, ...input }), onSaved),
    revokeOfficial: (input) => mutate(() => resultsBooksService.revokeOfficial({ championshipId, ...input })),
    // The time is converted inside the command so that an invalid value is reported like a failed command.
    createRecordClaim: (input, onSaved) =>
      mutate(
        () =>
          resultsBooksService.createRecordClaim({
            championshipId,
            ...input,
            achievedAt: new Date(input.achievedAt).toISOString(),
          }),
        onSaved,
      ),
    appendRecordClaimEntry: (input) =>
      mutate(() => resultsBooksService.appendRecordClaimEntry({ championshipId, ...input })),
    generateBook: (input) => mutate(() => resultsBooksService.generateBook({ championshipId, ...input })),
    signBook: (input) => mutate(() => resultsBooksService.signBook({ championshipId, ...input })),
    finalizeBook: (input) => mutate(() => resultsBooksService.finalizeBook({ championshipId, ...input })),
    exportBook: (bookId, format) =>
      run(async () => {
        unwrap(await resultsBooksService.exportBook({ bookId, format }));
      }),
  };

  return { workspace, signingAccounts, busy, error, load, commands };
}
