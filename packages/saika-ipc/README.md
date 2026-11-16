# Saika IPC

Typed IPC between the main, preload and renderer processes of Saika Lane and Saika Director. A contract names the
channels of one namespace and the Zod schemas of their inputs and outputs; the applications derive their handler and
bridge types from it.

| Import                         | Contents                                                       | Used by                 |
| ------------------------------ | -------------------------------------------------------------- | ----------------------- |
| `@sasakiuri/saika-ipc`         | `defineContract`, `command`, `query`, events, response schemas | main, preload, renderer |
| `@sasakiuri/saika-ipc/preload` | `createProcedureBridge(ipcRenderer, contract)`                 | preload                 |
| `@sasakiuri/saika-ipc/main`    | `toIpcError(error, { isDomainError, metadata })`               | main                    |

```ts
import { command, CommandResponseSchema, defineContract } from '@sasakiuri/saika-ipc';
import { createProcedureBridge } from '@sasakiuri/saika-ipc/preload';

export const sessionContract = defineContract('session', {
  resetSession: command(CommandResponseSchema), // channel 'session:resetSession'
});

const session = createProcedureBridge(ipcRenderer, sessionContract);
await session.resetSession();
```

The root and `/preload` load only Zod, so renderers and sandboxed preload scripts can import them; the preload bridge
calls the `ipcRenderer` the application passes in. `/main` converts thrown values into the IPC error object:
errors that `isDomainError` accepts keep their code and metadata, others get `UNKNOWN_ERROR`, and packaged builds
omit stack traces.

The package holds only the parts that behave the same in both applications. IPC routers, event bridges, command and
query buses, and error codes stay in each application because they behave differently.

From the repository root:

```sh
npm run test --workspace=@sasakiuri/saika-ipc
npm run typecheck --workspace=@sasakiuri/saika-ipc
npm run lint --workspace=@sasakiuri/saika-ipc
npm run depcruise --workspace=@sasakiuri/saika-ipc
```
