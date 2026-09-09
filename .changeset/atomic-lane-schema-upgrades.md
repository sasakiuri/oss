---
"@sasakiuri/saika-lane": patch
---

Separate Lane database initialization from its versioned migrations. Apply schema,
score conversions and version bookkeeping atomically, reject unsupported newer
databases, and close the connection when initialization fails. Existing schema
versions and stored data remain compatible.
