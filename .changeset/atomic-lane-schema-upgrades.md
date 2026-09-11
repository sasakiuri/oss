---
"@sasakiuri/saika-lane": patch
---

Apply Lane database upgrades in one transaction and reject unsupported newer versions. If initialization fails, roll back the upgrade and close the connection.
