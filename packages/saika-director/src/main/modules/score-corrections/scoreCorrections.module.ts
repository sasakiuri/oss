// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { scoreCorrectionsContract } from '@/shared/ipc/contracts';

export const scoreCorrectionsModule: ModuleDefinition<'ipcRouter' | 'scoreCorrectionService'> = {
  name: 'scoreCorrections',
  deps: ['ipcRouter', 'scoreCorrectionService'],
  register({ ipcRouter, scoreCorrectionService: service }) {
    ipcRouter.register(scoreCorrectionsContract, {
      workspace: async (input) => service.workspace(input),
      preview: async (input) => service.preview(input),
      apply: async (input) => service.apply(input),
      withdraw: async (input) => service.withdraw(input),
    });
    return {};
  },
};
