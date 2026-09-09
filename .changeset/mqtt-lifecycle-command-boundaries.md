---
"@sasakiuri/saika-lane": patch
"@sasakiuri/saika-director": patch
---

Separate MQTT connection, Lane readiness and timer lifecycles from competition coordination, and share Lane command
validation, authorization and acknowledgement handling. Prevent obsolete expiry callbacks from affecting a new broker
session, and return consistent errors for invalid command payloads and unsupported actions. Enforce the application
dependency boundaries without changing MQTT contracts or stored data.
