---
'@sasakiuri/saika-lane': patch
---

Reject Lane IPC responses that do not match their contract with an `IPC_INVALID_RESPONSE` error, and drop event payloads that do not match their schema before they reach the screen.
