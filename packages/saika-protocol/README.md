# Saika Protocol

Wire contracts shared by the Saika applications: MQTT schemas, payload types, command validation, topics and
Vista transport. Application policies and competition rules belong to the applications or `@sasakiuri/saika-rules`.

Use a message-family subpath for a focused dependency:

```ts
import { CompetitionCuePayloadSchema } from '@sasakiuri/saika-protocol/CompetitionCue';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

const cue = CompetitionCuePayloadSchema.parse(receivedPayload);
const topic = mqttTopics.competitionCue(cue.competitionId);
```

The root export is available for consumers that need several message families. The applications' existing MQTT
schema modules remain compatibility facades.

`mqttTopics` builds every MQTT topic and `mqttTopicFilters` the wildcard subscriptions. `parseMqttTopic()`
returns a received topic's builder name as `kind` with its identifiers exactly as received, including empty ones.
`MQTT_COMMAND_ACTIONS` maps each command action to its topic scope and schema; `commandSchemasForScope()` selects
the schemas of one scope from a schema set. Topic strings and action names are a released contract, pinned by
golden tests.

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

Portable schemas depend only on local contract modules and Zod. The explicit Node-only `vista-node` subpath
provides encrypted spectator HTTP transport, replay protection for each listener and local multicast discovery;
renderers must not import it. `Vista` defines complete versioned display snapshots, source identities, exact
target definitions, shooting histories and result publication state. `VISTA_CATALOG_PATH` and
`vistaSnapshotPath()` build the source API paths, `parseVistaSourcePath()` reads them back, and
`VISTA_PROTOCOL_VERSION` is the version every identity and snapshot carries. `VISTA_EVENT_CODES` lists the events
a Vista definition can describe. See
[Vista display data](../../ARCHITECTURE.md#vista-display-data) for acquisition, storage, and permissions.

Vista transport accepts requests within a 30-second clock window to limit replay. Keep the clocks on both
PCs synchronized within that window, including on an offline venue LAN. An authenticated expired request
reports that it expired or the device clocks are out of sync; synchronize both PCs and retry. This transport
requirement is separate from the display's countdown synchronization checks.

For message changes and compatibility checks, see the
[contribution guide](../../CONTRIBUTING.md#changing-application-code).
