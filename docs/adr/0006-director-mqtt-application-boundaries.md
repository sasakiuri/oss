# ADR-0006: MQTT command ordering

Competition, recovery and interruption commands modify the same Lane state.
They share a competition queue to prevent concurrent updates. Safety STOP and
clearance use a separate queue so STOP remains available while a competition
command waits for acknowledgement.

Broker transitions wait for preceding controls, and subsequent controls wait for
the transition. This avoids completing an old command against a new broker, but a
slow command can delay a broker change. Queue ordering alone cannot cancel pending
work or retract a network write; connection replacement also invalidates commands,
clock assessments and timers.

See [MQTT control](../../ARCHITECTURE.md#mqtt-control) for queue acquisition,
component responsibilities and cleanup requirements.
