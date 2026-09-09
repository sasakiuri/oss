# Saika Protocol

Application-neutral MQTT contracts shared by Saika Lane and Saika Director. Schemas, inferred payload types,
command validation and topic builders live here; application policies and competition rules belong to their
own modules or `@sasakiuri/saika-rules`.

Use a message-family subpath for a focused dependency:

```ts
import { CompetitionCuePayloadSchema } from '@sasakiuri/saika-protocol/CompetitionCue';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

const cue = CompetitionCuePayloadSchema.parse(receivedPayload);
const topic = mqttTopics.competitionCue(cue.competitionId);
```

The root export is available for consumers that need several message families. The applications' existing MQTT
schema modules remain compatibility facades.

`createCommandSchemas()` requires non-empty issuer labels by default. Lane calls it with `z.string()` to preserve
legacy empty-label acceptance. This only selects label validation; command authorization remains application-owned.
The package version is independent from the protocol versions contained in messages.

From the repository root:

```sh
npm run test --workspace=@sasakiuri/saika-protocol
npm run typecheck --workspace=@sasakiuri/saika-protocol
npm run lint --workspace=@sasakiuri/saika-protocol
npm run depcruise --workspace=@sasakiuri/saika-protocol
```

Dependency validation permits only local contract modules and Zod in `src`. Build tooling and tests can use
development dependencies. See [ADR-0005](../../docs/adr/0005-application-composition-and-wire-contracts.md) for the
composition model, compatibility decisions and extension workflow.
