import type { IpcMainInvokeEvent } from 'electron';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { operatorAccessContract } from '@/shared/ipc/contracts/operatorAccess.contract';
import type { OperatorAccessService } from './OperatorAccessService';

export { OperatorAccessService } from './OperatorAccessService';
export { SqliteOperatorAccessStore } from './SqliteOperatorAccessStore';
export { directorOperatorPermission } from './DirectorOperatorPermissions';
export { SessionSanctionAuthorizationResolver } from './SessionSanctionAuthorizationResolver';
export function registerOperatorAccess(ipcRouter: IpcRouter, service: OperatorAccessService) {
  const sender = (event: unknown) => (event as IpcMainInvokeEvent).sender.id;
  ipcRouter.register(operatorAccessContract, {
    status: async (event) => service.status(sender(event)),
    signIn: async (input, event) => service.signIn(sender(event), input.name, input.password),
    signOut: async (event) => service.signOut(sender(event)),
    setEnabled: async (input, event) => service.setEnabled(sender(event), input.enabled),
    saveAccount: async (input, event) => service.saveAccount(sender(event), input),
    getAdministration: async (event) => service.administration(sender(event)),
  });
}
