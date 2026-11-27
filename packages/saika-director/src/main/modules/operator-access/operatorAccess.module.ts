// SPDX-License-Identifier: MIT
import { ipcInvokeEvent } from '@/main/shared-infra/ipc/IpcRouter';
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { operatorAccessContract } from '@/shared/ipc/contracts';

export const operatorAccessModule = defineModule({
  name: 'operatorAccess',
  deps: ['ipcRouter', 'operatorAccessService'],
  register({ ipcRouter, operatorAccessService: service }) {
    const sender = (event: unknown) => ipcInvokeEvent(event).sender.id;
    ipcRouter.register(operatorAccessContract, {
      getSigningAccounts: async () => service.signingAccounts(),
      status: async (event) => service.status(sender(event)),
      signIn: async (input, event) => service.signIn(sender(event), input.name, input.password),
      signOut: async (event) => service.signOut(sender(event)),
      setEnabled: async (input, event) => service.setEnabled(sender(event), input.enabled),
      saveAccount: async (input, event) => service.saveAccount(sender(event), input),
      getAdministration: async (event) => service.administration(sender(event)),
    });
  },
});
