---
"@sasakiuri/saika-lane": patch
"@sasakiuri/saika-docs": patch
---

Handle completed-stage restarts without blocking Director finish, keep READY retries from restarting connections, and provide explicit recovery for unreadable runs and unknown saved types. Show unverified remaining time on the Lane screen, keep ERROR states inactive, preserve athlete mode selection and qualification recovery cancellation, and honor queued manual MQTT settings with visible replay errors.
