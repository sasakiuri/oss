import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { resultsBooksContract } from '@/shared/ipc/contracts';

export const resultsBooksModule: ModuleDefinition<'ipcRouter' | 'resultsBookService'> = {
  name: 'resultsBooks',
  deps: ['ipcRouter', 'resultsBookService'],
  register({ ipcRouter, resultsBookService }) {
    ipcRouter.register(resultsBooksContract, {
      getWorkspace: (input) => resultsBookService.getWorkspace(input.championshipId),
      appointOfficial: (input) => resultsBookService.appointOfficial(input),
      revokeOfficial: (input) => resultsBookService.revokeOfficial(input),
      createRecordClaim: (input) => resultsBookService.createRecordClaim(input),
      appendRecordClaimEntry: (input) => resultsBookService.appendRecordClaimEntry(input),
      generateBook: (input) => resultsBookService.generateBook(input.championshipId, input.createdBy),
      signBook: (input) => resultsBookService.signBook(input),
      finalizeBook: (input) => resultsBookService.finalizeBook(input),
      exportBook: (input) => resultsBookService.exportBook(input.bookId),
    });
  },
};
